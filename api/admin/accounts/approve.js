/* global Buffer */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminContext } from "../../_lib/firebaseAdmin.js";
import { requireAdminActor } from "../../_lib/adminAuthorization.js";

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
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: "account_not_found" });
    const account = doc.data();
    if (account.accountStatus !== "pending_approval") {
      return res.status(409).json({ success: false, error: "account_not_pending" });
    }

    await ref.update({
      role,
      accountStatus: "active",
      registrationState: "active",
      approvedAt: FieldValue.serverTimestamp(),
      approvedAtIso: new Date().toISOString(),
      approvedBy: actor.id,
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    });

    await context.db.collection("audit_logs").add({
      action: "registration.approved",
      userId: actor.id,
      userName: actor.fullName || actor.displayName || "",
      role: actor.role,
      targetId: accountId,
      riskLevel: role === "admin" || role === "treasurer" ? "high" : "medium",
      details: { assignedRole: role },
      createdAt: FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("account_approve_failed", { reason: error?.message || "unknown" });
    return res.status(403).json({ success: false, error: "unauthorized" });
  }
}
