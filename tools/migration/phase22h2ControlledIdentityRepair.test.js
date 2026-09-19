import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REGISTRATION_STATES,
  canRetireExpiredRegistration,
  classifyRegistrationReservation,
  hasDuplicateAccount,
  isRegistrationRequestBlocking,
} from "../../api/_lib/registrationCore.js";
import {
  buildOrphanDispositionPlan,
  validateRestoreEvidence,
} from "./phase22h2RepairCore.js";
import {
  buildExpiredSessionTransition,
  isExpiredActiveSession,
} from "../../api/_lib/sessionLifecycle.js";

const employee = { id: "employee-1", employeeCode: "1001", jobId: "1001" };
const expiredAt = "2020-01-01T00:00:00.000Z";
const futureAt = "2099-01-01T00:00:00.000Z";
const identityKnown = { identityStateKnown: true, accountIds: new Set(), firebaseUids: new Set() };

function request(overrides = {}) {
  return {
    id: "request-1",
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    accountId: "account-1",
    firebaseUid: "firebase-1",
    status: REGISTRATION_STATES.emailPendingVerification,
    expiresAt: expiredAt,
    ...overrides,
  };
}

test("phase 22h.2 expired identity_verified no longer blocks", () => {
  assert.equal(
    isRegistrationRequestBlocking(request({ status: REGISTRATION_STATES.identityVerified }), identityKnown),
    false
  );
});

test("phase 22h.2 expired email pending with no identities can be retired", () => {
  const value = request();
  assert.equal(isRegistrationRequestBlocking(value, identityKnown), false);
  assert.equal(canRetireExpiredRegistration(value, identityKnown), true);
});

test("phase 22h.2 expired email pending with live Firebase identity stays blocked", () => {
  const value = request();
  const result = classifyRegistrationReservation(value, {
    ...identityKnown,
    firebaseUserExists: true,
  });
  assert.equal(result.blocking, true);
  assert.equal(result.reason, "firebase_identity_requires_review");
});

test("phase 22h.2 expired email pending with an application account stays blocked", () => {
  const result = classifyRegistrationReservation(request(), {
    ...identityKnown,
    accountExists: true,
  });
  assert.equal(result.blocking, true);
  assert.equal(result.reason, "application_account_exists");
});

test("phase 22h.2 pending approval follows explicit expiry and identity policy", () => {
  const expiredMissing = request({ status: REGISTRATION_STATES.pendingApproval });
  assert.equal(canRetireExpiredRegistration(expiredMissing, identityKnown), true);
  assert.equal(
    isRegistrationRequestBlocking(expiredMissing, { ...identityKnown, firebaseUserExists: true }),
    true
  );
  assert.equal(
    isRegistrationRequestBlocking(request({ status: REGISTRATION_STATES.pendingApproval, expiresAt: futureAt }), identityKnown),
    true
  );
});

test("phase 22h.2 terminal request without a live identity does not block", () => {
  for (const status of ["completed", "retired", "expired", "rejected"]) {
    assert.equal(isRegistrationRequestBlocking(request({ status }), identityKnown), false);
  }
});

test("phase 22h.2 a real existing account always blocks registration", () => {
  const duplicate = hasDuplicateAccount(
    [{ id: "account-1", employeeId: employee.id }],
    employee,
    [request({ status: "retired" })],
    identityKnown
  );
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.account.id, "account-1");
});

test("phase 22h.2 second registration for an existing employee code is blocked", () => {
  const duplicate = hasDuplicateAccount(
    [{ id: "account-2", employeeCode: employee.employeeCode }],
    employee,
    [],
    identityKnown
  );
  assert.equal(duplicate.duplicate, true);
});

test("phase 22h.2 approval updates accountStatus and registrationState", () => {
  const source = readFileSync("api/admin/accounts/approve.js", "utf8");
  assert.match(source, /accountStatus:\s*"active"/);
  assert.match(source, /registrationState:\s*"active"/);
});

