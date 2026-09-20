/* global Buffer */
import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import {
  assertAuthorizationVersionMatch,
  buildAuthzVersion,
  compileEffectivePermissions,
  nextAuthorizationVersion,
} from "../../api/_lib/trustedPermissions.js";
import {
  compileAuthorizationProjection,
  persistAuthorizationProjection,
} from "../../api/_lib/authorizationProjection.js";
import { resolveTrustedPrincipal } from "../../api/_lib/trustedPrincipal.js";
import {
  EMPLOYEE_ATTACHMENT_TYPES,
  assertDownloadRelease,
  authorizeEmployeeAttachmentOperation,
  buildEmployeeAttachmentMetadata,
  buildTrustedEmployeeAttachmentPath,
  normalizeEmployeeStorageResource,
  sanitizeTrustedFileName,
} from "../../api/_lib/trustedStorageResource.js";
import { buildStorageAuditEvent } from "../../api/_lib/storageAudit.js";
import { createEmployeeAttachmentService } from "../../api/_lib/employeeAttachmentService.js";
import { PERMISSIONS } from "../../src/security/permissions.js";

const req = (token = "token") => ({ headers: { authorization: `Bearer ${token}` } });
const account = (overrides = {}) => ({
  id: "AccountCase",
  firebaseUid: "uid-1",
  identityType: "employee",
  employeeId: "EmployeeCase",
  accountStatus: "active",
  role: "viewer",
  permissionOverrides: [],
  permissionsVersion: 1,
  bindingVersion: 1,
  ...overrides,
});
const decoded = (overrides = {}) => ({
  uid: "uid-1",
  accountId: "AccountCase",
  permissionsVersion: 1,
  bindingVersion: 1,
  authzVersion: buildAuthzVersion(1, 1),
  ...overrides,
});

function makeDb({ accounts = [account()], employees = [{ id: "EmployeeCase" }], linkedAccountIds, metadata = {} } = {}) {
  const collections = {
    user_accounts: new Map(accounts.map((item) => [item.id, { ...item }])),
    employees: new Map(employees.map((item) => [item.id, { ...item }])),
    account_authorization: new Map(),
  };
  const auditEvents = [];
  const writes = [];
  const snapshot = (id, value) => ({
    id,
    exists: Boolean(value),
    data: () => (value ? { ...value, ...metadata } : undefined),
  });
  const queryFor = (name, filters = [], maximum = Infinity) => ({
    where(field, operator, value) {
      assert.equal(operator, "==");
      return queryFor(name, [...filters, [field, value]], maximum);
    },
    limit(value) {
      return queryFor(name, filters, value);
    },
    async get() {
      let values = [...(collections[name] || new Map()).entries()]
        .filter(([, value]) => filters.every(([field, expected]) => value[field] === expected))
        .map(([id, value]) => snapshot(id, value));
      if (name === "user_accounts" && linkedAccountIds) {
        values = linkedAccountIds.map((id) => snapshot(id, collections.user_accounts.get(id) || { employeeId: "EmployeeCase" }));
      }
      const docs = values.slice(0, maximum);
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  const db = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() { return snapshot(id, collections[name]?.get(id)); },
            async set(value, options) {
              writes.push({ name, id, value, options });
              collections[name] ||= new Map();
              collections[name].set(id, value);
            },
          };
        },
        where(field, operator, value) {
          return queryFor(name).where(field, operator, value);
        },
        async add(value) {
          auditEvents.push(value);
          return { id: `audit-${auditEvents.length}` };
        },
      };
    },
  };
  return { db, auditEvents, writes };
}

async function resolve({ accountOverrides = {}, decodedOverrides = {}, dbOptions = {}, requireVersionClaims = true } = {}) {
  const current = account(accountOverrides);
  const { db } = makeDb({ accounts: [current], ...dbOptions });
  const auth = { async verifyIdToken() { return decoded(decodedOverrides); } };
  return resolveTrustedPrincipal(req(), { auth, db }, { requireVersionClaims });
}

test("phase 22j.6 valid Firebase-native employee resolves with exact binding", async () => {
  const principal = await resolve();
  assert.equal(principal.accountId, "AccountCase");
  assert.equal(principal.employeeId, "EmployeeCase");
});

