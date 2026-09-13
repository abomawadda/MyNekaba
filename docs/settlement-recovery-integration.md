/**
 * تكامل أداة الاسترجاع مع واجهة SettlementTab
 * 
 * هذا الملف يوضح كيفية إضافة أزرار وقائمات الاسترجاع
 * إلى واجهة تسوية الشيكات الموجودة
 */

// ============================================================================
// 1️⃣ إضافة الواردات المطلوبة في SettlementTab.jsx
// ============================================================================

// أضف هذه الأسطر في رأس الملف:
// import { recoverSingleSettlement, discardDraft, getEmployeeSettlementHistory } from "./settlementRecovery";

// ============================================================================
// 2️⃣ إضافة State جديد في Component
// ============================================================================

const exampleStateAdditions = `
  // إضافة في SettlementTab function:
  const [recoveryModalData, setRecoveryModalData] = useState(null);
  const [recoveryReason, setRecoveryReason] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [showRecoveryConfirm, setShowRecoveryConfirm] = useState(false);
`;

// ============================================================================
// 3️⃣ دالة للاسترجاع من الأرشيف
// ============================================================================

export const exampleRecoveryFunctions = `
  // دالة لاسترجاع تسوية من الأرشيف
  const handleRecoverFromArchive = (settlement) => {
    setRecoveryModalData(settlement);
    setRecoveryReason("");
    setShowRecoveryConfirm(true);
  };

  // تنفيذ الاسترجاع
  const executeRecovery = async () => {
    if (!recoveryModalData) return;
    setRecoveryLoading(true);
    try {
      const result = await recoverSingleSettlement(recoveryModalData.id, {
        reason: recoveryReason || "استرجاع يدوي من الأرشيف",
        userId: currentSession?.user?.id || "",
        userName: currentSession?.user?.displayName || ""
      });

      if (result.success) {
        showToast("تم استرجاع التسوية بنجاح - الشيك الآن في قائمة التسويات المفتوحة", "success");
        // إعادة تحديث قائمة الأرشيف
        setActiveTab("current");
        setShowRecoveryConfirm(false);
        setRecoveryModalData(null);
      } else {
        showToast(result.message, "error");
      }
    } catch (e) {
      console.error(e);
      showToast("حدث خطأ أثناء الاسترجاع", "error");
    } finally {
      setRecoveryLoading(false);
    }
  };

  // دالة لحذف مسودة
  const handleDiscardDraftSettlement = async (draftId) => {
    setSaving(true);
    try {
      const result = await discardDraft(draftId, {
        userId: currentSession?.user?.id || "",
        userName: currentSession?.user?.displayName || ""
      });

      if (result.success) {
        showToast("تم حذف المسودة بنجاح", "success");
        setEditingSettlementId("");
        setSettlementSelectionMode("single");
        setSelAdvId("");
        setSelectedBatchIds([]);
        setExpenses([]);
        setCollectedSubs("");
        resetSettlementReturnState("carry_forward");
        resetExpenseForm();
      } else {
        showToast(result.message, "error");
      }
    } catch (e) {
      console.error(e);
      showToast("حدث خطأ أثناء حذف المسودة", "error");
    } finally {
      setSaving(false);
    }
  };
`;

// ============================================================================
// 4️⃣ أزرار الاسترجاع في جدول الأرشيف
// ============================================================================

