import {
  isGroupedSettlementFollower,
  normalizeRequiresSettlement,
  normalizeSettlementOpenState,
} from "../treasury/helpers/issuedChecks.js";
import { getFinanceAmount, isPostedFinanceRecord } from "../treasury/helpers/financeLedger.js";
import { parseArabicNumber } from "./settlementUtils.js";

export const getSettlementStatusKey = (record = {}) => {
  const normalized = normalizeSettlementOpenState(record);
  if (normalized.isSettled) return "completed";
  if (normalized.hasDraftSettlement || normalized.settlementDraft) return "partial";
  if (normalizeRequiresSettlement(record)) return "open";
  return "not_required";
};

export const getSettlementAmount = (record = {}) =>
  Number(record.settlementGroupAdvanceAmountBase || getFinanceAmount(record) || 0);

export const getSettlementSettledAmount = (record = {}) =>
  parseArabicNumber(record.settlementSpent || 0);

export const getSettlementRemainingAmount = (record = {}) =>
  parseArabicNumber(
    record.settlementReturned ||
      record.bankDepositedAmount ||
      record.returnedCashAmount ||
      0
  );

export const isSettlementCheckLinked = (record = {}) =>
  Boolean(record.checkNum || record.checkNo || record.sourceCollection === "issued_checks");

export const isSettlementTreasuryLinked = (record = {}) =>
  Boolean(
    record.id ||
      record.sourceTransactionId ||
      record.legacySourceId ||
      record.bankDepositTransactionId ||
      record.cashReturnTransactionId
  );

export const buildSettlementBaseline = (records = []) => {
  const statusCounts = {
    open: 0,
    partial: 0,
    completed: 0,
    not_required: 0,
  };

  const candidates = (records || []).filter((record) => !isGroupedSettlementFollower(record));
  const requiresSettlement = candidates.filter((record) => normalizeRequiresSettlement(record));

  let totalSettlementAmount = 0;
  let totalSettledAmount = 0;
  // Represents returned cash, bank-deposited, or carried-forward amounts; not outstanding debt.
  let totalRemainingAmount = 0;
  let checkLinked = 0;
  let treasuryLinked = 0;

  candidates.forEach((record) => {
    const status = getSettlementStatusKey(record);
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    if (!normalizeRequiresSettlement(record)) return;

    totalSettlementAmount += getSettlementAmount(record);
    totalSettledAmount += getSettlementSettledAmount(record);
    totalRemainingAmount += getSettlementRemainingAmount(record);
    if (isSettlementCheckLinked(record)) checkLinked += 1;
    if (isSettlementTreasuryLinked(record)) treasuryLinked += 1;
  });

  return {
    totalSettlements: requiresSettlement.length,
    openSettlements: statusCounts.open || 0,
    partialSettlements: statusCounts.partial || 0,
    completedSettlements: statusCounts.completed || 0,
    totalSettlementAmount,
    totalSettledAmount,
    totalRemainingAmount,
    settlementsLinkedToChecks: checkLinked,
    settlementsLinkedToTreasuryTransactions: treasuryLinked,
    requiresSettlementTransactionsCount: requiresSettlement.filter(isPostedFinanceRecord).length,
    statusCounts,
  };
};

export const pickSettlementAuditSamples = (records = []) => {
  const buckets = new Map();
  (records || []).forEach((record) => {
    const status = getSettlementStatusKey(record);
    if (!buckets.has(status)) buckets.set(status, record);
    if (isSettlementCheckLinked(record) && !buckets.has("check_linked")) buckets.set("check_linked", record);
    if (record.bankDepositTransactionId || record.cashReturnTransactionId) buckets.set("cash_linked", record);
  });

  return Array.from(buckets.entries()).map(([bucket, record]) => ({
    bucket,
    id: record.id || "",
    amount: getSettlementAmount(record),
    status: getSettlementStatusKey(record),
    linkedTransaction: record.sourceTransactionId || record.legacySourceId || record.id || "",
    linkedCheck: record.checkNum || record.checkNo || "",
    remaining: getSettlementRemainingAmount(record),
    dates: {
      issue: record.date || record.checkDate || "",
      settlement: record.settlementDate || "",
      updated: record.updatedAt || "",
    },
  }));
};
