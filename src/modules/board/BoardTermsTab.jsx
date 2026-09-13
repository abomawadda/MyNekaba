import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import clsx from "clsx";
import { ArrowUpCircle, Edit3, Plus, PlusCircle, Save, Trash2, X } from "lucide-react";
import { db } from "../../app/providers/FirebaseProvider";
import { logAuditEvent } from "../../utils/auditLog";
import ArabicDatePicker from "../../ui/inputs/ArabicDatePicker";
import MemberSearchSelect from "./MemberSearchSelect";
import {
  BOARD_BENEFITS_COLLECTION,
  BOARD_CANDIDATES_COLLECTION,
  BOARD_MEMBERSHIPS_COLLECTION,
  BOARD_MOVEMENTS_COLLECTION,
  BOARD_TERMS_COLLECTION,
  buildBoardMembershipSnapshot,
  buildBoardMemberViewsFromMemberships,
  computeTermClosingBalance,
  normalizeBoardMembership,
  normalizeBoardTerm,
  sortBoardTerms,
  validateBoardMembershipDates,
  validateBoardTermDates,
} from "./boardLifecycle";
import {
  archiveTermWithHistory,
  carryBalanceToNewTerm,
  closeTermWithBalance,
  logTermMovement,
} from "./boardElectionService";
import { sortBoardMembersUnified } from "./boardMembershipRules";
import { BOARD_MEMBERSHIP_ROLES, getEffectiveMemberState, isBoardMemberEligible } from "../../utils/memberBenefits";

const TARGET_BOARD_SIZE = 11;

const BOARD_ROLE_ORDER = {
  "رئيس المجلس": 1,
  "الأمين العام": 2,
  "أمين الصندوق": 3,
  "نائب الرئيس": 4,
  "عضو مجلس إدارة": 5,
  "عضو مجلس": 6,
};

const TERM_STATUS_OPTIONS = [
  { value: "planned", label: "مخططة" },
  { value: "active", label: "نشطة" },
  { value: "closed", label: "منتهية" },
  { value: "archived", label: "مؤرشفة" },
];

const MEMBERSHIP_STATUS_OPTIONS = [
  { value: "active", label: "سارية" },
  { value: "ended", label: "منتهية" },
  { value: "suspended", label: "موقوفة" },
  { value: "vacated", label: "شاغرة" },
];

const JOIN_METHOD_OPTIONS = [
  { value: "elected", label: "انتخاب" },
  { value: "escalated", label: "تصعيد" },
  { value: "appointed", label: "تعيين" },
  { value: "replacement", label: "بديل" },
  { value: "legacy", label: "ترحيل قديم" },
];

const END_REASON_OPTIONS = [
  { value: "", label: "بدون" },
  { value: "term_completed", label: "انتهاء الدورة" },
  { value: "retirement", label: "معاش" },
  { value: "death", label: "وفاة" },
  { value: "resignation", label: "استقالة" },
  { value: "dismissal", label: "إسقاط/استبعاد" },
  { value: "membership_end", label: "انتهاء العضوية" },
  { value: "board_restructure", label: "إعادة تشكيل" },
];

const TERM_STATUS_LABELS = Object.fromEntries(TERM_STATUS_OPTIONS.map((option) => [option.value, option.label]));
const MEMBERSHIP_STATUS_LABELS = Object.fromEntries(MEMBERSHIP_STATUS_OPTIONS.map((option) => [option.value, option.label]));
const JOIN_METHOD_LABELS = Object.fromEntries(JOIN_METHOD_OPTIONS.map((option) => [option.value, option.label]));
const END_REASON_LABELS = Object.fromEntries(END_REASON_OPTIONS.map((option) => [option.value, option.label]));

const inputCls = "w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600";

const chipClass = (tone = "slate") =>
({
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/40",
  amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40",
  sky: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800/40",
  rose: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800/40",
  slate: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700",
}[tone] || "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700");

const sortBoardMembers = (members = []) => sortBoardMembersUnified(members);

