export const BOARD_MEMBERSHIP_ROLES = [
  "رئيس المجلس",
  "الأمين العام",
  "أمين الصندوق",
  "عضو مجلس إدارة",
  "عضو مجلس",
  "نائب الرئيس",
];

export const BOARD_ALLOWANCE_CATEGORIES = [
  "بدل انتقال",
  "بدل جلسات",
  "بدل ضيافة",
  "ضيافة وبوفيه",
];

export const BOARD_CANDIDATE_POSITIONS = [
  { value: "president", label: "رئيس مجلس الإدارة" },
  { value: "member", label: "عضو مجلس إدارة" },
];

export const BOARD_CANDIDATE_STATUS = [
  { value: "nominated", label: "مرشح" },
  { value: "won_original", label: "فائز أصلي" },
  { value: "won_reserve", label: "احتياطي" },
  { value: "withdrawn", label: "منسحب" },
  { value: "disqualified", label: "مستبعد" },
];

export const BOARD_END_REASONS = [
  { value: "", label: "بدون" },
  { value: "death", label: "وفاة" },
  { value: "retirement", label: "تقاعد" },
  { value: "resignation", label: "استقالة" },
  { value: "membership_end", label: "انتهاء العضوية" },
  { value: "term_completed", label: "انتهاء الدورة" },
  { value: "dismissal", label: "إسقاط/استبعاد" },
];

export const isAssemblyMember = (member, onDate = new Date()) => {
  if (!member) return false;
  if (isIndependentMember(member)) return false;
  return isActiveMember(member, onDate);
};

export const NON_ALLOWANCE_BENEFIT_TYPES = [
  "دعم فعالية",
  "خصم إشراف فعالية",
  "إعفاء إشراف فعالية",
  "جائزة مسابقة",
  "خدمة عينية",
  "ميزة تنظيمية",
  "إعفاء",
];

export const isIndependentMember = (member) =>
  String(member?.membershipStatus || "").trim() === "نقابة مستقلة";

export const isBoardMember = (member) =>
  BOARD_MEMBERSHIP_ROLES.includes(String(member?.membershipStatus || "").trim());

export const getBoardRoleLabel = (member) =>
  String(member?.boardRoleTitle || member?.membershipStatus || "").trim();

export const normalizeArabicDigits = (value = "") =>
  String(value)
    .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit));

const RETIREMENT_AGE_PHASES = [
  { effectiveDate: "2032-07-01", age: 61 },
  { effectiveDate: "2034-07-01", age: 62 },
  { effectiveDate: "2036-07-01", age: 63 },
  { effectiveDate: "2038-07-01", age: 64 },
  { effectiveDate: "2040-07-01", age: 65 },
];

export const parseEmployeeDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const normalized = normalizeArabicDigits(value).trim();

  if (normalized.includes("-")) {
    const [yearText, monthText, dayText] = normalized.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(String(dayText).slice(0, 2));
    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
    return parsed;
  }

  if (normalized.includes("/")) {
    const [day, month, year] = normalized.split("/").map(Number);
    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
    return parsed;
  }

  return null;
};

