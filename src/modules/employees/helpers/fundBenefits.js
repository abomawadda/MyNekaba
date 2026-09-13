import {
  EMPLOYEE_LOOKUP_TYPES,
  getIssuedCheckTypeLabel,
  mergeIssuedChecksSourcesNormalized,
  normalizeIssuedCheckType,
} from "../../treasury/helpers/issuedChecks";
import { formatEmployeeDate, parseEmployeeDate } from "../../../utils/memberBenefits";

export const FUND_BENEFIT_CATEGORY_CONFIG = {
  aid: { label: "إعانات", color: "rose" },
  trip_support: { label: "دعم رحلات", color: "indigo" },
  meal_support: { label: "دعم وجبات", color: "amber" },
  prizes: { label: "جوائز مسابقات", color: "emerald" },
  books_tickets: { label: "خصم كتب وتذاكر", color: "sky" },
  in_kind: { label: "خدمات عينية", color: "violet" },
  event_support: { label: "دعم أنشطة وفاعليات", color: "orange" },
  other: { label: "مزايا أخرى", color: "slate" },
};

const TRIP_KEYWORDS = ["رحلة", "رحلات", "عمرة", "حج", "مصيف"];
const MEAL_KEYWORDS = ["إفطار", "وجبة", "وجبات", "غداء", "عشاء", "سحور"];
const BOOK_TICKET_KEYWORDS = ["كتاب", "كتب", "تذكرة", "تذاكر"];

const toLowerArabic = (value = "") => String(value || "").trim().toLowerCase();

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("ar-EG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const normalizeAmount = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
};

const includesAny = (value = "", keywords = []) => {
  const normalized = toLowerArabic(value);
  return keywords.some((keyword) => normalized.includes(toLowerArabic(keyword)));
};

const buildTextBlob = (...values) =>
  values
    .flat()
    .filter(Boolean)
    .map((value) => String(value))
    .join(" | ");

const getCategoryConfig = (key = "other") =>
  FUND_BENEFIT_CATEGORY_CONFIG[key] || FUND_BENEFIT_CATEGORY_CONFIG.other;

const resolveSupportCategory = (textBlob = "") => {
  if (includesAny(textBlob, TRIP_KEYWORDS)) return "trip_support";
  if (includesAny(textBlob, MEAL_KEYWORDS)) return "meal_support";
  if (includesAny(textBlob, BOOK_TICKET_KEYWORDS)) return "books_tickets";
  return "event_support";
};

const resolveCategoryKey = ({ source, type, benefitType, textBlob }) => {
  const normalizedType = normalizeIssuedCheckType(type);
  const normalizedBenefitType = toLowerArabic(benefitType);

  if (source === "issued_check") {
    if (normalizedType === "aid") return "aid";
    if (normalizedType === "trip") return "trip_support";
    if (normalizedType === "event") return resolveSupportCategory(textBlob);
    return "other";
  }

  if (normalizedBenefitType.includes("جائزة")) return "prizes";
  if (normalizedBenefitType.includes("خدمة عينية")) return "in_kind";
  if (normalizedBenefitType.includes("إعفاء") || normalizedBenefitType.includes("خصم")) {
    return includesAny(textBlob, BOOK_TICKET_KEYWORDS) ? "books_tickets" : resolveSupportCategory(textBlob);
  }
  if (normalizedBenefitType.includes("دعم فعالية")) return resolveSupportCategory(textBlob);
  if (normalizedBenefitType.includes("ميزة تنظيمية")) return "event_support";
  return "other";
};

const buildIssuedCheckDescription = (doc = {}) => {
  const normalizedType = normalizeIssuedCheckType(doc.type);
  if (normalizedType === "aid") {
    return [doc.aidCategory, doc.aidRel].filter(Boolean).join(" - ") || "رعاية صندوق";
  }

  if (normalizedType === "trip" || normalizedType === "event") {
    return [doc.activityName, doc.activityType, doc.notes].filter(Boolean).join(" - ") || getIssuedCheckTypeLabel(normalizedType);
  }

  return [doc.party, doc.beneficiaryName, doc.notes].filter(Boolean).join(" - ") || getIssuedCheckTypeLabel(normalizedType);
};

const buildIssuedCheckReference = (doc = {}) =>
  [doc.checkNum ? `شيك رقم ${doc.checkNum}` : "", doc.date ? `بتاريخ ${doc.date}` : ""]
    .filter(Boolean)
    .join(" - ");

const buildBenefitDescription = (doc = {}) =>
  doc.displayLabel ||
  [doc.benefitType, doc.eventTitle, doc.notes].filter(Boolean).join(" - ") ||
  "ميزة صندوق";

