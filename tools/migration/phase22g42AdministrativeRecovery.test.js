import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RECOVERY_ACTION,
  RECOVERY_STATUS,
  appendHistory,
  buildHistoryEvent,
  maskEmail,
  maskInternalId,
  maskNationalId,
  maskPhone,
  recoveryAuthMode,
  validateRecoveryAction,
} from "../../api/_lib/recoveryWorkflow.js";

const read = (path) => readFileSync(path, "utf8");
const firebaseAccount = { firebaseUid: "uid", email: "member@example.com", authMode: "firebase-native", role: "member" };
const legacyAccount = { passwordHash: "hash", passwordSalt: "salt" };

test("phase 22g.4.2 pending recovery can start review", () => {
  const result = validateRecoveryAction({ request: { status: RECOVERY_STATUS.pending }, action: RECOVERY_ACTION.startReview, account: firebaseAccount });
  assert.deepEqual({ ok: result.ok, to: result.to }, { ok: true, to: RECOVERY_STATUS.underReview });
});

test("phase 22g.4.2 pending recovery cannot jump to completed", () => {
  const result = validateRecoveryAction({ request: { status: RECOVERY_STATUS.pending }, action: RECOVERY_ACTION.complete, account: firebaseAccount });
  assert.equal(result.error, "invalid_transition");
});

test("phase 22g.4.2 under-review recovery can be approved with a reason", () => {
  const result = validateRecoveryAction({ request: { status: RECOVERY_STATUS.underReview }, action: RECOVERY_ACTION.approve, reason: "تمت المطابقة", account: firebaseAccount });
  assert.equal(result.to, RECOVERY_STATUS.approved);
});

test("phase 22g.4.2 approval requires a reason", () => {
  const result = validateRecoveryAction({ request: { status: RECOVERY_STATUS.underReview }, action: RECOVERY_ACTION.approve, account: firebaseAccount });
  assert.equal(result.error, "reason_required");
});

test("phase 22g.4.2 pending and under-review cases may be rejected with reason", () => {
  for (const status of [RECOVERY_STATUS.pending, RECOVERY_STATUS.underReview]) {
    assert.equal(validateRecoveryAction({ request: { status }, action: RECOVERY_ACTION.reject, reason: "تعذر التحقق", account: firebaseAccount }).to, RECOVERY_STATUS.rejected);
  }
});

test("phase 22g.4.2 rejection requires a reason", () => {
  assert.equal(validateRecoveryAction({ request: { status: RECOVERY_STATUS.pending }, action: RECOVERY_ACTION.reject, account: firebaseAccount }).error, "reason_required");
});

test("phase 22g.4.2 terminal cases cannot approve, reject, or execute recovery", () => {
  for (const status of [RECOVERY_STATUS.completed, RECOVERY_STATUS.rejected]) {
    for (const action of [RECOVERY_ACTION.approve, RECOVERY_ACTION.reject, RECOVERY_ACTION.sendPasswordReset]) {
      assert.equal(validateRecoveryAction({ request: { status }, action, reason: "سبب", account: firebaseAccount }).ok, false);
    }
  }
});

test("phase 22g.4.2 reset action requires approved Firebase-native account", () => {
  assert.equal(validateRecoveryAction({ request: { status: RECOVERY_STATUS.approved }, action: RECOVERY_ACTION.sendPasswordReset, account: firebaseAccount }).to, RECOVERY_STATUS.actionRequired);
  assert.equal(validateRecoveryAction({ request: { status: RECOVERY_STATUS.underReview }, action: RECOVERY_ACTION.sendPasswordReset, account: firebaseAccount }).error, "invalid_transition");
  assert.equal(validateRecoveryAction({ request: { status: RECOVERY_STATUS.approved }, action: RECOVERY_ACTION.sendPasswordReset, account: legacyAccount }).error, "invalid_auth_mode");
});

