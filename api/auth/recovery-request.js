/* global Buffer */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminContext, readCollection } from "../_lib/firebaseAdmin.js";
import {
  RECOVERY_GENERIC,
  findStrictEmployee,
  hashAuditValue,
  normalizeDigits,
} from "../_lib/registrationCore.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ success: false, message: RECOVERY_GENERIC });

  try {
    const body = await readBody(req);
    const identity = {
      nationalId: normalizeDigits(body.nationalId),
      employeeCode: normalizeDigits(body.employeeCode || body.jobCode),
      phone: normalizeDigits(body.phone),
    };
    const { db } = getAdminContext();
    const [employees, accounts, recoveries] = await Promise.all([
      readCollection(db, "employees"),
      readCollection(db, "user_accounts"),
      readCollection(db, "account_recovery_requests"),
    ]);
    const { employee } = findStrictEmployee(employees, identity);

    if (employee) {
      const account = accounts.find(
        (item) =>
          String(item.employeeId || "") === String(employee.id) ||
          normalizeDigits(item.employeeCode || item.jobId) === identity.employeeCode
      );
      const duplicate = recoveries.find(
        (item) =>
          ["recovery_pending", "pending"].includes(item.status) &&
          (item.accountId === account?.id || item.employeeId === employee.id)
      );

      if (account && !duplicate) {
        await db.collection("account_recovery_requests").add({
          status: "recovery_pending",
          accountId: account.id,
          employeeId: String(employee.id),
          employeeCode: identity.employeeCode,
          identityHash: hashAuditValue(Object.values(identity).join(":")),
          createdAt: FieldValue.serverTimestamp(),
          createdAtIso: new Date().toISOString(),
        });
      }
    }

    await db.collection("audit_logs").add({
      action: "recovery.requested",
      riskLevel: "medium",
      details: { identityHash: hashAuditValue(Object.values(identity).join(":")) },
      createdAt: FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, message: RECOVERY_GENERIC });
  } catch (error) {
    console.error("recovery_request_failed", { reason: error?.message || "unknown" });
    return res.status(200).json({ success: true, message: RECOVERY_GENERIC });
  }
}
