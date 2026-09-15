/* global Buffer */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminContext } from "../../_lib/firebaseAdmin.js";
import { requireAdminActor } from "../../_lib/adminAuthorization.js";

const ROLE_WHITELIST = new Set(["admin", "treasurer", "dataEntry", "auditor", "viewer", "member"]);
const STATUS_WHITELIST = new Set(["pending_approval", "active", "rejected", "suspended", "deleted"]);

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function nowPayload(prefix = "updated") {
  return {
    [`${prefix}At`]: FieldValue.serverTimestamp(),
    [`${prefix}AtIso`]: new Date().toISOString(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtIso: new Date().toISOString(),
  };
}

async function countActiveAdmins(db, exceptAccountId = "") {
  const snapshot = await db.collection("user_accounts").where("role", "==", "admin").where("accountStatus", "==", "active").get();
  return snapshot.docs.filter((doc) => doc.id !== exceptAccountId).length;
}

async function revokeSessions(db, accountId, reason = "security_admin_action") {
  const snapshot = await db.collection("auth_sessions").where("userId", "==", accountId).where("status", "==", "active").get();
  await Promise.all(
    snapshot.docs.map((doc) =>
      doc.ref.update({
        status: "revoked",
        revokedReason: reason,
        revokedAt: FieldValue.serverTimestamp(),
        revokedAtIso: new Date().toISOString(),
      })
    )
  );
  return snapshot.size;
}

async function audit(db, actor, action, targetId, details = {}, riskLevel = "medium") {
  await db.collection("audit_logs").add({
    action,
    userId: actor.id,
    userName: actor.fullName || actor.displayName || "",
    role: actor.role,
    targetId,
    riskLevel,
    details,
    page: "/security",
    createdAt: FieldValue.serverTimestamp(),
    createdAtIso: new Date().toISOString(),
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
    const accountId = String(body.accountId || "");
    const reason = String(body.reason || "").trim().slice(0, 500);
    if (!accountId) return res.status(400).json({ success: false, error: "missing_account" });

    const accountRef = context.db.collection("user_accounts").doc(accountId);
    const accountSnap = await accountRef.get();
    if (!accountSnap.exists) return res.status(404).json({ success: false, error: "missing_account" });
    const account = { id: accountSnap.id, ...accountSnap.data() };
    if (account.id === actor.id && ["delete", "suspend"].includes(action)) {
      return res.status(409).json({ success: false, error: "self_action_denied" });
    }

    if (action === "changeRole") {
      const role = String(body.role || "");
      if (!ROLE_WHITELIST.has(role)) return res.status(400).json({ success: false, error: "invalid_role" });
      if (account.role === "admin" && role !== "admin" && (await countActiveAdmins(context.db, account.id)) < 1) {
        return res.status(409).json({ success: false, error: "last_admin_protected" });
      }
      await accountRef.update({ role, title: role, ...nowPayload("roleChanged"), roleChangedBy: actor.id });
      await audit(context.db, actor, "security.role_changed", account.id, { role }, ["admin", "treasurer"].includes(role) ? "high" : "medium");
      return res.status(200).json({ success: true });
    }

    if (action === "setStatus") {
      const accountStatus = String(body.accountStatus || "");
      if (!STATUS_WHITELIST.has(accountStatus)) return res.status(400).json({ success: false, error: "invalid_status" });
      if (account.role === "admin" && accountStatus !== "active" && (await countActiveAdmins(context.db, account.id)) < 1) {
        return res.status(409).json({ success: false, error: "last_admin_protected" });
      }
      const prefix = accountStatus === "suspended" ? "suspended" : accountStatus === "active" ? "reactivated" : "statusChanged";
      await accountRef.update({ accountStatus, [`${prefix}By`]: actor.id, [`${prefix}Reason`]: reason, ...nowPayload(prefix) });
      if (account.firebaseUid && ["suspended", "deleted"].includes(accountStatus)) {
        await context.auth.updateUser(account.firebaseUid, { disabled: true }).catch(() => null);
      }
      if (account.firebaseUid && accountStatus === "active") {
        await context.auth.updateUser(account.firebaseUid, { disabled: false }).catch(() => null);
      }
      if (accountStatus === "suspended") await revokeSessions(context.db, account.id, "account_suspended");
      await audit(context.db, actor, `security.account_${accountStatus}`, account.id, { reason: Boolean(reason) }, accountStatus === "active" ? "medium" : "high");
      return res.status(200).json({ success: true });
    }

    if (action === "overrideEmailVerification") {
      if (!reason) return res.status(400).json({ success: false, error: "reason_required" });
      await accountRef.update({
        emailVerificationOverride: true,
        emailVerificationOverrideBy: actor.id,
        emailVerificationOverrideReason: reason,
        ...nowPayload("emailVerificationOverride"),
      });
      await audit(context.db, actor, "security.email_verification_override", account.id, { reasonProvided: true }, "high");
      return res.status(200).json({ success: true });
    }

    if (action === "removeEmailVerificationOverride") {
      await accountRef.update({
        emailVerificationOverride: false,
        emailVerificationOverrideRemovedBy: actor.id,
        ...nowPayload("emailVerificationOverrideRemoved"),
      });
      await audit(context.db, actor, "security.email_verification_override_removed", account.id, {}, "high");
      return res.status(200).json({ success: true });
    }

    if (action === "resendVerification") {
      if (!account.firebaseUid || !account.email) return res.status(409).json({ success: false, error: "missing_firebase_account" });
      const cooldownMs = 60 * 1000;
      const lastAt = new Date(account.lastVerificationLinkCreatedAtIso || 0).getTime();
      if (lastAt && Date.now() - lastAt < cooldownMs) {
        return res.status(429).json({ success: false, error: "cooldown_active", retryAfterSeconds: Math.ceil((cooldownMs - (Date.now() - lastAt)) / 1000) });
      }
      const link = await context.auth.generateEmailVerificationLink(account.email, {
        url: "https://mynekaba.vercel.app/login?emailVerified=1",
        handleCodeInApp: false,
      });
      await accountRef.update({
        lastVerificationLinkCreatedBy: actor.id,
        lastVerificationLinkCreatedAt: FieldValue.serverTimestamp(),
        lastVerificationLinkCreatedAtIso: new Date().toISOString(),
      });
      await audit(context.db, actor, "security.email_verification_link_created", account.id, { delivery: "manual_admin_copy" }, "medium");
      return res.status(200).json({ success: true, verificationLink: link, cooldownSeconds: 60 });
    }

    if (action === "revokeSessions") {
      const count = await revokeSessions(context.db, account.id, "admin_revoked");
      if (account.firebaseUid) await context.auth.revokeRefreshTokens(account.firebaseUid).catch(() => null);
      await audit(context.db, actor, "security.sessions_revoked", account.id, { count }, "medium");
      return res.status(200).json({ success: true, revokedSessions: count });
    }

    if (action === "delete") {
      if (!reason) return res.status(400).json({ success: false, error: "reason_required" });
      if (account.role === "admin" && (await countActiveAdmins(context.db, account.id)) < 1) {
        return res.status(409).json({ success: false, error: "last_admin_protected" });
      }
      await revokeSessions(context.db, account.id, "account_deleted");
      if (account.firebaseUid) {
        await context.auth.revokeRefreshTokens(account.firebaseUid).catch(() => null);
        await context.auth.deleteUser(account.firebaseUid).catch((error) => {
          if (error?.code !== "auth/user-not-found") throw error;
        });
      }
      await accountRef.update({
        accountStatus: "deleted",
        deletedBy: actor.id,
        deleteReason: reason,
        firebaseUidDeleted: Boolean(account.firebaseUid),
        ...nowPayload("deleted"),
      });
      await audit(context.db, actor, "security.account_deleted", account.id, { reasonProvided: true, firebaseUidDeleted: Boolean(account.firebaseUid) }, "high");
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: "unknown_action" });
  } catch (error) {
    console.error("security_account_action_failed", { reason: error?.message || "unknown" });
    return res.status(403).json({ success: false, error: "unauthorized" });
  }
}
