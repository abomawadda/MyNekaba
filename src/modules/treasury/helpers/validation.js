import { normalizeIssuedCheckType } from "./issuedChecks";

/**
 * التحقق من صحة بيانات إصدار الشيكات والحركات المتوافقة القديمة.
 */
export function validateTransaction(tx) {
  const errors = {};
  const type = normalizeIssuedCheckType(tx.type);

  // ── التاريخ ──────────────────────────────────────────
  if (!tx.date) errors.date = "تاريخ الحركة مطلوب";

  // ── المبلغ ────────────────────────────────────────────
  if (!tx.amount || Number(tx.amount) <= 0)
    errors.amount = "المبلغ يجب أن يكون رقمًا موجبًا";

  // ── رقم الشيك ────────────────────────────────────────
  if (type !== "deposit" && !tx.checkNum)
    errors.checkNum = "رقم الشيك مطلوب";

  // ── الجهة / اسم العضو / المستفيد ─────────────────────
  if (!tx.party && !tx.beneficiaryName)
    errors.party =
      type === "aid"
        ? "اسم العضو مطلوب"
        : type === "deposit"
        ? "جهة الإيداع مطلوبة"
        : "اسم المستلم مطلوب";

  // ── تفاصيل خاصة بالرعاية ─────────────────────────────
  if (type === "aid") {
    if (!tx.aidCategory) errors.aidCategory = "تصنيف الرعاية مطلوب";

    if (tx.incidentDate && tx.incidentDate > tx.date)
      errors.incidentDate =
        "تاريخ الواقعة لا يمكن أن يتجاوز تاريخ الحركة";
  }

  return errors;
}
