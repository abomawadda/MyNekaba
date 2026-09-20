import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertAuthorizationVersionMatch } from "../../api/_lib/trustedPermissions.js";
import {
  buildSafeArtifact,
  CLAIM_ACTION,
  DRIFT_CLASS,
  PROJECTION_FIELDS,
  READINESS_CLASS,
  reconcileAuthorizationSnapshot,
  validateProjectionSafety,
} from "./phase22j7AuthorizationProjectionCore.js";
import { readProductionSnapshot } from "./phase22j7AuthorizationProjectionDryRun.js";

const employee = (overrides = {}) => ({ id: "EmployeeCase", jobId: "101", ...overrides });
const account = (overrides = {}) => ({
  id: "AccountCase",
  firebaseUid: "UidCase",
  accountStatus: "active",
  identityType: "employee",
  employeeId: "EmployeeCase",
  role: "member",
  permissionOverrides: [],
  ...overrides,
});
const authUser = (overrides = {}) => ({
  uid: "UidCase",
  customClaims: { accountId: "AccountCase" },
  ...overrides,
});

function snapshot(overrides = {}) {
  return {
    accounts: [account()],
    employees: [employee()],
    authUsers: [authUser()],
    existingProjections: [],
    ...overrides,
  };
}

function reconcile(overrides = {}) {
  return reconcileAuthorizationSnapshot(snapshot(overrides));
}

function readySnapshot() {
  const versioned = account({ permissionsVersion: 1, bindingVersion: 1 });
  const claims = {
    accountId: versioned.id,
    permissionsVersion: 1,
    bindingVersion: 1,
    authzVersion: "v1:p1:b1",
  };
  return snapshot({ accounts: [versioned], authUsers: [authUser({ customClaims: claims })] });
}

test("phase 22j.7 valid native employee requires deterministic version initialization", () => {
  const result = reconcile();
  assert.equal(result.accounts[0].readinessClass, READINESS_CLASS.initialize);
  assert.equal(result.accounts[0].projection.identityType, "employee");
  assert.equal(result.accounts[0].projection.employeeId, "EmployeeCase");
});

test("phase 22j.7 valid administrative JIT identity is projection eligible", () => {
  const admin = account({
    id: "AdminCase",
    firebaseUid: "AdminUid",
    identityType: "administrative",
    employeeId: "",
    role: "admin",
  });
  const result = reconcile({
    accounts: [admin],
    authUsers: [authUser({ uid: "AdminUid", customClaims: { accountId: "AdminCase" } })],
  });
  assert.equal(result.accounts[0].readinessClass, READINESS_CLASS.initialize);
  assert.equal(result.accounts[0].projection.employeeId, null);
});

test("phase 22j.7 orphan auth identity remains HOLD with no projection", () => {
  const result = reconcile({
    authUsers: [authUser(), authUser({ uid: "OrphanUid", customClaims: { accountId: "MissingAccount" } })],
  });
  assert.equal(result.authOnlyIdentities[0].readinessClass, READINESS_CLASS.hold);
  assert.equal(result.authOnlyIdentities[0].projectionGenerated, false);
});

test("phase 22j.7 inactive account is P6 and receives no projection", () => {
  const result = reconcile({ accounts: [account({ accountStatus: "suspended" })] });
  assert.equal(result.accounts[0].readinessClass, READINESS_CLASS.inactive);
  assert.equal(result.accounts[0].projection, null);
});

test("phase 22j.7 UID mismatch is blocked binding", () => {
  const result = reconcile({
    accounts: [account({ firebaseUid: "ExpectedUid" })],
    authUsers: [authUser({ uid: "ActualUid" })],
  });
  assert.equal(result.accounts[0].readinessClass, READINESS_CLASS.binding);
  assert.equal(result.accounts[0].reason, "firebase_uid_mismatch");
});

test("phase 22j.7 missing employee is blocked binding", () => {
  const result = reconcile({ employees: [] });
  assert.equal(result.accounts[0].readinessClass, READINESS_CLASS.binding);
  assert.equal(result.accounts[0].reason, "employee_mapping_missing");
});

test("phase 22j.7 duplicate employee binding blocks both accounts", () => {
  const second = account({ id: "SecondAccount", firebaseUid: "SecondUid" });
  const result = reconcile({
    accounts: [account(), second],
    authUsers: [authUser(), authUser({ uid: "SecondUid", customClaims: { accountId: "SecondAccount" } })],
  });
  assert.equal(result.summary.duplicateEmployeeBindings, 1);
  assert.ok(result.accounts.every((item) => item.readinessClass === READINESS_CLASS.binding));
});

test("phase 22j.7 administrative identity with employee fields is blocked", () => {
  const result = reconcile({ accounts: [account({ identityType: "administrative", role: "admin" })] });
  assert.equal(result.accounts[0].readinessClass, READINESS_CLASS.binding);
  assert.equal(result.accounts[0].reason, "administrative_employee_conflict");
});

