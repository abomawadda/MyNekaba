import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compileAuthorizationProjection } from "../../api/_lib/authorizationProjection.js";
import { assertAuthorizationVersionMatch } from "../../api/_lib/trustedPermissions.js";
import {
  APPLY_CONFIRMATION,
  buildCompactClaims,
  buildInitializationPlan,
  buildSafePreWriteManifest,
  claimsMatchContract,
  INITIAL_AUTHZ_VERSION,
  projectionsMatch,
  verifyFinalTargetState,
} from "./phase22j7wAuthorizationCore.js";

const employee = { id: "EmployeeCase", jobId: "101" };
const employeeAccount = (overrides = {}) => ({
  id: "EmployeeAccount",
  firebaseUid: "EmployeeUid",
  accountStatus: "active",
  identityType: "employee",
  employeeId: "EmployeeCase",
  role: "member",
  permissionOverrides: [],
  updatedAtIso: "2026-09-20T10:00:00.000Z",
  ...overrides,
});
const adminAccount = (overrides = {}) => ({
  id: "AdminAccount",
  firebaseUid: "AdminUid",
  accountStatus: "active",
  identityType: "administrative",
  role: "admin",
  permissionOverrides: [],
  updatedAtIso: "2026-09-20T10:00:00.000Z",
  ...overrides,
});
const authUser = (uid, accountId, claims = {}) => ({
  uid,
  customClaims: { accountId, ...claims },
});

function initialSnapshot(overrides = {}) {
  return {
    accounts: [adminAccount(), employeeAccount()],
    employees: [employee],
    authUsers: [
      authUser("AdminUid", "AdminAccount", { approvedFlag: true }),
      authUser("EmployeeUid", "EmployeeAccount"),
      authUser("HoldUid1", "MissingAccount1"),
      authUser("HoldUid2", "MissingAccount2"),
      authUser("HoldUid3", "MissingAccount3"),
    ],
    existingProjections: [],
    ...overrides,
  };
}

function initializedSnapshot() {
  const accounts = [
    adminAccount({ permissionsVersion: 1, bindingVersion: 1 }),
    employeeAccount({ permissionsVersion: 1, bindingVersion: 1 }),
  ];
  const versionClaims = { permissionsVersion: 1, bindingVersion: 1, authzVersion: INITIAL_AUTHZ_VERSION };
  return initialSnapshot({
    accounts,
    authUsers: [
      authUser("AdminUid", "AdminAccount", { approvedFlag: true, ...versionClaims }),
      authUser("EmployeeUid", "EmployeeAccount", versionClaims),
      authUser("HoldUid1", "MissingAccount1"),
      authUser("HoldUid2", "MissingAccount2"),
      authUser("HoldUid3", "MissingAccount3"),
    ],
    existingProjections: accounts.map((account) => ({
      id: account.firebaseUid,
      ...compileAuthorizationProjection(account, { updatedAt: "2026-09-20T12:00:00.000Z" }),
    })),
  });
}

test("phase 22j.7w initial plan selects exactly two P2 targets", () => {
  const plan = buildInitializationPlan(initialSnapshot());
  assert.equal(plan.counts.eligibleTargets, 2);
  assert.equal(plan.counts.initialize, 2);
  assert.equal(plan.counts.alreadyInitialized, 0);
});

test("phase 22j.7w initial plan excludes all three HOLD identities", () => {
  const plan = buildInitializationPlan(initialSnapshot());
  assert.equal(plan.counts.holdExcluded, 3);
  assert.equal(plan.targets.some((target) => target.authRef.includes("HoldUid")), false);
});

test("phase 22j.7w proposes only version 1 source fields and compact authz version", () => {
  const plan = buildInitializationPlan(initialSnapshot());
  for (const target of plan.targets) {
    assert.equal(target.expectedProjection.permissionsVersion, 1);
    assert.equal(target.expectedProjection.bindingVersion, 1);
    assert.equal(target.nextClaims.authzVersion, "v1:p1:b1");
  }
});

