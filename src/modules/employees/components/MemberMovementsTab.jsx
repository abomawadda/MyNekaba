/* eslint-disable no-unused-vars, react-hooks/set-state-in-effect */
import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock3,
  FilePlus2,
  FileText,
  GitBranch,
  ShieldCheck,
  X,
} from "lucide-react";
import clsx from "clsx";
import { db } from "../../../app/providers/FirebaseProvider";
import { useAuth } from "../../../app/providers/AuthProvider";
import ArabicDatePicker from "../../../ui/inputs/ArabicDatePicker";
import {
  buildMemberMovementTimeline,
  dedupeMemberMovements,
  formatMovementDate,
  getLatestApprovedMovement,
  inferMovementSummaryFromMember,
  MEMBER_MOVEMENT_TYPE_LABELS,
  MEMBER_MOVEMENT_TYPES,
} from "../helpers/memberMovements";
import { useMemberMovementService } from "../services/memberMovementService";
import { PERMISSIONS } from "../../../security/permissions";

const getTodayISO = () => new Date().toISOString().split("T")[0];
const SERVICE_END_OPTIONS = [
  { value: "retirement", label: "إحالة للمعاش" },
  { value: "resignation", label: "استقالة" },
  { value: "death", label: "وفاة" },
  { value: "service_end", label: "إنهاء خدمة إداري" },
];
const GENERAL_MOVEMENT_OPTIONS = MEMBER_MOVEMENT_TYPES
  .filter((type) => !SERVICE_END_OPTIONS.some((option) => option.value === type))
  .map((type) => ({
    value: type,
    label: MEMBER_MOVEMENT_TYPE_LABELS[type] || type,
  }));

const dedupeDocs = (docs = []) => {
  const map = new Map();
  docs.forEach((item) => {
    if (item?.id) map.set(item.id, item);
  });
  return Array.from(map.values());
};

function StatCard({ icon: Icon, label, value, tone = "teal", T }) {
  return (
    <div className={clsx("p-4 rounded-2xl border shadow-sm", T?.card)}>
      <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center mb-3", `bg-${tone}-50 text-${tone}-600 dark:bg-${tone}-900/20`)}>
        <Icon size={18} />
      </div>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
      <p className="text-sm font-black text-slate-900 dark:text-white mt-1 break-words">{value}</p>
    </div>
  );
}

function MovementBadge({ label, tone = "slate" }) {
  return (
    <span className={clsx("px-2.5 py-1 rounded-full text-[10px] font-black", `bg-${tone}-50 text-${tone}-700 dark:bg-${tone}-900/20 dark:text-${tone}-300`)}>
      {label}
    </span>
  );
}

