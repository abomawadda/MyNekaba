import {
  mergeIssuedChecksSourcesNormalized,
  normalizeIssuedCheckType,
  normalizeRequiresSettlement,
} from "./issuedChecks.js";

export const TREASURY_OPENING_BALANCE = 42685.79;
export const OPENING_BALANCE = TREASURY_OPENING_BALANCE;
export const REPORT_OPENING_BALANCE = TREASURY_OPENING_BALANCE;
export const POSTED_FINANCE_STATES = new Set(["posted", "approved", "paid"]);
export const INCOME_FINANCE_TYPES = new Set(["deposit", "refund", "subs"]);
export const DIRECT_LEDGER_TYPES = new Set(["deposit", "refund", "subs", "bank_charge"]);

const ARABIC_LABEL_TYPE_MAP = [
  ["سلفة", "advance"],
  ["عهدة", "advance"],
  ["رعاية", "aid"],
  ["إعانة", "aid"],
  ["اعانة", "aid"],
  ["رحلة", "trip"],
  ["فاعلية", "event"],
  ["فعالية", "event"],
  ["نشاط", "event"],
  ["ميزانية", "budget"],
  ["ايداع", "deposit"],
  ["إيداع", "deposit"],
  ["رد", "refund"],
  ["اشتراك", "subs"],
  ["خصم", "bank_charge"],
  ["مصروف", "bank_charge"],
];

const AMOUNT_FIELDS = [
  "advanceAmountBase",
  "amount",
  "value",
  "checkAmount",
  "chequeAmount",
  "check_amount",
  "totalAmount",
  "totalValue",
  "paidAmount",
  "netAmount",
];

export const normalizeFinanceNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٬,]/g, "")
    .replace(/[٫]/g, ".")
    .replace(/[^\d.-]/g, "");

  if (!normalized || normalized === "-" || normalized === ".") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getFinanceAmount = (record = {}) => {
  const values = AMOUNT_FIELDS.map((field) => normalizeFinanceNumber(record?.[field]));
  const positive = values.find((amount) => amount > 0);
  if (positive !== undefined) return positive;
  return values.find((amount) => amount !== 0) || 0;
};

export const normalizeFinanceType = (record = {}) => {
  const directType = normalizeIssuedCheckType(record?.type || "");
  if (directType) return directType;

  const label = String(record?.typeLabel || record?.category || record?.notes || "").trim();
  const matched = ARABIC_LABEL_TYPE_MAP.find(([needle]) => label.includes(needle));
  if (matched) return matched[1];

  return record?.checkNum || record?.checkNo || getFinanceAmount(record) > 0 ? "other" : "";
};

export const isPostedFinanceRecord = (record = {}) =>
  !record?.state || POSTED_FINANCE_STATES.has(record.state);

export const isIncomeFinanceType = (type = "") =>
  INCOME_FINANCE_TYPES.has(normalizeIssuedCheckType(type));

const ZERO_EFFECT_CHECK_STATUSES = new Set([
  "issued", "delivered", "uncashed", "cancelled", "replaced", "available",
]);

const CHECK_STATUS_LABELS = {
  issued: "صادر",
  delivered: "تم التسليم",
  cashed: "تم الصرف",
  uncashed: "غير منصرف",
  cancelled: "ملغي",
  replaced: "مستبدل",
  available: "متاح",
};

export const getCheckStatusLabel = (record = {}) => {
  const status = String(record?.checkStatus || "").trim();
  if (!status) return "منصرف / سجل قديم";
  return CHECK_STATUS_LABELS[status] || status;
};

export const getRecordStateLabel = (state = "") => {
  const normalized = String(state || "posted").trim();
  if (normalized === "posted") return "مرحل";
  if (normalized === "approved") return "معتمد";
  if (normalized === "paid") return "مدفوع";
  if (normalized === "draft") return "مسودة";
  return normalized || "مرحل";
};