test("phase 22j.6 valid JIT-linked administrative account resolves without employee ownership", async () => {
  const principal = await resolve({
    accountOverrides: { identityType: "administrative", employeeId: "", role: "admin" },
    dbOptions: { employees: [], linkedAccountIds: [] },
  });
  assert.equal(principal.identityType, "administrative");
  assert.equal(principal.employeeId, null);
  assert.equal(principal.role, "admin");
});

test("phase 22j.6 missing accountId claim denies", async () => {
  await assert.rejects(() => resolve({ decodedOverrides: { accountId: "" } }), /missing_account_claim/);
});

test("phase 22j.6 wrong-case accountId denies without normalization", async () => {
  await assert.rejects(() => resolve({ decodedOverrides: { accountId: "accountcase" } }), /actor_account_missing/);
});

test("phase 22j.6 decoded UID mismatch denies", async () => {
  await assert.rejects(() => resolve({ decodedOverrides: { uid: "uid-2" } }), /firebase_uid_account_mismatch/);
});

test("phase 22j.6 inactive account denies", async () => {
  await assert.rejects(() => resolve({ accountOverrides: { accountStatus: "suspended" } }), /inactive_account/);
});

test("phase 22j.6 missing account and HOLD-style orphan deny", async () => {
  const { db } = makeDb({ accounts: [] });
  const auth = { async verifyIdToken() { return decoded(); } };
  await assert.rejects(() => resolveTrustedPrincipal(req(), { auth, db }), /actor_account_missing/);
});

test("phase 22j.6 employee identity without mapping denies", async () => {
  await assert.rejects(() => resolve({ accountOverrides: { employeeId: "" }, dbOptions: { employees: [] } }), /employee_mapping_missing/);
});

test("phase 22j.6 administrative identity with employee mapping denies", async () => {
  await assert.rejects(() => resolve({ accountOverrides: { identityType: "administrative" } }), /administrative_employee_conflict/);
});

test("phase 22j.6 duplicate employee account mapping denies", async () => {
  await assert.rejects(() => resolve({ dbOptions: { linkedAccountIds: ["AccountCase", "OtherAccount"] } }), /duplicate_employee_mapping/);
});

test("phase 22j.6 malformed or unknown role denies", async () => {
  await assert.rejects(() => resolve({ accountOverrides: { role: "futureRole" } }), /invalid_account_role/);
});

test("phase 22j.6 canonical role permissions compile", () => {
  const compiled = compileEffectivePermissions(account({ role: "viewer" }));
  assert.equal(compiled.effectivePermissions.includes(PERMISSIONS.attachmentsView), true);
  assert.equal(compiled.effectivePermissions.includes(PERMISSIONS.attachmentsUpload), false);
});

test("phase 22j.6 valid additive override becomes effective", () => {
  const compiled = compileEffectivePermissions(account({ role: "viewer", permissionOverrides: [PERMISSIONS.attachmentsUpload] }));
  assert.equal(compiled.effectivePermissions.includes(PERMISSIONS.attachmentsUpload), true);
  assert.deepEqual(compiled.validOverrides, [PERMISSIONS.attachmentsUpload]);
});

test("phase 22j.6 unknown override is ignored and reported", () => {
  const compiled = compileEffectivePermissions(account({ permissionOverrides: ["attachments.root"] }));
  assert.equal(compiled.effectivePermissions.includes("attachments.root"), false);
  assert.deepEqual(compiled.unknownOverrides, ["attachments.root"]);
});

test("phase 22j.6 effective permission output is deterministic and sorted", () => {
  const compiled = compileEffectivePermissions(account({ permissionOverrides: [PERMISSIONS.attachmentsUpload, PERMISSIONS.attachmentsView] }));
  assert.deepEqual(compiled.effectivePermissions, [...compiled.effectivePermissions].sort());
});

test("phase 22j.6 permissions hash is deterministic", () => {
  const first = compileEffectivePermissions(account({ permissionOverrides: [PERMISSIONS.attachmentsUpload] }));
  const second = compileEffectivePermissions(account({ permissionOverrides: [PERMISSIONS.attachmentsUpload] }));
  assert.equal(first.permissionsHash, second.permissionsHash);
});