test("phase 22j.7w compact claims preserve unrelated approved claims", () => {
  const claims = buildCompactClaims({ accountId: "AdminAccount", approvedFlag: true }, "AdminAccount");
  assert.equal(claims.approvedFlag, true);
  assert.equal(claims.accountId, "AdminAccount");
  assert.equal(claims.permissionsVersion, 1);
  assert.equal(claims.bindingVersion, 1);
  assert.equal(claims.authzVersion, "v1:p1:b1");
});

test("phase 22j.7w compact claims do not add permissions, role, or profile data", () => {
  const claims = buildCompactClaims({ accountId: "EmployeeAccount" }, "EmployeeAccount");
  assert.equal(Object.hasOwn(claims, "permissions"), false);
  assert.equal(Object.hasOwn(claims, "role"), false);
  assert.equal(Object.hasOwn(claims, "employeeId"), false);
  assert.equal(Object.hasOwn(claims, "email"), false);
});

test("phase 22j.7w compact claims enforce Firebase payload limit", () => {
  assert.throws(
    () => buildCompactClaims({ accountId: "EmployeeAccount", oversized: "x".repeat(1100) }, "EmployeeAccount"),
    /custom_claims_payload_too_large/
  );
});

test("phase 22j.7w exact claim contract rejects wrong-case account id", () => {
  assert.equal(claimsMatchContract({
    accountId: "employeeaccount",
    permissionsVersion: 1,
    bindingVersion: 1,
    authzVersion: "v1:p1:b1",
  }, "EmployeeAccount"), false);
});

test("phase 22j.7w refuses any Firebase project other than nekaba2026", () => {
  assert.throws(() => buildInitializationPlan(initialSnapshot(), { projectId: "other-project" }), /unexpected_firebase_project/);
});

test("phase 22j.7w hard-stops when application account count drifts", () => {
  const source = initialSnapshot();
  assert.throws(
    () => buildInitializationPlan({ ...source, accounts: source.accounts.slice(0, 1) }),
    /fresh_reconciliation_gate_failed/
  );
});

test("phase 22j.7w hard-stops on binding blockers", () => {
  const source = initialSnapshot();
  const accounts = [source.accounts[0], employeeAccount({ firebaseUid: "WrongUid" })];
  assert.throws(() => buildInitializationPlan({ ...source, accounts }), /fresh_reconciliation_gate_failed/);
});

test("phase 22j.7w hard-stops on unknown permission override", () => {
  const source = initialSnapshot();
  const accounts = [source.accounts[0], employeeAccount({ permissionOverrides: ["root.everything"] })];
  assert.throws(() => buildInitializationPlan({ ...source, accounts }), /fresh_reconciliation_gate_failed/);
});

test("phase 22j.7w refuses unexpected pre-existing projection", () => {
  const source = initialSnapshot();
  const proposed = compileAuthorizationProjection(employeeAccount(), { updatedAt: "2026-09-20T12:00:00.000Z" });
  assert.throws(
    () => buildInitializationPlan({ ...source, existingProjections: [{ id: "EmployeeUid", ...proposed }] }),
    /unexpected_existing_projection/
  );
});

test("phase 22j.7w refuses partial source version state", () => {
  const source = initialSnapshot();
  const accounts = [source.accounts[0], employeeAccount({ permissionsVersion: 1 })];
  assert.throws(() => buildInitializationPlan({ ...source, accounts }), /unexpected_source_version_state/);
});

test("phase 22j.7w refuses partial version claims", () => {
  const source = initialSnapshot();
  const authUsers = source.authUsers.map((user) => user.uid === "EmployeeUid"
    ? authUser("EmployeeUid", "EmployeeAccount", { permissionsVersion: 1 })
    : user);
  assert.throws(() => buildInitializationPlan({ ...source, authUsers }), /partial_authorization_claim_state/);
});

