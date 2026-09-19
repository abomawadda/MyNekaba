import { createHash, randomBytes } from "node:crypto";

export const IDENTITY_ERROR = "تعذر التحقق من البيانات المدخلة. راجع البيانات وحاول مرة أخرى.";
export const DUPLICATE_ACCOUNT_ERROR = "يوجد حساب مرتبط بالفعل بهذه العضوية. استخدم تسجيل الدخول أو استرداد الحساب.";
export const RECOVERY_GENERIC = "إذا كانت البيانات مرتبطة بحساب صالح، سيتم تسجيل طلب الاسترداد ومراجعته من الإدارة.";

export const REGISTRATION_STATES = Object.freeze({
  identityVerified: "identity_verified",
  emailPendingVerification: "email_pending_verification",
  pendingApproval: "pending_approval",
  completed: "completed",
  retired: "retired",
  expired: "expired",
  rejected: "rejected",
});

export const TERMINAL_REGISTRATION_STATES = Object.freeze([
  REGISTRATION_STATES.completed,
  REGISTRATION_STATES.retired,
  REGISTRATION_STATES.expired,
  REGISTRATION_STATES.rejected,
]);

export const VERIFY_REASON_CODES = Object.freeze({
  ok: "VERIFY_OK",
  invalidInput: "INVALID_INPUT_FORMAT",
  nationalIdNoMatch: "NATIONAL_ID_NO_MATCH",
  jobIdNoMatch: "JOB_ID_NO_MATCH",
  phoneNoMatch: "PHONE_NO_MATCH",
  employeeDataIncomplete: "EMPLOYEE_DATA_INCOMPLETE",
  multipleEmployeeMatches: "MULTIPLE_EMPLOYEE_MATCHES",
  duplicateAccount: "IDENTITY_MATCHED_BUT_ACCOUNT_EXISTS",
  pendingRequestExists: "PENDING_REQUEST_EXISTS",
  rateLimited: "REQUEST_RATE_LIMITED",
  internalError: "INTERNAL_VERIFY_ERROR",
});

export function normalizeDigits(value = "") {
  return String(value ?? "")
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
}

export function normalizeEgyptianPhone(value = "") {
  const digits = normalizeDigits(value);
  if (!digits) return "";
  if (digits.length === 14 && digits.startsWith("0020")) return `0${digits.slice(4)}`;
  if (digits.length === 13 && digits.startsWith("020")) return `0${digits.slice(3)}`;
  if (digits.length === 12 && digits.startsWith("20")) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("1")) return `0${digits}`;
  return digits;
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