test("phase 22j.7 unknown role is blocked permissions", () => {
  const result = reconcile({ accounts: [account({ role: "future-super-role" })] });
  assert.equal(result.accounts[0].readinessClass, READINESS_CLASS.permissions);
  assert.deepEqual(result.accounts[0].drift, [DRIFT_CLASS.unknownRole]);
});

test("phase 22j.7 invalid additive override is reported and cannot grant access", () => {
  const result = reconcile({ accounts: [account({ permissionOverrides: ["root.everything"] })] });
  assert.equal(result.accounts[0].readinessClass, READINESS_CLASS.permissions);
  assert.equal(result.summary.invalidOverrides, 1);
  assert.equal(result.accounts[0].projection, null);
});

test("phase 22j.7 malformed override collection is blocked permissions", () => {
  const result = reconcile({ accounts: [account({ permissionOverrides: "attachments.view" })] });
  assert.equal(result.accounts[0].readinessClass, READINESS_CLASS.permissions);
  assert.equal(result.summary.invalidOverrides, 1);
});

test("phase 22j.7 projection is generated only for eligible active accounts", () => {
  const result = reconcile({
    accounts: [account(), account({
      id: "Inactive",
      firebaseUid: "InactiveUid",
      employeeId: "InactiveEmployee",
      accountStatus: "rejected",
    })],
    employees: [employee(), employee({ id: "InactiveEmployee", jobId: "102" })],
    authUsers: [authUser(), authUser({ uid: "InactiveUid", customClaims: { accountId: "Inactive" } })],
  });
  assert.ok(result.accounts[0].projection);
  assert.equal(result.accounts[1].projection, null);
});

test("phase 22j.7 projection document id equals exact Firebase UID", () => {
  const item = reconcile().accounts[0];
  assert.equal(item.projectionDocumentId, item.projection.firebaseUid);
  assert.equal(item.projectionDocumentId, "UidCase");
});

test("phase 22j.7 projection contains only the approved authorization fields", () => {
  const projection = reconcile().accounts[0].projection;
  assert.deepEqual(Object.keys(projection).sort(), [...PROJECTION_FIELDS].sort());
  assert.equal(Object.keys(projection).some((key) => /email|phone|national|password|token/i.test(key)), false);
});

test("phase 22j.7 capability subset is deterministic", () => {
  const first = reconcile().accounts[0].projection.capabilities;
  const second = reconcile().accounts[0].projection.capabilities;
  assert.deepEqual(first, second);
  assert.ok(Object.values(first).every((value) => typeof value === "boolean"));
});

test("phase 22j.7 permissions hash is deterministic", () => {
  const first = reconcile().accounts[0].permissionState.permissionsHash;
  const second = reconcile().accounts[0].permissionState.permissionsHash;
  assert.equal(first, second);
  assert.equal(first.length, 64);
});

test("phase 22j.7 second dry run is byte-equivalent after stable serialization", () => {
  const first = reconcile();
  const second = reconcile();
  assert.deepEqual(first.accounts[0].projection, second.accounts[0].projection);
  assert.deepEqual(first.determinism, { projection: true, permissionsHash: true, versions: true });
});

test("phase 22j.7 missing version claims require INITIALIZE", () => {
  const item = reconcile().accounts[0];
  assert.equal(item.claims.action, CLAIM_ACTION.initialize);
  assert.equal(item.claims.accountIdExact, true);
});

test("phase 22j.7 stale lower version claim requires refresh", () => {
  const versioned = account({ permissionsVersion: 2, bindingVersion: 1 });
  const result = reconcile({
    accounts: [versioned],
    authUsers: [authUser({ customClaims: {
      accountId: "AccountCase",
      permissionsVersion: 1,
      bindingVersion: 1,
      authzVersion: "v1:p1:b1",
    } })],
  });
  assert.equal(result.accounts[0].claims.action, CLAIM_ACTION.refresh);
  assert.ok(result.accounts[0].drift.includes(DRIFT_CLASS.claimsStale));
});

test("phase 22j.7 stale higher version claim requires revoke and refresh", () => {
  const result = reconcile({
    accounts: [account({ permissionsVersion: 1, bindingVersion: 1 })],
    authUsers: [authUser({ customClaims: {
      accountId: "AccountCase",
      permissionsVersion: 2,
      bindingVersion: 1,
      authzVersion: "v1:p2:b1",
    } })],
  });
  assert.equal(result.accounts[0].claims.action, CLAIM_ACTION.revoke);
});

test("phase 22j.7 wrong-case accountId claim fails exact reconciliation", () => {
  const result = reconcile({ authUsers: [authUser({ customClaims: { accountId: "accountcase" } })] });
  assert.equal(result.accounts[0].readinessClass, READINESS_CLASS.binding);
  assert.equal(result.accounts[0].reason, "account_claim_mismatch");
});

test("phase 22j.7 duplicate Firebase UID bindings are blocked", () => {
  const result = reconcile({
    accounts: [account(), account({ id: "SecondAccount" })],
  });
  assert.equal(result.summary.duplicateUidBindings, 1);
  assert.ok(result.accounts.every((item) => item.readinessClass === READINESS_CLASS.binding));
});