test("phase 22j.6 Storage capability subset contains exact canonical keys", () => {
  const compiled = compileEffectivePermissions(account({ role: "admin" }));
  assert.equal(compiled.capabilities[PERMISSIONS.attachmentsDelete], true);
  assert.equal(compiled.capabilities[PERMISSIONS.treasuryMigrate], true);
  assert.equal(Object.hasOwn(compiled.capabilities, PERMISSIONS.activitiesManage), false);
});

test("phase 22j.6 removing an override changes hash and version expectation", () => {
  const before = compileEffectivePermissions(account({ permissionOverrides: [PERMISSIONS.attachmentsUpload] }));
  const after = compileEffectivePermissions(account({ permissionOverrides: [] }));
  assert.notEqual(before.permissionsHash, after.permissionsHash);
  assert.equal(nextAuthorizationVersion(3, before.permissionsHash !== after.permissionsHash), 4);
});

test("phase 22j.6 authorization version primitives are deterministic", () => {
  assert.equal(buildAuthzVersion(2, 7), "v1:p2:b7");
  assert.equal(nextAuthorizationVersion(2, false), 2);
});

test("phase 22j.6 stale token/projection mismatch fails closed", () => {
  assert.throws(() => assertAuthorizationVersionMatch(decoded(), { permissionsVersion: 2, bindingVersion: 1 }), /stale_authorization_token/);
});

test("phase 22j.6 trusted principal rejects stale version claims", async () => {
  await assert.rejects(() => resolve({ decodedOverrides: { permissionsVersion: 2 } }), /stale_authorization_token/);
});

test("phase 22j.6 employee authorization projection is canonical", () => {
  const projection = compileAuthorizationProjection(account(), { updatedAt: "2026-09-20T00:00:00.000Z" });
  assert.equal(projection.accountId, "AccountCase");
  assert.equal(projection.employeeId, "EmployeeCase");
  assert.equal(projection.status, "active");
  assert.equal(projection.capabilities[PERMISSIONS.attachmentsView], true);
});

test("phase 22j.6 administrative projection has no employee owner", () => {
  const projection = compileAuthorizationProjection(account({ identityType: "administrative", employeeId: "", role: "admin" }));
  assert.equal(projection.employeeId, null);
});

test("phase 22j.6 inactive identity compiles an inactive projection", () => {
  const projection = compileAuthorizationProjection(account({ accountStatus: "suspended" }));
  assert.equal(projection.status, "inactive");
  assert.equal(Object.hasOwn(projection, "sourceStatus"), false);
});

test("phase 22j.6 projection compiler ignores client-controlled fields", () => {
  const projection = compileAuthorizationProjection(account({ capabilities: { root: true }, status: "active", ownerFirebaseUid: "attacker" }));
  assert.equal(Object.hasOwn(projection.capabilities, "root"), false);
  assert.equal(Object.hasOwn(projection, "ownerFirebaseUid"), false);
});

test("phase 22j.6 projection persistence defaults to dry-run and requires trust", async () => {
  const projection = compileAuthorizationProjection(account());
  const { db, writes } = makeDb();
  await assert.rejects(() => persistAuthorizationProjection({ db, projection }), /trusted_projection_invocation_required/);
  const result = await persistAuthorizationProjection({ db, projection, trusted: true, dryRun: true });
  assert.equal(result.written, false);
  assert.equal(writes.length, 0);
});

const resource = (overrides = {}) => ({
  family: "employee",
  employeeId: "EmployeeCase",
  attachmentId: "Attachment-1",
  attachmentType: "general_employee",
  fileName: "record.pdf",
  ...overrides,
});

test("phase 22j.6 employee path builds canonically", () => {
  assert.equal(buildTrustedEmployeeAttachmentPath(resource()), "employees/EmployeeCase/attachments/Attachment-1/record.pdf");
});

test("phase 22j.6 arbitrary full path is rejected", () => {
  assert.throws(() => normalizeEmployeeStorageResource(resource({ path: "other/secret" })), /arbitrary_storage_path_rejected/);
});

test("phase 22j.6 traversal is rejected", () => {
  assert.throws(() => buildTrustedEmployeeAttachmentPath(resource({ employeeId: "../other" })), /invalid_employee_id/);
});

