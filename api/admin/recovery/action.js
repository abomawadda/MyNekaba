/* global Buffer, process */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminContext } from "../../_lib/firebaseAdmin.js";
import { requireAdminActor } from "../../_lib/adminAuthorization.js";
import {
  OPEN_RECOVERY_STATUSES,
  RECOVERY_ACTION,
  RECOVERY_STATUS,
  appendHistory,
  buildHistoryEvent,
  recoveryAuthMode,
  safeReason,
  validateRecoveryAction,
} from "../../_lib/recoveryWorkflow.js";

const ACTION_AUDIT = Object.freeze({
  [RECOVERY_ACTION.startReview]: "auth.recovery_review_started",
  [RECOVERY_ACTION.approve]: "auth.recovery_approved",
  [RECOVERY_ACTION.reject]: "auth.recovery_rejected",
  [RECOVERY_ACTION.manualFollowUp]: "auth.recovery_manual_follow_up_started",
  [RECOVERY_ACTION.complete]: "auth.recovery_completed",
});

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function workflowError(code, status = 409) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function auditPayload(actor, action, requestId, accountId, from, to, details = {}) {
  return {
    action,
    userId: actor.id,
    userName: actor.fullName || actor.displayName || "",
    role: actor.role,
    targetId: requestId,
    riskLevel: action.includes("reset") || action.includes("completed") ? "high" : "medium",
    details: { recoveryRequestId: requestId, accountId, statusBefore: from, statusAfter: to, ...details },
    page: "/security",
    createdAt: FieldValue.serverTimestamp(),
    createdAtIso: new Date().toISOString(),
  };
}

function assertFresh(request, body) {
  const expectedStatus = String(body.expectedStatus || "");
  const expectedVersion = Number(body.expectedVersion);
  if (expectedStatus && expectedStatus !== request.status) throw workflowError("stale_recovery_state");
  if (Number.isFinite(expectedVersion) && expectedVersion !== Number(request.version || 0)) {
    throw workflowError("stale_recovery_state");
  }
}

async function getOtherOpenCases(transaction, db, request) {
  if (!request.accountId) return [];
  const query = db
    .collection("account_recovery_requests")
    .where("accountId", "==", request.accountId);
  const snapshot = await transaction.get(query);
  return snapshot.docs
    .filter((doc) => doc.id !== request.id && OPEN_RECOVERY_STATUSES.includes(doc.data().status))
    .map((doc) => ({ id: doc.id, ...doc.data() }));
}

function transitionUpdate({ action, actor, request, validation, reason, notes, nowIso }) {
  const base = {
    status: validation.to,
    version: Number(request.version || 0) + 1,
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtIso: nowIso,
    lastActionAt: FieldValue.serverTimestamp(),
    lastActionAtIso: nowIso,
    history: appendHistory(
      request.history,
      buildHistoryEvent({ action, actor, from: validation.from, to: validation.to, reason, notes, atIso: nowIso })
    ),
  };

  if (action === RECOVERY_ACTION.startReview) {
    return { ...base, reviewerId: actor.id, reviewerName: actor.fullName || actor.displayName || "", reviewStartedAt: FieldValue.serverTimestamp(), reviewStartedAtIso: nowIso };
  }
  if (action === RECOVERY_ACTION.approve) {
    return { ...base, approvedBy: actor.id, approvedAt: FieldValue.serverTimestamp(), approvedAtIso: nowIso, approvalReason: reason, reviewNotes: notes };
  }
  if (action === RECOVERY_ACTION.reject) {
    return { ...base, rejectedBy: actor.id, rejectedAt: FieldValue.serverTimestamp(), rejectedAtIso: nowIso, rejectionReason: reason, reviewNotes: notes };
  }
  if (action === RECOVERY_ACTION.manualFollowUp) {
    return { ...base, recoveryActionMethod: "manual_admin_follow_up", recoveryActionStatus: "required", recoveryActionBy: actor.id, recoveryActionAt: FieldValue.serverTimestamp(), recoveryActionAtIso: nowIso, recoveryActionReason: reason };
  }
  if (action === RECOVERY_ACTION.complete) {
    return { ...base, completedBy: actor.id, completedAt: FieldValue.serverTimestamp(), completedAtIso: nowIso, completionMethod: request.recoveryActionMethod, completionNote: notes, recoveryActionStatus: "completed" };
  }
  return base;
}

