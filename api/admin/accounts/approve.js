/* global Buffer */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminContext } from "../../_lib/firebaseAdmin.js";
import { requireAdminActor } from "../../_lib/adminAuthorization.js";
import {
  IDENTITY_CLASSIFICATION_ERROR,
  validateIdentityClassification,
} from "../../_lib/identityClassification.js";

const ALLOWED_ROLES = new Set(["admin", "treasurer", "dataEntry", "auditor", "viewer", "member"]);

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });

  try {
    const context = getAdminContext();
    const actor = await requireAdminActor(req, context);
    const body = await readBody(req);
    const accountId = String(body.accountId || "");
    const role = ALLOWED_ROLES.has(body.role) ? body.role : "member";
    if (!accountId) return res.status(400).json({ success: false, error: "missing_account" });

    const ref = context.db.collection("user_accounts").doc(accountId);
    const requestsQuery = context.db
      .collection("registration_requests")
      .where("accountId", "==", accountId);
    const auditRef = context.db.collection("audit_logs").doc();
    const approvedAtIso = new Date().toISOString();
    await context.db.runTransaction(async (transaction) => {
      const [accountDoc, requestsSnapshot] = await Promise.all([
        transaction.get(ref),
        transaction.get(requestsQuery),
      ]);
      if (!accountDoc.exists) throw new Error("account_not_found");
      const account = accountDoc.data();
      if (account.accountStatus !== "pending_approval") throw new Error("account_not_pending");
      const employeeRef = account.employeeId
        ? context.db.collection("employees").doc(String(account.employeeId))
        : null;
      if (!employeeRef) throw new Error(IDENTITY_CLASSIFICATION_ERROR.employeeMappingMissing);
      const employeeDoc = await transaction.get(employeeRef);
      const duplicateQueries = [
        context.db.collection("user_accounts").where("employeeId", "==", String(account.employeeId)),
        account.employeeCode
          ? context.db.collection("user_accounts").where("employeeCode", "==", String(account.employeeCode))
          : null,
        account.employeeCode
          ? context.db.collection("user_accounts").where("jobId", "==", String(account.employeeCode))
          : null,
        account.nationalId
          ? context.db.collection("user_accounts").where("nationalId", "==", String(account.nationalId))
          : null,
      ].filter(Boolean);
      const duplicateSnapshots = await Promise.all(
        duplicateQueries.map((query) => transaction.get(query))
      );
      const duplicateAccounts = Array.from(
        new Map(
          duplicateSnapshots
            .flatMap((snapshot) => snapshot.docs)
            .map((doc) => [doc.id, { id: doc.id, ...doc.data() }])
        ).values()
      );
      const identityValidation = validateIdentityClassification({
        account: { id: accountDoc.id, ...account },
        employees: employeeDoc.exists ? [{ id: employeeDoc.id, ...employeeDoc.data() }] : [],
        accounts: duplicateAccounts,
      });
      if (!identityValidation.valid) throw new Error(identityValidation.error);
      const openRequests = requestsSnapshot.docs.filter((requestDoc) =>
        ["email_pending_verification", "pending_approval"].includes(requestDoc.data().status)
      );
      if (openRequests.length > 1) throw new Error("ambiguous_registration_request");
      const firebaseNative = Boolean(account.firebaseUid && !account.passwordHash && !account.passwordSalt);
      if (firebaseNative && openRequests.length !== 1) throw new Error("registration_request_missing");
      const requestRef = openRequests[0]?.ref || null;

      if (requestRef) {
        transaction.update(requestRef, {
          status: "completed",
          completedAt: FieldValue.serverTimestamp(),
          completedAtIso: approvedAtIso,
          completedBy: actor.id,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtIso: approvedAtIso,
        });
      }

      transaction.update(ref, {
        role,
        accountStatus: "active",
        registrationState: "active",
        approvedAt: FieldValue.serverTimestamp(),
        approvedAtIso,
        approvedBy: actor.id,
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtIso: approvedAtIso,
      });

      transaction.set(auditRef, {
        action: "registration.approved",
        userId: actor.id,
        userName: actor.fullName || actor.displayName || "",
        role: actor.role,
        targetId: accountId,
        riskLevel: role === "admin" || role === "treasurer" ? "high" : "medium",
        details: { assignedRole: role, registrationRequestTransitioned: Boolean(requestRef) },
        createdAt: FieldValue.serverTimestamp(),
        createdAtIso: approvedAtIso,
      });
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    const reason = error?.message || "unknown";
    console.error("account_approve_failed", { reason });
    if (reason === "account_not_found") return res.status(404).json({ success: false, error: reason });
    if ([
      "account_not_pending",
      "ambiguous_registration_request",
      "registration_request_missing",
      ...Object.values(IDENTITY_CLASSIFICATION_ERROR),
    ].includes(reason)) {
      return res.status(409).json({ success: false, error: reason });
    }
    return res.status(403).json({ success: false, error: "unauthorized" });
  }
}