test("phase 22j.7 invalid source versions fail closed as unknown", () => {
  const result = reconcile({ accounts: [account({ permissionsVersion: 0 })] });
  assert.equal(result.accounts[0].readinessClass, READINESS_CLASS.unknown);
  assert.equal(result.accounts[0].projection, null);
});

test("phase 22j.7 valid explicit versions and matching claims are P1", () => {
  const result = reconcileAuthorizationSnapshot(readySnapshot());
  assert.equal(result.accounts[0].readinessClass, READINESS_CLASS.ready);
  assert.equal(result.accounts[0].claims.action, CLAIM_ACTION.none);
});

test("phase 22j.7 missing projection is classified as drift", () => {
  const result = reconcileAuthorizationSnapshot(readySnapshot());
  assert.ok(result.accounts[0].drift.includes(DRIFT_CLASS.projectionMissing));
});

test("phase 22j.7 stale projection permissions are detected", () => {
  const baseline = reconcileAuthorizationSnapshot(readySnapshot());
  const projection = { ...baseline.accounts[0].projection, permissionsHash: "stale" };
  const result = reconcileAuthorizationSnapshot({ ...readySnapshot(), existingProjections: [{ id: "UidCase", ...projection }] });
  assert.ok(result.accounts[0].drift.includes(DRIFT_CLASS.projectionStalePermissions));
});

test("phase 22j.7 stale projection binding is detected", () => {
  const baseline = reconcileAuthorizationSnapshot(readySnapshot());
  const projection = { ...baseline.accounts[0].projection, employeeId: "OtherEmployee" };
  const result = reconcileAuthorizationSnapshot({ ...readySnapshot(), existingProjections: [{ id: "UidCase", ...projection }] });
  assert.ok(result.accounts[0].drift.includes(DRIFT_CLASS.projectionStaleBinding));
});

test("phase 22j.7 exact existing projection is no drift", () => {
  const baseline = reconcileAuthorizationSnapshot(readySnapshot());
  const projection = baseline.accounts[0].projection;
  const result = reconcileAuthorizationSnapshot({ ...readySnapshot(), existingProjections: [{ id: "UidCase", ...projection }] });
  assert.deepEqual(result.accounts[0].drift, [DRIFT_CLASS.none]);
  assert.equal(result.readiness.projectionReady, true);
});

test("phase 22j.7 projection safety rejects unexpected PII fields", () => {
  const item = reconcile().accounts[0];
  const unsafe = { ...item.projection, email: "private@example.com" };
  assert.equal(validateProjectionSafety(item.projectionDocumentId, unsafe).safe, false);
});

test("phase 22j.7 safe artifact redacts exact account, UID, and employee identifiers", () => {
  const result = reconcile();
  const artifact = buildSafeArtifact(result, { projectId: "nekaba2026", generatedAt: "2026-09-20T00:00:00.000Z" });
  const serialized = JSON.stringify(artifact);
  assert.doesNotMatch(serialized, /AccountCase|UidCase|EmployeeCase/);
  assert.equal(artifact.accounts[0].proposedProjection.marker, "DRY_RUN_ONLY");
});

test("phase 22j.7 read-only inventory never invokes a Production writer", async () => {
  const reads = [];
  const db = {
    collection(name) {
      reads.push(name);
      return {
        async get() { return { docs: [] }; },
        set() { assert.fail("writer invoked"); },
        update() { assert.fail("writer invoked"); },
        delete() { assert.fail("writer invoked"); },
      };
    },
  };
  const auth = {
    async listUsers() { return { users: [], pageToken: undefined }; },
    setCustomUserClaims() { assert.fail("claim setter invoked"); },
  };
  const result = await readProductionSnapshot({ db, auth });
  assert.deepEqual(reads.sort(), ["account_authorization", "employees", "user_accounts"]);
  assert.deepEqual(result, { accounts: [], employees: [], authUsers: [], existingProjections: [] });
});

test("phase 22j.7 runner contains no Firestore or claims mutation primitive", () => {
  const source = readFileSync("tools/migration/phase22j7AuthorizationProjectionDryRun.js", "utf8");
  assert.doesNotMatch(source, /\.set\s*\(|\.update\s*\(|\.delete\s*\(|setCustomUserClaims|revokeRefreshTokens/);
});

test("phase 22j.7 HOLD source objects remain byte-equivalent after reconciliation", () => {
  const hold = authUser({ uid: "HoldUid", customClaims: { accountId: "MissingAccount" } });
  const before = JSON.stringify(hold);
  reconcile({ authUsers: [authUser(), hold] });
  assert.equal(JSON.stringify(hold), before);
});

test("phase 22j.7 shared admin APIs retain non-strict version compatibility", () => {
  const source = readFileSync("api/_lib/adminAuthorization.js", "utf8");
  assert.match(source, /requireVersionClaims:\s*false/);
  assert.match(source, /resolveTrustedPrincipal/);
});

test("phase 22j.7 strict Storage version check remains fail closed without claims", () => {
  assert.throws(
    () => assertAuthorizationVersionMatch({ accountId: "AccountCase" }, { permissionsVersion: 1, bindingVersion: 1 }),
    /stale_authorization_token/
  );
});
