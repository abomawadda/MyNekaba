/* global Buffer */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminContext } from "../../_lib/firebaseAdmin.js";
import { requireAdminActor } from "../../_lib/adminAuthorization.js";

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
    const reason = String(body.reason || "").slice(0, 300);
    if (!accountId) return res.status(400).json({ success: false, error: "missing_account" });

    const accountRef = context.db.collection("user_accounts").doc(accountId);
    const accountSnap = await accountRef.get();
    if (!accountSnap.exists) return res.status(404).json({ success: false, error: "missing_account" });
    const account = accountSnap.data() || {};
    if (account.accountStatus !== "pending_approval") {
      return res.status(409).json({ success: false, error: "not_pending_approval" });
    }

    await accountRef.update({
      accountStatus: "rejected",
      registrationState: "rejected",
      rejectedAt: FieldValue.serverTimestamp(),
      rejectedAtIso: new Date().toISOString(),
      rejectedBy: actor.id,
      rejectionReason: reason,
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    });

    await context.db.collection("audit_logs").add({
      action: "registration.rejected",
      userId: actor.id,
      userName: actor.fullName || actor.displayName || "",
      role: actor.role,
      targetId: accountId,
      riskLevel: "medium",
      details: { hasReason: Boolean(reason) },
      createdAt: FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("account_reject_failed", { reason: error?.message || "unknown" });
    return res.status(403).json({ success: false, error: "unauthorized" });
  }
}