test("phase 22j.7w initialized state is safely idempotent", () => {
  const plan = buildInitializationPlan(initializedSnapshot());
  assert.equal(plan.counts.initialize, 0);
  assert.equal(plan.counts.alreadyInitialized, 2);
  assert.ok(plan.targets.every((target) => target.status === "ALREADY_INITIALIZED"));
});

test("phase 22j.7w projection comparison ignores only updatedAt representation", () => {
  const expected = compileAuthorizationProjection(
    employeeAccount({ permissionsVersion: 1, bindingVersion: 1 }),
    { updatedAt: "<SERVER_TIMESTAMP>" }
  );
  const actual = { id: "EmployeeUid", ...expected, updatedAt: "2026-09-20T12:00:00.000Z" };
  assert.equal(projectionsMatch(expected, actual), true);
});

test("phase 22j.7w projection comparison rejects extra fields", () => {
  const expected = compileAuthorizationProjection(
    employeeAccount({ permissionsVersion: 1, bindingVersion: 1 }),
    { updatedAt: "<SERVER_TIMESTAMP>" }
  );
  assert.equal(projectionsMatch(expected, { ...expected, role: "admin" }), false);
});

test("phase 22j.7w final verification requires source, projection, claims, and binding agreement", () => {
  const plan = buildInitializationPlan(initialSnapshot());
  const target = plan.targets.find((item) => item.account.id === "EmployeeAccount");
  const account = employeeAccount({ permissionsVersion: 1, bindingVersion: 1 });
  const projection = { id: "EmployeeUid", ...target.expectedProjection, updatedAt: "2026-09-20T12:00:00.000Z" };
  const auth = authUser("EmployeeUid", "EmployeeAccount", {
    permissionsVersion: 1,
    bindingVersion: 1,
    authzVersion: "v1:p1:b1",
  });
  assert.equal(verifyFinalTargetState({ account, projection, authUser: auth, target }).valid, true);
});

test("phase 22j.7w final verification rejects stale claim versions", () => {
  const plan = buildInitializationPlan(initialSnapshot());
  const target = plan.targets.find((item) => item.account.id === "EmployeeAccount");
  const result = verifyFinalTargetState({
    account: employeeAccount({ permissionsVersion: 1, bindingVersion: 1 }),
    projection: { id: "EmployeeUid", ...target.expectedProjection },
    authUser: authUser("EmployeeUid", "EmployeeAccount", {
      permissionsVersion: 2,
      bindingVersion: 1,
      authzVersion: "v1:p2:b1",
    }),
    target,
  });
  assert.equal(result.valid, false);
  assert.equal(result.claimsMatch, false);
});

test("phase 22j.7w safe manifest stores hashes and opaque references only", () => {
  const plan = buildInitializationPlan(initialSnapshot());
  const manifest = buildSafePreWriteManifest(plan, { runId: "run", capturedAt: "2026-09-20T12:00:00.000Z" });
  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, /AdminAccount|EmployeeAccount|AdminUid|EmployeeUid|EmployeeCase/);
  assert.equal(manifest.sensitiveValuesStored, false);
});

test("phase 22j.7w safe manifest records claim key names without values", () => {
  const manifest = buildSafePreWriteManifest(buildInitializationPlan(initialSnapshot()));
  const admin = manifest.targets.find((target) => target.existingClaimKeys.includes("approvedFlag"));
  assert.ok(admin);
  assert.equal(Object.hasOwn(admin, "previousClaims"), false);
  assert.equal(Object.hasOwn(admin, "nextClaims"), false);
});

test("phase 22j.7w reconciliation fingerprint is deterministic", () => {
  assert.equal(buildInitializationPlan(initialSnapshot()).fingerprint, buildInitializationPlan(initialSnapshot()).fingerprint);
});