function Modal({ open, onClose, title, children, actions, size = "lg" }) {
  useEffect(() => {
    const handler = (event) => {
      if (event.key === "Escape") onClose();
    };
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
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-100 hover:text-rose-600 transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 shrink-0">
          {actions}
        </div>
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

function Avatar({ member, idx = 0 }) {
  const palette = ["bg-teal-600", "bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-emerald-600"];
  const bg = palette[(String(member?.id || idx).charCodeAt(0) || idx) % palette.length];
  const initials = String(member?.name || "?")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("");

  return <div className={clsx("w-10 h-10 rounded-full flex items-center justify-center font-black text-white shrink-0", bg)}>{initials || "؟"}</div>;
}

function createEmptyBoardTermForm() {
  return {
    title: "",
    termNumber: "",
    startDate: "",
    endDate: "",
    status: "planned",
    electionDate: "",
    approvalDate: "",
    approvalRef: "",
    targetSeats: TARGET_BOARD_SIZE,
    openingBalance: "",
    carriedFromTermId: "",
    allowInactiveCandidates: false,
    notes: "",
  };
}

function createEmptyBoardMembershipForm(termId = "") {
  return {
    termId,
    memberId: "",
    role: BOARD_MEMBERSHIP_ROLES[0] || "",
    joinDate: "",
    endDate: "",
    status: "active",
    joinMethod: "elected",
    endReason: "",
    decisionDate: "",
    decisionRef: "",
    replacementForMembershipId: "",
    escalationSourceMemberId: "",
    notes: "",
  };
}

export default function BoardTermsTab({
  boardTerms,
  memberships,
  candidates = [],
  movements = [],
  benefits = [],
  financialDocs = [],
  allEmployees,
  activeTerm,
  T,
  canManage = false,
  openEmployeeModal,
}) {
  const normalizedTerms = useMemo(
    () => sortBoardTerms(boardTerms.map((term) => normalizeBoardTerm(term))),
    [boardTerms]
  );
  const [selectedTermId, setSelectedTermId] = useState("");
  const [showTermModal, setShowTermModal] = useState(false);
  const [showMembershipModal, setShowMembershipModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState(null);
  const [editingMembership, setEditingMembership] = useState(null);
  const [termForm, setTermForm] = useState(createEmptyBoardTermForm());
  const [membershipForm, setMembershipForm] = useState(createEmptyBoardMembershipForm());
  const [savingTerm, setSavingTerm] = useState(false);
  const [savingMembership, setSavingMembership] = useState(false);
  const [deletingTermId, setDeletingTermId] = useState("");
  const [deletingMembershipId, setDeletingMembershipId] = useState("");
  const [closingTermId, setClosingTermId] = useState("");
  const [carryTargetId, setCarryTargetId] = useState("");
  const [confirmDialog, setConfirmDialog] = useState(null);

  const handleCloseTerm = () => {
    if (!canEditTerms || !selectedTerm?.id) return;
    setConfirmDialog({
      title: "إغلاق الدورة",
      message: "سيتم إغلاق الدورة واحتساب رصيدها الختامي من المعاملات المرحلة داخل فترتها.",
      confirmLabel: "إغلاق واحتساب",
      tone: "slate",
      onConfirm: () => doCloseTerm(),
    });
  };

  const doCloseTerm = async () => {
    setClosingTermId(selectedTerm.id);
    try {
      const computed = await closeTermWithBalance({ term: selectedTerm, docs: financialDocs });
      alert(`تم إغلاق الدورة — الرصيد الختامي المحتسب: ${computed.closing}`);
    } catch (error) {
      alert(error.message || "تعذر الإغلاق.");
    } finally {
      setClosingTermId("");
    }
  };

  const handleArchiveTerm = () => {
    if (!canEditTerms || !selectedTerm?.id) return;
    setConfirmDialog({
      title: "أرشفة الدورة",
      message: "ستظل الدورة قابلة للاستدعاء والمشاهدة التاريخية، ولن تُحذف بياناتها.",
      confirmLabel: "أرشفة",
      tone: "sky",
      onConfirm: () => doArchiveTerm(),
    });
  };

  const doArchiveTerm = async () => {
    setClosingTermId(selectedTerm.id);
    try {
      await archiveTermWithHistory({ term: selectedTerm });
    } catch (error) {
      alert(error.message || "تعذر الأرشفة.");
    } finally {
      setClosingTermId("");
    }
  };

  const handleCleanupTerms = () => {
    if (!canManage) return;
    if (normalizedTerms.length <= 1) {
      alert("لا توجد دورات زائدة للحذف.");
      return;
    }
    const keeper = normalizedTerms.find((t) => String(t.startDate || "").startsWith("2022"))
      || normalizedTerms.find((t) => t.status === "active")
      || normalizedTerms[0];
    if (!keeper?.id) {
      alert("تعذر تحديد الدورة الحالية — تحقق من بيانات الدورات.");
      return;
    }
    const doomed = normalizedTerms.filter((t) => t.id && t.id !== keeper.id);
    setConfirmDialog({
      title: "تنظيف الدورات",
      message: `سيتم حذف ${doomed.length} دورة نهائياً مع كل عضوياتها ومرشحيها وسجلاتها ومزاياها، والإبقاء فقط على "${keeper.title || keeper.id}" وتثبيتها كدورة استثنائية 2022-2026 (2022/06/01 → 2026/12/31). لا يمكن التراجع.`,
      confirmLabel: "متابعة للخطوة الأخيرة",
      tone: "rose",
      onConfirm: () => setConfirmDialog({
        title: "تأكيد أخير",
        message: "حذف نهائي لكل الدورات الأخرى؟",
        confirmLabel: "حذف نهائي",
        tone: "rose",
        onConfirm: () => doCleanupTerms(keeper, doomed),
      }),
    });
  };

  const doCleanupTerms = async (keeper, doomed) => {
    setClosingTermId("__cleanup__");
    try {
      const batch = writeBatch(db);
      const membershipIds = new Set();
      normalizedMemberships.filter((m) => m.termId !== keeper.id).forEach((m) => {
        if (m.id && !membershipIds.has(m.id)) {
          membershipIds.add(m.id);
          batch.delete(doc(db, BOARD_MEMBERSHIPS_COLLECTION, m.id));
        }
      });
      (candidates || []).filter((c) => c.termId !== keeper.id && c.id).forEach((c) => {
        batch.delete(doc(db, BOARD_CANDIDATES_COLLECTION, c.id));
      });
      (movements || []).filter((m) => m.termId !== keeper.id && m.id).forEach((m) => {
        batch.delete(doc(db, BOARD_MOVEMENTS_COLLECTION, m.id));
      });
      (benefits || []).filter((b) => b.termId !== keeper.id && b.id).forEach((b) => {
        batch.delete(doc(db, BOARD_BENEFITS_COLLECTION, b.id));
      });
      doomed.forEach((t) => {
        if (t.id) batch.delete(doc(db, BOARD_TERMS_COLLECTION, t.id));
      });
      batch.set(doc(db, BOARD_TERMS_COLLECTION, keeper.id), {
        title: "الدورة الاستثنائية 2022 - 2026",
        startDate: "2022-06-01",
        endDate: "2026-12-31",
        status: "active",
        targetSeats: 11,
        allowInactiveCandidates: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      await logAuditEvent("board_terms_cleanup", {
        keeperId: keeper.id,
        deletedTerms: doomed.map((t) => t.id),
        riskLevel: "high",
      });
      await logTermMovement(keeper.id, "term_updated", "تثبيت كدورة استثنائية 2022-2026 بعد تنظيف الدورات");
      setSelectedTermId(keeper.id);
      alert("تم حذف الدورات الزائدة وتثبيت الدورة الاستثنائية 2022-2026.");
    } catch (error) {
      console.error(error);
      alert(error.message || "تعذر التنظيف.");
    } finally {
      setClosingTermId("");
    }
  };

  const handleCarryBalance = () => {
    if (!canEditTerms || !selectedTerm?.id || !carryTargetId) return;
    setConfirmDialog({
      title: "ترحيل الرصيد",
      message: "سيتم ترحيل الرصيد الختامي لهذه الدورة كرصيد افتتاحي للدورة المختارة.",
      confirmLabel: "ترحيل",
      tone: "emerald",
      onConfirm: () => doCarryBalance(),
    });
  };

  const doCarryBalance = async () => {
    try {
      await carryBalanceToNewTerm({ fromTerm: selectedTerm, toTermId: carryTargetId });
      alert("تم ترحيل الرصيد بنجاح.");
      setCarryTargetId("");
    } catch (error) {
      alert(error.message || "تعذر الترحيل.");
    }
  };

  useEffect(() => {
    const candidateIds = [...normalizedTerms.map((term) => term.id), activeTerm?.id].filter(Boolean);
    if (!selectedTermId || !candidateIds.includes(selectedTermId)) {
      setSelectedTermId(normalizedTerms.find((term) => term.id === activeTerm?.id)?.id || normalizedTerms[0]?.id || activeTerm?.id || "");
    }
  }, [activeTerm?.id, normalizedTerms, selectedTermId]);

  const selectedTerm =
    normalizedTerms.find((term) => term.id === selectedTermId) ||
    (activeTerm?.id === selectedTermId ? activeTerm : null) ||
    normalizedTerms[0] ||
    activeTerm ||
    null;
  const selectedTermIsPersisted = Boolean(
    selectedTerm?.id && normalizedTerms.some((term) => term.id === selectedTerm.id)
  );
  const isHistorical = ["archived", "closed"].includes(selectedTerm?.status);
  const canEditTerms = canManage && !isHistorical;
  const computedClosing = selectedTerm?.id
    ? computeTermClosingBalance(selectedTerm, financialDocs)
    : { opening: 0, credit: 0, debit: 0, closing: 0 };
  const canManageMemberships = Boolean(selectedTerm?.id && selectedTermIsPersisted) && !isHistorical;

  const normalizedMemberships = useMemo(
    () => memberships.map((membership) => normalizeBoardMembership(membership)),
    [memberships]
  );

  const membershipsForSelectedTerm = useMemo(
    () =>
      normalizedMemberships
        .filter((membership) => (selectedTerm?.id ? membership.termId === selectedTerm.id : true)),
    [normalizedMemberships, selectedTerm?.id]
  );

  const membershipViews = useMemo(
    () => sortBoardMembers(buildBoardMemberViewsFromMemberships(membershipsForSelectedTerm, allEmployees, { termId: selectedTerm?.id })),
    [allEmployees, membershipsForSelectedTerm, selectedTerm?.id]
  );
  const membershipsMap = useMemo(
    () =>
      new Map(
        membershipsForSelectedTerm.map((membership) => {
          const normalizedMembership = normalizeBoardMembership(membership);
          return [normalizedMembership.id, normalizedMembership];
        })
      ),
    [membershipsForSelectedTerm]
  );
  const employeesMap = useMemo(
    () => new Map((allEmployees || []).map((employee) => [employee.id, employee])),
    [allEmployees]
  );

  const selectableEmployees = useMemo(
    () => [...(allEmployees || [])]
      .map((employee) => ({ employee, eligible: isBoardMemberEligible(employee) || editingMembership?.memberId === employee.id }))
      .sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        return String(a.employee.name || "").localeCompare(String(b.employee.name || ""), "ar");
      }),
    [allEmployees, editingMembership?.memberId]
  );
  const replacementMembershipOptions = useMemo(
    () =>
      membershipsForSelectedTerm
        .map((membership) => normalizeBoardMembership(membership))
        .sort((a, b) => String(a.memberName || "").localeCompare(String(b.memberName || ""), "ar")),
    [membershipsForSelectedTerm]
  );

  const activeMembershipCount = membershipsForSelectedTerm.filter((membership) => membership.status === "active").length;
  const endedMembershipCount = membershipsForSelectedTerm.filter((membership) => membership.status !== "active").length;

  const openCreateTerm = () => {
    if (!canEditTerms) return;
    setEditingTerm(null);
    setTermForm(createEmptyBoardTermForm());
    setShowTermModal(true);
  };

  const openEditTerm = (term) => {
    if (!canEditTerms) return;
    setEditingTerm(term);
    setTermForm({
      title: term.title || "",
      termNumber: term.termNumber ?? "",
      startDate: term.startDate || "",
      endDate: term.endDate || "",
      status: term.status || "planned",
      electionDate: term.electionDate || "",
      approvalDate: term.approvalDate || "",
      approvalRef: term.approvalRef || "",
      targetSeats: term.targetSeats ?? TARGET_BOARD_SIZE,
      openingBalance: term.openingBalance ?? "",
      carriedFromTermId: term.carriedFromTermId || "",
      allowInactiveCandidates: Boolean(term.allowInactiveCandidates),
      notes: term.notes || "",
    });
    setShowTermModal(true);
  };

  const openCreateMembership = () => {
    if (!canManageMemberships) return;
    setEditingMembership(null);
    setMembershipForm(createEmptyBoardMembershipForm(selectedTerm.id));
    setShowMembershipModal(true);
  };

  const openEscalationMembership = () => {
    if (!canManageMemberships) return;
    setEditingMembership(null);
    setMembershipForm({
      ...createEmptyBoardMembershipForm(selectedTerm?.id || ""),
      joinMethod: "escalated",
      status: "active",
    });
    setShowMembershipModal(true);
  };

  const openEditMembership = (membership) => {
    if (!canEditTerms) return;
    setEditingMembership(membership);
    setMembershipForm({
      termId: membership.termId || selectedTerm?.id || "",
      memberId: membership.memberId || "",
      role: membership.role || BOARD_MEMBERSHIP_ROLES[0] || "",
      joinDate: membership.joinDate || "",
      endDate: membership.endDate || "",
      status: membership.status || "active",
      joinMethod: membership.joinMethod || "elected",
      endReason: membership.endReason || "",
      decisionDate: membership.decisionDate || "",
      decisionRef: membership.decisionRef || "",
      replacementForMembershipId: membership.replacementForMembershipId || "",
      escalationSourceMemberId: membership.escalationSourceMemberId || "",
      notes: membership.notes || "",
    });
    setShowMembershipModal(true);
  };

  const openReplacementMembership = (membership) => {
    if (!canManageMemberships || !membership?.id) return;
    const normalizedMembership = normalizeBoardMembership(membership);
    setEditingMembership(null);
    setMembershipForm({
      termId: normalizedMembership.termId || selectedTerm?.id || "",
      memberId: "",
      role: normalizedMembership.role || BOARD_MEMBERSHIP_ROLES[0] || "",
      joinDate: normalizedMembership.endDate || selectedTerm?.startDate || "",
      endDate: "",
      status: "active",
      joinMethod: "replacement",
      endReason: "",
      decisionDate: normalizedMembership.decisionDate || normalizedMembership.endDate || "",
      decisionRef: normalizedMembership.decisionRef || "",
      replacementForMembershipId: normalizedMembership.id,
      escalationSourceMemberId: normalizedMembership.memberId || "",
      notes: normalizedMembership.memberName
        ? `حل محل ${normalizedMembership.memberName} في مقعد ${normalizedMembership.role || "عضوية مجلس"}`
        : "",
    });
    setShowMembershipModal(true);
  };

  const removeTerm = (term) => {
    if (!canEditTerms) return;
    if (!term?.id) return;
    const linkedMemberships = normalizedMemberships
      .filter((membership) => membership.termId === term.id);
    const linkedCandidates = (candidates || []).filter((c) => c.termId === term.id).length;
    const linkedMovements = (movements || []).filter((m) => m.termId === term.id).length;
    const linkedBenefits = (benefits || []).filter((b) => b.termId === term.id).length;
    const linkedCount = linkedMemberships.length + linkedCandidates + linkedMovements + linkedBenefits;
    setConfirmDialog({
      title: "حذف الدورة",
      message: linkedCount > 0
        ? `للدورة ${linkedMemberships.length} عضوية و${linkedCandidates} مرشح و${linkedBenefits} ميزة وسجل تاريخي. سيتم أرشفتها بدل حذفها للحفاظ على البيانات.`
        : "سيتم حذف هذه الدورة نهائياً. لا يمكن التراجع.",
      confirmLabel: linkedCount > 0 ? "أرشفة بدل الحذف" : "حذف نهائي",
      tone: "rose",
      onConfirm: () => doRemoveTerm(term, linkedMemberships, linkedCount, linkedCandidates, linkedMovements, linkedBenefits),
    });
  };

  const doRemoveTerm = async (term, linkedMemberships, linkedCount, linkedCandidates, linkedMovements, linkedBenefits) => {
    setDeletingTermId(term.id);
    try {
      if (linkedCount > 0) {
        await updateDoc(doc(db, BOARD_TERMS_COLLECTION, term.id), { status: "archived", updatedAt: serverTimestamp() });
        await logTermMovement(term.id, "term_archived", `أرشفة بدل حذف — ${linkedCount} عنصر مرتبط`);
      } else {
        await deleteDoc(doc(db, BOARD_TERMS_COLLECTION, term.id));
      }
      await logAuditEvent(linkedCount > 0 ? "board_term_archived" : "board_term_deleted", {
        termId: term.id,
        title: term.title || "",
        deletedMembershipsCount: linkedMemberships.length,
        linkedCandidates,
        linkedMovements,
        linkedBenefits,
        riskLevel: "high",
      });
      if (selectedTermId === term.id) setSelectedTermId("");
    } catch (error) {
      console.error(error);
      alert(`تعذر حفظ الدورة: ${error.message || "خطأ غير معروف"}`);
    } finally {
      setDeletingTermId("");
    }
  };

  const removeMembership = (membership) => {
    if (!canEditTerms) return;
    if (!membership?.id) return;
    setConfirmDialog({
      title: "حذف العضوية",
      message: `سيتم حذف عضوية ${membership.memberName || "هذا العضو"} نهائياً من الدورة.`,
      confirmLabel: "حذف نهائي",
      tone: "rose",
      onConfirm: () => doRemoveMembership(membership),
    });
  };

  const doRemoveMembership = async (membership) => {
    setDeletingMembershipId(membership.id);
    try {
      await deleteDoc(doc(db, BOARD_MEMBERSHIPS_COLLECTION, membership.id));
      await logAuditEvent("board_membership_deleted", {
        membershipId: membership.id,
        termId: membership.termId || "",
        memberId: membership.memberId || "",
        memberName: membership.memberName || "",
        role: membership.role || "",
      });
    } catch (error) {
      console.error(error);
    } finally {
      setDeletingMembershipId("");
    }
  };

  const saveTerm = async () => {
    if (!canEditTerms) return;
    if (!termForm.title.trim() || !termForm.startDate || !termForm.endDate) {
      alert("أدخل عنوان الدورة وتاريخ البداية والنهاية.");
      return;
    }
    const dateError = validateBoardTermDates(termForm);
    if (dateError) { alert(dateError); return; }

    setSavingTerm(true);
    try {
      let openingBalance = termForm.openingBalance === "" ? "" : Number(termForm.openingBalance) || 0;
      const carriedFrom = normalizedTerms.find((t) => t.id === termForm.carriedFromTermId);
      if (carriedFrom && (termForm.openingBalance === "" || termForm.openingBalance === null)) {
        const sourceClosing = carriedFrom.closingBalance === "" || carriedFrom.closingBalance === null || carriedFrom.closingBalance === undefined
          ? computeTermClosingBalance(carriedFrom, financialDocs).closing
          : Number(carriedFrom.closingBalance) || 0;
        openingBalance = sourceClosing;
      }
      const payload = normalizeBoardTerm({
        ...termForm,
        title: termForm.title.trim(),
        targetSeats: Number(termForm.targetSeats || TARGET_BOARD_SIZE),
        openingBalance: openingBalance === "" ? 0 : openingBalance,
      });
      delete payload.id;

      if (payload.status === "active") {
        await Promise.all(
          normalizedTerms
            .filter((term) => term.id !== editingTerm?.id && term.status === "active")
            .map((term) =>
              updateDoc(doc(db, BOARD_TERMS_COLLECTION, term.id), {
                status: "closed",
                updatedAt: serverTimestamp(),
              })
            )
        );
      }

      if (editingTerm?.id) {
        await updateDoc(doc(db, BOARD_TERMS_COLLECTION, editingTerm.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        await logAuditEvent("board_term_updated", {
          termId: editingTerm.id,
          title: payload.title,
          status: payload.status,
        });
        await logTermMovement(editingTerm.id, "term_updated", `تعديل الدورة ${payload.title}`);
        setSelectedTermId(editingTerm.id);
      } else {
        const ref = await addDoc(collection(db, BOARD_TERMS_COLLECTION), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await logAuditEvent("board_term_created", {
          termId: ref.id,
          title: payload.title,
          status: payload.status,
        });
        await logTermMovement(ref.id, "term_created", `إنشاء الدورة ${payload.title}`);
        if (carriedFrom) {
          await carryBalanceToNewTerm({ fromTerm: carriedFrom, toTermId: ref.id, amount: payload.openingBalance });
        }
        setSelectedTermId(ref.id);
      }

      setShowTermModal(false);
      setEditingTerm(null);
    } catch (error) {
      console.error(error);
    } finally {
      setSavingTerm(false);
    }
  };

  const saveMembership = async () => {
    if (!canEditTerms) return;
    if (!membershipForm.termId || !membershipForm.memberId || !membershipForm.role || !membershipForm.joinDate) {
      alert("اختر الدورة والعضو والصفة وتاريخ الالتحاق.");
      return;
    }

    const employee = allEmployees.find((item) => item.id === membershipForm.memberId);
    if (!employee) {
      alert("تعذر العثور على بيانات العضو المختار.");
      return;
    }
    const selectedTermForValidation = normalizedTerms.find((term) => term.id === membershipForm.termId);
    const dateError = validateBoardMembershipDates(membershipForm, selectedTermForValidation || {});
    if (dateError) { alert(dateError); return; }
    const employeeCurrentlyEligible = isBoardMemberEligible(employee) || editingMembership?.memberId === employee.id;
    if (!employeeCurrentlyEligible) {
      if (!membershipForm.endDate || !membershipForm.endReason) {
        alert("هذا العضو غير نشط حالياً (وفاة/معاش/استقالة) — أدخل تاريخ انتهاء نشاطه وسببه لتسجيله تاريخياً ضمن الدورة.");
        return;
      }
      if (membershipForm.status === "active") {
        alert("لا يمكن تسجيل عضوية سارية لعضو غير نشط — اختر حالة منتهية مع تاريخ الانتهاء وسببه.");
        return;
      }
    }

    setSavingMembership(true);
    try {
      const linkedMembership = membershipsMap.get(membershipForm.replacementForMembershipId) || null;
      const payload = normalizeBoardMembership({
        ...membershipForm,
        memberId: employee.id,
        memberName: employee.name || "",        memberJobId: employee.jobId || "",
        replacementForMembershipId:
          membershipForm.joinMethod === "replacement" || membershipForm.joinMethod === "escalated"
            ? membershipForm.replacementForMembershipId
            : "",
        escalationSourceMemberId:
          membershipForm.joinMethod === "escalated"
            ? (membershipForm.escalationSourceMemberId || linkedMembership?.memberId || "")
            : membershipForm.joinMethod === "replacement"
              ? (linkedMembership?.memberId || membershipForm.escalationSourceMemberId || "")
              : "",
        roleOrder: BOARD_ROLE_ORDER[membershipForm.role] || 99,
        snapshot: buildBoardMembershipSnapshot({
          ...employee,
          membershipStatus: membershipForm.role,
          boardRoleTitle: membershipForm.role,
        }),
      });
      delete payload.id;

      const conflictingActiveMembership = membershipsForSelectedTerm.find(
        (membership) =>
          membership.id !== editingMembership?.id &&
          membership.memberId === payload.memberId &&
          membership.status === "active" &&
          payload.status === "active"
      );
      if (conflictingActiveMembership) {
        alert("هذا العضو لديه بالفعل عضوية مجلس سارية داخل نفس الدورة.");
        setSavingMembership(false);
        return;
      }

      const activeMemberships = membershipsForSelectedTerm.filter(
        (membership) => membership.status === "active" && membership.id !== editingMembership?.id
      );
      const targetSeats = Number(selectedTermForValidation?.targetSeats || TARGET_BOARD_SIZE);
      if (payload.status === "active" && activeMemberships.length >= targetSeats) {
        alert(`تم بلوغ الحد الأقصى لمقاعد الدورة: ${targetSeats}.`);
        setSavingMembership(false);
        return;
      }
      const executiveRoles = new Set(["رئيس المجلس", "الأمين العام", "أمين الصندوق", "نائب الرئيس"]);
      if (payload.status === "active" && executiveRoles.has(payload.role)) {
        const duplicateRole = activeMemberships.find((membership) => membership.role === payload.role);
        if (duplicateRole) {
          alert(`المنصب ${payload.role} مشغول بعضوية سارية بالفعل.`);
          setSavingMembership(false);
          return;
        }
      }

      if (editingMembership?.id) {
        await updateDoc(doc(db, BOARD_MEMBERSHIPS_COLLECTION, editingMembership.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        await logAuditEvent("board_membership_updated", {
          membershipId: editingMembership.id,
          termId: payload.termId,
          memberId: payload.memberId,
          memberName: payload.memberName,
          role: payload.role,
          status: payload.status,
        });
      } else {
        const ref = await addDoc(collection(db, BOARD_MEMBERSHIPS_COLLECTION), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await logAuditEvent("board_membership_created", {
          membershipId: ref.id,
          termId: payload.termId,
          memberId: payload.memberId,
          memberName: payload.memberName,
          role: payload.role,
          status: payload.status,
        });
      }

      setShowMembershipModal(false);
      setEditingMembership(null);
    } catch (error) {
      console.error(error);
      alert(`تعذر حفظ العضوية: ${error.message || "خطأ غير معروف"}`);
    } finally {
      setSavingMembership(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-5">
      <Modal
        open={Boolean(confirmDialog)}
        onClose={() => setConfirmDialog(null)}
        title={confirmDialog?.title || "تأكيد"}
        size="sm"
        actions={
          <>
            <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 rounded-xl text-xs font-black border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">تراجع</button>
            <button
              onClick={async () => { const fn = confirmDialog?.onConfirm; setConfirmDialog(null); await fn?.(); }}
              className={clsx(
                "px-4 py-2 rounded-xl text-xs font-black text-white transition-all flex items-center gap-1.5",
                confirmDialog?.tone === "rose" ? "bg-rose-500 hover:bg-rose-600"
                  : confirmDialog?.tone === "emerald" ? "bg-emerald-500 hover:bg-emerald-600"
                  : confirmDialog?.tone === "sky" ? "bg-sky-500 hover:bg-sky-600"
                  : "bg-slate-800 hover:bg-slate-900"
              )}
            >
              {confirmDialog?.confirmLabel || "تأكيد"}
            </button>
          </>
        }
      >
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <div className={clsx(
            "w-14 h-14 rounded-full flex items-center justify-center",
            confirmDialog?.tone === "rose" ? "bg-rose-50 text-rose-600 dark:bg-rose-900/20"
              : confirmDialog?.tone === "emerald" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20"
              : confirmDialog?.tone === "sky" ? "bg-sky-50 text-sky-600 dark:bg-sky-900/20"
              : "bg-slate-100 text-slate-600 dark:bg-slate-800"
          )}>
            <Trash2 size={26} />
          </div>
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300 leading-relaxed">{confirmDialog?.message}</p>
        </div>
      </Modal>
      <Modal
        open={showTermModal}
        onClose={() => { if (!savingTerm) { setShowTermModal(false); setEditingTerm(null); } }}
        title={editingTerm ? "تعديل دورة المجلس" : "إضافة دورة مجلس"}
        actions={
          <>
            <button onClick={() => { setShowTermModal(false); setEditingTerm(null); }} className="px-4 py-2 rounded-xl text-xs font-black border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">إلغاء</button>
            <button onClick={saveTerm} disabled={savingTerm || !canEditTerms} className="px-4 py-2 rounded-xl text-xs font-black bg-amber-500 text-white hover:bg-amber-600 transition-all flex items-center gap-1.5 disabled:opacity-60"><Save size={13} /> {savingTerm ? "جارٍ الحفظ..." : "حفظ الدورة"}</button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="عنوان الدورة" required>
            <input className={inputCls} value={termForm.title} onChange={(e) => setTermForm((v) => ({ ...v, title: e.target.value }))} placeholder="مثال: دورة مجلس 2022 - 2027" />
          </FormField>
          <FormField label="رقم الدورة">
            <input className={inputCls} value={termForm.termNumber} onChange={(e) => setTermForm((v) => ({ ...v, termNumber: e.target.value }))} placeholder="7" />
          </FormField>
          <FormField label="بداية الدورة" required>
            <ArabicDatePicker value={termForm.startDate} onChange={(value) => setTermForm((v) => ({ ...v, startDate: value }))} />
          </FormField>
          <FormField label="نهاية الدورة" required>
            <ArabicDatePicker value={termForm.endDate} onChange={(value) => setTermForm((v) => ({ ...v, endDate: value }))} />
          </FormField>
          <FormField label="حالة الدورة">
            <select className={inputCls} value={termForm.status} onChange={(e) => setTermForm((v) => ({ ...v, status: e.target.value }))}>
              {TERM_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </FormField>
          <FormField label="عدد المقاعد المستهدف">
            <input type="number" min="1" className={inputCls} value={termForm.targetSeats} onChange={(e) => setTermForm((v) => ({ ...v, targetSeats: e.target.value }))} />
          </FormField>
          <label className="flex items-center gap-2 text-xs font-black text-slate-600 dark:text-slate-300 md:col-span-2 bg-amber-50/60 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl px-3 py-2.5">
            <input type="checkbox" checked={Boolean(termForm.allowInactiveCandidates)} onChange={(e) => setTermForm((v) => ({ ...v, allowInactiveCandidates: e.target.checked }))} className="w-4 h-4" />
            دورة استثنائية: السماح بترشيح أعضاء غير نشطين (وفاة/معاش) لهذه الدورة فقط
          </label>
          <FormField label="الرصيد الافتتاحي (جنيه)">
            <input type="number" className={inputCls} value={termForm.openingBalance} onChange={(e) => setTermForm((v) => ({ ...v, openingBalance: e.target.value }))} placeholder="يُملأ تلقائياً من الدورة السابقة عند اختيارها" />
          </FormField>
          <FormField label="ترحيل الرصيد من دورة سابقة">
            <select className={inputCls} value={termForm.carriedFromTermId} onChange={(e) => setTermForm((v) => ({ ...v, carriedFromTermId: e.target.value }))}>
              <option value="">بدون ترحيل</option>
              {normalizedTerms.filter((t) => t.id !== editingTerm?.id).map((t) => (
                <option key={t.id} value={t.id}>{t.title || t.id} {t.closingBalance !== "" && t.closingBalance !== undefined ? `— ختامي ${t.closingBalance}` : ""}</option>
              ))}
            </select>
          </FormField>
          <FormField label="تاريخ الانتخاب">
            <ArabicDatePicker value={termForm.electionDate} onChange={(value) => setTermForm((v) => ({ ...v, electionDate: value }))} />
          </FormField>
          <FormField label="تاريخ الاعتماد">
            <ArabicDatePicker value={termForm.approvalDate} onChange={(value) => setTermForm((v) => ({ ...v, approvalDate: value }))} />
          </FormField>
          <div className="md:col-span-2">
            <FormField label="مرجع قرار الاعتماد">
              <input className={inputCls} value={termForm.approvalRef} onChange={(e) => setTermForm((v) => ({ ...v, approvalRef: e.target.value }))} placeholder="قرار رقم 12/2022" />
            </FormField>
          </div>
          <div className="md:col-span-2">
            <FormField label="ملاحظات">
              <textarea className={clsx(inputCls, "resize-none")} rows={3} value={termForm.notes} onChange={(e) => setTermForm((v) => ({ ...v, notes: e.target.value }))} />
            </FormField>
          </div>
        </div>
      </Modal>

      <Modal
        open={showMembershipModal}
        onClose={() => { if (!savingMembership) { setShowMembershipModal(false); setEditingMembership(null); } }}
        title={editingMembership ? "تعديل عضوية مجلس" : "إضافة عضوية مجلس"}
        actions={
          <>
            <button onClick={() => { setShowMembershipModal(false); setEditingMembership(null); }} className="px-4 py-2 rounded-xl text-xs font-black border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">إلغاء</button>
            <button onClick={saveMembership} disabled={savingMembership || !canEditTerms} className="px-4 py-2 rounded-xl text-xs font-black bg-amber-500 text-white hover:bg-amber-600 transition-all flex items-center gap-1.5 disabled:opacity-60"><Save size={13} /> {savingMembership ? "جارٍ الحفظ..." : "حفظ العضوية"}</button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="الدورة" required>
            <select className={inputCls} value={membershipForm.termId} onChange={(e) => setMembershipForm((v) => ({ ...v, termId: e.target.value }))}>
              <option value="">اختر الدورة</option>
              {normalizedTerms.map((term) => <option key={term.id} value={term.id}>{term.title || term.id}</option>)}
            </select>
          </FormField>
          <FormField label="العضو — بحث واختيار" required>
            <MemberSearchSelect
              value={membershipForm.memberId}
              onChange={(id) => setMembershipForm((v) => ({ ...v, memberId: id }))}
              options={selectableEmployees.map(({ employee, eligible }) => ({
                id: employee.id,
                name: employee.name || "بدون اسم",
                sub: `${employee.jobId || ""}${employee.workplace ? ` • ${employee.workplace}` : ""}`,
                badge: eligible ? "" : `${getEffectiveMemberState(employee)} (تسجيل تاريخي)`,
              }))}
            />
          </FormField>
          <FormField label="الصفة" required>
            <select className={inputCls} value={membershipForm.role} onChange={(e) => setMembershipForm((v) => ({ ...v, role: e.target.value }))}>
              {BOARD_MEMBERSHIP_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </FormField>
          <FormField label="طريقة الالتحاق">
            <select className={inputCls} value={membershipForm.joinMethod} onChange={(e) => setMembershipForm((v) => ({ ...v, joinMethod: e.target.value }))}>
              {JOIN_METHOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </FormField>
          {(membershipForm.joinMethod === "replacement" || membershipForm.joinMethod === "escalated") && (
            <FormField label={membershipForm.joinMethod === "escalated" ? "العضوية التي نتج عنها التصعيد" : "بديل عن العضوية"}>
              <select
                className={inputCls}
                value={membershipForm.replacementForMembershipId}
                onChange={(e) => setMembershipForm((v) => ({ ...v, replacementForMembershipId: e.target.value }))}
              >
                <option value="">اختر العضوية المرتبطة</option>
                {replacementMembershipOptions
                  .filter((membership) => membership.id !== editingMembership?.id)
                  .map((membership) => (
                    <option key={membership.id} value={membership.id}>
                      {(membership.memberName || "بدون اسم")} - {(membership.role || "عضوية")} {membership.endDate ? `- حتى ${membership.endDate}` : ""}
                    </option>
                  ))}
              </select>
            </FormField>
          )}
          {membershipForm.joinMethod === "escalated" && (
            <FormField label="صدر التصعيد بسبب خروج العضو">
              <select
                className={inputCls}
                value={membershipForm.escalationSourceMemberId}
                onChange={(e) => setMembershipForm((v) => ({ ...v, escalationSourceMemberId: e.target.value }))}
              >
                <option value="">اختر العضو المرتبط</option>
                {replacementMembershipOptions.map((membership) => (
                  <option key={membership.id} value={membership.memberId}>
                    {(membership.memberName || "بدون اسم")} - {(membership.role || "عضوية")}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="تاريخ الالتحاق" required>
            <ArabicDatePicker value={membershipForm.joinDate} onChange={(value) => setMembershipForm((v) => ({ ...v, joinDate: value }))} />
          </FormField>
          <FormField label="تاريخ الانتهاء">
            <ArabicDatePicker value={membershipForm.endDate} onChange={(value) => setMembershipForm((v) => ({ ...v, endDate: value }))} />
          </FormField>
          <FormField label="حالة العضوية">
            <select className={inputCls} value={membershipForm.status} onChange={(e) => setMembershipForm((v) => ({ ...v, status: e.target.value }))}>
              {MEMBERSHIP_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </FormField>
          <FormField label="سبب الانتهاء">
            <select className={inputCls} value={membershipForm.endReason} onChange={(e) => setMembershipForm((v) => ({ ...v, endReason: e.target.value }))}>
              {END_REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </FormField>
          <FormField label="تاريخ القرار">
            <ArabicDatePicker value={membershipForm.decisionDate} onChange={(value) => setMembershipForm((v) => ({ ...v, decisionDate: value }))} />
          </FormField>
          <FormField label="مرجع القرار">
            <input className={inputCls} value={membershipForm.decisionRef} onChange={(e) => setMembershipForm((v) => ({ ...v, decisionRef: e.target.value }))} placeholder="محضر اجتماع أو قرار" />
          </FormField>
          <div className="md:col-span-2">
            <FormField label="ملاحظات">
              <textarea className={clsx(inputCls, "resize-none")} rows={3} value={membershipForm.notes} onChange={(e) => setMembershipForm((v) => ({ ...v, notes: e.target.value }))} />
            </FormField>
          </div>
        </div>
      </Modal>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">الدورات والعضويات الزمنية</h2>
          <p className="text-[11px] font-bold text-slate-400 mt-1">هذا التبويب ينقل المجلس من الحالة الحالية إلى سجلات زمنية قابلة للأرشفة والتتبع.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={openCreateTerm} className="px-4 py-2 rounded-xl text-xs font-black bg-sky-500 text-white hover:bg-sky-600 transition-all flex items-center gap-1.5"><PlusCircle size={14} /> إضافة دورة</button>
          {canManage && normalizedTerms.length > 1 && (
            <button onClick={handleCleanupTerms} disabled={closingTermId === "__cleanup__"} className="px-4 py-2 rounded-xl text-xs font-black bg-rose-500 text-white hover:bg-rose-600 transition-all flex items-center gap-1.5 disabled:opacity-60"><Trash2 size={14} /> {closingTermId === "__cleanup__" ? "جارٍ التنظيف..." : "تنظيف الدورات والإبقاء على الحالية"}</button>
          )}
          <button onClick={openCreateMembership} disabled={!canManageMemberships} className={clsx("px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5", canManageMemberships ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-slate-200 text-slate-400 cursor-not-allowed")}><Plus size={14} /> إضافة عضوية</button>
          <button onClick={openEscalationMembership} disabled={!canManageMemberships} className={clsx("px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5", canManageMemberships ? "bg-teal-500 text-white hover:bg-teal-600" : "bg-slate-200 text-slate-400 cursor-not-allowed")}><ArrowUpCircle size={14} /> تصعيد عضو</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={clsx("p-4 rounded-2xl border shadow-sm", T.card)}><div className="text-[10px] font-black text-slate-400">إجمالي الدورات</div><div className="text-3xl font-black text-sky-600 mt-1">{normalizedTerms.length || 1}</div></div>
        <div className={clsx("p-4 rounded-2xl border shadow-sm", T.card)}><div className="text-[10px] font-black text-slate-400">الدورة النشطة</div><div className="text-sm font-black text-amber-600 mt-2 truncate">{activeTerm?.title || "الدورة الحالية"}</div></div>
        <div className={clsx("p-4 rounded-2xl border shadow-sm", T.card)}><div className="text-[10px] font-black text-slate-400">عضويات سارية</div><div className="text-3xl font-black text-emerald-600 mt-1">{activeMembershipCount}</div></div>
        <div className={clsx("p-4 rounded-2xl border shadow-sm", T.card)}><div className="text-[10px] font-black text-slate-400">عضويات منتهية</div><div className="text-3xl font-black text-rose-500 mt-1">{endedMembershipCount}</div></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.4fr] gap-5">
        <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">الدورات المسجلة</h3>
            <span className="text-[10px] font-black text-slate-400">{normalizedTerms.length} دورة</span>
          </div>
          <div className="space-y-3">
            {normalizedTerms.length > 0 ? normalizedTerms.map((term) => {
              const activeCount = memberships.filter((membership) => membership.termId === term.id && membership.status === "active").length;
              const selected = term.id === selectedTerm?.id;
              return (
                <div
                  key={term.id}
                  className={clsx(
                    "w-full p-4 rounded-2xl border transition-all",
                    selected
                      ? "border-amber-400 bg-amber-50/60 dark:bg-amber-900/10"
                      : "border-slate-200 dark:border-slate-700 hover:border-amber-300"
                  )}
                >
                  <button onClick={() => setSelectedTermId(term.id)} className="w-full text-right">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-slate-800 dark:text-slate-100">{term.title || "بدون عنوان"}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-1">{term.startDate || "—"} إلى {term.endDate || "—"}</div>
                      </div>
                      <span className={clsx("px-2.5 py-1 rounded-lg text-[10px] font-black border", chipClass(term.status === "active" ? "emerald" : term.status === "planned" ? "sky" : term.status === "archived" ? "slate" : "amber"))}>{TERM_STATUS_LABELS[term.status] || term.status}</span>
                    </div>
                    <div className="flex items-center justify-between mt-3 text-[10px] font-black text-slate-500">
                      <span>{activeCount} عضوية سارية</span>
                      <span>{term.targetSeats || TARGET_BOARD_SIZE} مقعد</span>
                    </div>
                  </button>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => openEditTerm(term)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-black border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-300 hover:text-amber-600 transition-all flex items-center gap-1"
                    >
                      <Edit3 size={11} /> تعديل
                    </button>
                    <button
                      onClick={() => removeTerm(term)}
                      disabled={deletingTermId === term.id}
                      className={clsx(
                        "px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all flex items-center gap-1",
                        deletingTermId === term.id
                          ? "border-rose-100 text-rose-300 cursor-not-allowed"
                          : "border-rose-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                      )}
                    >
                      <Trash2 size={11} /> {deletingTermId === term.id ? "جاري الحذف..." : "حذف"}
                    </button>
                  </div>
                </div>
              );
            }) : <div className="p-4 rounded-2xl border border-dashed border-slate-300 text-center text-[11px] font-bold text-slate-400">لا توجد دورات مسجلة بعد. ابدأ بإضافة أول دورة.</div>}
          </div>
        </div>

        <div className="space-y-5">
          <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">{selectedTerm?.title || "الدورة الحالية"}</h3>
                <div className="text-[11px] font-bold text-slate-400 mt-1">من {selectedTerm?.startDate || "—"} إلى {selectedTerm?.endDate || "—"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={clsx("px-2.5 py-1 rounded-lg text-[10px] font-black border", chipClass(selectedTerm?.status === "active" ? "emerald" : selectedTerm?.status === "planned" ? "sky" : "amber"))}>{TERM_STATUS_LABELS[selectedTerm?.status] || selectedTerm?.status || "انتقالية"}</span>
                {selectedTermIsPersisted && (
                  <button
                    onClick={() => openEditTerm(selectedTerm)}
                    className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-all flex items-center gap-1"
                  >
                    <Edit3 size={12} /> تعديل الدورة
                  </button>
                )}
                {selectedTermIsPersisted && (
                  <button
                    onClick={() => removeTerm(selectedTerm)}
                    disabled={deletingTermId === selectedTerm.id}
                    className={clsx(
                      "px-3 py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-1",
                      deletingTermId === selectedTerm.id
                        ? "bg-rose-100 text-rose-300 cursor-not-allowed"
                        : "bg-rose-100 text-rose-600 hover:bg-rose-200"
                    )}
                  >
                    <Trash2 size={12} /> {deletingTermId === selectedTerm.id ? "جارٍ الحذف..." : "حذف الدورة"}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700"><div className="text-[10px] font-black text-slate-400">تاريخ الانتخاب</div><div className="text-sm font-black text-slate-700 dark:text-slate-200 mt-1">{selectedTerm?.electionDate || "—"}</div></div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700"><div className="text-[10px] font-black text-slate-400">تاريخ الاعتماد</div><div className="text-sm font-black text-slate-700 dark:text-slate-200 mt-1">{selectedTerm?.approvalDate || "—"}</div></div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700"><div className="text-[10px] font-black text-slate-400">مرجع الاعتماد</div><div className="text-sm font-black text-slate-700 dark:text-slate-200 mt-1">{selectedTerm?.approvalRef || "—"}</div></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40"><div className="text-[10px] font-black text-emerald-600">الرصيد الافتتاحي</div><div className="text-sm font-black text-emerald-700 dark:text-emerald-300 mt-1">{selectedTerm?.openingBalance ?? "—"}</div></div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700"><div className="text-[10px] font-black text-slate-400">وارد الفترة (محتسب)</div><div className="text-sm font-black text-slate-700 dark:text-slate-200 mt-1">{computedClosing.credit}</div></div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700"><div className="text-[10px] font-black text-slate-400">منصرف الفترة (محتسب)</div><div className="text-sm font-black text-slate-700 dark:text-slate-200 mt-1">{computedClosing.debit}</div></div>
              <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800/40"><div className="text-[10px] font-black text-sky-600">الرصيد الختامي</div><div className="text-sm font-black text-sky-700 dark:text-sky-300 mt-1">{selectedTerm?.closingBalance !== "" && selectedTerm?.closingBalance !== undefined ? selectedTerm.closingBalance : `محتسب: ${computedClosing.closing}`}</div></div>
            </div>

            {isHistorical && (
              <div className="mt-3 p-3 rounded-xl border border-sky-200 bg-sky-50 text-sky-800 text-[11px] font-black">عرض تاريخي — الدورة {selectedTerm?.status === "archived" ? "مؤرشفة" : "منتهية"} وقابلة للاستدعاء في أي وقت. التعديل معطل للحفاظ على التاريخ.</div>
            )}

            {canEditTerms && selectedTermIsPersisted && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {["planned", "active"].includes(selectedTerm?.status) && (
                  <button onClick={handleCloseTerm} disabled={closingTermId === selectedTerm.id} className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50">{closingTermId === selectedTerm.id ? "جارٍ الإغلاق..." : "إغلاق واحتساب الرصيد"}</button>
                )}
                {selectedTerm?.status === "closed" && (
                  <button onClick={handleArchiveTerm} disabled={closingTermId === selectedTerm.id} className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50">أرشفة الدورة</button>
                )}
                {["closed", "archived"].includes(selectedTerm?.status) && selectedTerm?.closingBalance !== "" && selectedTerm?.closingBalance !== undefined && (
                  <>
                    <select className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[10px] font-black" value={carryTargetId} onChange={(e) => setCarryTargetId(e.target.value)}>
                      <option value="">ترحيل الختامي إلى دورة...</option>
                      {normalizedTerms.filter((t) => t.id !== selectedTerm.id && !["archived", "closed"].includes(t.status)).map((t) => <option key={t.id} value={t.id}>{t.title || t.id}</option>)}
                    </select>
                    <button onClick={handleCarryBalance} disabled={!carryTargetId} className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">ترحيل الرصيد</button>
                  </>
                )}
              </div>
            )}

            {selectedTerm?.notes && <div className="mt-4 p-3 rounded-xl bg-amber-50/40 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30"><div className="text-[10px] font-black text-amber-600 mb-1">ملاحظات</div><div className="text-xs font-bold text-slate-600 dark:text-slate-300">{selectedTerm.notes}</div></div>}
          </div>

          <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">عضويات المجلس داخل الدورة</h3>
                <div className="text-[11px] font-bold text-slate-400 mt-1">كل عضوية تحمل تاريخ التحاق وانتهاء وسبب وطريقة الالتحاق.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={openCreateMembership} disabled={!canManageMemberships} className={clsx("px-3 py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-1", canManageMemberships ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-slate-200 text-slate-400 cursor-not-allowed")}><Plus size={12} /> إضافة عضوية</button>
                <button onClick={openEscalationMembership} disabled={!canManageMemberships} className={clsx("px-3 py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-1", canManageMemberships ? "bg-teal-500 text-white hover:bg-teal-600" : "bg-slate-200 text-slate-400 cursor-not-allowed")}><ArrowUpCircle size={12} /> تصعيد عضو</button>
              </div>
            </div>

            <div className="space-y-3">
              {membershipViews.length > 0 ? membershipViews.map((member, index) => {
                const membership = member.boardMembership || {};
                const linkedMembership = membershipsMap.get(membership.replacementForMembershipId);
                const linkedEmployee = employeesMap.get(membership.escalationSourceMemberId);
                return (
                  <div key={membership.id || member.id || index} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar member={member} idx={index} />
                        <div className="min-w-0">
                          <button onClick={() => member.id && openEmployeeModal?.(employeesMap.get(member.id) || member)} className="text-sm font-black text-slate-800 dark:text-slate-100 hover:text-amber-600 truncate">{member.name || "بدون اسم"}</button>
                          <div className="text-[10px] font-bold text-slate-400 mt-1">{member.jobId || "بدون كود"}{member.workplace ? ` • ${member.workplace}` : ""}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={clsx("px-2.5 py-1 rounded-lg text-[10px] font-black border", chipClass("sky"))}>{membership.role || "—"}</span>
                        <span className={clsx("px-2.5 py-1 rounded-lg text-[10px] font-black border", chipClass(membership.status === "active" ? "emerald" : membership.status === "vacated" ? "rose" : "amber"))}>{MEMBERSHIP_STATUS_LABELS[membership.status] || membership.status || "—"}</span>
                        <button disabled={!canEditTerms} onClick={() => openEditMembership(membership)} className="px-2.5 py-1 rounded-lg text-[10px] font-black border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-amber-600 hover:border-amber-300 transition-all flex items-center gap-1 disabled:opacity-40"><Edit3 size={11} /> تعديل</button>
                        <button
                          onClick={() => removeMembership(membership)}
                          disabled={deletingMembershipId === membership.id}
                          className={clsx(
                            "px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all flex items-center gap-1",
                            deletingMembershipId === membership.id
                              ? "border-rose-100 text-rose-300 cursor-not-allowed"
                              : "border-rose-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                          )}
                        >
                          <Trash2 size={11} /> {deletingMembershipId === membership.id ? "جارٍ الحذف..." : "حذف"}
                        </button>
                        {membership.status !== "active" && canManageMemberships && (
                          <button onClick={() => openReplacementMembership(membership)} className="px-2.5 py-1 rounded-lg text-[10px] font-black border border-teal-200 dark:border-teal-800 text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all flex items-center gap-1">
                            <Plus size={11} /> بديل/تصعيد
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3 text-[10px] font-black">
                      <div className="text-slate-500">التحاق: <span className="text-slate-700 dark:text-slate-200">{membership.joinDate || "—"}</span></div>
                      <div className="text-slate-500">انتهاء: <span className="text-slate-700 dark:text-slate-200">{membership.endDate || "—"}</span></div>
                      <div className="text-slate-500">الطريقة: <span className="text-slate-700 dark:text-slate-200">{JOIN_METHOD_LABELS[membership.joinMethod] || membership.joinMethod || "—"}</span></div>
                      <div className="text-slate-500">السبب: <span className="text-slate-700 dark:text-slate-200">{END_REASON_LABELS[membership.endReason] || membership.endReason || "—"}</span></div>
                    </div>
                    {membership.decisionRef && <div className="text-[10px] font-bold text-slate-400 mt-3">مرجع القرار: {membership.decisionRef}</div>}
                    {(linkedMembership || linkedEmployee) && (
                      <div className="mt-3 text-[10px] font-bold text-slate-400 flex flex-wrap gap-4">
                        {linkedMembership && (
                          <span>
                            {membership.joinMethod === "escalated" ? "التصعيد مرتبط بعضوية:" : "بديل عن:"}{" "}
                            <span className="text-slate-600 dark:text-slate-300">{linkedMembership.memberName || "—"} - {linkedMembership.role || "عضوية"}</span>
                          </span>
                        )}
                        {membership.joinMethod === "escalated" && linkedEmployee && (
                          <span>
                            بسبب خروج: <span className="text-slate-600 dark:text-slate-300">{linkedEmployee.name || "—"}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              }) : <div className="p-5 rounded-2xl border border-dashed border-slate-300 text-center text-[11px] font-bold text-slate-400">{canManageMemberships ? "لا توجد عضويات مسجلة لهذه الدورة بعد." : "أنشئ دورة حقيقية أولًا ثم أضف العضويات."}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
