import { writeBatch } from "firebase/firestore";

export const SETTLEMENT_BATCH_LIMIT = 400;

export function parseArabicNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٬,]/g, "")
    .replace(/[٫]/g, ".")
    .replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-" || normalized === ".") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function newExpenseId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `e_${crypto.randomUUID()}`;
  } catch {
    // fallback below
  }
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function newAttachmentId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fallback below
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildSettlementResetPayload(type = "", nowIso = "") {
  const now = nowIso || new Date().toISOString();
  const normalizedType = String(type || "");
  return {
    isSettled: false,
    hasDraftSettlement: false,
    settlementDate: "",
    settlementExpenses: [],
    settlementSpent: 0,
    settlementReturned: 0,
    returnedActually: false,
    returnMode: "carry_forward",
    returnedCashAmount: 0,
    bankDepositedAmount: 0,
    bankDepositDate: "",
    bankDepositReference: "",
    bankDepositTransactionId: "",
    bankDepositCreatedAt: "",
    cashReturnTransactionId: "",
    cashReturnCreatedAt: "",
    settlementApprovedAt: "",
    settlementCompletedAt: "",
    settlementClosedAt: "",
    settlementFinalized: false,
    settlementStatus: "open",
    settlement_state: "open",
    settlementDraft: false,
    prevBalanceUsed: 0,
    collectedSubscriptions: 0,
    settlement_group_id: "",
    settlementGroupId: "",
    settlementGroupLeaderId: "",
    settlementGroupMemberIds: [],
    settlementGroupCount: 0,
    settlementGroupFollower: false,
    settlementGroupAdvanceAmountBase: 0,
    settlementGroupPrevBalanceUsed: 0,
    settlementGroupCollectedSubscriptions: 0,
    requires_settlement: true,
    requiresSettlement: true,
    settlement_mode:
      normalizedType === "advance"
        ? "carry_forward"
        : normalizedType === "trip"
          ? "check_plus_subscriptions"
          : "check_only",
    updatedAt: now,
  };
}

export async function commitInChunks(db, ops = []) {
  for (let i = 0; i < ops.length; i += SETTLEMENT_BATCH_LIMIT) {
    const batch = writeBatch(db);
    ops.slice(i, i + SETTLEMENT_BATCH_LIMIT).forEach((op) => {
      if (op.type === "delete") batch.delete(op.ref);
      else batch.set(op.ref, op.data || {}, { merge: op.merge !== false });
    });
    await batch.commit();
  }
}
