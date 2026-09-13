export const CHECKBOOK_COLLECTION = "checkbooks";

export const CHECKBOOK_STATUS = {
  requested: "طلب",
  received: "تم الاستلام",
  destroyed: "تم الإعدام",
  postponed: "تم التأجيل",
};

export const CHECKBOOK_STATUS_IDS = Object.keys(CHECKBOOK_STATUS);

export const CHECK_STATUS = {
  available: "متاح",
  issued: "محرر",
  delivered: "تم التسليم",
  cashed: "منصرف",
  uncashed: "غير منصرف",
  cancelled: "ملغى",
  replaced: "مستبدل",
};

export const CHECK_STATUS_IDS = Object.keys(CHECK_STATUS);
export const LEGACY_CHECK_STATUS = "cashed";
export const LEGACY_CHECK_STATUS_LABEL = "منصرف / سجل قديم";

export const CHECK_FINANCIAL_EFFECT = {
  available: 0,
  issued: 0,
  delivered: 0,
  uncashed: 0,
  cancelled: 0,
  replaced: 0,
  cashed: 1,
};

export const hasFinancialEffect = (status = "") => CHECK_FINANCIAL_EFFECT[status] === 1;

export const isLegacyCheckWithoutLifecycle = (doc = {}) => !doc?.checkStatus;

export const getCheckLifecycle = (doc = {}) => doc?.checkStatus || LEGACY_CHECK_STATUS;

export const getCheckStatusLabel = (doc = {}) =>
  isLegacyCheckWithoutLifecycle(doc)
    ? LEGACY_CHECK_STATUS_LABEL
    : CHECK_STATUS[getCheckLifecycle(doc)] || getCheckLifecycle(doc) || "—";

export const getCheckFinancialEffect = (doc = {}, amount = 0) => {
  if (isLegacyCheckWithoutLifecycle(doc)) return Number(amount) || 0;
  return hasFinancialEffect(doc?.checkStatus) ? Number(amount) || 0 : 0;
};

export const normalizeCheckbookNumber = (value) => {
  const n = Number(
    String(value ?? "")
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .trim()
  );
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

export const calcChecksCount = (from, to) => {
  const f = normalizeCheckbookNumber(from);
  const t = normalizeCheckbookNumber(to);
  if (!Number.isFinite(f) || !Number.isFinite(t) || t < f) return 0;
  return t - f + 1;
};

export const rangesOverlap = (aFrom, aTo, bFrom, bTo) => {
  const f1 = normalizeCheckbookNumber(aFrom);
  const t1 = normalizeCheckbookNumber(aTo);
  const f2 = normalizeCheckbookNumber(bFrom);
  const t2 = normalizeCheckbookNumber(bTo);
  if (![f1, t1, f2, t2].every(Number.isFinite)) return false;
  return Math.max(f1, f2) <= Math.min(t1, t2);
};

export const findOverlappingBook = (candidate = {}, books = []) => {
  if (candidate.status !== "received") return null;
  const cf = normalizeCheckbookNumber(candidate.serialFrom);
  const ct = normalizeCheckbookNumber(candidate.serialTo);
  if (!Number.isFinite(cf) || !Number.isFinite(ct)) return null;
  return (
    books.find((b) => {
      if (b.id === candidate.id || b.status !== "received") return false;
      if (candidate.bank && b.bank && candidate.bank !== b.bank) return false;
      return rangesOverlap(cf, ct, b.serialFrom, b.serialTo);
    }) || null
  );
};

export const validateCheckbook = (data = {}, books = []) => {
  const errors = {};
  if (!data.requestDate) errors.requestDate = "تاريخ الطلب مطلوب";
  if (!data.booksCount || Number(data.booksCount) <= 0) errors.booksCount = "عدد الدفاتر مطلوب";
  if (data.status === "received") {
    const f = normalizeCheckbookNumber(data.serialFrom);
    const t = normalizeCheckbookNumber(data.serialTo);
    if (!Number.isFinite(f)) errors.serialFrom = "مسلسل البداية مطلوب";
    if (!Number.isFinite(t)) errors.serialTo = "مسلسل النهاية مطلوب";
    if (Number.isFinite(f) && Number.isFinite(t) && t < f) errors.serialTo = "النهاية أقل من البداية";
    const expected = calcChecksCount(data.serialFrom, data.serialTo);
    if (expected <= 0) errors.serialTo = errors.serialTo || "نطاق غير منطقي";
    else if (data.checksCount && Number(data.checksCount) !== expected)
      errors.checksCount = `العدد يجب أن يكون ${expected}`;
    const overlap = findOverlappingBook(data, books);
    if (overlap) errors.serialFrom = `تداخل مع دفتر ${overlap.requestNo || overlap.id} (${overlap.serialFrom}→${overlap.serialTo})`;
  }
  if (data.status === "destroyed" && !data.decisionDate) errors.decisionDate = "تاريخ قرار الإعدام مطلوب";
  if (data.status === "destroyed" && !String(data.reason || "").trim()) errors.reason = "سبب الإعدام مطلوب";
  if (data.status === "postponed" && !data.decisionDate) errors.decisionDate = "تاريخ قرار التأجيل مطلوب";
  if (data.status === "postponed" && !String(data.reason || "").trim()) errors.reason = "سبب التأجيل مطلوب";
  return errors;
};

export const CHECKBOOK_PERMISSIONS = {
  view: "treasury.view",
  create: "treasury.create",
  receive: "treasury.edit",
  destroy: "treasury.approve",
  postpone: "treasury.edit",
  issue: "treasury.create",
  cancel: "treasury.edit",
  review: "treasury.settle",
  reports: "reports.view",
};