export const getBirthDateFromNationalId = (nationalId) => {
  const value = normalizeArabicDigits(nationalId).replace(/\D/g, "");
  if (value.length !== 14) return null;

  const centuryDigit = value[0];
  const century = centuryDigit === "2" ? "19" : centuryDigit === "3" ? "20" : null;
  if (!century) return null;

  const year = Number(`${century}${value.slice(1, 3)}`);
  const month = Number(value.slice(3, 5));
  const day = Number(value.slice(5, 7));
  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

export const getEmployeeBirthDate = (member) =>
  parseEmployeeDate(member?.birthDate || member?.dateOfBirth || member?.dob || member?.nationalBirthDate) ||
  getBirthDateFromNationalId(member?.nationalId);

export const formatEmployeeDate = (value) => {
  const parsed = parseEmployeeDate(value);
  if (!parsed) return "";
  return `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`;
};

const addYears = (date, years) =>
  new Date(date.getFullYear() + years, date.getMonth(), date.getDate());

export const getLegalRetirementAge = (member) => {
  const birthDate = getEmployeeBirthDate(member);
  if (!birthDate) return null;

  let retirementDate = addYears(birthDate, 60);
  let retirementAge = 60;

  RETIREMENT_AGE_PHASES.forEach((phase) => {
    const phaseDate = parseEmployeeDate(phase.effectiveDate);
    if (retirementDate && phaseDate && retirementDate.getTime() >= phaseDate.getTime()) {
      retirementAge = phase.age;
      retirementDate = addYears(birthDate, phase.age);
    }
  });

  return retirementAge;
};

export const getLegalRetirementDate = (member) => {
  const birthDate = getEmployeeBirthDate(member);
  if (!birthDate) return null;

  let retirementDate = addYears(birthDate, 60);

  RETIREMENT_AGE_PHASES.forEach((phase) => {
    const phaseDate = parseEmployeeDate(phase.effectiveDate);
    if (retirementDate && phaseDate && retirementDate.getTime() >= phaseDate.getTime()) {
      retirementDate = addYears(birthDate, phase.age);
    }
  });

  return retirementDate;
};

export const getRetirementDate = (member) =>
  parseEmployeeDate(member?.retirementDate || member?.retiredAt || member?.retireDate) ||
  getLegalRetirementDate(member);

export const getMembershipEndDate = (member) =>
  getRetirementDate(member) ||
  parseEmployeeDate(member?.membershipExpiry || member?.membershipEndDate || member?.unionEndDate);

export const getDeathDate = (member) =>
  parseEmployeeDate(member?.deathDate || member?.dateOfDeath || member?.deceasedAt);

export const isDeceasedMember = (member, onDate = new Date()) => {
  const state = String(member?.memberState || "").trim();
  const deathDate = getDeathDate(member);
  const effectiveDate = stripTime(parseEmployeeDate(onDate) || new Date(onDate));

  if (deathDate) {
    return stripTime(deathDate).getTime() <= effectiveDate.getTime();
  }

  return state === "وفاة";
};

const stripTime = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const isRetiredMember = (member, onDate = new Date()) => {
  const state = String(member?.memberState || "").trim();
  const retirementDate = getRetirementDate(member);
  const effectiveDate = stripTime(parseEmployeeDate(onDate) || new Date(onDate));

  if (retirementDate) {
    return stripTime(retirementDate).getTime() <= effectiveDate.getTime();
  }

  return state === "معاش";
};

export const isMembershipEnded = (member, onDate = new Date()) => {
  const membershipEndDate = getMembershipEndDate(member);
  if (!membershipEndDate) return false;
  const effectiveDate = stripTime(parseEmployeeDate(onDate) || new Date(onDate));
  return stripTime(membershipEndDate).getTime() <= effectiveDate.getTime();
};

export const getEffectiveMemberState = (member, onDate = new Date()) => {
  const state = String(member?.memberState || "").trim();

  if (isDeceasedMember(member, onDate)) return "وفاة";
  if (state === "استقالة") return "استقالة";
  if (state === "موقوف") return "موقوف";
  if (isRetiredMember(member, onDate) || isMembershipEnded(member, onDate)) return "معاش";

  return state || "نشط";
};

export const isActiveMember = (member, onDate = new Date()) =>
  !["وفاة", "استقالة", "موقوف", "معاش"].includes(getEffectiveMemberState(member, onDate));

export const isEligibleForBenefit = (member, onDate = new Date()) =>
  !isIndependentMember(member) && !isRetiredMember(member, onDate) && !isDeceasedMember(member, onDate);

export const isBoardMemberEligible = (member, onDate = new Date()) =>
  isBoardMember(member) && isActiveMember(member, onDate) && !isIndependentMember(member);

export const getAutomaticMemberLifecycleUpdates = (member, onDate = new Date()) => {
  const retirementDate = getRetirementDate(member);
  if (!retirementDate) return null;

  const updates = {};
  const retirementDateText = formatEmployeeDate(retirementDate);
  const effectiveDate = stripTime(parseEmployeeDate(onDate) || new Date(onDate));
  const rawState = String(member?.memberState || "").trim();

  if (retirementDateText && member?.membershipExpiry !== retirementDateText) {
    updates.membershipExpiry = retirementDateText;
  }

  if (
    stripTime(retirementDate).getTime() <= effectiveDate.getTime() &&
    !["وفاة", "استقالة", "معاش"].includes(rawState)
  ) {
    updates.memberState = "معاش";
  }

  return Object.keys(updates).length ? updates : null;
};

export const parseEmployeeBirthDate = (birthDateStr) => parseEmployeeDate(birthDateStr);

export const getEmployeeAge = (member) => {
  const birthDate = getEmployeeBirthDate(member);
  if (!birthDate) return -1;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
};

const normalizeJobId = (value) => String(value ?? "").trim();

const jobIdSortValue = (value) => {
  const normalized = normalizeJobId(value).replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && normalized !== "" ? numeric : Number.MAX_SAFE_INTEGER;
};

export const compareMembersByAgeThenJobId = (a, b) => {
  const ageDiff = getEmployeeAge(b) - getEmployeeAge(a);
  if (ageDiff !== 0) return ageDiff;

  const jobDiff = jobIdSortValue(a?.jobId) - jobIdSortValue(b?.jobId);
  if (jobDiff !== 0) return jobDiff;

  return normalizeJobId(a?.jobId).localeCompare(normalizeJobId(b?.jobId), "ar");
};

export const sortMembersByAgeThenJobId = (members = []) =>
  [...members].sort(compareMembersByAgeThenJobId);

export const createBenefitLabel = ({ benefitType, eventTitle, notes }) =>
  [benefitType, eventTitle ? `المرجع: ${eventTitle}` : "", notes].filter(Boolean).join(" - ");
