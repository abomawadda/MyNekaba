import { getAdminContext, readCollection } from "../../_lib/firebaseAdmin.js";
import { requireAdminActor } from "../../_lib/adminAuthorization.js";
import {
  OPEN_RECOVERY_STATUSES,
  maskEmail,
  maskInternalId,
  maskNationalId,
  maskPhone,
  recoveryAuthMode,
} from "../../_lib/recoveryWorkflow.js";

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
    const [accounts, sessions, auditLogs, recoveries, employees] = await Promise.all([
      readCollection(context.db, "user_accounts"),
      readCollection(context.db, "auth_sessions"),
      readCollection(context.db, "audit_logs"),
      readCollection(context.db, "account_recovery_requests").catch(() => []),
      readCollection(context.db, "employees").catch(() => []),
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
          authMode: recoveryAuthMode(account),
          firebase,
          firebaseUidMasked: firebase?.uidMasked || "",
          emailVerificationState,
          emailVerificationOverride: Boolean(account.emailVerificationOverride),
          emailVerificationOverrideReason: account.emailVerificationOverrideReason || "",
          emailVerificationOverrideAt: toIso(account.emailVerificationOverrideAt) || account.emailVerificationOverrideAtIso || "",
          failedLoginCount: Number(account.failedLoginCount || 0),
          lockedUntil: toIso(account.lockedUntil) || account.lockedUntilIso || account.lockedUntil || "",
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

    const enrichedById = new Map(enriched.map((account) => [String(account.id), account]));
    const rawAccountsById = new Map(accounts.map((account) => [String(account.id), account]));
    const employeesById = new Map(employees.map((employee) => [String(employee.id), employee]));
    const safeRecoveries = recoveries
      .sort((a, b) => String(b.createdAtIso || "").localeCompare(String(a.createdAtIso || "")))
      .slice(0, 100)
      .map((request) => {
        const account = enrichedById.get(String(request.accountId || "")) || null;
        const rawAccount = rawAccountsById.get(String(request.accountId || "")) || {};
        const employee = employeesById.get(String(request.employeeId || rawAccount.employeeId || "")) || {};
        const history = Array.isArray(request.history) && request.history.length
          ? request.history
          : [{ action: "recoveryRequested", actorName: "مقدم الطلب", from: "", to: request.status || "recovery_pending", atIso: request.createdAtIso || "" }];
        const openForAccount = recoveries.filter(
          (candidate) =>
            candidate.id !== request.id &&
            String(candidate.accountId || "") === String(request.accountId || "") &&
            OPEN_RECOVERY_STATUSES.includes(candidate.status)
        ).length;

        return {
          id: request.id,
          requestReference: maskInternalId(request.id),
          status: request.status || "recovery_pending",
          version: Number(request.version || 0),
          source: request.source || "administrative_recovery_form",
          createdAtIso: toIso(request.createdAt) || request.createdAtIso || "",
          updatedAtIso: toIso(request.updatedAt) || request.updatedAtIso || request.createdAtIso || "",
          lastActionAtIso: toIso(request.lastActionAt) || request.lastActionAtIso || request.updatedAtIso || request.createdAtIso || "",
          reviewerName: request.reviewerName || "",
          otherOpenRequestCount: openForAccount,
          employee: {
            fullName: employee.name || account?.fullName || rawAccount.fullName || rawAccount.displayName || "",
            employeeCode: request.employeeCode || employee.jobId || rawAccount.employeeCode || rawAccount.jobId || "",
            organizationalUnit: employee.department || employee.branch || employee.organizationalUnit || employee.workplace || "",
            nationalIdMasked: maskNationalId(employee.nationalId || rawAccount.nationalId),
            phoneMasked: maskPhone(employee.phone || rawAccount.phone),
            emailMasked: maskEmail(account?.email || employee.email || rawAccount.email),
          },
          account: account
            ? {
                reference: maskInternalId(account.id),
                accountStatus: account.accountStatus,
                authMode: account.authMode,
                firebaseLinked: Boolean(rawAccount.firebaseUid),
                firebaseUidMasked: account.firebaseUidMasked || "",
                emailVerificationState: account.emailVerificationState,
                createdAt: account.createdAt,
                lastSignInAt: account.lastSignInAt,
                lastAppActivityAt: account.lastAppActivityAt,
              }
            : null,
          recoveryActionMethod: request.recoveryActionMethod || "",
          recoveryActionStatus: request.recoveryActionStatus || "",
          approvalReason: request.approvalReason || "",
          rejectionReason: request.rejectionReason || "",
          completionNote: request.completionNote || "",
          history: history.slice(-100).map((event) => ({
            action: String(event.action || ""),
            actorName: String(event.actorName || ""),
            from: String(event.from || ""),
            to: String(event.to || ""),
            reason: String(event.reason || "").slice(0, 300),
            notes: String(event.notes || "").slice(0, 500),
            atIso: String(event.atIso || ""),
          })),
        };
      });

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
      recoveryRequests: safeRecoveries,
    });
  } catch (error) {
    console.error("security_accounts_list_failed", { reason: error?.message || "unknown" });
    return res.status(403).json({ success: false, error: "unauthorized" });
  }
}