test("phase 22j.6 malformed identifier is rejected", () => {
  assert.throws(() => buildTrustedEmployeeAttachmentPath(resource({ attachmentId: "bad/id" })), /invalid_attachment_id/);
});

test("phase 22j.6 unsafe filename is reduced to a safe leaf", () => {
  assert.equal(sanitizeTrustedFileName("folder\\my report.pdf"), "my_report.pdf");
});

test("phase 22j.6 high-sensitivity types are backend-only and scanning-required", () => {
  for (const policy of Object.values(EMPLOYEE_ATTACHMENT_TYPES)) {
    assert.equal(policy.backendOnly, true);
    assert.equal(policy.scanningRequired, true);
  }
});

const ownerPrincipal = (permissions = []) => ({
  accountId: "AccountCase",
  firebaseUid: "uid-1",
  identityType: "employee",
  employeeId: "EmployeeCase",
  role: "viewer",
  effectivePermissions: permissions,
  authzVersion: "v1:p1:b1",
});
const staffPrincipal = () => {
  const compiled = compileEffectivePermissions(account({ identityType: "administrative", employeeId: "", role: "admin" }));
  return {
    accountId: "AdminAccount",
    firebaseUid: "admin-uid",
    identityType: "administrative",
    employeeId: null,
    role: "admin",
    effectivePermissions: compiled.effectivePermissions,
    authzVersion: "v1:p1:b1",
  };
};

function makeService(principal, storageOverrides = {}) {
  const { db, auditEvents } = makeDb();
  const calls = { saves: 0, metadata: 0, streams: 0, deletes: 0 };
  const releasedMetadata = {
    ...buildEmployeeAttachmentMetadata({ resource: resource(), principal: staffPrincipal() }),
    scanStatus: "clean",
    accessState: "released",
  };
  const storage = {
    async save() { calls.saves += 1; return { path: "ok" }; },
    async getMetadata() { calls.metadata += 1; return { contentType: "application/pdf", size: 3, metadata: releasedMetadata }; },
    createReadStream() { calls.streams += 1; return Readable.from([Buffer.from("pdf")]); },
    async delete() { calls.deletes += 1; return { deleted: true }; },
    ...storageOverrides,
  };
  const service = createEmployeeAttachmentService({
    auth: {},
    db,
    storage,
    resolvePrincipal: async () => principal,
    auditWriter: async (_db, event) => { auditEvents.push(event); return event; },
    now: () => "2026-09-20T00:00:00.000Z",
    requestId: () => "request-1",
  });
  return { service, calls, auditEvents, releasedMetadata };
}

test("phase 22j.6 unauthorized upload reaches zero Storage writes", async () => {
  const { service, calls } = makeService(ownerPrincipal([]));
  await assert.rejects(() => service.upload({ req: req(), resource: resource(), data: Buffer.from("pdf"), contentType: "application/pdf", size: 3 }), /attachment_authorization_denied/);
  assert.equal(calls.saves, 0);
});

test("phase 22j.6 unauthorized download reaches zero Storage reads or streams", async () => {
  const { service, calls } = makeService(ownerPrincipal([]));
  await assert.rejects(() => service.download({ req: req(), resource: resource() }), /attachment_authorization_denied/);
  assert.deepEqual([calls.metadata, calls.streams], [0, 0]);
});

test("phase 22j.6 unauthorized delete reaches zero Storage reads or deletes", async () => {
  const { service, calls } = makeService(ownerPrincipal([]));
  await assert.rejects(() => service.remove({ req: req(), resource: resource() }), /attachment_authorization_denied/);
  assert.deepEqual([calls.metadata, calls.deletes], [0, 0]);
});

test("phase 22j.6 employee owner cannot target another employee", () => {
  assert.throws(
    () => authorizeEmployeeAttachmentOperation(ownerPrincipal([PERMISSIONS.attachmentsView]), resource({ employeeId: "EmployeeOther" }), "view"),
    /attachment_authorization_denied/
  );
});

test("phase 22j.6 administrative identity gets no owner access automatically", () => {
  const principal = { ...ownerPrincipal([PERMISSIONS.attachmentsView]), identityType: "administrative", employeeId: null };
  assert.throws(() => authorizeEmployeeAttachmentOperation(principal, resource(), "view"), /attachment_authorization_denied/);
});

