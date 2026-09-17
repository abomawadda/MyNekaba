export const RECOVERY_STATUS = Object.freeze({
  pending: "recovery_pending",
  underReview: "recovery_under_review",
  approved: "recovery_approved",
  rejected: "recovery_rejected",
  actionRequired: "recovery_action_required",
  completed: "recovery_completed",
  cancelled: "recovery_cancelled",
});

export const RECOVERY_ACTION = Object.freeze({
  startReview: "startReview",
  approve: "approveRecovery",
  reject: "rejectRecovery",
  sendPasswordReset: "sendPasswordReset",
  manualFollowUp: "markManualFollowUp",
  complete: "completeRecovery",
});

export const OPEN_RECOVERY_STATUSES = Object.freeze([
  RECOVERY_STATUS.pending,
  RECOVERY_STATUS.underReview,
  RECOVERY_STATUS.approved,
  RECOVERY_STATUS.actionRequired,
]);

const RULES = Object.freeze({
  [RECOVERY_ACTION.startReview]: {
    from: [RECOVERY_STATUS.pending],
    to: RECOVERY_STATUS.underReview,
  },
  [RECOVERY_ACTION.approve]: {
    from: [RECOVERY_STATUS.underReview],
    to: RECOVERY_STATUS.approved,
    reasonRequired: true,
  },
  [RECOVERY_ACTION.reject]: {
    from: [RECOVERY_STATUS.pending, RECOVERY_STATUS.underReview],
    to: RECOVERY_STATUS.rejected,
    reasonRequired: true,
  },
  [RECOVERY_ACTION.sendPasswordReset]: {
    from: [RECOVERY_STATUS.approved],
    to: RECOVERY_STATUS.actionRequired,
    authModes: ["firebase-native"],
  },
  [RECOVERY_ACTION.manualFollowUp]: {
    from: [RECOVERY_STATUS.approved],
    to: RECOVERY_STATUS.actionRequired,
    authModes: ["legacy", "jit-linked"],
    reasonRequired: true,
  },
  [RECOVERY_ACTION.complete]: {
    from: [RECOVERY_STATUS.actionRequired],
    to: RECOVERY_STATUS.completed,
  },
});

export function recoveryAuthMode(account = {}) {
  if (!account.firebaseUid) return "legacy";
  if (account.authMode === "firebase-native" || account.credentialAuthority === "firebase") return "firebase-native";
  if (
    account.registrationState === "email_pending_verification" ||
    account.registrationState === "pending_approval" ||
    (account.role === "member" && account.email && !account.passwordSalt)
  ) {
    return "firebase-native";
  }
  if (account.passwordHash || account.passwordSalt) return "jit-linked";
  return "firebase-native";
}

export function validateRecoveryAction({ request = {}, action = "", reason = "", account = {} }) {
  const rule = RULES[action];
  if (!rule) return { ok: false, error: "invalid_action" };
  if (!rule.from.includes(request.status)) return { ok: false, error: "invalid_transition" };
  if (rule.reasonRequired && !String(reason || "").trim()) return { ok: false, error: "reason_required" };

  const authMode = recoveryAuthMode(account);
  if (rule.authModes && !rule.authModes.includes(authMode)) {
    return { ok: false, error: "invalid_auth_mode" };
  }
  if (action === RECOVERY_ACTION.sendPasswordReset && (!account.firebaseUid || !account.email)) {
    return { ok: false, error: "missing_firebase_account" };
  }
  if (action === RECOVERY_ACTION.complete && !request.recoveryActionMethod) {
    return { ok: false, error: "recovery_action_required" };
  }

  return { ok: true, from: request.status, to: rule.to, authMode };
}

export function safeReason(value = "", maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

export function maskInternalId(value = "") {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return `${text.slice(0, 2)}••${text.slice(-2)}`;
  return `${text.slice(0, 4)}••••${text.slice(-4)}`;
}

export function maskNationalId(value = "") {
  const text = String(value || "").replace(/\D/g, "");
  if (!text) return "";
  return `${text.slice(0, 2)}${"*".repeat(Math.max(0, text.length - 4))}${text.slice(-2)}`;
}

export function maskPhone(value = "") {
  const text = String(value || "").replace(/\D/g, "");
  if (!text) return "";
  return `${text.slice(0, 3)}${"*".repeat(Math.max(0, text.length - 5))}${text.slice(-2)}`;
}

export function maskEmail(value = "") {
  const [local = "", domain = ""] = String(value || "").trim().split("@");
  if (!local || !domain) return "";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export function buildHistoryEvent({ action, actor = {}, from, to, reason = "", notes = "", atIso }) {
  return {
    action,
    actorId: actor.id || "",
    actorName: actor.fullName || actor.displayName || "",
    from: from || "",
    to: to || "",
    reason: safeReason(reason, 300),
    notes: safeReason(notes, 500),
    atIso: atIso || new Date().toISOString(),
  };
}

export function appendHistory(history, event, limit = 100) {
  return [...(Array.isArray(history) ? history : []), event].slice(-limit);
}

export const RECOVERY_RULES = RULES;
