import {
  firebaseSendCurrentUserEmailVerification,
  firebaseSignInWithCustomToken,
  firebaseSignOut,
  getFirebaseIdToken,
} from "./firebaseAuth";

async function postJson(url, payload, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers,
    body: JSON.stringify(payload || {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    const message = body?.error || body?.message || "تعذر تنفيذ العملية. حاول مرة أخرى.";
    const reference = body?.correlationId ? `\nرقم مرجعي للمحاولة: ${body.correlationId}` : "";
    const error = new Error(`${message}${reference}`);
    error.code = body?.error || "request_failed";
    error.status = response.status;
    error.retryAfterSeconds = body?.retryAfterSeconds;
    throw error;
  }
  return body;
}

export async function verifyEmployeeRegistrationIdentity(identity) {
  return postJson("/api/auth/verify-employee", identity);
}

export async function completeEmployeeRegistration(payload) {
  const result = await postJson("/api/auth/register-complete", payload);
  if (result.customToken) {
    await firebaseSignInWithCustomToken(result.customToken);
    await firebaseSendCurrentUserEmailVerification();
  }
  return result.account;
}

export async function resendCurrentUserVerificationEmail() {
  await firebaseSendCurrentUserEmailVerification();
}

export async function clearRegistrationFirebaseSession() {
  await firebaseSignOut();
}

export async function requestAccountRecovery(payload) {
  return postJson("/api/auth/recovery-request", payload);
}

export async function approvePendingAccount(accountId, role) {
  const token = await getFirebaseIdToken(true);
  return postJson(
    "/api/admin/accounts/approve",
    { accountId, role },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function rejectPendingAccount(accountId, reason = "") {
  const token = await getFirebaseIdToken(true);
  return postJson(
    "/api/admin/accounts/reject",
    { accountId, reason },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function fetchSecurityAccounts() {
  const token = await getFirebaseIdToken(true);
  const response = await fetch("/api/admin/accounts/list", {
    method: "GET",
    credentials: "same-origin",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    throw new Error(body?.error || "تعذر تحميل مركز الأمان.");
  }
  return body;
}

export async function runSecurityAccountAction(payload) {
  const token = await getFirebaseIdToken(true);
  return postJson("/api/admin/accounts/action", payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function runRecoveryAction(payload) {
  const token = await getFirebaseIdToken(true);
  return postJson("/api/admin/recovery/action", payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