const buildBenefitReference = (doc = {}) =>
  [doc.eventTitle ? `المرجع: ${doc.eventTitle}` : "", doc.date ? `بتاريخ ${doc.date}` : ""]
    .filter(Boolean)
    .join(" - ");

const dedupeByKey = (items = [], getKey) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildMemberFundBenefitEntries = ({
  issuedChecks = [],
  legacyTransactions = [],
  memberBenefits = [],
} = {}) => {
  const mergedChecks = mergeIssuedChecksSourcesNormalized(issuedChecks, legacyTransactions).filter((doc) =>
    EMPLOYEE_LOOKUP_TYPES.includes(normalizeIssuedCheckType(doc.type))
  );

  const normalizedChecks = mergedChecks
    .filter((doc) => ["aid", "trip", "event"].includes(normalizeIssuedCheckType(doc.type)))
    .map((doc) => {
      const textBlob = buildTextBlob(
        doc.party,
        doc.beneficiaryName,
        doc.employeeName,
        doc.activityName,
        doc.activityType,
        doc.notes,
        doc.aidCategory,
        doc.aidRel
      );
      const categoryKey = resolveCategoryKey({
        source: "issued_check",
        type: doc.type,
        textBlob,
      });

      return {
        id: `issued:${doc.id}`,
        source: "issued_check",
        sourceLabel: "صرف من الصندوق",
        sourceCollection: doc.sourceCollection || "issued_checks",
        amount: normalizeAmount(doc.amount),
        date: doc.date || "",
        parsedDate: parseEmployeeDate(doc.date),
        rawType: normalizeIssuedCheckType(doc.type),
        title: buildIssuedCheckDescription(doc),
        description: [doc.party, doc.notes].filter(Boolean).join(" - "),
        reference: buildIssuedCheckReference(doc),
        categoryKey,
        categoryLabel: getCategoryConfig(categoryKey).label,
        categoryColor: getCategoryConfig(categoryKey).color,
      };
    });

  const normalizedBenefits = memberBenefits
    .filter((doc) => String(doc.status || "active") !== "cancelled")
    .map((doc) => {
      const textBlob = buildTextBlob(doc.benefitType, doc.eventTitle, doc.notes, doc.displayLabel);
      const categoryKey = resolveCategoryKey({
        source: "member_benefit",
        benefitType: doc.benefitType,
        textBlob,
      });

      return {
        id: `benefit:${doc.id}`,
        source: "member_benefit",
        sourceLabel: "ميزة/دعم نشاط",
        sourceCollection: "member_benefits",
        amount: normalizeAmount(doc.amount),
        date: doc.date || "",
        parsedDate: parseEmployeeDate(doc.date),
        rawType: doc.benefitType || "ميزة صندوق",
        title: buildBenefitDescription(doc),
        description: doc.notes || doc.eventTitle || "",
        reference: buildBenefitReference(doc),
        categoryKey,
        categoryLabel: getCategoryConfig(categoryKey).label,
        categoryColor: getCategoryConfig(categoryKey).color,
      };
    });

  return dedupeByKey([...normalizedChecks, ...normalizedBenefits], (item) => item.id).sort((a, b) => {
    const aTime = a.parsedDate?.getTime?.() || 0;
    const bTime = b.parsedDate?.getTime?.() || 0;
    if (aTime !== bTime) return bTime - aTime;
    return b.amount - a.amount;
  });
};

export const buildMemberFundBenefitSummary = (entries = []) => {
  const categoriesMap = new Map();
  let totalAmount = 0;
  let directSupportAmount = 0;
  let benefitAmount = 0;

  entries.forEach((entry) => {
    const amount = normalizeAmount(entry.amount);
    totalAmount += amount;
    if (entry.source === "issued_check") directSupportAmount += amount;
    if (entry.source === "member_benefit") benefitAmount += amount;

    const existing = categoriesMap.get(entry.categoryKey) || {
      key: entry.categoryKey,
      label: entry.categoryLabel,
      color: entry.categoryColor,
      amount: 0,
      count: 0,
    };
    existing.amount += amount;
    existing.count += 1;
    categoriesMap.set(entry.categoryKey, existing);
  });

  const categories = Array.from(categoriesMap.values()).sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return b.count - a.count;
  });

  const latestEntry = entries[0] || null;

  return {
    totalAmount,
    totalCount: entries.length,
    directSupportAmount,
    benefitAmount,
    latestEntry,
    categories,
    topCategory: categories[0] || null,
  };
};

export const formatFundBenefitAmount = formatMoney;

export const formatFundBenefitDate = (value) => formatEmployeeDate(value) || value || "—";