async function runTransition(context, actor, body) {
  const requestId = String(body.recoveryRequestId || "");
  const action = String(body.action || "");
  const reason = safeReason(body.reason, 300);
  const notes = safeReason(body.notes, 500);
  if (!requestId) throw workflowError("missing_recovery_request", 400);

  const result = await context.db.runTransaction(async (transaction) => {
    const requestRef = context.db.collection("account_recovery_requests").doc(requestId);
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) throw workflowError("missing_recovery_request", 404);
    const request = { id: requestSnap.id, ...requestSnap.data() };
    assertFresh(request, body);
    if (!request.accountId) throw workflowError("missing_account", 404);

    const accountRef = context.db.collection("user_accounts").doc(String(request.accountId || ""));
    const accountSnap = await transaction.get(accountRef);
    if (!accountSnap.exists) throw workflowError("missing_account", 404);
    const account = { id: accountSnap.id, ...accountSnap.data() };
    const validation = validateRecoveryAction({ request, action, reason, account });
    if (!validation.ok) throw workflowError(validation.error, validation.error === "reason_required" ? 400 : 409);
    if (
      request.status === RECOVERY_STATUS.underReview &&
      request.reviewerId &&
      request.reviewerId !== actor.id &&
      [RECOVERY_ACTION.approve, RECOVERY_ACTION.reject].includes(action)
    ) {
      throw workflowError("reviewer_conflict");
    }

    if ([RECOVERY_ACTION.manualFollowUp].includes(action)) {
      const otherOpen = await getOtherOpenCases(transaction, context.db, request);
      if (otherOpen.length) throw workflowError("other_open_recovery");
    }

    const nowIso = new Date().toISOString();
    const update = transitionUpdate({ action, actor, request, validation, reason, notes, nowIso });
    transaction.update(requestRef, update);
    const auditRef = context.db.collection("audit_logs").doc();
    transaction.set(auditRef, auditPayload(actor, ACTION_AUDIT[action], request.id, account.id, validation.from, validation.to, { reasonCategory: reason ? reason.slice(0, 80) : "" }));
    return { request, account, status: validation.to, version: update.version };
  });

  if (action === RECOVERY_ACTION.complete) {
    const sessions = await context.db.collection("auth_sessions").where("userId", "==", result.account.id).where("status", "==", "active").get();
    await Promise.all(sessions.docs.map((doc) => doc.ref.update({ status: "revoked", revokedReason: "recovery_completed", revokedAt: FieldValue.serverTimestamp(), revokedAtIso: new Date().toISOString() })));
    if (result.account.firebaseUid) await context.auth.revokeRefreshTokens(result.account.firebaseUid).catch(() => null);
  }

  return result;
}

async function sendFirebaseResetEmail(apiKey, email) {
  if (!apiKey) throw workflowError("password_reset_delivery_unavailable", 503);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestType: "PASSWORD_RESET",
      email,
      continueUrl: "https://mynekaba.vercel.app/login?resetComplete=1",
    }),
  });
  if (!response.ok) throw workflowError(response.status === 429 ? "reset_rate_limited" : "password_reset_delivery_failed", response.status === 429 ? 429 : 502);
}

async function reserveResetAction(context, actor, body) {
  const requestId = String(body.recoveryRequestId || "");
  if (!requestId) throw workflowError("missing_recovery_request", 400);
  const lockId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  return context.db.runTransaction(async (transaction) => {
    const requestRef = context.db.collection("account_recovery_requests").doc(requestId);
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) throw workflowError("missing_recovery_request", 404);
    const request = { id: requestSnap.id, ...requestSnap.data() };
    assertFresh(request, body);
    if (!request.accountId) throw workflowError("missing_account", 404);

    const accountRef = context.db.collection("user_accounts").doc(String(request.accountId || ""));
    const accountSnap = await transaction.get(accountRef);
    if (!accountSnap.exists) throw workflowError("missing_account", 404);
    const account = { id: accountSnap.id, ...accountSnap.data() };
    const validation = validateRecoveryAction({ request, action: RECOVERY_ACTION.sendPasswordReset, account });
    if (!validation.ok) throw workflowError(validation.error);

    const lockTime = new Date(request.actionExecutionLockedAtIso || 0).getTime();
    if (request.actionExecutionState === "dispatching" && Date.now() - lockTime < 5 * 60 * 1000) {
      throw workflowError("action_in_progress");
    }
    const otherOpen = await getOtherOpenCases(transaction, context.db, request);
    if (otherOpen.length) throw workflowError("other_open_recovery");

    transaction.update(requestRef, {
      actionExecutionState: "dispatching",
      actionExecutionId: lockId,
      actionExecutionLockedBy: actor.id,
      actionExecutionLockedAtIso: new Date().toISOString(),
      version: Number(request.version || 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    });
    return { request, account, validation, requestRef, lockId };
  });
}