export const getCheckFinancialEffectAmount = (record = {}, amount = 0) => {
  const status = record?.checkStatus;
  if (!status) return Number(amount) || 0;
  return ZERO_EFFECT_CHECK_STATUSES.has(status) ? 0 : Number(amount) || 0;
};

export const getFinanceImpact = (record = {}) => {
  const type = normalizeFinanceType(record);
  const rawAmount = getFinanceAmount(record);
  const amount = getCheckFinancialEffectAmount(record, rawAmount);
  const income = isIncomeFinanceType(type);

  return {
    type,
    amount,
    rawAmount,
    checkStatus: record?.checkStatus || "",
    hasFinancialEffect: amount !== 0,
    credit: income ? amount : 0,
    debit: income ? 0 : amount,
  };
};

export const getSharedFinanceLedgerRecords = (sourceData = {}) => {
  const directTransactions = (sourceData.transactions || [])
    .filter((record) => DIRECT_LEDGER_TYPES.has(normalizeFinanceType(record)))
    .map((record) => ({
      ...record,
      type: normalizeFinanceType(record),
      sourceCollection: record?.sourceCollection || "transactions",
    }));

  return [
    ...mergeIssuedChecksSourcesNormalized(
      sourceData.issued_checks || [],
      sourceData.transactions || []
    ),
    ...directTransactions,
  ].filter((record) => getFinanceAmount(record) !== 0);
};

export const getTreasuryFinancialMetrics = (
  records = [],
  { openingBalance = TREASURY_OPENING_BALANCE, monthlyCloses = [] } = {}
) => {
  let totalIncome = 0;
  let totalExpenses = 0;
  let checkFinancialEffect = 0;
  let issuedChecksContributingToLedger = 0;
  let zeroEffectCount = 0;

  const postedRecords = [];
  const unpostedRecords = [];
  const requiresSettlementRecords = [];

  (records || []).forEach((record) => {
    if (isPostedFinanceRecord(record)) postedRecords.push(record);
    else unpostedRecords.push(record);

    if (normalizeRequiresSettlement(record)) requiresSettlementRecords.push(record);

    const impact = getFinanceImpact(record);
    if (isPostedFinanceRecord(record)) {
      totalIncome += impact.credit;
      totalExpenses += impact.debit;
      if (impact.rawAmount !== 0 && impact.amount === 0) zeroEffectCount += 1;
      if (record?.sourceCollection === "issued_checks" || record?.checkNum) {
        checkFinancialEffect += impact.amount;
        if (impact.amount !== 0) issuedChecksContributingToLedger += 1;
      }
    }
  });

  return {
    totalTransactions: records.length,
    postedCount: postedRecords.length,
    unpostedCount: unpostedRecords.length,
    totalIncome,
    totalExpenses,
    currentBalance: Number(openingBalance || 0) + totalIncome - totalExpenses,
    issuedChecksContributingToLedger,
    checkFinancialEffect,
    requiresSettlementCount: requiresSettlementRecords.length,
    monthlyCloseCount: monthlyCloses.length,
    zeroEffectCount,
    postedRecords,
    unpostedRecords,
    requiresSettlementRecords,
  };
};

export function computeMonthlyCloses(docs = [], openingBalance = 0) {
  const buckets = new Map();
  (docs || []).forEach((record) => {
    if (!isPostedFinanceRecord(record)) return;
    const period = String(record?.date || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) return;
    const impact = getFinanceImpact(record);
    if (!impact.amount) return;
    if (!buckets.has(period)) buckets.set(period, { credit: 0, debit: 0, count: 0 });
    const bucket = buckets.get(period);
    bucket.credit += impact.credit;
    bucket.debit += impact.debit;
    bucket.count += 1;
  });
  const periods = [...buckets.keys()].sort();
  let running = Number(openingBalance) || 0;
  return periods.map((period) => {
    const bucket = buckets.get(period);
    const opening = running;
    const closing = opening + bucket.credit - bucket.debit;
    running = closing;
    return { period, opening, credit: bucket.credit, debit: bucket.debit, closing, count: bucket.count };
  });
}