test("phase 22j.6 JIT mode alone grants no attachment access", () => {
  const principal = { ...ownerPrincipal([]), authMode: "jit-linked" };
  assert.throws(() => authorizeEmployeeAttachmentOperation(principal, resource(), "view"), /attachment_authorization_denied/);
});

test("phase 22j.6 employee owner access requires both type policy and attachment capability", () => {
  const authorization = authorizeEmployeeAttachmentOperation(
    ownerPrincipal([PERMISSIONS.attachmentsUpload]),
    resource({ attachmentType: "general_employee" }),
    "upload"
  );
  assert.equal(authorization.accessMode, "owner");
  assert.throws(
    () => authorizeEmployeeAttachmentOperation(ownerPrincipal([PERMISSIONS.attachmentsUpload]), resource({ attachmentType: "medical" }), "upload"),
    /attachment_authorization_denied/
  );
});

test("phase 22j.6 valid staff capabilities reach the upload boundary", async () => {
  const { service, calls } = makeService(staffPrincipal());
  await service.upload({ req: req(), resource: resource(), data: Buffer.from("pdf"), contentType: "application/pdf", size: 3 });
  assert.equal(calls.saves, 1);
});

test("phase 22j.6 missing employee target blocks upload before Storage", async () => {
  const { service, calls } = makeService(staffPrincipal());
  await assert.rejects(
    () => service.upload({ req: req(), resource: resource({ employeeId: "MissingEmployee" }), data: Buffer.from("pdf"), contentType: "application/pdf", size: 3 }),
    /employee_target_missing/
  );
  assert.equal(calls.saves, 0);
});

test("phase 22j.6 invalid upload content blocks Storage", async () => {
  const { service, calls } = makeService(staffPrincipal());
  await assert.rejects(
    () => service.upload({ req: req(), resource: resource(), data: Buffer.from("html"), contentType: "text/html", size: 4 }),
    /invalid_attachment_file/
  );
  assert.equal(calls.saves, 0);
});

test("phase 22j.6 audit failure blocks upload before Storage", async () => {
  const { db } = makeDb();
  let saves = 0;
  const service = createEmployeeAttachmentService({
    auth: {},
    db,
    storage: {
      async save() { saves += 1; },
      async getMetadata() { throw new Error("unused"); },
      createReadStream() { throw new Error("unused"); },
      async delete() { throw new Error("unused"); },
    },
    resolvePrincipal: async () => staffPrincipal(),
    auditWriter: async () => { throw new Error("audit_unavailable"); },
  });
  await assert.rejects(
    () => service.upload({ req: req(), resource: resource(), data: Buffer.from("pdf"), contentType: "application/pdf", size: 3 }),
    /audit_unavailable/
  );
  assert.equal(saves, 0);
});

test("phase 22j.6 trusted upload returns path and quarantine state without persistent URL", async () => {
  const { service } = makeService(staffPrincipal());
  const result = await service.upload({ req: req(), resource: resource(), data: Buffer.from("pdf"), contentType: "application/pdf", size: 3 });
  assert.equal(result.storagePath, "employees/EmployeeCase/attachments/Attachment-1/record.pdf");
  assert.equal(result.scanStatus, "pending");
  assert.equal(result.accessState, "quarantined");
  assert.equal(Object.hasOwn(result, "url"), false);
});

test("phase 22j.6 upload metadata contains immutable employee binding", () => {
  const metadata = buildEmployeeAttachmentMetadata({ resource: resource({ attachmentType: "medical" }), principal: staffPrincipal(), now: "2026-09-20T00:00:00.000Z" });
  assert.equal(metadata.employeeId, "EmployeeCase");
  assert.equal(metadata.businessEntityId, "EmployeeCase");
  assert.equal(metadata.ownerFirebaseUid, undefined);
});

test("phase 22j.6 released download returns a stream and no URL", async () => {
  const { service, calls } = makeService(staffPrincipal());
  const result = await service.download({ req: req(), resource: resource() });
  assert.equal(typeof result.stream.pipe, "function");
  assert.equal(Object.hasOwn(result, "url"), false);
  assert.equal(calls.streams, 1);
});

