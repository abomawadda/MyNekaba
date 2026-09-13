import { formatMoney } from "../../utils/numberFormat.js";
import { parseEmployeeDate } from "../../utils/memberBenefits.js";

export const getTodayISO = () => new Date().toISOString().split("T")[0];

const parseFlexibleDate = (value = "") => {
  const parsed = parseEmployeeDate(value);
  if (parsed) return parsed;
  if (!value) return null;
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const getDateTimestamp = (value = "") => {
  const parsed = parseFlexibleDate(value);
  return parsed ? parsed.getTime() : 0;
};

export const escapeHtml = (value = "") =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const normalizeText = (value = "") =>
  String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

export const toNumber = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const compareArabic = (a = "", b = "") =>
  String(a ?? "").localeCompare(String(b ?? ""), "ar", { numeric: true, sensitivity: "base" });

export const getYearMonthDay = (value = "") => String(value ?? "").slice(0, 10);

export const getDateRange = (rows = [], dateField = "") => {
  if (!dateField) return { from: "", to: "" };
  const dates = rows
    .map((row) => getYearMonthDay(row?.[dateField]))
    .filter(Boolean)
    .sort(compareArabic);
  return {
    from: dates[0] || "",
    to: dates[dates.length - 1] || "",
  };
};

export const getLatestSettlementExpenseDate = (expenses = [], fallback = "") => {
  const datedExpenses = (Array.isArray(expenses) ? expenses : [])
    .map((expense) => ({
      raw: expense?.date || "",
      timestamp: getDateTimestamp(expense?.date),
    }))
    .filter((entry) => entry.raw);

  if (datedExpenses.length === 0) return fallback || "";

  datedExpenses.sort((a, b) => (b.timestamp - a.timestamp) || compareArabic(b.raw, a.raw));
  return datedExpenses[0]?.raw || fallback || "";
};

export const getSettlementModeLabel = (mode = "") => {
  if (mode === "carry_forward") return "سلفة بعهدة";
  if (mode === "check_plus_subscriptions") return "رحلة باشتراكات";
  if (mode === "check_only") return "شيك يتطلب تسوية";
  return "بدون تسوية";
};

export const getBookingStatusLabel = (status = "") => {
  if (status === "confirmed") return "مؤكد";
  if (status === "cancelled") return "ملغي";
  return "معلق";
};

export const getRecordStateLabel = (value = "") => {
  if (value === "draft") return "مسودة";
  if (value === "approved") return "معتمد";
  return "مرحّل";
};

const isEmptySortValue = (value = "") => {
  const text = String(value ?? "").trim();
  return text === "" || text === "—" || text === "-";
};

export const sortByDateRefName = (rows = [], dateField, refField = "", nameField = "", jobField = "") =>
  [...rows].sort((a, b) => {
    const dateCompare = compareArabic(getYearMonthDay(a?.[dateField]), getYearMonthDay(b?.[dateField]));
    if (dateCompare !== 0) return dateCompare;
    if (refField) {
      const aEmpty = isEmptySortValue(a?.[refField]);
      const bEmpty = isEmptySortValue(b?.[refField]);
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      if (!aEmpty) {
        const refCompare = compareArabic(a?.[refField], b?.[refField]);
        if (refCompare !== 0) return refCompare;
      }
    }
    if (jobField) {
      const aEmpty = isEmptySortValue(a?.[jobField]);
      const bEmpty = isEmptySortValue(b?.[jobField]);
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      if (!aEmpty) {
        const jobCompare = compareArabic(a?.[jobField], b?.[jobField]);
        if (jobCompare !== 0) return jobCompare;
      }
    }
    return compareArabic(a?.[nameField], b?.[nameField]);
  });

export const sortByDateCheckEmployee = (
  rows = [],
  dateField = "date",
  checkField = "reference",
  employeeField = "memberId",
  fallbackField = "party"
) =>
  [...rows].sort((a, b) => {
    const dateCompare = compareArabic(getYearMonthDay(a?.[dateField]), getYearMonthDay(b?.[dateField]));
    if (dateCompare !== 0) return dateCompare;

    if (checkField) {
      const aEmpty = isEmptySortValue(a?.[checkField]);
      const bEmpty = isEmptySortValue(b?.[checkField]);
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      if (!aEmpty) {
        const checkCompare = compareArabic(a?.[checkField], b?.[checkField]);
        if (checkCompare !== 0) return checkCompare;
      }
    }

    if (employeeField) {
      const aEmpty = isEmptySortValue(a?.[employeeField]);
      const bEmpty = isEmptySortValue(b?.[employeeField]);
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      if (!aEmpty) {
        const employeeCompare = compareArabic(a?.[employeeField], b?.[employeeField]);
        if (employeeCompare !== 0) return employeeCompare;
      }
    }

    return compareArabic(a?.[fallbackField], b?.[fallbackField]);
  });

export const getBoardExecutiveSortBucket = (role = "") => {
  const text = String(role || "").trim();
  if (
    text.includes("تنفيذي") ||
    text.includes("رئيس") ||
    text.includes("الأمين العام") ||
    text.includes("أمين الصندوق") ||
    text.includes("نائب")
  ) {
    return 0;
  }
  return 1;
};

export const formatDisplayValue = (field, value) => {
  if (field.currency) return formatMoney(toNumber(value));
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
};
