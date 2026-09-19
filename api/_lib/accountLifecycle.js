export const APPROVAL_FLOW_REQUIRED = "APPROVAL_FLOW_REQUIRED";
export const INVALID_REACTIVATION_STATE = "INVALID_REACTIVATION_STATE";

const OPEN_REGISTRATION_STATES = new Set([
  "identity_verified",
  "email_pending_verification",
  "pending_approval",
  "recovery_pending",
]);

const TERMINAL_REGISTRATION_STATES = new Set([
  "completed",
  "approved",
  "retired",
  "expired",
  "rejected",
]);

const REACTIVATABLE_ACCOUNT_STATES = new Set(["active", "suspended", "blocked", "inactive"]);

function isFirebaseNativeAccount(account = {}) {
  return (
    account.authMode === "firebase-native" ||
    account.credentialAuthority === "firebase" ||
    Boolean(account.firebaseUid && !account.passwordHash && !account.passwordSalt)
  );
}

export function validateGenericActiveTransition(account = {}, registrationRequests = []) {
  if (account.accountStatus === "pending_approval") {
    return { allowed: false, error: APPROVAL_FLOW_REQUIRED, reason: "first_time_approval" };
  }

  const openRequest = registrationRequests.find((request) =>
    OPEN_REGISTRATION_STATES.has(String(request.status || ""))
  );
  if (openRequest) {
    return { allowed: false, error: APPROVAL_FLOW_REQUIRED, reason: "open_registration_request" };
  }

  const registrationState = String(account.registrationState || "");
  if (OPEN_REGISTRATION_STATES.has(registrationState)) {
    return { allowed: false, error: APPROVAL_FLOW_REQUIRED, reason: "incomplete_registration_state" };
  }

  if (isFirebaseNativeAccount(account)) {
    const completedRequest = registrationRequests.some((request) =>
      TERMINAL_REGISTRATION_STATES.has(String(request.status || "")) &&
      ["completed", "approved"].includes(String(request.status || ""))
    );
    if (registrationState !== "active" || !completedRequest) {
      return { allowed: false, error: APPROVAL_FLOW_REQUIRED, reason: "canonical_approval_not_proven" };
    }
  }

  if (!REACTIVATABLE_ACCOUNT_STATES.has(String(account.accountStatus || ""))) {
    return { allowed: false, error: INVALID_REACTIVATION_STATE, reason: "status_not_reactivatable" };
  }

  return { allowed: true, error: "", reason: "post_approval_reactivation" };
}
