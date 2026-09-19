/* global Buffer */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminContext, readCollection } from "../_lib/firebaseAdmin.js";
import {
  DUPLICATE_ACCOUNT_ERROR,
  IDENTITY_ERROR,
  REGISTRATION_STATES,
  employeeKeys,
  hasDuplicateAccount,
  hashAuditValue,
  isEmail,
  normalizeEmail,
  randomToken,
  resolveRegistrationIdentityContext,
  validatePasswordPolicy,
} from "../_lib/registrationCore.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function buildUsername(employeeCode = "") {
  return `emp_${employeeCode || randomToken(3)}`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ success: false, error: IDENTITY_ERROR });

  let createdUid = "";
  let accountRef = null;
  try {
    const body = await readBody(req);
    const verificationId = String(body.verificationId || "");
    const verificationToken = String(body.verificationToken || "");
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");
    const emailMode = String(body.emailMode || "new");
    const requestedEmail = normalizeEmail(body.email);

    if (!verificationId || !verificationToken || !password) {
      return res.status(400).json({ success: false, error: IDENTITY_ERROR });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: "كلمتا المرور غير متطابقتين." });
    }

    const { auth, db } = getAdminContext();
    const requestDoc = await db.collection("registration_requests").doc(verificationId).get();
    if (!requestDoc.exists) return res.status(404).json({ success: false, error: IDENTITY_ERROR });

    const request = { id: requestDoc.id, ...requestDoc.data() };
    if (
      request.status !== REGISTRATION_STATES.identityVerified ||
      request.verificationTokenHash !== hashAuditValue(verificationToken) ||
      new Date(request.expiresAt || 0).getTime() <= Date.now()
    ) {
      return res.status(409).json({ success: false, error: IDENTITY_ERROR });
    }

    const [employees, accounts, requests] = await Promise.all([
      readCollection(db, "employees"),
      readCollection(db, "user_accounts"),
      readCollection(db, "registration_requests"),
    ]);
    const employee = employees.find((item) => String(item.id) === String(request.employeeId));
    if (!employee) return res.status(404).json({ success: false, error: IDENTITY_ERROR });

    const keys = employeeKeys(employee);
    const email = emailMode === "registered" && keys.email ? keys.email : requestedEmail;
    if (!isEmail(email)) return res.status(400).json({ success: false, error: IDENTITY_ERROR });

    const otherRequests = requests.filter((item) => item.id !== request.id);
    const identityContext = await resolveRegistrationIdentityContext({ auth, accounts, requests: otherRequests });
    const duplicate = hasDuplicateAccount(accounts, employee, otherRequests, identityContext);
    if (duplicate.duplicate) return res.status(409).json({ success: false, error: DUPLICATE_ACCOUNT_ERROR });

    const passwordCheck = validatePasswordPolicy(password, {
      fullName: employee.name || employee.fullName,
      phone: keys.phone,
      email,
      username: buildUsername(keys.employeeCode),
    });
    if (!passwordCheck.valid) return res.status(400).json({ success: false, error: "كلمة المرور لا تطابق سياسة الأمان." });

    try {
      await auth.getUserByEmail(email);
      return res.status(409).json({ success: false, error: "هذا البريد مرتبط بالفعل بحساب آخر." });
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }

    const authUser = await auth.createUser({
      email,
      password,
      displayName: employee.name || employee.fullName || "",
      emailVerified: false,
      disabled: false,
    });
    createdUid = authUser.uid;

    accountRef = db.collection("user_accounts").doc();
    const accountId = accountRef.id;
    const username = buildUsername(keys.employeeCode);
    await auth.setCustomUserClaims(authUser.uid, { accountId });

    await accountRef.set({
      id: accountId,
      firebaseUid: authUser.uid,
      employeeId: keys.employeeId,
      employeeCode: keys.employeeCode,
      nationalId: keys.nationalId,
      phone: keys.phone,
      email,
      username,
      fullName: employee.name || employee.fullName || "",
      displayName: employee.name || employee.fullName || "",
      role: "member",
      authMode: "firebase-native",
      credentialAuthority: "firebase",
      title: "عضو",
      membershipStatus: employee.membershipStatus || "عضو جمعية عمومية",
      accountStatus: "pending_approval",
      registrationState: REGISTRATION_STATES.emailPendingVerification,
      emailVerified: false,
      permissionOverrides: [],
      createdAt: FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    });

    await db.collection("registration_requests").doc(verificationId).update({
      status: REGISTRATION_STATES.emailPendingVerification,
      accountId,
      firebaseUid: authUser.uid,
      email: normalizeEmail(email),
      completedAtIso: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection("audit_logs").add({
      action: "registration.account_created",
      targetId: accountId,
      riskLevel: "medium",
      details: { employeeId: keys.employeeId, employeeCode: keys.employeeCode, requestId: verificationId },
      createdAt: FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    });

    const customToken = await auth.createCustomToken(authUser.uid, { accountId });
    return res.status(200).json({
      success: true,
      customToken,
      account: { accountId, username, status: "pending_approval", emailVerificationRequired: true },
    });
  } catch (error) {
    if (accountRef) {
      try {
        await accountRef.delete();
      } catch {
        // best-effort rollback
      }
    }
    if (createdUid) {
      try {
        const { auth } = getAdminContext();
        await auth.deleteUser(createdUid);
      } catch {
        // best-effort rollback
      }
    }
    console.error("register_complete_failed", { reason: error?.message || "unknown" });
    return res.status(500).json({ success: false, error: IDENTITY_ERROR });
  }
}
