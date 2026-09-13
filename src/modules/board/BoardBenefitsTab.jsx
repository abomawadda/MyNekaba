import React, { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Banknote, Coins, Eye, Plus, Save, Trash2, X } from "lucide-react";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";
import { logAuditEvent } from "../../utils/auditLog";
import { formatMoney } from "../../utils/numberFormat";
import ArabicDatePicker from "../../ui/inputs/ArabicDatePicker";
import MemberSearchSelect from "./MemberSearchSelect";
import {
  BOARD_ALLOWANCE_CATEGORIES,
  NON_ALLOWANCE_BENEFIT_TYPES,
} from "../../utils/memberBenefits";
import {
  normalizeBoardBenefit,
  normalizeBoardMembership,
  sortBoardTerms,
} from "./boardLifecycle";
import { saveBoardBenefit } from "./boardElectionService";

const inputCls = "w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all";

const OTHER_BENEFIT_TYPES = [
  "دعم رحلة",
  "دعم رحلة عمرة",
  "إعفاء من الإشراف",
  "خصم نقدي",
  "مساعدة مالية",
  ...NON_ALLOWANCE_BENEFIT_TYPES,
  "ميزة أخرى",
];

const inRange = (date, from, to) => {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
};

function deriveAllowanceBenefits(settlementTransactions = []) {
  const rows = [];
  (settlementTransactions || []).forEach((check) => {
    const expenses = Array.isArray(check.settlementExpenses) ? check.settlementExpenses : [];
    const checkNum = check.checkNum || check.bankReference || "";
    const settlementId = check.id || "";
    const settlementDate = check.settlementDate || check.settlementApprovedAt || check.settlementCompletedAt || "";
    const settlementState = check.isSettled ? "مسواة" : check.hasDraftSettlement ? "مسودة" : "مفتوحة";
    expenses.forEach((expense, idx) => {
      if (!BOARD_ALLOWANCE_CATEGORIES.includes(expense?.category)) return;
      const snapshots = Array.isArray(expense.boardMemberSnapshots) && expense.boardMemberSnapshots.length > 0
        ? expense.boardMemberSnapshots
        : (Array.isArray(expense.boardMembers) ? expense.boardMembers.map((id) => ({ memberId: id })) : []);
      if (snapshots.length === 0) return;
      const perMember = Number(expense.allowancePerMember || 0) > 0
        ? Number(expense.allowancePerMember)
        : Number(expense.amount || 0) / snapshots.length;
      snapshots.forEach((snap) => {
        const memberId = snap.memberId || snap.id || "";
        if (!memberId) return;
        rows.push({
          id: `${settlementId}:${idx}:${memberId}`,
          memberId,
          memberName: snap.name || snap.memberName || "",
          benefitType: expense.category,
          amount: perMember,
          benefitDate: expense.date || settlementDate || check.date || "",
          description: expense.meetingTitle ? `اجتماع: ${expense.meetingTitle}` : expense.notes || "",
          source: "settlement",
          refDocId: settlementId,
          checkNum,
          settlementId,
          settlementState,
        });
      });
    });
  });
  return rows;
}