async function releaseResetReservation(context, actor, reservation, failureCode) {
  await context.db.runTransaction(async (transaction) => {
    const snap = await transaction.get(reservation.requestRef);
    if (!snap.exists || snap.data().actionExecutionId !== reservation.lockId) return;
    transaction.update(reservation.requestRef, {
      actionExecutionState: "failed",
      actionExecutionId: FieldValue.delete(),
      actionExecutionFailure: failureCode,
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    });
    transaction.set(context.db.collection("audit_logs").doc(), auditPayload(actor, "auth.recovery_reset_failed", reservation.request.id, reservation.account.id, reservation.request.status, reservation.request.status, { reasonCode: failureCode }));
  });
}

async function runResetAction(context, actor, body) {
  const reservation = await reserveResetAction(context, actor, body);
  try {
    const firebaseUser = await context.auth.getUser(reservation.account.firebaseUid);
    if (!firebaseUser.email || !firebaseUser.emailVerified) throw workflowError("verified_email_required");
    await sendFirebaseResetEmail(process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY, firebaseUser.email);
  } catch (error) {
    await releaseResetReservation(context, actor, reservation, error?.code || "password_reset_delivery_failed");
    throw error;
  }

  return context.db.runTransaction(async (transaction) => {
    const snap = await transaction.get(reservation.requestRef);
    if (!snap.exists) throw workflowError("missing_recovery_request", 404);
    const current = { id: snap.id, ...snap.data() };
    if (current.actionExecutionId !== reservation.lockId || current.status !== RECOVERY_STATUS.approved) {
      throw workflowError("stale_recovery_state");
    }
    const nowIso = new Date().toISOString();
    const nextVersion = Number(current.version || 0) + 1;
    transaction.update(reservation.requestRef, {
      status: RECOVERY_STATUS.actionRequired,
      recoveryActionMethod: "firebase_password_reset_email",
      recoveryActionStatus: "requested",
      recoveryActionBy: actor.id,
      recoveryActionAt: FieldValue.serverTimestamp(),
      recoveryActionAtIso: nowIso,
      actionExecutionState: "completed",
      actionExecutionId: FieldValue.delete(),
      version: nextVersion,
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: nowIso,
      lastActionAt: FieldValue.serverTimestamp(),
      lastActionAtIso: nowIso,
      history: appendHistory(current.history, buildHistoryEvent({ action: RECOVERY_ACTION.sendPasswordReset, actor, from: RECOVERY_STATUS.approved, to: RECOVERY_STATUS.actionRequired, atIso: nowIso })),
    });
    transaction.set(context.db.collection("audit_logs").doc(), auditPayload(actor, "auth.recovery_reset_sent", current.id, reservation.account.id, RECOVERY_STATUS.approved, RECOVERY_STATUS.actionRequired, { delivery: "firebase_email", authMode: recoveryAuthMode(reservation.account) }));
    return { status: RECOVERY_STATUS.actionRequired, version: nextVersion };
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });

  try {
    const context = getAdminContext();
    const actor = await requireAdminActor(req, context);
    const body = await readBody(req);
    const action = String(body.action || "");
    const result = action === RECOVERY_ACTION.sendPasswordReset
      ? await runResetAction(context, actor, body)
      : await runTransition(context, actor, body);
    return res.status(200).json({ success: true, status: result.status, version: result.version });
  } catch (error) {
    console.error("admin_recovery_action_failed", { reason: error?.code || error?.message || "unknown" });
    const status = Number(error?.status || (/token|actor_not_admin|unauthorized/.test(error?.message || "") ? 403 : 409));
    return res.status(status).json({ success: false, error: error?.code || "recovery_action_failed" });
  }
}