function MovementModal({
  open,
  onClose,
  form,
  setForm,
  saving,
  error,
  onSubmit,
  T,
  title,
  description,
  options,
  confirmLabel,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx("relative w-full max-w-2xl rounded-3xl border shadow-2xl p-5 space-y-4", T?.card)}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-100">{title}</h3>
            <p className="text-[11px] font-bold text-slate-500 mt-1">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase">نوع الحركة</label>
            <select
              value={form.movementType}
              onChange={(e) => setForm((prev) => ({ ...prev, movementType: e.target.value }))}
              className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-black outline-none", T?.sel || T?.inp)}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase">التاريخ الفعلي</label>
            <ArabicDatePicker
              label=""
              value={form.effectiveDate}
              onChange={(value) => setForm((prev) => ({ ...prev, effectiveDate: value }))}
              maxVal={getTodayISO()}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase">تاريخ القرار</label>
            <ArabicDatePicker
              label=""
              value={form.decisionDate}
              onChange={(value) => setForm((prev) => ({ ...prev, decisionDate: value }))}
              minVal={form.effectiveDate || undefined}
              maxVal={getTodayISO()}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase">سبب الحركة</label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="مثال: بلوغ السن القانوني"
              className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-black outline-none", T?.inp)}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-[10px] font-black text-slate-500 uppercase">ملاحظات</label>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="أي تفاصيل إضافية أو مرجع القرار"
              className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-black outline-none resize-none", T?.inp)}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 text-xs font-black">
            {error}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border text-xs font-black text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Clock3 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MemberMovementsTab({ member, T }) {
  const { user, can } = useAuth();
  const { createAndApplyMemberMovement, approveMemberMovement } = useMemberMovementService();
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isServiceEndOpen, setIsServiceEndOpen] = useState(false);
  const [serviceEndError, setServiceEndError] = useState("");
  const [savingServiceEnd, setSavingServiceEnd] = useState(false);
  const [isMovementOpen, setIsMovementOpen] = useState(false);
  const [movementError, setMovementError] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);
  const [serviceEndForm, setServiceEndForm] = useState({
    movementType: "retirement",
    effectiveDate: getTodayISO(),
    decisionDate: getTodayISO(),
    reason: "",
    notes: "",
  });
  const [movementForm, setMovementForm] = useState({
    movementType: GENERAL_MOVEMENT_OPTIONS[0]?.value || "promotion",
    effectiveDate: getTodayISO(),
    decisionDate: getTodayISO(),
    reason: "",
    notes: "",
  });
  const canManageMovements = can?.("employees.edit") || can?.("employees.create") || user?.role === "admin";
  const canApproveMovements = can?.(PERMISSIONS.employeesMovementApprove) || user?.role === "admin";

  useEffect(() => {
    if (!member) return undefined;

    const memberId = String(member?.id || "").trim();
    const memberJobId = String(member?.jobId || "").trim();
    const memberName = String(member?.name || "").trim();

    if (!memberId && !memberJobId && !memberName) {
      setMovements([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    let active = true;
    let pendingInitialLoads = 0;
    let byId = [];
    let byJobId = [];
    let byName = [];
    const subscriptions = [];

    const refresh = () => {
      if (!active) return;
      setMovements(dedupeDocs([...byId, ...byJobId, ...byName]));
    };

    const markReady = () => {
      pendingInitialLoads -= 1;
      if (active && pendingInitialLoads <= 0) setLoading(false);
    };

    const attachListener = (field, value, assign) => {
      if (!value) return;
      pendingInitialLoads += 1;
      let initialized = false;

      const unsubscribe = onSnapshot(
        query(collection(db, "member_movements"), where(field, "==", value)),
        (snapshot) => {
          assign(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
          refresh();
          if (!initialized) {
            initialized = true;
            markReady();
          }
        },
        (nextError) => {
          console.error(nextError);
          if (active) {
            setError("تعذر تحميل سجل حركة العضو حاليًا.");
          }
          if (!initialized) {
            initialized = true;
            markReady();
          }
        }
      );

      subscriptions.push(unsubscribe);
    };

    setLoading(true);
    setError("");
    attachListener("memberId", memberId, (docs) => {
      byId = docs;
    });
    attachListener("memberJobId", memberJobId, (docs) => {
      byJobId = docs;
    });
    attachListener("memberName", memberName, (docs) => {
      byName = docs;
    });

    if (pendingInitialLoads === 0) {
      setLoading(false);
    }

    return () => {
      active = false;
      subscriptions.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [member]);

  const timeline = useMemo(
    () => buildMemberMovementTimeline(dedupeMemberMovements(movements)),
    [movements]
  );
  const latestApproved = useMemo(() => getLatestApprovedMovement(timeline), [timeline]);
  const inferredSummary = useMemo(() => inferMovementSummaryFromMember(member), [member]);

  const resetServiceEndForm = () => {
    setServiceEndForm({
      movementType: "retirement",
      effectiveDate: getTodayISO(),
      decisionDate: getTodayISO(),
      reason: "",
      notes: "",
    });
    setServiceEndError("");
  };

  const openServiceEndModal = () => {
    resetServiceEndForm();
    setIsServiceEndOpen(true);
  };

  const resetMovementForm = () => {
    setMovementForm({
      movementType: GENERAL_MOVEMENT_OPTIONS[0]?.value || "promotion",
      effectiveDate: getTodayISO(),
      decisionDate: getTodayISO(),
      reason: "",
      notes: "",
    });
    setMovementError("");
  };

  const openMovementModal = () => {
    resetMovementForm();
    setIsMovementOpen(true);
  };

  const closeServiceEndModal = () => {
    setIsServiceEndOpen(false);
    setSavingServiceEnd(false);
    setServiceEndError("");
  };

  const closeMovementModal = () => {
    setIsMovementOpen(false);
    setSavingMovement(false);
    setMovementError("");
  };

  const handleServiceEndSubmit = async () => {
    if (!member?.id) {
      setServiceEndError("تعذر تحديد العضو المطلوب تحديثه.");
      return;
    }
    if (!serviceEndForm.effectiveDate) {
      setServiceEndError("تاريخ الحركة الفعلي مطلوب.");
      return;
    }
    if (!serviceEndForm.reason.trim()) {
      setServiceEndError("سبب الحركة مطلوب.");
      return;
    }

    setSavingServiceEnd(true);
    setServiceEndError("");
    try {
      await createAndApplyMemberMovement(
        {
          movementType: serviceEndForm.movementType,
          effectiveDate: serviceEndForm.effectiveDate,
          decisionDate: serviceEndForm.decisionDate || serviceEndForm.effectiveDate,
          reason: serviceEndForm.reason.trim(),
          notes: serviceEndForm.notes.trim(),
          source: "employee_module",
          createdBy: user?.displayName || user?.fullName || "",
          createdById: user?.id || "",
        },
        member
      );
      closeServiceEndModal();
    } catch (submitError) {
      console.error(submitError);
      setServiceEndError(submitError?.message || "تعذر اعتماد الحركة حاليًا.");
      setSavingServiceEnd(false);
    }
  };

  const handleMovementSubmit = async () => {
    if (!member?.id) {
      setMovementError("تعذر تحديد العضو المطلوب تحديثه.");
      return;
    }
    if (!movementForm.effectiveDate) {
      setMovementError("تاريخ الحركة الفعلي مطلوب.");
      return;
    }
    if (!movementForm.reason.trim()) {
      setMovementError("وصف الحركة أو سببها مطلوب.");
      return;
    }

    setSavingMovement(true);
    setMovementError("");
    try {
      await createAndApplyMemberMovement(
        {
          movementType: movementForm.movementType,
          effectiveDate: movementForm.effectiveDate,
          decisionDate: movementForm.decisionDate || movementForm.effectiveDate,
          reason: movementForm.reason.trim(),
          notes: movementForm.notes.trim(),
          source: "employee_module",
          createdBy: user?.displayName || user?.fullName || "",
          createdById: user?.id || "",
        },
        member
      );
      closeMovementModal();
    } catch (submitError) {
      console.error(submitError);
      setMovementError(submitError?.message || "تعذر اعتماد الحركة حاليًا.");
      setSavingMovement(false);
    }
  };

  const handleApproveMovement = async (movement) => {
    if (!canApproveMovements) return;
    if (movement.createdById && movement.createdById === user?.id) {
      setError("لا يمكن اعتماد حركة أنشأتها بنفسك.");
      return;
    }
    try {
      await approveMemberMovement({ ...movement, approvedById: user?.id || "", approvedBy: user?.displayName || user?.fullName || "" }, member);
    } catch (approveError) {
      setError(approveError?.message || "تعذر اعتماد الحركة.");
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className={clsx("p-4 rounded-2xl border shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3", T?.card)}>
        <div>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">سجل حركة العضو</h3>
          <p className="text-[11px] font-bold text-slate-500 mt-1">
            يعرض الحركات الإدارية المؤثرة على العضوية والخدمة، وهو الأساس المقترح لمرحلة دورة حياة العضو.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MovementBadge
            label={latestApproved?.movementLabel || inferredSummary.movementLabel || "لا توجد حركة معتمدة"}
            tone={latestApproved?.isFinal ? "rose" : "teal"}
          />
          {canManageMovements && (
            <>
              <button
                type="button"
                onClick={openMovementModal}
                className="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-black hover:bg-teal-700 flex items-center gap-2"
              >
                <FilePlus2 size={14} />
                إضافة حركة
              </button>
              <button
                type="button"
                onClick={openServiceEndModal}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700 flex items-center gap-2"
              >
                <FilePlus2 size={14} />
                إنهاء خدمة
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon={GitBranch} label="إجمالي الحركات" value={`${timeline.length}`} tone="teal" T={T} />
        <StatCard icon={ShieldCheck} label="الحالة الحالية" value={member?.memberState || "نشط"} tone="sky" T={T} />
        <StatCard
          icon={Calendar}
          label="آخر حركة معتمدة"
          value={latestApproved ? `${latestApproved.movementLabel} - ${latestApproved.displayDate}` : `${inferredSummary.movementLabel} - ${inferredSummary.effectiveDate}`}
          tone={latestApproved?.isFinal ? "rose" : "amber"}
          T={T}
        />
        <StatCard
          icon={Clock3}
          label="آخر تحديث عضوية"
          value={formatMovementDate(member?.lastMovementDate || member?.membershipExpiry || member?.retirementDate)}
          tone="violet"
          T={T}
        />
      </div>

      {loading && (
        <div className={clsx("p-10 rounded-2xl border text-center space-y-3", T?.card)}>
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-black text-slate-500">جارٍ تحميل سجل الحركة...</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700 text-xs font-black">
          {error}
        </div>
      )}

      {!loading && !error && timeline.length === 0 && (
        <div className={clsx("p-8 rounded-2xl border border-dashed text-center space-y-3", T?.card)}>
          <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 mx-auto flex items-center justify-center">
            <FileText size={24} className="text-slate-400" />
          </div>
          <p className="text-sm font-black text-slate-700 dark:text-slate-200">لا توجد حركات مسجلة بعد</p>
          <p className="text-[11px] font-bold text-slate-500">
            الملف يعرض الآن الحالة الحالية للعضو فقط. عند بدء استخدام `member_movements` ستظهر الحركات التاريخية هنا تلقائيًا.
          </p>
        </div>
      )}

      {!loading && !error && timeline.length > 0 && (
        <div className="space-y-3">
          {timeline.map((movement) => (
            <div key={movement.id} className={clsx("p-4 rounded-2xl border shadow-sm", T?.card)}>
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <MovementBadge label={movement.movementLabel} tone={movement.isFinal ? "rose" : "teal"} />
                    <MovementBadge label={movement.statusLabel} tone={movement.status === "approved" ? "emerald" : movement.status === "cancelled" ? "slate" : "amber"} />
                    <span className="text-[11px] font-black text-slate-400">{movement.displayDate}</span>
                  </div>

                  <div>
                    <p className="text-sm font-black text-slate-800 dark:text-slate-100">{movement.reason || movement.movementLabel}</p>
                    {movement.notes && (
                      <p className="text-[11px] font-bold text-slate-500 mt-1 leading-6">{movement.notes}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <MovementBadge label={movement.sourceLabel} tone="sky" />
                  {movement.isFinal && (
                    <MovementBadge label="حركة نهائية" tone="rose" />
                  )}
                  {movement.status === "draft" && canApproveMovements && movement.createdById !== user?.id && (
                    <button type="button" onClick={() => handleApproveMovement(movement)} className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                      اعتماد الحركة
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-[11px]">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800 p-3">
                  <p className="font-black text-slate-500 mb-2">قبل الحركة</p>
                  <p className="font-bold text-slate-700 dark:text-slate-200">الحالة: {movement.beforeSnapshot?.memberState || "—"}</p>
                  <p className="font-bold text-slate-500 mt-1">انتهاء العضوية: {movement.beforeSnapshot?.membershipExpiry || "—"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800 p-3">
                  <p className="font-black text-slate-500 mb-2">بعد الحركة</p>
                  <p className="font-bold text-slate-700 dark:text-slate-200">الحالة: {movement.afterSnapshot?.memberState || "—"}</p>
                  <p className="font-bold text-slate-500 mt-1">انتهاء العضوية: {movement.afterSnapshot?.membershipExpiry || "—"}</p>
                </div>
              </div>

              {(movement.createdBy || movement.approvedBy) && (
                <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] font-black text-slate-400">
                  {movement.createdBy && <span>أنشأها: {movement.createdBy}</span>}
                  {movement.approvedBy && <span>اعتمدها: {movement.approvedBy}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {latestApproved?.isFinal && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 dark:bg-rose-950/10 px-4 py-3 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
            <AlertTriangle size={18} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black text-rose-700">آخر حركة معتمدة نهائية</p>
            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              {latestApproved.movementLabel} بتاريخ {latestApproved.displayDate}، ويجب أن تنعكس على أهلية المزايا والخدمات في المراحل التالية.
            </p>
          </div>
        </div>
      )}

      <MovementModal
        open={isMovementOpen}
        onClose={closeMovementModal}
        form={movementForm}
        setForm={setMovementForm}
        saving={savingMovement}
        error={movementError}
        onSubmit={handleMovementSubmit}
        T={T}
        title="إضافة حركة عضو"
        description="يسجل حركة إدارية عامة ويعتمدها مباشرة داخل ملف العضو الحالي."
        options={GENERAL_MOVEMENT_OPTIONS}
        confirmLabel="إضافة الحركة"
      />

      <MovementModal
        open={isServiceEndOpen}
        onClose={closeServiceEndModal}
        form={serviceEndForm}
        setForm={setServiceEndForm}
        saving={savingServiceEnd}
        error={serviceEndError}
        onSubmit={handleServiceEndSubmit}
        T={T}
        title="إنهاء خدمة / حركة نهائية"
        description="يعتمد الحركة النهائية مباشرة ويحدّث حالة العضو داخل السجل الحالي."
        options={SERVICE_END_OPTIONS}
        confirmLabel="اعتماد الحركة"
      />
    </div>
  );
}
