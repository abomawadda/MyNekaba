import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("phase 22g.3 admin account actions are backend-only and token-gated", () => {
  const actionApi = read("api/admin/accounts/action.js");
  assert.match(actionApi, /requireAdminActor/);
  assert.match(actionApi, /ROLE_WHITELIST/);
  assert.match(actionApi, /last_admin_protected/);
  assert.match(actionApi, /revokeRefreshTokens/);
  assert.match(actionApi, /deleteUser/);
  assert.match(actionApi, /emailVerificationOverride/);
});

test("phase 22g.3 Security Center uses trusted admin API instead of direct Firestore account mutation", () => {
  const center = read("src/modules/security/SecurityCenter.jsx");
  assert.match(center, /fetchSecurityAccounts/);
  assert.match(center, /runSecurityAccountAction/);
  assert.doesNotMatch(center, /updateDoc\(/);
  assert.doesNotMatch(center, /collection\(db,\s*"user_accounts"/);
});

test("phase 22g.3 Firebase-native login requires verified email or admin override", () => {
  const authProvider = read("src/app/providers/AuthProvider.jsx");
  assert.match(authProvider, /firebase_email_unverified_blocked/);
  assert.match(authProvider, /account\.emailVerificationOverride/);
  assert.match(authProvider, /fb\.emailVerified/);
});

test("phase 22g.3 printable A4 security report exists", () => {
  const center = read("src/modules/security/SecurityCenter.jsx");
  assert.match(center, /@page \{ size: A4/);
  assert.match(center, /security-print-report/);
  assert.match(center, /تقرير مركز الأمان/);
});

test("phase 22g.3 frontend does not import Firebase Admin SDK", () => {
  const center = read("src/modules/security/SecurityCenter.jsx");
  const api = read("src/security/registrationApi.js");
  assert.doesNotMatch(center + api, /firebase-admin/);
});
