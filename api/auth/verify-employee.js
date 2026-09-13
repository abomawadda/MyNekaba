/* global Buffer */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminContext, readCollection } from "../_lib/firebaseAdmin.js";
import {
  DUPLICATE_ACCOUNT_ERROR,
  IDENTITY_ERROR,
  VERIFY_REASON_CODES,
  buildEmployeePreview,
  diagnoseEmployeeIdentity,
  hasDuplicateAccount,
  hashAuditValue,
  normalizeDigits,
  normalizeEgyptianPhone,
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
  res.setHeader("X-Auth-Flow-Version", "22G.2");
  const verificationCorrelationId = `vrf_${randomToken(8)}`;
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: IDENTITY_ERROR, correlationId: verificationCorrelationId });
  }

  try {
    const body = await readBody(req);
    if (isRateLimited(req, body)) {
      console.warn("employee_verification_failed", {
        verificationCorrelationId,
        reasonCode: VERIFY_REASON_CODES.rateLimited,
      });
      return res.status(429).json({ success: false, error: IDENTITY_ERROR, correlationId: verificationCorrelationId });
    }

    const identity = {
      nationalId: normalizeDigits(body.nationalId),
      employeeCode: normalizeDigits(body.employeeCode || body.jobCode),
      phone: normalizeEgyptianPhone(body.phone),
    };
    if (!identity.nationalId || !identity.employeeCode || !identity.phone) {
      console.warn("employee_verification_failed", {
        verificationCorrelationId,
        reasonCode: VERIFY_REASON_CODES.invalidInput,
      });
      return res.status(400).json({ success: false, error: IDENTITY_ERROR, correlationId: verificationCorrelationId });
    }

    const { db } = getAdminContext();
    const [employees, accounts, requestsSnapshot] = await Promise.all([
      readCollection(db, "employees"),
      readCollection(db, "user_accounts"),
      readCollection(db, "registration_requests"),
    ]);

    const diagnosis = diagnoseEmployeeIdentity(employees, identity);
    const { employee } = diagnosis;
    if (!employee) {
      await db.collection("audit_logs").add({
        action: "registration.identity_failed",
        riskLevel: "medium",
        details: {
          verificationCorrelationId,
          reasonCode: diagnosis.reasonCode,
          identityHash: hashAuditValue(Object.values(identity).join(":")),
        },
        createdAt: FieldValue.serverTimestamp(),
        createdAtIso: new Date().toISOString(),
      });
      console.warn("employee_verification_failed", {
        verificationCorrelationId,
        reasonCode: diagnosis.reasonCode,
        employeeCandidateCount: diagnosis.employeeCandidateCount,
        nationalIdMatch: diagnosis.nationalIdMatch,
        jobIdMatch: diagnosis.jobIdMatch,
        phoneMatch: diagnosis.phoneMatch,
        phone2Match: diagnosis.phone2Match,
      });
      return res.status(401).json({ success: false, error: IDENTITY_ERROR, correlationId: verificationCorrelationId });
    }

    const duplicate = hasDuplicateAccount(accounts, employee, requestsSnapshot);
    if (duplicate.duplicate) {
      const reasonCode = duplicate.account ? VERIFY_REASON_CODES.duplicateAccount : VERIFY_REASON_CODES.pendingRequestExists;
      console.warn("employee_verification_blocked", {
        verificationCorrelationId,
        reasonCode,
        employeeCandidateCount: 1,
      });
      return res.status(409).json({ success: false, error: DUPLICATE_ACCOUNT_ERROR, correlationId: verificationCorrelationId });
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
      details: { verificationCorrelationId, employeeId: preview.employeeId, employeeCode: preview.employeeCode },
      createdAt: FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      verificationId: requestRef.id,
      verificationToken,
      expiresAt,
      correlationId: verificationCorrelationId,
      employee: preview,
    });
  } catch (error) {
    console.error("verify_employee_failed", {
      verificationCorrelationId,
      reasonCode: VERIFY_REASON_CODES.internalError,
      reason: error?.message || "unknown",
    });
    return res.status(500).json({ success: false, error: IDENTITY_ERROR, correlationId: verificationCorrelationId });
  }
}