test("phase 22h.2 approval transitions the registration request to completed", () => {
  const source = readFileSync("api/admin/accounts/approve.js", "utf8");
  assert.match(source, /transaction\.update\(requestRef,[\s\S]*status:\s*"completed"/);
});

test("phase 22h.2 Security Center uses one transactional approval lifecycle", () => {
  const endpoint = readFileSync("api/admin/accounts/approve.js", "utf8");
  const center = readFileSync("src/modules/security/SecurityCenter.jsx", "utf8");
  assert.match(endpoint, /runTransaction/);
  assert.match(center, /approvePendingAccount\(account\.id/);
  assert.doesNotMatch(center, /const approve = \(account\) => runAction\(\{ action: "setStatus"/);
});

test("phase 22h.2 restore requires authoritative role and status", () => {
  const validation = validateRestoreEvidence({
    accountId: "account-1",
    firebaseUid: "firebase-1",
    employeeId: "employee-1",
    employeeCode: "1001",
    email: "member@example.com",
    role: "member",
    accountStatus: "active",
  });
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.missing, ["roleAuthoritative", "statusAuthoritative"]);
});

test("phase 22h.2 retirement disables and revokes without deleting Auth", () => {
  const plan = buildOrphanDispositionPlan({}, "RETIRE");
  assert.deepEqual(plan.authMutations, ["disable", "revoke_refresh_tokens"]);
  assert.equal(plan.deleteAuthUser, false);
});

test("phase 22h.2 HOLD performs no identity mutation", () => {
  const plan = buildOrphanDispositionPlan({}, "HOLD");
  assert.deepEqual(plan.authMutations, []);
  assert.deepEqual(plan.firestoreMutations, []);
  assert.equal(plan.unresolved, true);
});

test("phase 22h.2 expired active session transitions to expired", () => {
  const session = { status: "active", expiresAt: expiredAt };
  const transition = buildExpiredSessionTransition(session, {
    now: new Date("2026-01-01T00:00:00.000Z"),
    accountExists: false,
    reconciliationId: "reconciliation-1",
    actor: "operator",
  });
  assert.equal(isExpiredActiveSession(session, Date.parse("2026-01-01T00:00:00.000Z")), true);
  assert.equal(transition.status, "expired");
  assert.equal(transition.expiredReason, "identity_reconciliation_expired");
});

test("phase 22h.2 valid active session remains active", () => {
  const session = { status: "active", expiresAt: futureAt };
  assert.equal(isExpiredActiveSession(session, Date.parse("2026-01-01T00:00:00.000Z")), false);
  assert.equal(buildExpiredSessionTransition(session, { now: new Date("2026-01-01T00:00:00.000Z") }), null);
});

test("phase 22h.2 session cleanup has no registration mutation dependency", () => {
  const source = readFileSync("api/_lib/sessionLifecycle.js", "utf8");
  assert.doesNotMatch(source, /registration_requests|registrationState|firebaseUid/);
});

test("phase 22h.2 Firebase-native login routing remains wired", () => {
  const source = readFileSync("src/app/providers/AuthProvider.jsx", "utf8");
  assert.match(source, /firebaseSignIn/);
  assert.match(source, /authMode:\s*nextUser\.authMode/);
});

test("phase 22h.2 JIT login routing remains wired", () => {
  const source = readFileSync("src/app/providers/AuthProvider.jsx", "utf8");
  assert.match(source, /establishJitFirebaseSession/);
  assert.match(source, /JIT_SESSION_STATE/);
});

test("phase 22h.2 administrative recovery flow remains wired", () => {
  const source = readFileSync("src/security/registrationApi.js", "utf8");
  assert.match(source, /requestAccountRecovery/);
  assert.match(source, /runRecoveryAction/);
});

test("phase 22h.2 self-service password reset remains wired", () => {
  const source = readFileSync("src/app/providers/AuthProvider.jsx", "utf8");
  assert.match(source, /firebaseSendPasswordResetEmail/);
});
