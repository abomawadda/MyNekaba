import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../app/providers/FirebaseProvider";
import { logAuditEvent } from "../utils/auditLog";
import { validatePasswordPolicy } from "./passwordPolicy";
import { firebaseSignUp } from "./firebaseAuth";
import {
  hashValue,
  normalizeLoginIdentifier,
  randomToken,
} from "./session";
import { hasPermission, PERMISSIONS } from "./permissions";

const normalizeDigits = (value = "") =>
  String(value ?? "")
    .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
    .replace(/\D/g, "");

export const normalizeNationalId = (value = "") => normalizeDigits(value);
export const normalizeJobCode = (value = "") => normalizeDigits(value);
export const normalizePhone = (value = "") => normalizeDigits(value);

export const maskNationalId = (value = "") => {
  const digits = normalizeDigits(value);
  if (digits.length < 4) return "—";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

export function matchEmployeeIdentity(employee = {}, { nationalId, jobCode, phone }) {
  const empNid = normalizeNationalId(employee.nationalId || employee.nationalID);
  const empJob = normalizeJobCode(employee.jobId || employee.employeeCode);
  const empPhone = normalizePhone(employee.phone || employee.mobile);
  return (
    empNid &&
    empJob &&
    empPhone &&
    empNid === normalizeNationalId(nationalId) &&
    empJob === normalizeJobCode(jobCode) &&
    empPhone === normalizePhone(phone)
  );
}

export function describeMismatch(employee = {}, { phone }) {
  if (!employee?.id) return "لم يتم العثور على موظف مطابق للبيانات المدخلة.";
  const empPhone = normalizePhone(employee.phone || employee.mobile);
  if (empPhone && empPhone !== normalizePhone(phone)) {
    return "رقم الهاتف غير مطابق للرقم المسجل بالنظام.";
  }
  return "البيانات المدخلة لا تتطابق مع بيانات الموظف المسجلة بالنظام.";
}

export function buildUsername(jobCode, existingUsernames = []) {
  const base = `emp_${normalizeJobCode(jobCode) || randomToken(4)}`;
  if (!existingUsernames.includes(base)) return base;
  let counter = 2;
  while (existingUsernames.includes(`${base}_${counter}`)) counter += 1;
  return `${base}_${counter}`;
}

async function fetchAll(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function verifyMemberIdentity({ nationalId, jobCode, phone }) {
  if (!normalizeNationalId(nationalId) || !normalizeJobCode(jobCode) || !normalizePhone(phone)) {
    throw new Error("أدخل الرقم القومي وكود الموظف ورقم الهاتف.");
  }
  const employees = await fetchAll("employees");
  const matched = employees.find((e) => matchEmployeeIdentity(e, { nationalId, jobCode, phone }));
  if (!matched) {
    const byJob = employees.find((e) => normalizeJobCode(e.jobId || e.employeeCode) === normalizeJobCode(jobCode));
    await logAuditEvent("member.verify_failed", { employeeId: normalizeJobCode(jobCode), riskLevel: "medium" });
    throw new Error(describeMismatch(byJob, { nationalId, jobCode, phone }));
  }
  return matched;
}

export async function findAccountForEmployee(employee) {
  const accounts = await fetchAll("user_accounts");
  const keys = [
    normalizeDigits(employee.id),
    normalizeJobCode(employee.jobId || employee.employeeCode),
    normalizeNationalId(employee.nationalId || employee.nationalID),
    normalizePhone(employee.phone || employee.mobile),
  ].filter(Boolean);
  return (
    accounts.find((a) =>
      [a.employeeId, a.employeeCode, a.jobId, a.nationalId, a.phone, a.email]
        .filter(Boolean)
        .map((v) => String(v))
        .some((v) => keys.includes(v) || keys.includes(normalizeDigits(v)))
    ) || null
  );
}

async function buildPasswordHash(password, salt) {
  return hashValue(`${salt}::${password}`);
}

export async function registerMemberAccount({ employee, password, confirmPassword, email = "" }) {
  if (!employee?.id) throw new Error("بيانات الموظف غير صالحة.");
  if (password !== confirmPassword) throw new Error("تأكيد كلمة المرور غير مطابق.");
  const policy = validatePasswordPolicy(password, {
    fullName: employee.name,
    phone: employee.phone,
    email,
  });
  if (!policy.valid) throw new Error(policy.errors[0]);

  const existing = await findAccountForEmployee(employee);
  if (existing) {
    throw new Error("هذا الموظف لديه حساب بالفعل. يمكنك تسجيل الدخول أو استخدام استعادة كلمة المرور.");
  }

  const accounts = await fetchAll("user_accounts");
  const username = buildUsername(
    employee.jobId || employee.employeeCode,
    accounts.map((a) => a.username).filter(Boolean)
  );
  const accountId = doc(collection(db, "user_accounts")).id;
  const passwordSalt = randomToken(8);
  const passwordHash = await buildPasswordHash(password, passwordSalt);

  const payload = {
    id: accountId,
    fullName: employee.name || "",
    phone: normalizePhone(employee.phone || employee.mobile),
    email: normalizeLoginIdentifier(email || employee.email || ""),
    username,
    employeeId: String(employee.id),
    employeeCode: normalizeJobCode(employee.jobId || employee.employeeCode),
    nationalId: normalizeNationalId(employee.nationalId || employee.nationalID),
    role: "member",
    title: "عضو",
    membershipStatus: employee.membershipStatus || "عضو جمعية عمومية",
    accountStatus: "pending_approval",
    passwordSalt,
    passwordHash,
    mustResetPassword: false,
    profileImage: employee.photo || "",
    termsAccepted: true,
    termsAcceptedAt: new Date().toISOString(),
    createdAt: serverTimestamp(),
    createdAtIso: new Date().toISOString(),
    permissionOverrides: [],
  };

  await setDoc(doc(db, "user_accounts", accountId), payload);

  try {
    if (payload.email && password) {
      const fb = await firebaseSignUp(payload.email, password);
      await updateDoc(doc(db, "user_accounts", accountId), { firebaseUid: fb.uid });
    }
  } catch {
    // best-effort
  }

  await logAuditEvent("member.register", {
    userId: accountId,
    employeeId: payload.employeeId,
    role: "member",
    page: "/register",
    riskLevel: "medium",
  });

  return { accountId, username };
}

export async function resetMemberPassword({ nationalId, jobCode, phone, password, confirmPassword }) {
  const employee = await verifyMemberIdentity({ nationalId, jobCode, phone });
  const account = await findAccountForEmployee(employee);
  if (!account) throw new Error("لا يوجد حساب مرتبط بهذا الموظف. أنشئ حساباً أولاً.");
  if (password !== confirmPassword) throw new Error("تأكيد كلمة المرور غير مطابق.");
  const policy = validatePasswordPolicy(password, { fullName: employee.name, phone: employee.phone });
  if (!policy.valid) throw new Error(policy.errors[0]);

  const passwordSalt = randomToken(8);
  const passwordHash = await buildPasswordHash(password, passwordSalt);
  await updateDoc(doc(db, "user_accounts", account.id), {
    passwordSalt,
    passwordHash,
    firebaseUid: "",
    mustResetPassword: false,
    updatedAt: serverTimestamp(),
    updatedAtIso: new Date().toISOString(),
  });

  await logAuditEvent("member.password_reset", {
    userId: account.id,
    employeeId: String(employee.id),
    riskLevel: "high",
  });
}

export async function changeAccountPassword({ accountId, currentPassword, password, confirmPassword, userFullName = "" }) {
  if (!accountId) throw new Error("معرف الحساب مطلوب.");
  if (password !== confirmPassword) throw new Error("تأكيد كلمة المرور غير مطابق.");
  const accounts = await fetchAll("user_accounts");
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new Error("الحساب غير موجود.");
  const policy = validatePasswordPolicy(password, { fullName: userFullName || account.fullName, phone: account.phone });
  if (!policy.valid) throw new Error(policy.errors[0]);

  if (account.passwordHash) {
    const currentHash = await buildPasswordHash(currentPassword || "", account.passwordSalt);
    if (currentHash !== account.passwordHash) throw new Error("كلمة المرور الحالية غير صحيحة.");
  }

  const passwordSalt = randomToken(8);
  const passwordHash = await buildPasswordHash(password, passwordSalt);
  await updateDoc(doc(db, "user_accounts", accountId), {
    passwordSalt,
    passwordHash,
    firebaseUid: "",
    mustResetPassword: false,
    updatedAt: serverTimestamp(),
    updatedAtIso: new Date().toISOString(),
  });

  await logAuditEvent("member.password_changed", { userId: accountId, riskLevel: "medium" });
}

export async function adminForcePasswordReset(accountId, actor) {
  if (!accountId) throw new Error("معرف الحساب مطلوب.");
  if (!hasPermission(actor, PERMISSIONS.securityManageAccounts)) {
    throw new Error("لا تملك صلاحية إدارة الحسابات.");
  }
  await updateDoc(doc(db, "user_accounts", accountId), {
    passwordSalt: "",
    passwordHash: "",
    firebaseUid: "",
    mustResetPassword: true,
    updatedAt: serverTimestamp(),
    updatedAtIso: new Date().toISOString(),
  });
  await logAuditEvent("security.password_reset_forced", { targetId: accountId, riskLevel: "high", page: "/security" });
}
