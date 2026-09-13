import { createHash, randomBytes } from "node:crypto";

export const IDENTITY_ERROR = "تعذر التحقق من البيانات المدخلة. راجع البيانات وحاول مرة أخرى.";
export const DUPLICATE_ACCOUNT_ERROR = "يوجد حساب مرتبط بالفعل بهذه العضوية. استخدم تسجيل الدخول أو استرداد الحساب.";
export const RECOVERY_GENERIC = "إذا كانت البيانات مرتبطة بحساب صالح، سيتم تسجيل طلب الاسترداد ومراجعته من الإدارة.";

export const REGISTRATION_STATES = Object.freeze({
  identityVerified: "identity_verified",
  emailPendingVerification: "email_pending_verification",
  pendingApproval: "pending_approval",
  rejected: "rejected",
});

export function normalizeDigits(value = "") {
  return String(value ?? "")
    .replace(/[\u0660-\u0669]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/\D/g, "");
}

export function normalizeEgyptianPhone(value = "") {
  const digits = normalizeDigits(value);
  if (!digits) return "";
  if (digits.length === 12 && digits.startsWith("20")) return `0${digits.slice(2)}`;
  if (digits.length === 13 && digits.startsWith("020")) return `0${digits.slice(3)}`;
  if (digits.length === 10 && digits.startsWith("1")) return `0${digits}`;
  return digits;
}

function firstValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return "";
}

function collectValues(source = {}, keys = [], normalizer = normalizeText) {
  return Array.from(
    new Set(
      keys
        .map((key) => normalizer(source[key]))
        .filter(Boolean)
    )
  );
}

export function normalizeText(value = "") {
  return String(value ?? "").trim();
}

export function normalizeEmail(value = "") {
  return normalizeText(value).toLowerCase();
}

export function isEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function maskNationalId(value = "") {
  const digits = normalizeDigits(value);
  if (digits.length < 4) return "";
  return `${digits.slice(0, 2)}${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-2)}`;
}

export function maskEmail(value = "") {
  const email = normalizeEmail(value);
  const [name, domain] = email.split("@");
  if (!name || !domain) return "";
  return `${name.slice(0, 1)}***@${domain}`;
}

export function employeeKeys(employee = {}) {
  const phoneValues = collectValues(
    employee,
    ["phone", "mobile", "phone1", "phone2", "mobileNumber", "whatsapp", "telephone"],
    normalizeEgyptianPhone
  );
  return {
    nationalId: normalizeDigits(firstValue(employee, ["nationalId", "nationalID", "nid", "nationalNumber"])),
    employeeCode: normalizeDigits(firstValue(employee, ["employeeCode", "jobId", "jobCode", "employeeNumber", "code"])),
    employeeId: normalizeText(employee.id),
    phone: phoneValues[0] || "",
    phones: phoneValues,
    email: normalizeEmail(employee.email),
  };
}

export function matchesEmployeeIdentity(employee = {}, identity = {}) {
  const keys = employeeKeys(employee);
  return Boolean(
    keys.nationalId &&
      keys.employeeCode &&
      keys.phone &&
      keys.nationalId === normalizeDigits(identity.nationalId) &&
      keys.employeeCode === normalizeDigits(identity.employeeCode || identity.jobCode) &&
      keys.phones.includes(normalizeEgyptianPhone(identity.phone))
  );
}

export function findStrictEmployee(employees = [], identity = {}) {
  const matches = employees.filter((employee) => matchesEmployeeIdentity(employee, identity));
  return {
    employee: matches.length === 1 ? matches[0] : null,
    ambiguous: matches.length > 1,
  };
}

export function buildEmployeePreview(employee = {}) {
  const keys = employeeKeys(employee);
  return {
    employeeId: keys.employeeId,
    name: employee.name || employee.fullName || "",
    employeeCode: keys.employeeCode,
    maskedNationalId: maskNationalId(keys.nationalId),
    maskedEmail: maskEmail(keys.email),
    hasRegisteredEmail: Boolean(keys.email),
    membershipStatus: employee.membershipStatus || "",
  };
}

export function hasDuplicateAccount(accounts = [], employee = {}, requests = []) {
  const keys = employeeKeys(employee);
  const account = accounts.find((candidate) => {
    const candidateKeys = [
      candidate.employeeId,
      candidate.employeeCode,
      candidate.jobId,
      candidate.nationalId,
    ]
      .filter(Boolean)
      .map((value) => normalizeText(value));
    const candidateDigits = candidateKeys.map(normalizeDigits);
    return (
      candidateKeys.includes(keys.employeeId) ||
      candidateDigits.includes(keys.employeeCode) ||
      candidateDigits.includes(keys.nationalId)
    );
  });
  const request = requests.find(
    (candidate) =>
      ["identity_verified", "email_pending_verification", "pending_approval", "recovery_pending"].includes(candidate.status) &&
      (normalizeText(candidate.employeeId) === keys.employeeId ||
        normalizeDigits(candidate.employeeCode) === keys.employeeCode)
  );
  return { duplicate: Boolean(account || request), account, request };
}

export function validatePasswordPolicy(password = "", profile = {}) {
  const value = String(password || "");
  const lowered = value.toLowerCase();
  const errors = [];
  const related = [profile.fullName, profile.phone, profile.email, profile.username]
    .filter(Boolean)
    .map((item) => String(item).toLowerCase());

  if (value.length < 8) errors.push("password_too_short");
  if (!/[A-Z]/.test(value)) errors.push("password_missing_uppercase");
  if (!/[a-z]/.test(value)) errors.push("password_missing_lowercase");
  if (!/\d/.test(value)) errors.push("password_missing_number");
  if (!/[^\w\s]/.test(value)) errors.push("password_missing_symbol");
  if (["123456", "123456789", "password", "admin", "nekaba123"].includes(lowered)) {
    errors.push("password_common");
  }
  if (related.some((word) => word && lowered.includes(word))) errors.push("password_contains_profile_data");

  return { valid: errors.length === 0, errors };
}

export function randomToken(length = 24) {
  return randomBytes(length).toString("hex");
}

export function hashAuditValue(value = "") {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}
