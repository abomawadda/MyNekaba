/* global Buffer */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminContext, readCollection } from "../_lib/firebaseAdmin.js";
import {
  DUPLICATE_ACCOUNT_ERROR,
  IDENTITY_ERROR,
  buildEmployeePreview,
  findStrictEmployee,
  hasDuplicateAccount,
  hashAuditValue,
  normalizeDigits,
  randomToken,
} from "../_lib/registrationCore.js";

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function rateKey(req, body) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "ip";
  return `${ip}:${hashAuditValue([body.nationalId, body.employeeCode || body.jobCode, body.phone].join(":"))}`;
}

function isRateLimited(req, body) {
  const key = rateKey(req, body);
  const now = Date.now();
  const current = attempts.get(key) || { count: 0, firstAt: now };
  const next = now - current.firstAt > WINDOW_MS ? { count: 0, firstAt: now } : current;
  next.count += 1;
  attempts.set(key, next);
  return next.count > MAX_ATTEMPTS;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ success: false, error: IDENTITY_ERROR });

  try {
    const body = await readBody(req);
    if (isRateLimited(req, body)) return res.status(429).json({ success: false, error: IDENTITY_ERROR });

    const identity = {
      nationalId: normalizeDigits(body.nationalId),
      employeeCode: normalizeDigits(body.employeeCode || body.jobCode),
      phone: normalizeDigits(body.phone),
    };
    if (!identity.nationalId || !identity.employeeCode || !identity.phone) {
      return res.status(400).json({ success: false, error: IDENTITY_ERROR });
    }

    const { db } = getAdminContext();
    const [employees, accounts, requestsSnapshot] = await Promise.all([
      readCollection(db, "employees"),
      readCollection(db, "user_accounts"),
      readCollection(db, "registration_requests"),
    ]);

    const { employee } = findStrictEmployee(employees, identity);
    if (!employee) {
      await db.collection("audit_logs").add({
        action: "registration.identity_failed",
        riskLevel: "medium",
        details: { identityHash: hashAuditValue(Object.values(identity).join(":")) },
        createdAt: FieldValue.serverTimestamp(),
        createdAtIso: new Date().toISOString(),
      });
      return res.status(401).json({ success: false, error: IDENTITY_ERROR });
    }

    const duplicate = hasDuplicateAccount(accounts, employee, requestsSnapshot);
    if (duplicate.duplicate) {
      return res.status(409).json({ success: false, error: DUPLICATE_ACCOUNT_ERROR });
    }

    const verificationToken = randomToken(24);
    const preview = buildEmployeePreview(employee);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const requestRef = await db.collection("registration_requests").add({
      status: "identity_verified",
      verificationTokenHash: hashAuditValue(verificationToken),
      employeeId: preview.employeeId,
      employeeCode: preview.employeeCode,
      phoneHash: hashAuditValue(identity.phone),
      nationalIdHash: hashAuditValue(identity.nationalId),
      createdAt: FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString(),
      expiresAt,
    });

    await db.collection("audit_logs").add({
      action: "registration.identity_verified",
      targetId: requestRef.id,
      riskLevel: "low",
      details: { employeeId: preview.employeeId, employeeCode: preview.employeeCode },
      createdAt: FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      verificationId: requestRef.id,
      verificationToken,
      expiresAt,
      employee: preview,
    });
  } catch (error) {
    console.error("verify_employee_failed", { reason: error?.message || "unknown" });
    return res.status(500).json({ success: false, error: IDENTITY_ERROR });
  }
}
