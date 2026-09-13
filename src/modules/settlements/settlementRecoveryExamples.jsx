/* eslint-disable react-refresh/only-export-components */

/**
 * مثال عملي: نموذج التحكم والاسترجاع للتسويات
 * 
 * يوضح هذا الملف كيفية استخدام دوال الاسترجاع في التطبيق الفعلي
 * وكيفية بناء واجهة للقيام بهذه العمليات
 */

import React, { useState, useEffect } from "react";
import { 
  recoverSingleSettlement, 
  recoverBatchSettlement, 
  discardDraft,
  getSettlementReport,
  validateSettlement,
  findAllDrafts,
  getEmployeeSettlementHistory
} from "./settlementRecovery";
import { formatMoney } from "../../utils/numberFormat";
import clsx from "clsx";
import { Trash2, RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

/**
 * ============================================================================
 * 💡 أمثلة الاستخدام في JavaScript
 * ============================================================================
 */

// مثال 1: استرجاع تسوية واحدة معتمدة
export const exampleRecoverSingleSettlement = async () => {
  const settlementId = "check_12345";
  const result = await recoverSingleSettlement(settlementId, {
    reason: "خطأ في حساب المصروفات - يجب إعادة الفحص",
    userId: "user_001",
    userName: "أحمد محمد"
  });

  if (result.success) {
    console.log("✅ تم الاسترجاع:", result.details);
    // {
    //   settlementId: "check_12345",
    //   party: "علي أحمد",
    //   settlementDate: "2026-05-09",
    //   spent: 15000,
    //   returned: 5000,
    //   recoveryReason: "خطأ في حساب المصروفات",
    //   recoveryTime: "2026-05-09T10:30:00Z"
    // }
  } else {
    console.error("❌ خطأ:", result.message);
  }
};

// مثال 2: استرجاع تسوية مجمعة (عدة شيكات)
export const exampleRecoverBatchSettlement = async () => {
  const result = await recoverBatchSettlement(
    "group_20260509",
    "check_001",
    ["check_001", "check_002", "check_003"],
    {
      reason: "صرف مشروط - تم تصحيح الشروط",
      userId: "user_002",
      userName: "فاطمة علي"
    }
  );

  if (result.success) {
    console.log("✅ تم استرجاع المجموعة:");
    console.log(`  - استرجاع ${result.details.recovered.length} شيك`);
    console.log(`  - حذف ${result.details.deletedDeposits.length} إيداع بنكي`);
  }
};

// مثال 3: حذف مسودة بدون اعتماد
export const exampleDiscardDraft = async () => {
  const result = await discardDraft("check_draft_456", {
    userId: "user_001",
    userName: "محمود حسن"
  });

  if (result.success) {
    console.log("✅ تم حذف المسودة التي احتوت على", result.details.expensesCount, "فواتير");
  }
};

// مثال 4: الحصول على تقرير شامل
export const exampleGetReport = async () => {
  const report = await getSettlementReport({
    fromDate: "2026-01-01",
    toDate: "2026-05-31",
    employeeId: "emp_123"
  });

  console.log("📊 ملخص التقرير:");
  console.log(`  - عدد التسويات المعتمدة: ${report.summary.settledCount}`);
  console.log(`  - عدد المسودات: ${report.summary.draftCount}`);
  console.log(`  - عدد غير المسويات: ${report.summary.unsettledCount}`);
  console.log(`  - إجمالي المصروف: ${formatMoney(report.amounts.totalSettled)}`);
};

// مثال 5: التحقق من سلامة التسوية
export const exampleValidateSettlement = async () => {
  const result = await validateSettlement("check_789");
  
  if (result.valid) {
    console.log("✅ التسوية سليمة");
  } else {
    console.error("❌ مشاكل وجدت:");
    result.errors.forEach(err => console.error(`  - ${err}`));
  }

  if (result.warnings.length > 0) {
    console.warn("⚠️ تحذيرات:");
    result.warnings.forEach(warn => console.warn(`  - ${warn}`));
  }
};

// مثال 6: الحصول على سجل موظف شامل
export const exampleGetEmployeeHistory = async () => {
  const history = await getEmployeeSettlementHistory("emp_456");
  
  console.log(`📈 سجل ${history.employeeId}:`);
  console.log(`  - معتمد: ${history.summary.totalSettled} تسوية = ${formatMoney(history.summary.totalAmountSettled)}`);
  console.log(`  - مسودات: ${history.summary.totalDrafts}`);
  console.log(`  - غير مسوى: ${history.summary.totalUnsettled}`);
};

/**
 * ============================================================================
 * 🎨 نموذج واجهة React لإدارة الاسترجاع
 * ============================================================================
 */

export function SettlementRecoveryPanel() {
  const [activeTab, setActiveTab] = useState("recover");
  const [settlementId, setSettlementId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [report, setReport] = useState(null);

  // تحميل المسودات عند فتح التبويب
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        if (activeTab === "drafts") {
          const items = await findAllDrafts();
          if (!cancelled) setDrafts(items);
        } else if (activeTab === "report") {
          const reportData = await getSettlementReport();
          if (!cancelled) setReport(reportData);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [activeTab]);

  const handleRecoverSettlement = async () => {
    if (!settlementId.trim()) return;
    
    setLoading(true);
    const res = await recoverSingleSettlement(settlementId, {
      reason: reason || "استرجاع يدوي",
      userId: "current_user",
      userName: "المستخدم الحالي"
    });
    setResult(res);
    setLoading(false);
    
    if (res.success) {
      setSettlementId("");
      setReason("");
      setTimeout(() => setResult(null), 5000);
    }
  };

  const handleDiscardDraft = async (draftId) => {
    setLoading(true);
    const res = await discardDraft(draftId, {
      userId: "current_user",
      userName: "المستخدم الحالي"
    });
    setResult(res);
    setLoading(false);

    if (res.success) {
      const items = await findAllDrafts();
      setDrafts(items);
      setTimeout(() => setResult(null), 5000);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4" dir="rtl">
      <div className="bg-gradient-to-r from-rose-600 to-pink-600 text-white p-6 rounded-2xl shadow-lg">
        <h1 className="text-2xl font-black mb-2">🔄 نظام استرجاع التسويات</h1>
        <p className="text-sm opacity-90">
          استرجاع التسويات المعتمدة والمسودات وإعادتها إلى قائمة الشيكات الغير مسواة
        </p>
      </div>

      {/* نتيجة العملية */}
      {result && (
        <div className={clsx(
          "p-4 rounded-xl border-2 flex items-start gap-3",
          result.success 
            ? "bg-emerald-50 border-emerald-300 text-emerald-900" 
            : "bg-red-50 border-red-300 text-red-900"
        )}>
          {result.success ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          <div>
            <p className="font-bold">{result.message}</p>
            {result.details && (
              <p className="text-sm mt-1 opacity-75">
                {JSON.stringify(result.details, null, 2)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* التبويبات */}
      <div className="flex gap-2 bg-slate-100 p-2 rounded-xl">
        {[
          { id: "recover", label: "🔙 استرجاع تسوية" },
          { id: "drafts", label: "📋 حذف مسودات" },
          { id: "report", label: "📊 التقرير" }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "px-4 py-2 rounded-lg font-bold text-sm transition-all",
              activeTab === tab.id
                ? "bg-white text-slate-900 shadow-md"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* تبويب الاسترجاع */}
      {activeTab === "recover" && (
        <div className="space-y-4 p-6 bg-white rounded-2xl border">
          <div>
            <label className="block text-sm font-bold mb-2">معرف التسوية</label>
            <input
              type="text"
              value={settlementId}
              onChange={e => setSettlementId(e.target.value)}
              placeholder="مثال: check_12345"
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">سبب الاسترجاع</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="اشرح سبب استرجاع هذه التسوية..."
              className="w-full px-4 py-2 border rounded-lg"
              rows="3"
            />
          </div>

          <button
            onClick={handleRecoverSettlement}
            disabled={loading || !settlementId}
            className="w-full bg-rose-600 text-white py-2 rounded-lg font-bold hover:bg-rose-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw size={16} />}
            استرجاع التسوية
          </button>
        </div>
      )}

      {/* تبويب المسودات */}
      {activeTab === "drafts" && (
        <div className="space-y-4 p-6 bg-white rounded-2xl border">
          {loading ? (
            <p className="text-center py-8 text-slate-400">جاري التحميل...</p>
          ) : drafts.length === 0 ? (
            <p className="text-center py-8 text-slate-400">لا توجد مسودات</p>
          ) : (
            <div className="space-y-2">
              {drafts.map(draft => (
                <div key={draft.id} className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <div>
                    <p className="font-bold">{draft.employeeName || draft.party}</p>
                    <p className="text-xs text-slate-500">{draft.date}</p>
                    <p className="text-xs">
                      {(draft.settlementExpenses || []).length} فواتير
                    </p>
                  </div>
                  <button
                    onClick={() => handleDiscardDraft(draft.id)}
                    disabled={loading}
                    className="bg-red-500 text-white px-3 py-1 rounded flex items-center gap-1 hover:bg-red-600 disabled:opacity-50"
                  >
                    <Trash2 size={14} /> حذف
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* تبويب التقرير */}
      {activeTab === "report" && report && (
        <div className="space-y-4 p-6 bg-white rounded-2xl border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-slate-100 rounded-lg">
              <p className="text-xs text-slate-600 font-bold">معتمد</p>
              <p className="text-lg font-black text-slate-900">{report.summary.settledCount}</p>
            </div>
            <div className="p-3 bg-amber-100 rounded-lg">
              <p className="text-xs text-amber-600 font-bold">مسودات</p>
              <p className="text-lg font-black text-amber-900">{report.summary.draftCount}</p>
            </div>
            <div className="p-3 bg-rose-100 rounded-lg">
              <p className="text-xs text-rose-600 font-bold">غير مسوى</p>
              <p className="text-lg font-black text-rose-900">{report.summary.unsettledCount}</p>
            </div>
            <div className="p-3 bg-teal-100 rounded-lg">
              <p className="text-xs text-teal-600 font-bold">المجموع</p>
              <p className="text-lg font-black text-teal-900">{report.summary.totalChecks}</p>
            </div>
          </div>

          <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-teal-200">
            <p className="text-xs text-teal-600 font-bold">إجمالي المصروف</p>
            <p className="text-2xl font-black text-teal-900">{formatMoney(report.amounts.totalSettled)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * ============================================================================
 * 📝 اسكريبت تنفيذي (لاستخدام في Firebase Functions أو الـ Console)
 * ============================================================================
 */

/**
 * تنفيذ الاسترجاع التجميعي
 * يمكن استخدام هذا في Firebase Cloud Functions
 */
import { getDocs, query, collection, where } from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";

export async function batchRecoveryJob() {
  console.log("🔄 بدء عملية الاسترجاع التجميعي...");

  try {
    // الحصول على جميع التسويات المعتمدة
    const allSettlements = await getDocs(
      query(
        collection(db, "issued_checks"),
        where("isSettled", "==", true)
      )
    );

    console.log(`📊 تم العثور على ${allSettlements.docs.length} تسوية معتمدة`);

    // جمع الإحصائيات
    let recoveredCount = 0;
    let errorCount = 0;

    for (const doc of allSettlements.docs) {
      const settlement = doc.data();
      
      // تصفية: استرجاع التسويات الأقدم من سنة
      const settlementDate = new Date(settlement.settlementDate || settlement.date);
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      if (settlementDate < oneYearAgo) {
        try {
          // يمكن إضافة شروط إضافية هنا
          console.log(`⏳ التسوية قديمة: ${settlement.id}`);
          // await recoverSingleSettlement(settlement.id, { reason: "تنظيف سنوي" });
          // recoveredCount++;
        } catch (error) {
          console.error(`❌ خطأ في ${settlement.id}:`, error.message);
          errorCount++;
        }
      }
    }

    console.log(`✅ انتهت العملية: ${recoveredCount} تم استرجاعها، ${errorCount} خطأ`);
  } catch (error) {
    console.error("❌ خطأ في الاسترجاع التجميعي:", error);
  }
}

export default SettlementRecoveryPanel;