export function employeeKeys(employee = {}) {
  const phoneValues = collectValues(
    employee,
    ["phone", "phone2", "mobile", "phone1", "mobileNumber", "whatsapp", "telephone"],
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

function identityKeys(identity = {}) {
  return {
    nationalId: normalizeDigits(identity.nationalId),
    employeeCode: normalizeDigits(identity.employeeCode || identity.jobCode || identity.jobId),
    phone: normalizeEgyptianPhone(identity.phone),
  };
}

export function matchesEmployeeIdentity(employee = {}, identity = {}) {
  const keys = employeeKeys(employee);
  const input = identityKeys(identity);
  return Boolean(
    keys.nationalId &&
      keys.employeeCode &&
      keys.phone &&
      keys.nationalId === input.nationalId &&
      keys.employeeCode === input.employeeCode &&
      keys.phones.includes(input.phone)
  );
}

export function diagnoseEmployeeIdentity(employees = [], identity = {}) {
  const input = identityKeys(identity);
  if (!input.nationalId || !input.employeeCode || !input.phone) {
    return {
      employee: null,
      reasonCode: VERIFY_REASON_CODES.invalidInput,
      employeeCandidateCount: 0,
      nationalIdMatch: Boolean(input.nationalId),
      jobIdMatch: Boolean(input.employeeCode),
      phoneMatch: Boolean(input.phone),
      phone2Match: false,
    };
  }

  const diagnostics = employees.map((employee) => {
    const keys = employeeKeys(employee);
    const phoneValues = keys.phones || [];
    const phoneMatch = phoneValues[0] === input.phone;
    const phone2Match = phoneValues.slice(1).includes(input.phone);
    return {
      employee,
      keys,
      nationalIdMatch: keys.nationalId === input.nationalId,
      jobIdMatch: keys.employeeCode === input.employeeCode,
      phoneMatch,
      phone2Match,
      anyPhoneMatch: phoneMatch || phone2Match,
      dataComplete: Boolean(keys.nationalId && keys.employeeCode && phoneValues.length),
    };
  });

  const matches = diagnostics.filter((item) => item.nationalIdMatch && item.jobIdMatch && item.anyPhoneMatch);
  if (matches.length === 1) {
    const matched = matches[0];
    return {
      employee: matched.employee,
      reasonCode: VERIFY_REASON_CODES.ok,
      employeeCandidateCount: 1,
      nationalIdMatch: true,
      jobIdMatch: true,
      phoneMatch: matched.phoneMatch,
      phone2Match: matched.phone2Match,
    };
  }
  if (matches.length > 1) {
    return {
      employee: null,
      reasonCode: VERIFY_REASON_CODES.multipleEmployeeMatches,
      employeeCandidateCount: matches.length,
      nationalIdMatch: true,
      jobIdMatch: true,
      phoneMatch: matches.some((item) => item.phoneMatch),
      phone2Match: matches.some((item) => item.phone2Match),
    };
  }

  const sameNational = diagnostics.filter((item) => item.nationalIdMatch);
  const sameJob = diagnostics.filter((item) => item.jobIdMatch);
  const sameNationalAndJob = diagnostics.filter((item) => item.nationalIdMatch && item.jobIdMatch);
  const reasonCode = !sameNational.length
    ? VERIFY_REASON_CODES.nationalIdNoMatch
    : !sameJob.length
      ? VERIFY_REASON_CODES.jobIdNoMatch
      : sameNationalAndJob.length && sameNationalAndJob.every((item) => !item.anyPhoneMatch)
        ? VERIFY_REASON_CODES.phoneNoMatch
        : diagnostics.some((item) => !item.dataComplete)
          ? VERIFY_REASON_CODES.employeeDataIncomplete
          : VERIFY_REASON_CODES.jobIdNoMatch;

  return {
    employee: null,
    reasonCode,
    employeeCandidateCount: sameNationalAndJob.length || sameNational.length || sameJob.length,
    nationalIdMatch: Boolean(sameNational.length),
    jobIdMatch: Boolean(sameJob.length),
    phoneMatch: diagnostics.some((item) => item.phoneMatch),
    phone2Match: diagnostics.some((item) => item.phone2Match),
  };
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

export function classifyRegistrationReservation(request = {}, context = {}) {
  const status = normalizeText(request.status);
  const expiresAt = new Date(request.expiresAt || 0).getTime();
  const expired = Boolean(expiresAt && expiresAt <= Number(context.now || Date.now()));
  const accountExists = Boolean(context.accountExists);
  const firebaseUserExists = Boolean(context.firebaseUserExists);
  const identityStateKnown = Boolean(context.identityStateKnown);

  if (TERMINAL_REGISTRATION_STATES.includes(status)) {
    return { blocking: false, retirable: false, status, expired, reason: "terminal_request" };
  }

  if (status === REGISTRATION_STATES.identityVerified) {
    return {
      blocking: !expired,
      retirable: expired,
      status,
      expired,
      reason: expired ? "expired_identity_verification" : "active_identity_verification",
    };
  }

  if ([REGISTRATION_STATES.emailPendingVerification, REGISTRATION_STATES.pendingApproval].includes(status)) {
    if (accountExists) {
      return { blocking: true, retirable: false, status, expired, reason: "application_account_exists" };
    }
    if (firebaseUserExists) {
      return { blocking: true, retirable: false, status, expired, reason: "firebase_identity_requires_review" };
    }
    if (!identityStateKnown) {
      return { blocking: true, retirable: false, status, expired, reason: "identity_state_unknown" };
    }
    return {
      blocking: !expired,
      retirable: expired,
      status,
      expired,
      reason: expired ? "stale_identity_absent" : "registration_in_progress",
    };
  }

  if (status === "recovery_pending") {
    return { blocking: true, retirable: false, status, expired, reason: "recovery_pending" };
  }

  return { blocking: false, retirable: false, status, expired, reason: "non_blocking_status" };
}

export function isRegistrationRequestBlocking(request = {}, context = {}) {
  return classifyRegistrationReservation(request, context).blocking;
}

export function canRetireExpiredRegistration(request = {}, context = {}) {
  return classifyRegistrationReservation(request, context).retirable;
}

export async function resolveRegistrationIdentityContext({ auth, accounts = [], requests = [] } = {}) {
  const accountIds = new Set(accounts.map((account) => normalizeText(account.id)).filter(Boolean));
  const firebaseUids = new Set();
  const requestedUids = Array.from(
    new Set(requests.map((request) => normalizeText(request.firebaseUid)).filter(Boolean))
  );

  if (!auth?.getUsers) {
    return { identityStateKnown: false, accountIds, firebaseUids };
  }

  for (let index = 0; index < requestedUids.length; index += 100) {
    const chunk = requestedUids.slice(index, index + 100);
    const result = await auth.getUsers(chunk.map((uid) => ({ uid })));
    result.users.forEach((user) => firebaseUids.add(normalizeText(user.uid)));
  }

  return { identityStateKnown: true, accountIds, firebaseUids };
}

export function hasDuplicateAccount(accounts = [], employee = {}, requests = [], identityContext = {}) {
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
  const request = requests.find((candidate) => {
    const employeeMatches =
      normalizeText(candidate.employeeId) === keys.employeeId ||
      normalizeDigits(candidate.employeeCode) === keys.employeeCode;
    if (!employeeMatches) return false;

    const reservation = classifyRegistrationReservation(candidate, {
      now: identityContext.now,
      identityStateKnown: identityContext.identityStateKnown,
      accountExists: identityContext.accountIds?.has(normalizeText(candidate.accountId)),
      firebaseUserExists: identityContext.firebaseUids?.has(normalizeText(candidate.firebaseUid)),
    });
    return reservation.blocking;
  });
  const reservation = request
    ? classifyRegistrationReservation(request, {
        now: identityContext.now,
        identityStateKnown: identityContext.identityStateKnown,
        accountExists: identityContext.accountIds?.has(normalizeText(request.accountId)),
        firebaseUserExists: identityContext.firebaseUids?.has(normalizeText(request.firebaseUid)),
      })
    : null;
  return { duplicate: Boolean(account || request), account, request, reservation };
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