test("phase 22j.7w source change changes reconciliation fingerprint", () => {
  const first = buildInitializationPlan(initialSnapshot()).fingerprint;
  const source = initialSnapshot();
  const second = buildInitializationPlan({
    ...source,
    accounts: [source.accounts[0], employeeAccount({ updatedAtIso: "2026-09-20T10:01:00.000Z" })],
  }).fingerprint;
  assert.notEqual(first, second);
});

test("phase 22j.7w controlled tool defaults to dry-run and requires apply confirmation plus fingerprint", () => {
  const source = readFileSync("tools/migration/phase22j7wInitializeAuthorization.js", "utf8");
  assert.match(source, /mode:\s*"dry-run"/);
  assert.match(source, /options\.confirm !== APPLY_CONFIRMATION/);
  assert.match(source, /options\.fingerprint !== plan\.fingerprint/);
  assert.equal(APPLY_CONFIRMATION, "INITIALIZE_PHASE_22J7W_AUTHORIZATION");
});

test("phase 22j.7w source and projection are initialized in one Firestore transaction", () => {
  const source = readFileSync("tools/migration/phase22j7wInitializeAuthorization.js", "utf8");
  assert.match(source, /runTransaction/);
  assert.match(source, /transaction\.update\(accountRef/);
  assert.match(source, /transaction\.create\(projectionRef/);
});

test("phase 22j.7w claims are merged and verified after Firestore read-back", () => {
  const source = readFileSync("tools/migration/phase22j7wInitializeAuthorization.js", "utf8");
  const firestoreVerify = source.indexOf("verifyFirestoreBeforeClaims");
  const claimsWrite = source.indexOf("setCustomUserClaims", firestoreVerify);
  const finalVerify = source.indexOf("verifyFinalTargetState", claimsWrite);
  assert.ok(firestoreVerify >= 0 && claimsWrite > firestoreVerify && finalVerify > claimsWrite);
});

test("phase 22j.7w incident rollback invalidates versions before restoring claims", () => {
  const source = readFileSync("tools/migration/phase22j7wInitializeAuthorization.js", "utf8");
  const invalidate = source.indexOf("await invalidateBeforeClaimRollback");
  const restoreClaims = source.indexOf("setCustomUserClaims(target.authUser.uid, target.previousClaims)", invalidate);
  const revoke = source.indexOf("revokeRefreshTokens", restoreClaims);
  const restoreFirestore = source.indexOf("restoreAfterInvalidation", revoke);
  assert.ok(invalidate >= 0 && restoreClaims > invalidate && revoke > restoreClaims && restoreFirestore > revoke);
});

test("phase 22j.7w tool contains no Storage or deployment operation", () => {
  const source = readFileSync("tools/migration/phase22j7wInitializeAuthorization.js", "utf8");
  assert.doesNotMatch(source, /getStorage|\.bucket\s*\(|firebase deploy|vercel|git push|getDownloadURL/);
});

test("phase 22j.7w tool does not write audit logs outside the approved mutation budget", () => {
  const source = readFileSync("tools/migration/phase22j7wInitializeAuthorization.js", "utf8");
  assert.doesNotMatch(source, /collection\("audit_logs"\)/);
});

test("phase 22j.7w current Firestore source denies unmatched account_authorization access", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  assert.doesNotMatch(rules, /match \/account_authorization/);
  assert.match(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false/);
});

test("phase 22j.7w strict resolver remains fail closed for tokens without version claims", () => {
  assert.throws(
    () => assertAuthorizationVersionMatch({ accountId: "EmployeeAccount" }, { permissionsVersion: 1, bindingVersion: 1 }),
    /stale_authorization_token/
  );
});

test("phase 22j.7w initialized compact claims satisfy strict version comparison", () => {
  assert.equal(assertAuthorizationVersionMatch({
    accountId: "EmployeeAccount",
    permissionsVersion: 1,
    bindingVersion: 1,
    authzVersion: "v1:p1:b1",
  }, { permissionsVersion: 1, bindingVersion: 1 }), true);
});
