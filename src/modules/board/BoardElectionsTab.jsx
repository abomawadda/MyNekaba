/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query } from "firebase/firestore";
import clsx from "clsx";
import {
  ArrowUpCircle, BarChart3, CheckCircle2, Edit3, Gavel, History, ListChecks, Plus, Save, Trash2, Trophy, UserX, X,
} from "lucide-react";
import { db } from "../../app/providers/FirebaseProvider";
import { logAuditEvent } from "../../utils/auditLog";
import ArabicDatePicker from "../../ui/inputs/ArabicDatePicker";
import MemberSearchSelect from "./MemberSearchSelect";
import { Button, FilterBar, SearchInput, StatCard, StatusBadge } from "../../ui/enterprise";
import {
  BOARD_CANDIDATE_POSITIONS,
  BOARD_CANDIDATE_STATUS,
  BOARD_END_REASONS,
  BOARD_MEMBERSHIP_ROLES,
  getEffectiveMemberState,
  isAssemblyMember,
} from "../../utils/memberBenefits";
import {
  BOARD_CANDIDATES_COLLECTION,
  BOARD_BENEFITS_COLLECTION,
  BOARD_MOVEMENTS_COLLECTION,
  BOARD_MOVEMENT_LABELS,
  findNextReserveCandidate,
  normalizeBoardCandidate,
  normalizeBoardMembership,
  normalizeBoardMovement,
  rankBoardCandidates,
  sortBoardTerms,
} from "./boardLifecycle";
import {
  approveElectionResults,
  assignBoardPosition,
  endBoardMembership,
  escalateNextReserve,
  saveBoardCandidate,
} from "./boardElectionService";

const inputCls = "w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600";

const POSITION_LABELS = Object.fromEntries(BOARD_CANDIDATE_POSITIONS.map((p) => [p.value, p.label]));
const CANDIDATE_STATUS_LABELS = Object.fromEntries(BOARD_CANDIDATE_STATUS.map((s) => [s.value, s.label]));
const END_REASON_LABELS = Object.fromEntries(BOARD_END_REASONS.map((r) => [r.value, r.label]));

const EXECUTIVE_ROLES = ["رئيس المجلس", "الأمين العام", "أمين الصندوق"];

const getCandidateStatusTone = (status, computedSeat = "") => {
  if (status === "won_original" || computedSeat === "original") return "success";
  if (status === "won_reserve" || computedSeat === "reserve") return "info";
  if (status === "withdrawn") return "warning";
  if (status === "disqualified") return "danger";
  return "neutral";
};

function Modal({ open, onClose, title, children, actions, size = "lg" }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx("relative w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col max-h-[92vh]", widths[size] || widths.lg)}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h3 className="text-base font-black text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-100 hover:text-rose-600 transition-colors"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 shrink-0">{actions}</div>
      </div>
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const emptyCandidateForm = (termId = "") => ({
  termId, memberId: "", position: "member", votes: 0, nominationDate: "", status: "nominated", notes: "",
});