export const exampleRecoveryButton = \`
  // إضافة هذا العمود في جدول الأرشيف:
  
  <td>
    <div className="flex items-center gap-2">
      {/* زر الاسترجاع */}
      <button
        onClick={() => handleRecoverFromArchive(settlement)}
        className="p-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
        title="استرجاع هذه التسوية"
      >
        <RotateCcw size={14} />
      </button>
      
      {/* زر الطباعة */}
      <button
        onClick={() => printSettlement(settlement)}
        className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
        title="طباعة التسوية"
      >
        <Printer size={14} />
      </button>
      
      {/* زر الحذف */}
      <button
        onClick={() => setSettlementToDelete(settlement)}
        className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
        title="حذف التسوية"
      >
        <Trash2 size={14} />
      </button>
    </div>
  </td>
\`;

// ============================================================================
// 5️⃣ نافذة تأكيد الاسترجاع
// ============================================================================

export const exampleRecoveryConfirmModal = \`
  {/* نافذة تأكيد الاسترجاع */}
  {showRecoveryConfirm && recoveryModalData && (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className={clsx("w-full max-w-md p-6 rounded-3xl shadow-2xl border space-y-5 animate-in zoom-in-95", T.card)}>
        
        {/* الرأس */}
        <div className="flex items-center gap-3 text-amber-600 border-b border-amber-100 pb-3">
          <div className="p-2.5 bg-amber-100 rounded-xl">
            <RotateCcw size={20} />
          </div>
          <div>
            <h2 className="font-black text-sm">استرجاع تسوية معتمدة</h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">
              سيتم إعادة الشيك إلى قائمة التسويات المفتوحة
            </p>
          </div>
        </div>

        {/* المعلومات */}
        <div className="space-y-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
          <p className="text-xs font-bold text-slate-600">معلومات التسوية:</p>
          <div className="text-xs space-y-1">
            <p><span className="font-bold">الموظف:</span> {recoveryModalData.employeeName || recoveryModalData.party}</p>
            <p><span className="font-bold">التاريخ:</span> {recoveryModalData.settlementDate}</p>
            <p><span className="font-bold">المصروف:</span> {formatMoney(recoveryModalData.settlementSpent || 0)}</p>
            <p><span className="font-bold">المرتجع:</span> {formatMoney(recoveryModalData.settlementReturned || 0)}</p>
          </div>
        </div>

        {/* حقل السبب */}
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase pr-1 mb-1 block">
            سبب الاسترجاع (اختياري)
          </label>
          <textarea
            value={recoveryReason}
            onChange={(e) => setRecoveryReason(e.target.value)}
            placeholder="اشرح سبب استرجاع هذه التسوية..."
            className={clsx("w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:border-amber-500", T.inp)}
            rows="3"
          />
        </div>

        {/* الأزرار */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => {
              setShowRecoveryConfirm(false);
              setRecoveryModalData(null);
              setRecoveryReason("");
            }}
            className={clsx("flex-1 py-2.5 rounded-xl font-bold text-xs border shadow-sm", T.btn)}
          >
            إلغاء
          </button>
          <button
            onClick={executeRecovery}
            disabled={recoveryLoading}
            className="flex-1 py-2.5 rounded-xl font-black text-xs bg-amber-600 text-white hover:bg-amber-700 shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {recoveryLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RotateCcw size={14} />
            )}
            استرجاع التسوية
          </button>
        </div>
      </div>
    </div>
  )}
\`;

// ============================================================================
// 6️⃣ أزرار حذف المسودات في التبويب الحالي
// ============================================================================

export const exampleDraftActions = \`
  {/* في تبويب "المسودات المحفوظة مؤقتاً" */}
  {draftSettlements.length > 0 && (
    <div className="space-y-2">
      {draftSettlements.map(draft => (
        <div
          key={draft.id}
          className={clsx(
            "p-3 rounded-xl border flex items-center justify-between",
            T.card
          )}
        >
          <div>
            <p className="font-bold text-sm">
              {draft.employeeName || draft.party}
              <span className="text-[10px] font-normal text-slate-500 mr-2">
                ({(draft.settlementExpenses || []).length} فواتير)
              </span>
            </p>
            <p className="text-[10px] text-slate-500">{draft.date}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => continueDraft(draft)}
              className="px-3 py-1 bg-teal-100 text-teal-700 rounded-lg text-xs font-bold hover:bg-teal-200"
            >
              متابعة
            </button>
            <button
              onClick={() => handleDiscardDraftSettlement(draft.id)}
              className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200 flex items-center gap-1"
            >
              <Trash2 size={12} /> حذف
            </button>
          </div>
        </div>
      ))}
    </div>
  )}
\`;

// ============================================================================
// 7️⃣ إضافة لسجل التدقيق (Audit Trail)
// ============================================================================

export const exampleAuditTrail = \`
  // إضافة جدول يوضح سجل الاسترجاعات
  {/* تبويب جديد: سجل الاسترجاعات */}
  <button
    onClick={() => setActiveTab("recoveryLog")}
    className={clsx(
      "px-6 py-2.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-2",
      activeTab === "recoveryLog"
        ? "bg-white dark:bg-slate-700 shadow-md text-amber-600"
        : "text-slate-500 hover:text-slate-700"
    )}
  >
    <History size={14} /> سجل الاسترجاعات
  </button>

  {/* محتوى التبويب */}
  {activeTab === "recoveryLog" && (
    <div className="space-y-4 p-6 bg-white rounded-2xl border">
      {/* يمكن الاستعلام عن audit_logs مع action = settlement_recovered */}
      <p className="text-slate-600">السجل يتم الاحتفاظ به تلقائياً في قاعدة البيانات</p>
      {/* يمكن إضافة جدول لعرض عمليات الاسترجاع السابقة */}
    </div>
  )}
\`;

// ============================================================================
// 8️⃣ مثال كامل: تحديث جدول الأرشيف
// ============================================================================

export const exampleCompleteArchiveTableUpdate = \`
  {/* في تبويب الأرشيف */}
  <div className="overflow-x-auto rounded-2xl border">
    <table className="w-full text-xs font-bold">
      <thead>
        <tr className="bg-slate-100 dark:bg-slate-800">
          <th className="p-3 text-right">الموظف</th>
          <th className="p-3 text-right">التاريخ</th>
          <th className="p-3 text-right">المصروف</th>
          <th className="p-3 text-right">المرتجع</th>
          <th className="p-3 text-right">الحالة</th>
          <th className="p-3 text-center">الإجراءات</th>
        </tr>
      </thead>
      <tbody>
        {filteredArchivedSettlements.map((settlement) => (
          <tr key={settlement.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-800">
            <td className="p-3">{settlement.employeeName || settlement.party}</td>
            <td className="p-3">{settlement.settlementDate}</td>
            <td className="p-3">{formatMoney(settlement.settlementSpent || 0)}</td>
            <td className="p-3">{formatMoney(settlement.settlementReturned || 0)}</td>
            <td className="p-3">
              <span className={clsx(
                "px-2 py-1 rounded text-[9px] font-black",
                settlement.returnMode === "bank_deposit"
                  ? "bg-blue-100 text-blue-700"
                  : settlement.returnMode === "cash_return"
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-700"
              )}>
                {settlement.returnMode === "bank_deposit" && "📱 إيداع بنك"}
                {settlement.returnMode === "cash_return" && "💵 رد نقدي"}
                {settlement.returnMode === "carry_forward" && "➡️ ترحيل"}
                {settlement.returnMode === "settled" && "✅ مسوى"}
              </span>
            </td>
            <td className="p-3">
              <div className="flex items-center justify-center gap-2">
                {/* زر الاسترجاع */}
                <button
                  onClick={() => handleRecoverFromArchive(settlement)}
                  title="استرجاع"
                  className="p-2 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors"
                >
                  <RotateCcw size={14} />
                </button>

                {/* زر الطباعة */}
                <button
                  onClick={() => printSettlementLocal({
                    advanceTxn: settlement,
                    expenses: settlement.settlementExpenses || [],
                    spent: settlement.settlementSpent || 0,
                    remaining: settlement.settlementReturned || 0,
                    returnMode: settlement.returnMode
                  })}
                  title="طباعة"
                  className="p-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                >
                  <Printer size={14} />
                </button>

                {/* زر الحذف */}
                <button
                  onClick={() => setSettlementToDelete(settlement)}
                  title="حذف"
                  className="p-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
\`;

// ============================================================================
// ملاحظات التكامل المهمة
// ============================================================================

export const integrationNotes = \`
⚠️ نقاط مهمة:

1️⃣ الواردات:
   - تأكد من استيراد recoverSingleSettlement من settlementRecovery
   - استيراد discardDraft للمسودات
   - استيراد getEmployeeSettlementHistory للسجلات

2️⃣ State Management:
   - أضف State لـ recoveryModalData، recoveryReason، recoveryLoading
   - أضف State لـ showRecoveryConfirm

3️⃣ السجل والمصادقة:
   - تأكد من توفر currentSession مع بيانات المستخدم
   - سيتم تسجيل جميع العمليات تلقائياً في audit_logs

4️⃣ التحديثات:
   - بعد الاسترجاع الناجح: أعد تحميل البيانات
   - انتقل إلى تبويب "current" لإظهار الشيك المسترجع
   - أفرغ نماذج الإدخال

5️⃣ معالجة الأخطاء:
   - عالج جميع العمليات مع try/catch
   - عرض رسالة واضحة للمستخدم
   - سجل الأخطاء في console

6️⃣ الأمان:
   - تحقق من صلاحيات المستخدم قبل الاسترجاع
   - اطلب تأكيداً واضحاً من المستخدم
   - وثق سبب الاسترجاع
\`;