export default function BoardBenefitsTab({
  boardTerms, memberships, allEmployees, settlementTransactions, manualBenefits, activeTerm, T, canManage = false,
}) {
  const normalizedTerms = useMemo(() => sortBoardTerms((boardTerms || []).map((t) => ({ ...t }))), [boardTerms]);
  const [selectedTermId, setSelectedTermId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [showBenefitModal, setShowBenefitModal] = useState(false);
  const [benefitForm, setBenefitForm] = useState({ memberId: "", benefitType: "", amount: "", benefitDate: "", description: "", checkNum: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ids = [...normalizedTerms.map((t) => t.id), activeTerm?.id].filter(Boolean);
    if (!selectedTermId || !ids.includes(selectedTermId)) {
      setSelectedTermId(normalizedTerms.find((t) => t.id === activeTerm?.id)?.id || normalizedTerms[0]?.id || "");
    }
  }, [activeTerm?.id, normalizedTerms, selectedTermId]);

  const selectedTerm = normalizedTerms.find((t) => t.id === selectedTermId) || normalizedTerms[0] || null;
  const isHistorical = ["archived", "closed"].includes(selectedTerm?.status);
  const canEdit = canManage && !isHistorical;

  const termMemberships = useMemo(
    () => (memberships || []).map(normalizeBoardMembership).filter((m) => !selectedTerm?.id || m.termId === selectedTerm.id),
    [memberships, selectedTerm?.id]
  );
  const employeesMap = useMemo(() => new Map((allEmployees || []).map((e) => [e.id, e])), [allEmployees]);

  const allowanceRows = useMemo(() => {
    if (!selectedTerm) return [];
    return deriveAllowanceBenefits(settlementTransactions).filter((row) =>
      inRange(row.benefitDate, selectedTerm.startDate, selectedTerm.endDate)
    );
  }, [settlementTransactions, selectedTerm]);

  const manualRows = useMemo(
    () => (manualBenefits || []).map(normalizeBoardBenefit)
      .filter((b) => !selectedTerm?.id || b.termId === selectedTerm.id)
      .map((b) => ({ ...b, source: "manual", settlementState: "—" })),
    [manualBenefits, selectedTerm?.id]
  );

  const memberWindows = useMemo(() => {
    const map = new Map();
    termMemberships.forEach((m) => {
      if (!map.has(m.memberId)) map.set(m.memberId, []);
      map.get(m.memberId).push({ from: m.joinDate || "", to: m.endDate || "", role: m.role || "", status: m.status });
    });
    return map;
  }, [termMemberships]);

  const withTenure = (rows) => rows.map((row) => {
    const windows = memberWindows.get(row.memberId) || [];
    const within = windows.some((w) => inRange(row.benefitDate, w.from || selectedTerm?.startDate, w.to || selectedTerm?.endDate));
    return { ...row, withinTenure: windows.length === 0 ? true : within };
  });

  const allRows = useMemo(() => withTenure([...allowanceRows, ...manualRows])
    .sort((a, b) => String(b.benefitDate || "").localeCompare(String(a.benefitDate || ""))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allowanceRows, manualRows, memberWindows, selectedTerm]);

  const memberTotals = useMemo(() => {
    const map = new Map();
    allRows.forEach((row) => {
      if (!map.has(row.memberId)) {
        const membership = termMemberships.find((m) => m.memberId === row.memberId);
        const employee = employeesMap.get(row.memberId) || {};
        map.set(row.memberId, {
          memberId: row.memberId,
          memberName: row.memberName || membership?.memberName || employee.name || "—",
          role: membership?.role || "",
          total: 0,
          count: 0,
        });
      }
      const entry = map.get(row.memberId);
      if (row.withinTenure) entry.total += Number(row.amount || 0);
      entry.count += 1;
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [allRows, termMemberships, employeesMap]);

  const grandTotal = useMemo(
    () => memberTotals.reduce((s, m) => s + Number(m.total || 0), 0),
    [memberTotals]
  );

  const memberFile = useMemo(() => {
    if (!selectedMemberId) return null;
    const rows = allRows.filter((r) => r.memberId === selectedMemberId);
    const total = rows.filter((r) => r.withinTenure).reduce((s, r) => s + Number(r.amount || 0), 0);
    const info = memberTotals.find((m) => m.memberId === selectedMemberId);
    return { rows, total, info };
  }, [selectedMemberId, allRows, memberTotals]);

  const openAddBenefit = () => {
    if (!canEdit || !selectedTerm?.id) return;
    setBenefitForm({ memberId: "", benefitType: "", amount: "", benefitDate: "", description: "", checkNum: "" });
    setShowBenefitModal(true);
  };

  const handleSaveBenefit = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const membership = termMemberships.find((m) => m.memberId === benefitForm.memberId);
      const employee = employeesMap.get(benefitForm.memberId) || {};
      await saveBoardBenefit({
        termId: selectedTerm.id,
        memberId: benefitForm.memberId,
        memberName: membership?.memberName || employee.name || "",
        benefitType: benefitForm.benefitType,
        amount: Number(benefitForm.amount || 0),
        benefitDate: benefitForm.benefitDate,
        description: benefitForm.description,
        source: "manual",
        checkNum: benefitForm.checkNum,
      });
      setShowBenefitModal(false);
    } catch (error) {
      alert(error.message || "تعذر حفظ الميزة.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBenefit = async (benefit) => {
    if (!canEdit || !benefit?.id || benefit.source !== "manual") return;
    if (!window.confirm(`حذف ميزة ${benefit.benefitType} للعضو ${benefit.memberName}؟`)) return;
    try {
      await deleteDoc(doc(db, "board_benefits", benefit.id));
      await logAuditEvent("board_benefit_deleted", { targetId: benefit.id, termId: benefit.termId, memberName: benefit.memberName });
    } catch {
      alert("تعذر الحذف.");
    }
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-5">
      {showBenefitModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowBenefitModal(false)} />
          <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border shadow-2xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <h3 className="text-base font-black">إضافة ميزة أخرى للعضو</h3>
              <button onClick={() => setShowBenefitModal(false)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><X size={15} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5"><label className="text-[11px] font-black text-slate-500">العضو — بحث واختيار</label>
                <MemberSearchSelect
                  value={benefitForm.memberId}
                  onChange={(memberId) => setBenefitForm((v) => ({ ...v, memberId }))}
                  options={termMemberships.map((m) => ({ id: m.memberId, name: m.memberName, sub: m.role || "" }))}
                /></div>
              <div className="flex flex-col gap-1.5"><label className="text-[11px] font-black text-slate-500">نوع الميزة</label>
                <select className={inputCls} value={benefitForm.benefitType} onChange={(e) => setBenefitForm((v) => ({ ...v, benefitType: e.target.value }))}>
                  <option value="">اختر النوع</option>
                  {OTHER_BENEFIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select></div>
              <div className="flex flex-col gap-1.5"><label className="text-[11px] font-black text-slate-500">القيمة المالية</label>
                <input type="number" min="0" className={inputCls} value={benefitForm.amount} onChange={(e) => setBenefitForm((v) => ({ ...v, amount: e.target.value }))} /></div>
              <div className="flex flex-col gap-1.5"><label className="text-[11px] font-black text-slate-500">التاريخ</label>
                <ArabicDatePicker value={benefitForm.benefitDate} onChange={(value) => setBenefitForm((v) => ({ ...v, benefitDate: value }))} /></div>
              <div className="flex flex-col gap-1.5"><label className="text-[11px] font-black text-slate-500">رقم الشيك/المرجع</label>
                <input className={inputCls} value={benefitForm.checkNum} onChange={(e) => setBenefitForm((v) => ({ ...v, checkNum: e.target.value }))} /></div>
              <div className="flex flex-col gap-1.5"><label className="text-[11px] font-black text-slate-500">الوصف</label>
                <input className={inputCls} value={benefitForm.description} onChange={(e) => setBenefitForm((v) => ({ ...v, description: e.target.value }))} /></div>
            </div>
            <div className="px-5 py-4 border-t flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowBenefitModal(false)} className="px-4 py-2 rounded-xl text-xs font-black border">إلغاء</button>
              <button onClick={handleSaveBenefit} disabled={saving || !canEdit} className="px-4 py-2 rounded-xl text-xs font-black bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60 flex items-center gap-1.5"><Save size={13} /> حفظ الميزة</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">البدلات والمزايا النقدية</h2>
          <p className="text-[11px] font-bold text-slate-400 mt-1">بدلات التسويات المعتمدة + المزايا الأخرى — إجمالي الدورة: {formatMoney(grandTotal)}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-black" value={selectedTermId} onChange={(e) => { setSelectedTermId(e.target.value); setSelectedMemberId(""); }}>
            {normalizedTerms.map((t) => <option key={t.id} value={t.id}>{t.title || t.id}</option>)}
          </select>
          <button onClick={openAddBenefit} disabled={!canEdit} className={clsx("px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5", canEdit ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-slate-200 text-slate-400 cursor-not-allowed")}><Plus size={14} /> إضافة ميزة أخرى</button>
        </div>
      </div>

      <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
        <h3 className="text-sm font-black mb-4 flex items-center gap-2"><Coins size={15} className="text-emerald-500" /> إجمالي المزايا لكل عضو (داخل فترة عضويته)</h3>
        {memberTotals.length === 0 ? (
          <p className="text-[11px] font-bold text-slate-400 text-center py-6">لا توجد مزايا مسجلة في هذه الدورة بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[11px]">
              <thead><tr className="bg-slate-50 dark:bg-slate-800/60 border-b">
                {["العضو", "الصفة", "عدد البنود", "الإجمالي النقدي", ""].map((h, i) => <th key={i} className="p-2.5 font-black text-slate-500 whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {memberTotals.map((m) => (
                  <tr key={m.memberId} className={selectedMemberId === m.memberId ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}>
                    <td className="p-2.5 font-black">{m.memberName}</td>
                    <td className="p-2.5 text-slate-500 font-bold">{m.role || "—"}</td>
                    <td className="p-2.5 font-bold">{m.count}</td>
                    <td className="p-2.5 font-black text-emerald-600">{formatMoney(m.total)}</td>
                    <td className="p-2.5"><button onClick={() => setSelectedMemberId(selectedMemberId === m.memberId ? "" : m.memberId)} className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 hover:text-amber-700 flex items-center gap-1"><Eye size={12} /> الملف المالي</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {memberFile && (
        <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-sm font-black flex items-center gap-2"><Banknote size={15} className="text-teal-500" /> الملف المالي — {memberFile.info?.memberName}</h3>
            <span className="text-xs font-black text-emerald-600">الإجمالي: {formatMoney(memberFile.total)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[10px]">
              <thead><tr className="bg-slate-800 text-white">
                {["التاريخ", "نوع الميزة", "المبلغ", "المصدر", "الشيك", "التسوية", "السبب/الوصف", "الحالة", ""].map((h, i) => <th key={i} className="py-2 px-2 font-black border border-slate-700 whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {memberFile.rows.map((r) => (
                  <tr key={r.id} className={!r.withinTenure ? "bg-slate-100/70 dark:bg-slate-800/40" : ""}>
                    <td className="py-1.5 px-2 border whitespace-nowrap font-bold">{r.benefitDate || "—"}</td>
                    <td className="py-1.5 px-2 border font-black whitespace-nowrap">{r.benefitType}</td>
                    <td className="py-1.5 px-2 border font-black tabular-nums text-emerald-600 whitespace-nowrap">{formatMoney(r.amount)}</td>
                    <td className="py-1.5 px-2 border font-bold whitespace-nowrap">{r.source === "settlement" ? "سلفة مؤقتة" : "يدوية"}</td>
                    <td className="py-1.5 px-2 border font-bold whitespace-nowrap">{r.checkNum || "—"}</td>
                    <td className="py-1.5 px-2 border font-bold whitespace-nowrap">{r.settlementState || "—"}</td>
                    <td className="py-1.5 px-2 border text-slate-500 max-w-[220px] break-words">{r.description || "—"}</td>
                    <td className="py-1.5 px-2 border whitespace-nowrap">{r.withinTenure ? <span className="text-emerald-600 font-black">ضمن العضوية</span> : <span className="text-slate-400 font-black">خارج فترة العضوية</span>}</td>
                    <td className="py-1.5 px-2 border">{r.source === "manual" && canEdit && <button onClick={() => handleDeleteBenefit(r)} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={13} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
