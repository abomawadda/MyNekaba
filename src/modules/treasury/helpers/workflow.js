// 1. التعريفات الأساسية للمراحل
export const WORKFLOW_STATES = ["draft", "review", "approved", "posted"];

export const WORKFLOW_LABELS = {
  draft: "مسودة",
  review: "قيد المراجعة",
  approved: "معتمد",
  posted: "مُرحّل نهائيًا",
};

// 2. دالة الانتقال للمرحلة التالية (مع حماية الصلاحيات)
export function nextWorkflowState(current, role) {
  const idx = WORKFLOW_STATES.indexOf(current);
  if (idx === -1) return "draft";

  const nextState = WORKFLOW_STATES[idx + 1];

  // حماية: فقط أمين الصندوق يقدر يتخطى مرحلة "المراجعة" إلى "الاعتماد" أو "الترحيل"
  if ((nextState === "approved" || nextState === "posted") && role !== "treasurer") {
    return current;
  }

  return nextState || current;
}

// 🎯 التعديل الجديد: القاعدة الذهبية لكشف الحساب (Ledger)
// هذه الدالة تضمن أن السند لا يظهر في الحسابات المالية إلا إذا كان "مُرحّل نهائيًا"
export function getLedgerRecords(transactions) {
  if (!transactions) return [];
  return transactions.filter((t) => t.state === "posted");
}

// دالة إضافية لحساب الرصيد الصافي (إيداع - صرف) للسندات المرحلة فقط
export function calculateLedgerBalance(transactions) {
  const ledger = getLedgerRecords(transactions);
  return ledger.reduce((acc, t) => {
    const amt = Number(t.amount) || 0;
    return t.type === "deposit" ? acc + amt : acc - amt;
  }, 0);
}