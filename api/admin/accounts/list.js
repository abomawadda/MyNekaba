import { getAdminContext, readCollection } from "../../_lib/firebaseAdmin.js";
import { requireAdminActor } from "../../_lib/adminAuthorization.js";

function toIso(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return "";
}

function maskId(value = "") {
  const text = String(value || "");
  if (text.length <= 10) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function authMode(account = {}) {
  if (account.firebaseUid && account.passwordHash) return "jit-linked";
  if (account.firebaseUid) return "firebase-native";
  return "legacy";
}

function latestBy(items = [], predicate, dateKey = "createdAtIso") {
  return items
    .filter(predicate)
    .sort((a, b) => String(b[dateKey] || "").localeCompare(String(a[dateKey] || "")))[0] || null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "method_not_allowed" });

  try {
    const context = getAdminContext();
    const actor = await requireAdminActor(req, context);
    const [accounts, sessions, auditLogs, recoveries] = await Promise.all([
      readCollection(context.db, "user_accounts"),
      readCollection(context.db, "auth_sessions"),
      readCollection(context.db, "audit_logs"),
      readCollection(context.db, "account_recovery_requests").catch(() => []),
    ]);

    const enriched = await Promise.all(
      accounts.map(async (account) => {
        let firebase = null;
        if (account.firebaseUid) {
          try {
            const user = await context.auth.getUser(account.firebaseUid);
            firebase = {
              uid: user.uid,
              uidMasked: maskId(user.uid),
              email: user.email || "",
              emailVerified: Boolean(user.emailVerified),
              disabled: Boolean(user.disabled),
              createdAt: user.metadata?.creationTime || "",
              lastSignInAt: user.metadata?.lastSignInTime || "",
            };
          } catch (error) {
            firebase = { missing: true, reason: error?.code || "auth_user_missing" };
          }
        }

        const activeSessions = sessions.filter((item) => item.userId === account.id && item.status === "active");
        const lastSession = latestBy(sessions, (item) => item.userId === account.id, "lastSeenAtIso");
        const lastAudit = latestBy(auditLogs, (item) => item.targetId === account.id || item.userId === account.id, "createdAtIso");
        const recovery = latestBy(recoveries, (item) => item.accountId === account.id || item.employeeId === account.employeeId, "createdAtIso");
        const emailVerificationState = account.emailVerificationOverride
          ? "overridden"
          : firebase?.emailVerified
            ? "verified"
            : account.firebaseUid
              ? "unverified"
              : "not_applicable";

        return {
          id: account.id,
          fullName: account.fullName || account.displayName || "",
          username: account.username || "",
          email: account.email || "",
          employeeId: account.employeeId || "",
          employeeCode: account.employeeCode || account.jobId || "",
          nationalIdMasked: account.nationalId ? `${String(account.nationalId).slice(0, 2)}**********${String(account.nationalId).slice(-2)}` : "",
          phone: account.phone || "",
          role: account.role || "viewer",
          accountStatus: account.accountStatus || "active",
          registrationState: account.registrationState || "",
          authMode: authMode(account),
          firebase,
          firebaseUidMasked: firebase?.uidMasked || "",
          emailVerificationState,
          emailVerificationOverride: Boolean(account.emailVerificationOverride),
          emailVerificationOverrideReason: account.emailVerificationOverrideReason || "",
          emailVerificationOverrideAt: toIso(account.emailVerificationOverrideAt) || account.emailVerificationOverrideAtIso || "",
          permissionOverrides: Array.isArray(account.permissionOverrides) ? account.permissionOverrides : [],
          createdAt: firebase?.createdAt || toIso(account.createdAt) || account.createdAtIso || "",
          approvedAt: toIso(account.approvedAt) || account.approvedAtIso || "",
          suspendedAt: toIso(account.suspendedAt) || account.suspendedAtIso || "",
          deletedAt: toIso(account.deletedAt) || account.deletedAtIso || "",
          lastSignInAt: firebase?.lastSignInAt || "",
          lastAppActivityAt: lastSession?.lastSeenAtIso || "",
          lastSecurityEvent: lastAudit ? { action: lastAudit.action, at: lastAudit.createdAtIso || "" } : null,
          activeSessionCount: activeSessions.length,
          latestRecoveryStatus: recovery?.status || "",
        };
      })
    );

    return res.status(200).json({
      success: true,
      actor: { id: actor.id, fullName: actor.fullName || actor.displayName || "", role: actor.role },
      accounts: enriched,
      sessions: sessions
        .sort((a, b) => String(b.lastSeenAtIso || b.createdAtIso || "").localeCompare(String(a.lastSeenAtIso || a.createdAtIso || "")))
        .slice(0, 50),
      auditLogs: auditLogs
        .sort((a, b) => String(b.createdAtIso || "").localeCompare(String(a.createdAtIso || "")))
        .slice(0, 80),
      recoveryRequests: recoveries
        .sort((a, b) => String(b.createdAtIso || "").localeCompare(String(a.createdAtIso || "")))
        .slice(0, 50),
    });
  } catch (error) {
    console.error("security_accounts_list_failed", { reason: error?.message || "unknown" });
    return res.status(403).json({ success: false, error: "unauthorized" });
  }
}
