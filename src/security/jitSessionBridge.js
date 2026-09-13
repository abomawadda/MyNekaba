import { firebaseSignInWithCustomToken } from "./firebaseAuth";

const JIT_ENDPOINT = "/api/auth/jit-session";

export const JIT_SESSION_STATE = {
  linked: "firebase-linked",
  legacyOnly: "legacy-only",
  unavailable: "unavailable",
};

export async function establishJitFirebaseSession({ identifier, password, expectedAccountId, expectedFirebaseUid }) {
  if (!identifier || !password || !expectedAccountId) {
    return { state: JIT_SESSION_STATE.unavailable, reason: "missing_input" };
  }

  const response = await fetch(JIT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ identifier, password }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "تعذر تسجيل الدخول. تأكد من البيانات وحاول مرة أخرى.");
  }

  if (payload.firebaseSession === JIT_SESSION_STATE.legacyOnly) {
    return { state: JIT_SESSION_STATE.legacyOnly };
  }

  if (!payload.customToken) {
    return { state: JIT_SESSION_STATE.unavailable, reason: "missing_custom_token" };
  }

  const firebaseUser = await firebaseSignInWithCustomToken(payload.customToken);
  const accountIdClaim = String(firebaseUser.claims?.accountId || "");

  if (accountIdClaim !== expectedAccountId) {
    throw new Error("تعذر التحقق من جلسة Firebase للحساب.");
  }

  if (expectedFirebaseUid && firebaseUser.uid !== expectedFirebaseUid) {
    throw new Error("تعذر التحقق من ربط Firebase للحساب.");
  }

  return {
    state: JIT_SESSION_STATE.linked,
    uid: firebaseUser.uid,
    accountId: accountIdClaim,
  };
}
