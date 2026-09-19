import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APPROVAL_FLOW_REQUIRED,
  INVALID_REACTIVATION_STATE,
  validateGenericActiveTransition,
} from "../../api/_lib/accountLifecycle.js";

const completedRequest = { id: "request-1", status: "completed" };
const nativeApproved = {
  id: "AccountCaseSensitive",
  role: "member",
  authMode: "firebase-native",
  credentialAuthority: "firebase",
  accountStatus: "suspended",
  registrationState: "active",
};

test("phase 22h.3a generic pending approval to active is rejected", () => {
  const result = validateGenericActiveTransition(
    { ...nativeApproved, accountStatus: "pending_approval", registrationState: "email_pending_verification" },
    [{ status: "email_pending_verification" }]
  );
  assert.equal(result.allowed, false);
  assert.equal(result.error, APPROVAL_FLOW_REQUIRED);
});

test("phase 22h.3a registration-backed account cannot bypass an open request", () => {
  const result = validateGenericActiveTransition(nativeApproved, [{ status: "pending_approval" }]);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "open_registration_request");
});

test("phase 22h.3a incomplete registrationState fails closed with stable error", () => {
  const result = validateGenericActiveTransition(
    { ...nativeApproved, registrationState: "email_pending_verification" },
    []
  );
  assert.deepEqual(
    { allowed: result.allowed, error: result.error },
    { allowed: false, error: "APPROVAL_FLOW_REQUIRED" }
  );
});

test("phase 22h.3a dedicated approval remains the canonical transactional flow", () => {
  const source = readFileSync("api/admin/accounts/approve.js", "utf8");
  assert.match(source, /runTransaction/);
  assert.match(source, /accountStatus:\s*"active"/);
  assert.match(source, /registrationState:\s*"active"/);
  assert.match(source, /transaction\.update\(requestRef,[\s\S]*status:\s*"completed"/);
  assert.match(source, /transaction\.set\(auditRef/);
});

test("phase 22h.3a canonical approval rejects ambiguous open requests", () => {
  const source = readFileSync("api/admin/accounts/approve.js", "utf8");
  assert.match(source, /openRequests\.length > 1/);
  assert.match(source, /ambiguous_registration_request/);
});

test("phase 22h.3a canonical Firebase-native approval rejects a missing request", () => {
  const source = readFileSync("api/admin/accounts/approve.js", "utf8");
  assert.match(source, /firebaseNative && openRequests\.length !== 1/);
  assert.match(source, /registration_request_missing/);
});

test("phase 22h.3a inferred Firebase-native account also fails closed without canonical history", () => {
  const result = validateGenericActiveTransition(
    { firebaseUid: "uid-1", accountStatus: "suspended", registrationState: "active" },
    []
  );
  assert.equal(result.allowed, false);
  assert.equal(result.error, APPROVAL_FLOW_REQUIRED);
  assert.equal(result.reason, "canonical_approval_not_proven");
});

test("phase 22h.3a fully approved suspended Firebase-native account may reactivate", () => {
  const result = validateGenericActiveTransition(nativeApproved, [completedRequest]);
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "post_approval_reactivation");
});

test("phase 22h.3a established JIT account may reactivate without a registration request", () => {
  const result = validateGenericActiveTransition(
    { role: "admin", accountStatus: "suspended", passwordHash: "legacy-hash", passwordSalt: "legacy-salt" },
    []
  );
  assert.equal(result.allowed, true);
});

test("phase 22h.3a blocked or inactive registration account cannot become a first approval", () => {
  for (const accountStatus of ["blocked", "inactive"]) {
    const result = validateGenericActiveTransition(
      { ...nativeApproved, accountStatus, registrationState: "pending_approval" },
      []
    );
    assert.equal(result.allowed, false);
    assert.equal(result.error, APPROVAL_FLOW_REQUIRED);
  }
});

test("phase 22h.3a Security Center pending approval never invokes generic active status", () => {
  const source = readFileSync("src/modules/security/SecurityCenter.jsx", "utf8");
  assert.match(source, /await approvePendingAccount\(account\.id/);
  assert.match(source, /account\.accountStatus === "pending_approval"[^\n]*approve\(account\)/);
  assert.doesNotMatch(source, /const approve =[^\n]*setStatus/);
});

test("phase 22h.3a direct generic activation uses backend transaction and lifecycle guard", () => {
  const source = readFileSync("api/admin/accounts/action.js", "utf8");
  assert.match(source, /accountStatus === "active"/);
  assert.match(source, /runTransaction/);
  assert.match(source, /validateGenericActiveTransition/);
  assert.match(source, /collection\("registration_requests"\)/);
  assert.match(source, /return res\.status\(409\).*APPROVAL_FLOW_REQUIRED/s);
});

test("phase 22h.3a unauthorized generic callers remain denied", () => {
  const source = readFileSync("api/admin/accounts/action.js", "utf8");
  assert.match(source, /requireAdminActor\(req, context\)/);
  assert.match(source, /return res\.status\(403\)\.json\(\{ success: false, error: "unauthorized" \}\)/);
});

test("phase 22h.3a admin role alone grants no first-approval exemption", () => {
  const result = validateGenericActiveTransition(
    { role: "admin", accountStatus: "pending_approval" },
    []
  );
  assert.equal(result.allowed, false);
  assert.equal(result.error, APPROVAL_FLOW_REQUIRED);
});

test("phase 22h.3a unresolved JIT evidence introduces no identity-type shortcut", () => {
  const source = readFileSync("api/_lib/accountLifecycle.js", "utf8");
  assert.doesNotMatch(source, /identityType|system-admin|service account/i);
  assert.doesNotMatch(source, /account\.role/);
});

test("phase 22h.3a deleted and rejected accounts cannot use generic reactivation", () => {
  for (const accountStatus of ["deleted", "rejected"]) {
    const result = validateGenericActiveTransition({ accountStatus }, []);
    assert.equal(result.allowed, false);
    assert.equal(result.error, INVALID_REACTIVATION_STATE);
  }
});

test("phase 22h.3a account identifiers remain exact and case-preserving", () => {
  const source = readFileSync("api/admin/accounts/action.js", "utf8");
  assert.match(source, /\.doc\(accountId\)/);
  assert.doesNotMatch(source, /accountId\.toLowerCase\(\)/);
});