export default function BoardElectionsTab({
  boardTerms, candidates, memberships, movements, allEmployees, activeTerm, T, canManage = false,
}) {
  const normalizedTerms = useMemo(() => sortBoardTerms((boardTerms || []).map((t) => ({ ...t }))), [boardTerms]);
  const [selectedTermId, setSelectedTermId] = useState("");
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [candidateForm, setCandidateForm] = useState(emptyCandidateForm());
  const [saving, setSaving] = useState(false);
  const [seats, setSeats] = useState(11);
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [positionTarget, setPositionTarget] = useState(null);
  const [positionForm, setPositionForm] = useState({ role: "", effectiveDate: "", decisionRef: "" });
  const [showEndModal, setShowEndModal] = useState(false);
  const [endTarget, setEndTarget] = useState(null);
  const [endForm, setEndForm] = useState({ endDate: "", endReason: "", decisionRef: "", notes: "" });
  const [escalationDate, setEscalationDate] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");

  useEffect(() => {
    const ids = [...normalizedTerms.map((t) => t.id), activeTerm?.id].filter(Boolean);
    if (!selectedTermId || !ids.includes(selectedTermId)) {
      setSelectedTermId(normalizedTerms.find((t) => t.id === activeTerm?.id)?.id || normalizedTerms[0]?.id || activeTerm?.id || "");
    }
  }, [activeTerm?.id, normalizedTerms, selectedTermId]);

  const selectedTerm = normalizedTerms.find((t) => t.id === selectedTermId) || normalizedTerms[0] || activeTerm || null;
  const isHistorical = ["archived", "closed"].includes(selectedTerm?.status);
  const canEdit = canManage && !isHistorical;

  const termCandidates = useMemo(
    () => (candidates || []).map(normalizeBoardCandidate).filter((c) => !selectedTerm?.id || c.termId === selectedTerm.id),
    [candidates, selectedTerm?.id]
  );
  const ranked = useMemo(() => rankBoardCandidates(termCandidates, Number(selectedTerm?.winnersCount || selectedTerm?.targetSeats || seats || 11)), [termCandidates, selectedTerm, seats]);
  const termMemberships = useMemo(
    () => (memberships || []).map(normalizeBoardMembership).filter((m) => !selectedTerm?.id || m.termId === selectedTerm.id),
    [memberships, selectedTerm?.id]
  );
  const termMovements = useMemo(
    () => (movements || []).map(normalizeBoardMovement).filter((m) => !selectedTerm?.id || m.termId === selectedTerm.id)
      .sort((a, b) => String(b.createdAtIso || "").localeCompare(String(a.createdAtIso || ""))),
    [movements, selectedTerm?.id]
  );

  const allowInactive = Boolean(selectedTerm?.allowInactiveCandidates);
  const termMemberIds = useMemo(
    () => new Set(termMemberships.map((m) => m.memberId).filter(Boolean)),
    [termMemberships]
  );
  const assemblyMembers = useMemo(() => {
    const existingIds = new Set(termCandidates.map((c) => c.memberId));
    return [...(allEmployees || [])]
      .filter((e) => {
        if (existingIds.has(e.id)) return false;
        if (isAssemblyMember(e)) return true;
        if (termMemberIds.has(e.id)) return true;
        if (!allowInactive) return false;
        const state = getEffectiveMemberState(e);
        return ["وفاة", "معاش", "استقالة"].includes(state);
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
  }, [allEmployees, termCandidates, allowInactive, termMemberIds]);

  const activeMemberIds = useMemo(
    () => termMemberships.filter((m) => m.status === "active").map((m) => m.memberId),
    [termMemberships]
  );
  const nextReserve = useMemo(() => findNextReserveCandidate(ranked, activeMemberIds), [ranked, activeMemberIds]);
  const filteredRanked = useMemo(() => {
    const q = String(searchQ || "").trim().toLowerCase();
    return ranked.filter((candidate) => {
      const matchesSearch = !q || [
        candidate.memberName,
        candidate.memberJobId,
        POSITION_LABELS[candidate.position],
        CANDIDATE_STATUS_LABELS[candidate.status],
      ].some((value) => String(value || "").toLowerCase().includes(q));
      const matchesStatus = statusFilter === "all" || candidate.status === statusFilter;
      const matchesPosition = positionFilter === "all" || candidate.position === positionFilter;
      return matchesSearch && matchesStatus && matchesPosition;
    });
  }, [ranked, searchQ, statusFilter, positionFilter]);
  const candidateStatusCounts = useMemo(() => {
    const counts = Object.fromEntries(BOARD_CANDIDATE_STATUS.map((status) => [status.value, 0]));
    termCandidates.forEach((candidate) => {
      counts[candidate.status] = (counts[candidate.status] || 0) + 1;
    });
    return counts;
  }, [termCandidates]);
  const positionCounts = useMemo(() => {
    const counts = Object.fromEntries(BOARD_CANDIDATE_POSITIONS.map((position) => [position.value, 0]));
    termCandidates.forEach((candidate) => {
      counts[candidate.position] = (counts[candidate.position] || 0) + 1;
    });
    return counts;
  }, [termCandidates]);
  const originalWinners = ranked.filter((candidate) => candidate.status === "won_original" || candidate.computedSeat === "original");
  const activeMembershipCount = termMemberships.filter((membership) => membership.status === "active").length;

  const openAddCandidate = () => {
    if (!canEdit || !selectedTerm?.id) return;
    setEditingCandidate(null);
    setCandidateForm(emptyCandidateForm(selectedTerm.id));
    setShowCandidateModal(true);
  };

  const openEditCandidate = (candidate) => {
    if (!canEdit) return;
    setEditingCandidate(candidate);
    setCandidateForm({
      termId: candidate.termId, memberId: candidate.memberId, position: candidate.position,
      votes: candidate.votes, nominationDate: candidate.nominationDate || "",
      status: candidate.status || "nominated", notes: candidate.notes || "",
    });
    setShowCandidateModal(true);
  };

  const handleSaveCandidate = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const employee = (allEmployees || []).find((e) => e.id === candidateForm.memberId);
      await saveBoardCandidate({
        ...candidateForm,
        id: editingCandidate?.id || "",
        votes: Number(candidateForm.votes || 0),
        memberName: employee?.name || editingCandidate?.memberName || "",
        memberJobId: employee?.jobId || editingCandidate?.memberJobId || "",
      }, termCandidates);
      setShowCandidateModal(false);
      setEditingCandidate(null);
    } catch (error) {
      alert(error.message || "تعذر حفظ المرشح.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCandidate = async (candidate) => {
    if (!canEdit || !candidate?.id) return;
    if (["won_original", "won_reserve"].includes(candidate.status)) {
      alert("لا يمكن حذف مرشح بعد اعتماد النتائج — استخدم سحب الترشيح بتعديل الحالة.");
      return;
    }
    if (!window.confirm(`حذف ترشيح ${candidate.memberName}؟`)) return;
    try {
      await deleteDoc(doc(db, BOARD_CANDIDATES_COLLECTION, candidate.id));
      await logAuditEvent("board_candidate_deleted", { targetId: candidate.id, termId: candidate.termId, memberName: candidate.memberName });
    } catch {
      alert("تعذر الحذف.");
    }
  };

  const handleApprove = async () => {
    if (!canEdit || !selectedTerm?.id) return;
    const seatsCount = Number(seats || 11);
    if (!window.confirm(`اعتماد أعلى ${seatsCount} مرشح كأعضاء أصليين والباقي احتياطي؟ سيتم إنشاء العضويات تلقائياً.`)) return;
    setSaving(true);
    try {
      const employeesMap = new Map((allEmployees || []).map((e) => [e.id, e]));
      const inactiveMap = {};
      termCandidates.forEach((c) => {
        const emp = employeesMap.get(c.memberId);
        if (!emp || isAssemblyMember(emp)) return;
        const state = getEffectiveMemberState(emp);
        const endDate = state === "وفاة"
          ? (emp.deathDate || emp.dateOfDeath || "")
          : state === "معاش"
            ? (emp.retirementDate || emp.retiredAt || "")
            : (emp.membershipExpiry || emp.membershipEndDate || "");
        inactiveMap[c.memberId] = {
          endDate,
          endReason: state === "وفاة" ? "death" : state === "معاش" ? "retirement" : state === "استقالة" ? "resignation" : "membership_end",
        };
      });
      await approveElectionResults({ term: selectedTerm, candidates: termCandidates, seats: seatsCount, inactiveMap, existingMemberIds: [...termMemberIds] });
      alert("تم اعتماد النتائج وإنشاء العضويات (تم تخطي الأعضاء المسجلين مسبقاً دون تكرار).");
    } catch (error) {
      alert(error.message || "تعذر الاعتماد.");
    } finally {
      setSaving(false);
    }
  };

  const openPositionModal = (membership) => {
    if (!canEdit) return;
    setPositionTarget(membership);
    setPositionForm({ role: membership.role || "", effectiveDate: membership.roleStartDate || membership.joinDate || "", decisionRef: "" });
    setShowPositionModal(true);
  };

  const handleAssignPosition = async () => {
    if (!canEdit || !positionTarget) return;
    setSaving(true);
    try {
      await assignBoardPosition({ membership: positionTarget, role: positionForm.role, effectiveDate: positionForm.effectiveDate, decisionRef: positionForm.decisionRef });
      setShowPositionModal(false);
      setPositionTarget(null);
    } catch (error) {
      alert(error.message || "تعذر تعيين المنصب.");
    } finally {
      setSaving(false);
    }
  };

  const openEndModal = (membership) => {
    if (!canEdit) return;
    setEndTarget(membership);
    setEndForm({ endDate: membership.endDate || "", endReason: membership.endReason || "", decisionRef: membership.decisionRef || "", notes: "" });
    setShowEndModal(true);
  };

  const handleEndMembership = async () => {
    if (!canEdit || !endTarget) return;
    setSaving(true);
    try {
      await endBoardMembership({ membership: endTarget, ...endForm });
      setShowEndModal(false);
      setEndTarget(null);
    } catch (error) {
      alert(error.message || "تعذر إنهاء العضوية.");
    } finally {
      setSaving(false);
    }
  };

  const handleEscalate = async (endedMembership) => {
    if (!canEdit) return;
    if (!window.confirm("تصعيد أعلى احتياطي مستحق تلقائياً؟")) return;
    setSaving(true);
    try {
      const result = await escalateNextReserve({
        term: selectedTerm, endedMembership, candidates: termCandidates, memberships: termMemberships, escalationDate,
      });
      alert(`تم تصعيد ${result.candidate.memberName} (${result.candidate.votes} صوت).`);
    } catch (error) {
      alert(error.message || "تعذر التصعيد.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-5">
      <Modal open={showCandidateModal} onClose={() => setShowCandidateModal(false)} title={editingCandidate ? "تعديل مرشح" : "إضافة مرشح (أعضاء الجمعية العمومية فقط)"} actions={
        <>
          <button onClick={() => setShowCandidateModal(false)} className="px-4 py-2 rounded-xl text-xs font-black border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">إلغاء</button>
          <button onClick={handleSaveCandidate} disabled={saving || !canEdit} className="px-4 py-2 rounded-xl text-xs font-black bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60 flex items-center gap-1.5"><Save size={13} /> حفظ</button>
        </>
      }>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="العضو المرشح — بحث واختيار" required>
            <MemberSearchSelect
              value={candidateForm.memberId}
              onChange={(memberId) => setCandidateForm((v) => ({ ...v, memberId }))}
              options={[
                ...(editingCandidate ? [{ id: editingCandidate.memberId, name: editingCandidate.memberName, sub: editingCandidate.memberJobId || "" }] : []),
                ...assemblyMembers.map((e) => {
                  const active = isAssemblyMember(e);
                  return {
                    id: e.id,
                    name: e.name,
                    sub: `${e.jobId || ""}${e.workplace ? ` • ${e.workplace}` : ""}${active ? "" : ` — ${getEffectiveMemberState(e)} (تاريخي)`}`,
                  };
                }),
              ]}
            />
          </FormField>
          <FormField label="المنصب المرشح له" required>
            <select className={inputCls} value={candidateForm.position} onChange={(e) => setCandidateForm((v) => ({ ...v, position: e.target.value }))}>
              {BOARD_CANDIDATE_POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </FormField>
          <FormField label="عدد الأصوات" required>
            <input type="number" min="0" className={inputCls} value={candidateForm.votes} onChange={(e) => setCandidateForm((v) => ({ ...v, votes: e.target.value }))} />
          </FormField>
          <FormField label="تاريخ الترشح">
            <ArabicDatePicker value={candidateForm.nominationDate} onChange={(value) => setCandidateForm((v) => ({ ...v, nominationDate: value }))} />
          </FormField>
          <FormField label="حالة الترشيح">
            <select className={inputCls} value={candidateForm.status} onChange={(e) => setCandidateForm((v) => ({ ...v, status: e.target.value }))}>
              {BOARD_CANDIDATE_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </FormField>
          <div className="md:col-span-2"><FormField label="ملاحظات"><textarea className={clsx(inputCls, "resize-none")} rows={2} value={candidateForm.notes} onChange={(e) => setCandidateForm((v) => ({ ...v, notes: e.target.value }))} /></FormField></div>
        </div>
      </Modal>

      <Modal open={showPositionModal} onClose={() => setShowPositionModal(false)} title={`تعيين منصب — ${positionTarget?.memberName || ""}`} size="md" actions={
        <>
          <button onClick={() => setShowPositionModal(false)} className="px-4 py-2 rounded-xl text-xs font-black border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">إلغاء</button>
          <button onClick={handleAssignPosition} disabled={saving || !canEdit} className="px-4 py-2 rounded-xl text-xs font-black bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60 flex items-center gap-1.5"><Save size={13} /> حفظ المنصب</button>
        </>
      }>
        <div className="grid grid-cols-1 gap-4">
          <FormField label="المنصب" required>
            <select className={inputCls} value={positionForm.role} onChange={(e) => setPositionForm((v) => ({ ...v, role: e.target.value }))}>
              <option value="">اختر المنصب</option>
              {BOARD_MEMBERSHIP_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </FormField>
          <FormField label="تاريخ تولي المنصب">
            <ArabicDatePicker value={positionForm.effectiveDate} onChange={(value) => setPositionForm((v) => ({ ...v, effectiveDate: value }))} />
          </FormField>
          <FormField label="مرجع القرار">
            <input className={inputCls} value={positionForm.decisionRef} onChange={(e) => setPositionForm((v) => ({ ...v, decisionRef: e.target.value }))} placeholder="محضر اجتماع أو قرار" />
          </FormField>
        </div>
      </Modal>

      <Modal open={showEndModal} onClose={() => setShowEndModal(false)} title={`إنهاء نشاط — ${endTarget?.memberName || ""}`} size="md" actions={
        <>
          <button onClick={() => setShowEndModal(false)} className="px-4 py-2 rounded-xl text-xs font-black border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">إلغاء</button>
          <button onClick={handleEndMembership} disabled={saving || !canEdit} className="px-4 py-2 rounded-xl text-xs font-black bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-60 flex items-center gap-1.5"><Save size={13} /> حفظ الإنهاء</button>
        </>
      }>
        <p className="text-[11px] font-bold text-slate-500 mb-4">لن يُحذف العضو — يُغلق نشاطه بتاريخ وسبب، وتظل معاملاته السابقة محفوظة في سجله.</p>
        <div className="grid grid-cols-1 gap-4">
          <FormField label="تاريخ انتهاء النشاط" required>
            <ArabicDatePicker value={endForm.endDate} onChange={(value) => setEndForm((v) => ({ ...v, endDate: value }))} />
          </FormField>
          <FormField label="سبب الانتهاء" required>
            <select className={inputCls} value={endForm.endReason} onChange={(e) => setEndForm((v) => ({ ...v, endReason: e.target.value }))}>
              {BOARD_END_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </FormField>
          <FormField label="مرجع القرار">
            <input className={inputCls} value={endForm.decisionRef} onChange={(e) => setEndForm((v) => ({ ...v, decisionRef: e.target.value }))} />
          </FormField>
          <FormField label="ملاحظات">
            <textarea className={clsx(inputCls, "resize-none")} rows={2} value={endForm.notes} onChange={(e) => setEndForm((v) => ({ ...v, notes: e.target.value }))} />
          </FormField>
        </div>
      </Modal>

      <div className={clsx("rounded-2xl border shadow-sm overflow-hidden", T.card)}>
        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="p-5 bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.16),_transparent_34%),linear-gradient(135deg,rgba(20,184,166,0.06),rgba(255,255,255,0.88))] dark:bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.84))]">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <StatusBadge tone={selectedTerm?.resultsApproved ? "success" : isHistorical ? "neutral" : "warning"}>
                {selectedTerm?.resultsApproved ? "نتائج معتمدة" : isHistorical ? "عرض تاريخي" : "دورة مفتوحة"}
              </StatusBadge>
              {selectedTerm?.status && <StatusBadge tone="info">{selectedTerm.status}</StatusBadge>}
              {allowInactive && <StatusBadge tone="warning">ترشيح تاريخي مسموح</StatusBadge>}
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">مساحة الانتخابات والترشيحات</h2>
            <p className="mt-2 max-w-3xl text-xs font-bold leading-6 text-slate-500 dark:text-slate-400">
              متابعة دورة الترشيح، ترتيب المرشحين، اعتماد النتائج، وتحوّل الفائزين إلى عضويات مجلس إدارة من نفس المنطق الحالي دون إنشاء مسار انتخابي جديد.
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/70 bg-white/70 p-3 dark:border-slate-700/60 dark:bg-slate-900/50">
                <p className="text-[10px] font-black text-slate-400">الدورة</p>
                <p className="mt-1 truncate text-sm font-black text-slate-800 dark:text-slate-100">{selectedTerm?.title || selectedTerm?.id || "بدون دورة"}</p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white/70 p-3 dark:border-slate-700/60 dark:bg-slate-900/50">
                <p className="text-[10px] font-black text-slate-400">نطاق الدورة</p>
                <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-100">{selectedTerm?.startDate || "—"} / {selectedTerm?.endDate || "—"}</p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white/70 p-3 dark:border-slate-700/60 dark:bg-slate-900/50">
                <p className="text-[10px] font-black text-slate-400">المقاعد الأصلية</p>
                <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-100">{Number(selectedTerm?.winnersCount || selectedTerm?.targetSeats || seats || 11)}</p>
              </div>
            </div>
          </div>
          <div className="p-5 border-t xl:border-t-0 xl:border-r border-slate-100 dark:border-slate-800">
            <div className="flex flex-col gap-3">
              <select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" value={selectedTermId} onChange={(e) => setSelectedTermId(e.target.value)}>
                {normalizedTerms.map((t) => <option key={t.id} value={t.id}>{t.title || t.id}</option>)}
              </select>
              <Button onClick={openAddCandidate} disabled={!canEdit} iconStart={Plus}>إضافة مرشح</Button>
              <div className="rounded-xl border border-dashed border-slate-200 p-3 text-[11px] font-bold text-slate-500 dark:border-slate-700">
                {canEdit ? "الإجراءات المتاحة تعتمد على صلاحيات إدارة المجلس وحالة الدورة." : "هذه الدورة للعرض فقط أو لا تملك صلاحية الإدارة."}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isHistorical && (
        <div className="p-3 rounded-xl border border-sky-200 bg-sky-50 text-sky-800 text-[11px] font-black flex items-center gap-2">
          <History size={14} /> عرض تاريخي للدورة ({selectedTerm?.status === "archived" ? "مؤرشفة" : "منتهية"}) — التعديل معطل.
        </div>
      )}
      {selectedTerm?.resultsApproved && (
        <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-[11px] font-black flex items-center gap-2">
          <CheckCircle2 size={14} /> تم اعتماد نتائج هذه الدورة — أي تعديل على الأصوات يتطلب إعادة الاعتماد.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <StatCard label="إجمالي المرشحين" value={termCandidates.length} sub={`${filteredRanked.length} ظاهر بعد الفلترة`} icon={Trophy} tone="brand" compact />
        <StatCard label="مرشحون" value={candidateStatusCounts.nominated || 0} sub="طلبات قائمة" icon={ListChecks} tone="warning" compact />
        <StatCard label="فائز أصلي" value={candidateStatusCounts.won_original || 0} sub={`${originalWinners.length} حسب الترتيب`} icon={CheckCircle2} tone="success" compact />
        <StatCard label="احتياطي" value={candidateStatusCounts.won_reserve || 0} sub={nextReserve ? `التالي: ${nextReserve.memberName}` : "لا يوجد احتياطي متاح"} icon={ArrowUpCircle} tone="info" compact />
        <StatCard label="عضويات نشطة" value={activeMembershipCount} sub="بعد الاعتماد/التصعيد" icon={Gavel} tone="neutral" compact />
      </div>

      <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2"><BarChart3 size={16} className="text-amber-500" /> مسار الترشيحات</h3>
            <p className="mt-1 text-[10px] font-bold text-slate-400">المراحل المعروضة هي حالات الترشيح الفعلية في النظام.</p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-5">
            {BOARD_CANDIDATE_STATUS.map((status) => (
              <button
                key={status.value}
                type="button"
                onClick={() => setStatusFilter(statusFilter === status.value ? "all" : status.value)}
                className={clsx(
                  "rounded-xl border p-3 text-right transition",
                  statusFilter === status.value
                    ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-amber-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
                )}
              >
                <p className="text-[10px] font-black">{status.label}</p>
                <p className="mt-1 text-lg font-black">{candidateStatusCounts[status.value] || 0}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2"><Trophy size={16} className="text-amber-500" /> المرشحون والنتائج ({filteredRanked.length}/{ranked.length})</h3>
            <p className="mt-1 text-[10px] font-bold text-slate-400">النتائج هنا مبنية على الأصوات والحالات المسجلة فقط، ولا تعرض نتائج وهمية.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-black text-slate-400">المقاعد الأصلية</label>
            <input type="number" min="1" max="30" className="w-20 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black" value={seats} onChange={(e) => setSeats(e.target.value)} />
            <Button onClick={handleApprove} disabled={!canEdit || saving || ranked.length === 0} loading={saving} iconStart={Gavel} size="sm">اعتماد النتائج وإنشاء العضويات</Button>
          </div>
        </div>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput value={searchQ} onChange={setSearchQ} placeholder="بحث بالاسم أو الكود أو المنصب..." className="lg:max-w-md" />
          <FilterBar className="flex-1 justify-end">
            <select className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">كل الحالات</option>
              {BOARD_CANDIDATE_STATUS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
            <select className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100" value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
              <option value="all">كل المناصب</option>
              {BOARD_CANDIDATE_POSITIONS.map((position) => <option key={position.value} value={position.value}>{position.label} ({positionCounts[position.value] || 0})</option>)}
            </select>
            {(searchQ || statusFilter !== "all" || positionFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setSearchQ(""); setStatusFilter("all"); setPositionFilter("all"); }}>مسح</Button>
            )}
          </FilterBar>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-right text-[11px]">
            <thead><tr className="bg-slate-50 dark:bg-slate-800/60 border-b">
              {[ "الترتيب", "المرشح", "المنصب المرشح له", "الأصوات", "الحالة", "تاريخ الترشح", "إجراءات" ].map((h, i) => <th key={i} className="p-2.5 font-black text-slate-500 whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {filteredRanked.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold">{ranked.length === 0 ? "لا يوجد مرشحون في هذه الدورة بعد." : "لا توجد نتائج مطابقة للبحث أو الفلاتر."}</td></tr>
              ) : filteredRanked.map((c) => (
                <tr key={c.id} className={c.computedSeat === "original" ? "bg-emerald-50/40 dark:bg-emerald-900/10" : ""}>
                  <td className="p-2.5 font-black">{c.computedSeat === "original" ? `#${c.rank}` : c.rank}</td>
                  <td className="p-2.5 font-black">{c.memberName}<span className="block text-[9px] text-slate-400 font-bold">{c.memberJobId || ""}</span></td>
                  <td className="p-2.5">{POSITION_LABELS[c.position] || c.position}</td>
                  <td className="p-2.5 font-black text-amber-600">{c.votes}</td>
                  <td className="p-2.5"><StatusBadge tone={getCandidateStatusTone(c.status, c.computedSeat)}>{CANDIDATE_STATUS_LABELS[c.status] || (c.computedSeat === "original" ? "فائز أصلي (متوقع)" : "احتياطي (متوقع)")}</StatusBadge></td>
                  <td className="p-2.5 font-bold text-slate-500">{c.nominationDate || "—"}</td>
                  <td className="p-2.5"><div className="flex gap-1">
                    <button disabled={!canEdit} onClick={() => openEditCandidate(c)} className="p-1.5 text-slate-400 hover:text-amber-600 disabled:opacity-40"><Edit3 size={13} /></button>
                    <button disabled={!canEdit} onClick={() => handleDeleteCandidate(c)} className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-40"><Trash2 size={13} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 md:hidden">
          {filteredRanked.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs font-bold text-slate-400 dark:border-slate-700">{ranked.length === 0 ? "لا يوجد مرشحون في هذه الدورة بعد." : "لا توجد نتائج مطابقة للبحث أو الفلاتر."}</p>
          ) : filteredRanked.map((c) => (
            <article key={c.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{c.memberName}</p>
                  <p className="mt-1 text-[10px] font-bold text-slate-500">{c.memberJobId || "—"} • {POSITION_LABELS[c.position] || c.position}</p>
                </div>
                <StatusBadge tone={getCandidateStatusTone(c.status, c.computedSeat)}>{CANDIDATE_STATUS_LABELS[c.status] || c.status}</StatusBadge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-white p-2 dark:bg-slate-900/50"><p className="text-[9px] font-bold text-slate-400">ترتيب</p><p className="text-sm font-black">{c.rank}</p></div>
                <div className="rounded-lg bg-white p-2 dark:bg-slate-900/50"><p className="text-[9px] font-bold text-slate-400">أصوات</p><p className="text-sm font-black">{c.votes}</p></div>
                <div className="rounded-lg bg-white p-2 dark:bg-slate-900/50"><p className="text-[9px] font-bold text-slate-400">تاريخ</p><p className="truncate text-[10px] font-black">{c.nominationDate || "—"}</p></div>
              </div>
              <div className="mt-3 flex justify-end gap-1">
                <button disabled={!canEdit} onClick={() => openEditCandidate(c)} className="p-2 text-slate-400 hover:text-amber-600 disabled:opacity-40" title="تعديل"><Edit3 size={14} /></button>
                <button disabled={!canEdit} onClick={() => handleDeleteCandidate(c)} className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-40" title="حذف"><Trash2 size={14} /></button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2"><CheckCircle2 size={15} className="text-teal-500" /> المناصب داخل المجلس</h3>
          <p className="text-[10px] font-bold text-slate-400 mb-4">تعيين الرئيس والأمين العام وأمين الصندوق من الأعضاء — مع تاريخ التولي.</p>
          <div className="space-y-2">
            {termMemberships.filter((m) => m.status === "active").length === 0 && <p className="text-[11px] font-bold text-slate-400 text-center py-4">لا توجد عضويات سارية — اعتمد النتائج أولاً.</p>}
            {termMemberships.filter((m) => m.status === "active").map((m) => (
              <div key={m.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0"><p className="text-xs font-black truncate">{m.memberName}</p><p className="text-[9px] font-bold text-slate-400">{m.role || "—"}{m.roleStartDate ? ` — منذ ${m.roleStartDate}` : ""}</p></div>
                <button disabled={!canEdit} onClick={() => openPositionModal(m)} className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-40">تعيين منصب</button>
              </div>
            ))}
          </div>
        </div>

        <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2"><ArrowUpCircle size={15} className="text-teal-500" /> إنهاء نشاط وتصعيد</h3>
          <p className="text-[10px] font-bold text-slate-400 mb-4">إنهاء العضو المنتهي ثم تصعيد أعلى احتياطي تلقائياً.</p>
          {nextReserve && (
            <div className="p-3 rounded-xl border border-teal-200 bg-teal-50 dark:bg-teal-900/20 mb-3 text-[11px] font-black text-teal-700 dark:text-teal-300 flex flex-wrap items-center gap-2">
              <span>الاحتياطي التالي: {nextReserve.memberName} — {nextReserve.votes} صوت (ترتيب {nextReserve.rank})</span>
              <ArabicDatePicker value={escalationDate} onChange={setEscalationDate} />
            </div>
          )}
          <div className="space-y-2">
            {termMemberships.length === 0 && <p className="text-[11px] font-bold text-slate-400 text-center py-4">لا توجد عضويات.</p>}
            {termMemberships.map((m) => (
              <div key={m.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-xs font-black truncate">{m.memberName} <span className={clsx("text-[9px] px-1.5 py-0.5 rounded", m.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{m.status === "active" ? "نشط" : `منتهي ${m.endDate || ""}`}</span></p>
                  <p className="text-[9px] font-bold text-slate-400">{m.role || "—"}{m.endReason ? ` — ${END_REASON_LABELS[m.endReason] || m.endReason}` : ""}</p>
                </div>
                <div className="flex gap-1">
                  {m.status === "active" && <button disabled={!canEdit} onClick={() => openEndModal(m)} className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-40 flex items-center gap-1"><UserX size={12} /> إنهاء نشاط</button>}
                  {m.status !== "active" && <button disabled={!canEdit || !nextReserve} onClick={() => handleEscalate(m)} className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-40 flex items-center gap-1"><ArrowUpCircle size={12} /> تصعيد الاحتياطي</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2"><History size={15} className="text-slate-500" /> السجل التاريخي للدورة ({termMovements.length})</h3>
        {termMovements.length === 0 ? (
          <p className="text-[11px] font-bold text-slate-400 text-center py-4">لا توجد حركات مسجلة بعد.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {termMovements.map((mv) => (
              <div key={mv.id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-white text-[9px] font-black">{BOARD_MOVEMENT_LABELS[mv.type] || mv.type}</span>
                  <span className="font-black">{mv.memberName || "—"}</span>
                  {mv.fromRole && <span className="text-slate-400 font-bold">{mv.fromRole} ← {mv.toRole || "—"}</span>}
                  {mv.effectiveDate && <span className="text-slate-400 font-bold">{mv.effectiveDate}</span>}
                </div>
                {mv.notes && <p className="text-[10px] font-bold text-slate-500 mt-1">{mv.notes}</p>}
                {mv.reason && <p className="text-[10px] font-bold text-slate-400">السبب: {END_REASON_LABELS[mv.reason] || mv.reason}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function useBoardElectionSubscriptions() {
  const [candidates, setCandidates] = useState([]);
  const [movements, setMovements] = useState([]);
  const [benefits, setBenefits] = useState([]);
  useEffect(() => {
    const unsubs = [
      onSnapshot(query(collection(db, BOARD_CANDIDATES_COLLECTION)), (s) => setCandidates(s.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(query(collection(db, BOARD_MOVEMENTS_COLLECTION)), (s) => setMovements(s.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(query(collection(db, BOARD_BENEFITS_COLLECTION)), (s) => setBenefits(s.docs.map((d) => ({ ...d.data(), id: d.id })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);
  return { candidates, movements, benefits };
}