test("phase 22g.4.2 legacy and JIT accounts use manual follow-up without authority migration", () => {
  const jitAccount = { firebaseUid: "uid", passwordHash: "hash", passwordSalt: "salt" };
  assert.equal(recoveryAuthMode(legacyAccount), "legacy");
  assert.equal(recoveryAuthMode(jitAccount), "jit-linked");
  for (const account of [legacyAccount, jitAccount]) {
    assert.equal(validateRecoveryAction({ request: { status: RECOVERY_STATUS.approved }, action: RECOVERY_ACTION.manualFollowUp, reason: "متابعة", account }).to, RECOVERY_STATUS.actionRequired);
  }
});

test("phase 22g.4.2 completion requires a recorded recovery action", () => {
  assert.equal(validateRecoveryAction({ request: { status: RECOVERY_STATUS.actionRequired }, action: RECOVERY_ACTION.complete, account: firebaseAccount }).error, "recovery_action_required");
  assert.equal(validateRecoveryAction({ request: { status: RECOVERY_STATUS.actionRequired, recoveryActionMethod: "firebase_password_reset_email" }, action: RECOVERY_ACTION.complete, account: firebaseAccount }).to, RECOVERY_STATUS.completed);
});

test("phase 22g.4.2 history stores actor, transition, reason, and timestamp", () => {
  const event = buildHistoryEvent({ action: RECOVERY_ACTION.approve, actor: { id: "admin", fullName: "مدير" }, from: RECOVERY_STATUS.underReview, to: RECOVERY_STATUS.approved, reason: "مطابقة", atIso: "2026-09-17T00:00:00.000Z" });
  assert.equal(event.actorName, "مدير");
  assert.equal(event.reason, "مطابقة");
  assert.equal(appendHistory([], event).length, 1);
});

test("phase 22g.4.2 masking helpers minimize identifiers", () => {
  assert.equal(maskNationalId("12345678901234"), "12**********34");
  assert.equal(maskPhone("01012345678"), "010******78");
  assert.equal(maskEmail("member@example.com"), "me****@example.com");
  assert.doesNotMatch(maskInternalId("account-sensitive-id"), /account-sensitive-id/);
});

test("phase 22g.4.2 endpoint requires trusted active admin authorization", () => {
  const endpoint = read("api/admin/recovery/action.js");
  const authorization = read("api/_lib/adminAuthorization.js");
  assert.match(endpoint, /requireAdminActor/);
  assert.match(authorization, /verifyIdToken/);
  assert.match(authorization, /actor\.accountStatus !== "active"/);
  assert.match(authorization, /actor\.role !== "admin"/);
});

test("phase 22g.4.2 endpoint uses transactions, optimistic version checks, and duplicate-case protection", () => {
  const endpoint = read("api/admin/recovery/action.js");
  assert.match(endpoint, /runTransaction/);
  assert.match(endpoint, /expectedVersion/);
  assert.match(endpoint, /stale_recovery_state/);
  assert.match(endpoint, /other_open_recovery/);
  assert.match(endpoint, /actionExecutionState/);
  assert.match(endpoint, /reviewer_conflict/);
  assert.match(read("api/auth/recovery-request.js"), /OPEN_RECOVERY_STATUSES/);
});

test("phase 22g.4.2 approval does not change password, role, verification, or account activation", () => {
  const endpoint = read("api/admin/recovery/action.js");
  assert.doesNotMatch(endpoint, /updatePassword|passwordHash\s*:|passwordSalt\s*:|setCustomUserClaims|emailVerified\s*:|accountStatus\s*:/);
  assert.match(endpoint, /approvalReason/);
  assert.match(endpoint, /auth\.recovery_approved/);
});

test("phase 22g.4.2 rejection and completion store actor/time and audit events", () => {
  const endpoint = read("api/admin/recovery/action.js");
  assert.match(endpoint, /rejectedBy/);
  assert.match(endpoint, /rejectedAt/);
  assert.match(endpoint, /auth\.recovery_rejected/);
  assert.match(endpoint, /completedBy/);
  assert.match(endpoint, /completedAt/);
  assert.match(endpoint, /completionMethod/);
  assert.match(endpoint, /auth\.recovery_completed/);
});