test("phase 22j.6 quarantined download fails before content stream", async () => {
  const pending = buildEmployeeAttachmentMetadata({ resource: resource(), principal: staffPrincipal() });
  const { service, calls } = makeService(staffPrincipal(), {
    async getMetadata() { calls.metadata += 1; return { contentType: "application/pdf", size: 3, metadata: pending }; },
  });
  await assert.rejects(() => service.download({ req: req(), resource: resource() }), /attachment_not_released/);
  assert.equal(calls.streams, 0);
});

test("phase 22j.6 metadata release requires exact object binding", () => {
  const metadata = { ...buildEmployeeAttachmentMetadata({ resource: resource(), principal: staffPrincipal() }), scanStatus: "clean", accessState: "released", employeeId: "Other" };
  assert.throws(() => assertDownloadRelease(metadata, resource()), /attachment_binding_mismatch/);
});

test("phase 22j.6 authorization denial emits a safe audit event", async () => {
  const { service, auditEvents } = makeService(ownerPrincipal([]));
  await assert.rejects(() => service.download({ req: req(), resource: resource() }));
  const denial = auditEvents.find((event) => event.action === "attachment.authorization_denied");
  assert.equal(denial.decision, "denied");
  assert.equal(Object.hasOwn(denial, "fileName"), false);
  assert.equal(Object.hasOwn(denial, "url"), false);
  assert.equal(Object.hasOwn(denial, "token"), false);
});

test("phase 22j.6 authorized staff delete verifies metadata before delete", async () => {
  const { service, calls } = makeService(staffPrincipal());
  const result = await service.remove({ req: req(), resource: resource() });
  assert.equal(result.deleted, true);
  assert.deepEqual([calls.metadata, calls.deletes], [1, 1]);
});

test("phase 22j.6 delete is idempotent for an already absent canonical object", async () => {
  const { service, calls } = makeService(staffPrincipal(), {
    async getMetadata() { calls.metadata += 1; throw new Error("object_not_found"); },
  });
  const result = await service.remove({ req: req(), resource: resource() });
  assert.equal(result.alreadyAbsent, true);
  assert.equal(calls.deletes, 0);
});

test("phase 22j.6 safe audit builder excludes paths, names, URLs, and tokens", () => {
  const event = buildStorageAuditEvent({
    event: "attachment.view_requested",
    principal: staffPrincipal(),
    resource: resource({ fileName: "secret.pdf", url: "https://example.invalid/token" }),
  });
  const serialized = JSON.stringify(event);
  assert.doesNotMatch(serialized, /secret\.pdf|example\.invalid|storagePath|downloadUrl/);
});

test("phase 22j.6 endpoints expose no persistent download URL or arbitrary path input", () => {
  const sources = [
    "api/storage/employees/upload.js",
    "api/storage/employees/download.js",
    "api/storage/employees/delete.js",
    "api/_lib/employeeAttachmentService.js",
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(sources, /getDownloadURL|createSignedUrl|downloadToken/);
  assert.doesNotMatch(sources, /body\.path|body\.storagePath/);
});

test("phase 22j.6 shared admin authorization inherits exact UID binding", () => {
  const adminHelper = readFileSync("api/_lib/adminAuthorization.js", "utf8");
  const principalHelper = readFileSync("api/_lib/trustedPrincipal.js", "utf8");
  assert.match(adminHelper, /resolveTrustedPrincipal/);
  assert.match(principalHelper, /account\.firebaseUid\) !== firebaseUid/);
  assert.match(principalHelper, /accountDoc\.id !== accountId/);
});

test("phase 22j.6 implementation requires no Production mutation or Rules deployment", () => {
  const testSource = readFileSync("tools/migration/phase22j6TrustedStorageApi.test.js", "utf8");
  const imports = testSource.match(/^import .*$/gm)?.join("\n") || "";
  assert.doesNotMatch(imports, /firebase-admin|firebase\/storage/);
  const deploymentCommand = new RegExp(["firebase", "deploy"].join("\\s+"));
  const productionInvocation = new RegExp(["mynekaba", "vercel", "app/api/storage"].join("\\."));
  assert.equal(deploymentCommand.test(testSource), false);
  assert.equal(productionInvocation.test(testSource), false);
});
