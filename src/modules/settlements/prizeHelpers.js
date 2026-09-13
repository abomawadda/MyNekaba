import { parseArabicNumber } from "./settlementUtils";

export const PRIZE_CATEGORY = "جوائز نقدية";
export const PRIZE_BENEFIT_SOURCE = "settlement_prize";

export const isPrizeCategory = (category = "") =>
  String(category || "").trim() === PRIZE_CATEGORY;

export const normalizePrizeRecipients = (recipients = []) =>
  (Array.isArray(recipients) ? recipients : [])
    .map((r) => ({
      memberId: String(r.memberId || r.id || "").trim(),
      name: String(r.name || "").trim(),
      jobId: String(r.jobId || "").trim(),
      amount: parseArabicNumber(r.amount ?? 0),
    }))
    .filter((r) => r.memberId && r.name);

export const prizeTotal = (recipients = []) =>
  normalizePrizeRecipients(recipients).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

export function validatePrizeRecipients(recipients = []) {
  const list = normalizePrizeRecipients(recipients);
  if (list.length === 0) return "اختر موظفاً مستفيداً واحداً على الأقل.";
  const invalid = list.find((r) => !Number.isFinite(Number(r.amount)) || Number(r.amount) <= 0);
  if (invalid) return `أدخل مبلغاً صحيحاً أكبر من صفر للموظف ${invalid.name}.`;
  return "";
}

export const prizeBenefitDocId = (settlementId = "", expenseId = "", memberId = "") =>
  `settlement_prize:${String(settlementId || "").trim()}:${String(expenseId || "").trim()}:${String(memberId || "").trim()}`;

export const summarizePrizeRecipients = (recipients = []) => {
  const list = normalizePrizeRecipients(recipients);
  if (list.length === 0) return "";
  return `جوائز نقدية (${list.length} مستفيد): ${list.map((r) => r.name).join("، ")} — الإجمالي ${prizeTotal(list)}`;
};

export const normalizePrizeMeta = (meta = {}) => ({
  contestName: String(meta?.contestName || "").trim(),
  decisionNo: String(meta?.decisionNo || "").trim(),
  minutesNo: String(meta?.minutesNo || "").trim(),
});

export const buildPrizeBenefitPayload = ({ recipient, expense, settlement }) => {
  const meta = normalizePrizeMeta(expense?.prizeMeta);
  const contestSuffix = meta.contestName ? ` — ${meta.contestName}` : "";
  return {
    memberId: recipient.memberId,
    memberName: recipient.name,
    membershipStatus: recipient.membershipStatus || "",
    memberState: recipient.memberState || "",
    date: expense.date || settlement.settlementDate || "",
    benefitType: PRIZE_CATEGORY,
    amount: Number(recipient.amount || 0),
    notes: `جائزة نقدية${contestSuffix} — تسوية شيك رقم ${settlement.checkNum || "—"}`,
    eventId: "",
    eventTitle: meta.contestName || "",
    bookingId: "",
    source: PRIZE_BENEFIT_SOURCE,
    status: "active",
    settlementId: settlement.settlementId || "",
    expenseId: expense.id || "",
    checkNum: settlement.checkNum || "",
    contestName: meta.contestName,
    decisionNo: meta.decisionNo,
    minutesNo: meta.minutesNo,
    prizeMeta: meta,
    displayLabel: `جائزة نقدية${contestSuffix} - تسوية شيك رقم ${settlement.checkNum || "—"}`,
  };
};