test("phase 22g.4.2 reset delivery does not expose reset links or tokens", () => {
  const endpoint = read("api/admin/recovery/action.js");
  assert.match(endpoint, /accounts:sendOobCode/);
  assert.match(endpoint, /PASSWORD_RESET/);
  assert.doesNotMatch(endpoint, /generatePasswordResetLink|resetLink|resetToken/);
  assert.match(endpoint, /auth\.recovery_reset_sent/);
});

test("phase 22g.4.2 completion revokes app sessions and Firebase refresh tokens", () => {
  const endpoint = read("api/admin/recovery/action.js");
  assert.match(endpoint, /revokedReason: "recovery_completed"/);
  assert.match(endpoint, /revokeRefreshTokens/);
});

test("phase 22g.4.2 list API returns masked case details without credential material", () => {
  const list = read("api/admin/accounts/list.js");
  assert.match(list, /requestReference: maskInternalId/);
  assert.match(list, /nationalIdMasked: maskNationalId/);
  assert.match(list, /phoneMasked: maskPhone/);
  assert.match(list, /emailMasked: maskEmail/);
  assert.doesNotMatch(list, /passwordHash\s*:|passwordSalt\s*:/);
});

test("phase 22g.4.2 Security Center renders Arabic lifecycle and a details drawer", () => {
  const center = read("src/modules/security/SecurityCenter.jsx");
  for (const label of ["قيد الانتظار", "قيد المراجعة", "تمت الموافقة", "بانتظار تنفيذ إجراء الاسترداد", "مكتمل", "ملغي"]) {
    assert.match(center, new RegExp(label));
  }
  assert.match(center, /عرض التفاصيل/);
  assert.match(center, /تفاصيل طلب الاسترداد/);
  assert.match(center, /سجل الحالة/);
});

test("phase 22g.4.2 UI actions are status-aware and terminal cases are read-only", () => {
  const center = read("src/modules/security/SecurityCenter.jsx");
  assert.match(center, /status === "recovery_pending"/);
  assert.match(center, /status === "recovery_under_review"/);
  assert.match(center, /status === "recovery_approved"/);
  assert.match(center, /status === "recovery_action_required"/);
  assert.match(center, /الطلب للقراءة فقط/);
});

test("phase 22g.4.2 critical recovery forms use React modal state", () => {
  const center = read("src/modules/security/SecurityCenter.jsx");
  assert.match(center, /RECOVERY_MODAL_CONFIG/);
  assert.match(center, /submitRecoveryModal/);
  assert.match(center, /openRecoveryModal/);
  assert.doesNotMatch(center, /prompt\([^\n]*(?:الاسترداد|الاسترداد الإداري)/);
});

test("phase 22g.4.2 email change is explicitly deferred and cannot auto-verify", () => {
  const center = read("src/modules/security/SecurityCenter.jsx");
  const endpoint = read("api/admin/recovery/action.js");
  assert.match(center, /تغيير بريد الاسترداد:[\s\S]*مؤجل وغير منفذ/);
  assert.doesNotMatch(endpoint, /prepareEmailChange|updateUser\([^)]*email/);
});

test("phase 22g.4.2 preserves authentication and self-service recovery wiring", () => {
  const provider = read("src/app/providers/AuthProvider.jsx");
  const resetPage = read("src/modules/auth/ResetPasswordPage.jsx");
  assert.match(provider, /establishJitFirebaseSession/);
  assert.match(provider, /buildPasswordHash/);
  assert.match(provider, /readStoredSession/);
  assert.match(provider, /terminateSession/);
  assert.match(resetPage, /requestPasswordReset/);
  assert.match(resetPage, /requestAccountRecovery/);
});
