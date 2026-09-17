import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const resetPage = () => read("src/modules/auth/ResetPasswordPage.jsx");

test("phase 22g.4.1 login forgot-password link opens the combined recovery route", () => {
  const login = read("src/modules/auth/LoginPage.jsx");
  const router = read("src/app/router.jsx");
  assert.match(login, /to="\/reset-password"/);
  assert.match(router, /path="\/reset-password"/);
  assert.match(router, /<ResetPasswordPage/);
});

test("phase 22g.4.1 email reset is the default and admin recovery is an explicit fallback", () => {
  const page = resetPage();
  assert.match(page, /useState\("email"\)/);
  assert.match(page, /إعادة تعيين كلمة المرور بالبريد الإلكتروني/);
  assert.match(page, /لا أستطيع الوصول إلى بريدي/);
  assert.match(page, /method === "email"/);
  assert.match(page, /method === "admin"/);
});

test("phase 22g.4.1 valid email uses Firebase reset abstraction with generic stable success", () => {
  const page = resetPage();
  const provider = read("src/app/providers/AuthProvider.jsx");
  assert.match(page, /requestPasswordReset\(\{ email: normalizedEmail \}\)/);
  assert.match(provider, /firebaseSendPasswordResetEmail\(identifier\)/);
  assert.match(page, /إذا كان البريد مرتبطًا بحساب صالح/);
  assert.match(page, /setEmailSuccess\(true\)/);
});

test("phase 22g.4.1 validates email, prevents double submit, and applies 60-second cooldown", () => {
  const page = resetPage();
  assert.match(page, /RESEND_COOLDOWN_SECONDS = 60/);
  assert.match(page, /يرجى إدخال بريد إلكتروني بصيغة صحيحة/);
  assert.match(page, /if \(emailValidationError \|\| loading \|\| cooldown > 0\) return/);
  assert.match(page, /disabled=\{loading !== "" \|\| Boolean\(emailValidationError\) \|\| cooldown > 0\}/);
});

test("phase 22g.4.1 Firebase errors are safely mapped without exposing enumeration", () => {
  const firebaseAuth = read("src/security/firebaseAuth.js");
  const provider = read("src/app/providers/AuthProvider.jsx");
  const page = resetPage();
  assert.match(firebaseAuth, /INVALID_EMAIL/);
  assert.match(firebaseAuth, /FIREBASE_TOO_MANY_REQUESTS/);
  assert.match(firebaseAuth, /FIREBASE_UNAUTHORIZED_CONTINUE_URI/);
  assert.match(provider, /error\?\.reason !== FIREBASE_AUTH_REASON\.invalidCredential/);
  assert.match(page, /تم إرسال عدد كبير من الطلبات/);
  assert.doesNotMatch(page, /USER_NOT_FOUND|EMAIL_NOT_FOUND/);
});

test("phase 22g.4.1 admin recovery submits identity factors and never redirects automatically", () => {
  const page = resetPage();
  assert.match(page, /requestAccountRecovery\(\{/);
  assert.match(page, /nationalId: digits\(adminForm\.nationalId\)/);
  assert.match(page, /jobCode: text\(adminForm\.jobCode\)/);
  assert.match(page, /phone: digits\(adminForm\.phone\)/);
  assert.match(page, /تم تسجيل طلب استرداد الحساب/);
  assert.doesNotMatch(page, /setTimeout|navigate\("\/login"/);
});

test("phase 22g.4.1 administrative recovery API only creates a review request", () => {
  const api = read("api/auth/recovery-request.js");
  assert.match(api, /account_recovery_requests/);
  assert.match(api, /recovery_pending/);
  assert.doesNotMatch(api, /updatePassword|passwordHash|setCustomUserClaims|accountStatus:\s*"active"/);
});

test("phase 22g.4.1 login reset-complete message is persistent", () => {
  const login = read("src/modules/auth/LoginPage.jsx");
  assert.match(login, /resetComplete/);
  assert.match(login, /تم تحديث كلمة المرور/);
  assert.match(login, /يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة/);
  assert.doesNotMatch(login, /setTimeout[^;]*resetComplete/);
});

test("phase 22g.4.1 preserves JIT, legacy, session, logout, and registration wiring", () => {
  const provider = read("src/app/providers/AuthProvider.jsx");
  assert.match(provider, /establishJitFirebaseSession/);
  assert.match(provider, /buildPasswordHash/);
  assert.match(provider, /passwordHash/);
  assert.match(provider, /readStoredSession/);
  assert.match(provider, /terminateSession/);
  assert.match(provider, /registerAccount/);
});
