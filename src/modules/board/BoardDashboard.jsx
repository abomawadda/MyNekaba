import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  collection, query, onSnapshot, orderBy, runTransaction,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";
import { useT } from "../../app/providers/ThemeProvider";
import { useEmployeeModal } from "../../app/providers/GlobalEmployeeModal";
import { useAuth } from "../../app/providers/AuthProvider";
import { PERMISSIONS } from "../../security/permissions";
import { logAuditEvent } from "../../utils/auditLog";
import {
  BOARD_MEMBERSHIP_ROLES,
  getAutomaticMemberLifecycleUpdates,
  getBoardRoleLabel,
  getEffectiveMemberState,
  getRetirementDate,
  isActiveMember,
  isBoardMemberEligible,
  parseEmployeeDate,
} from "../../utils/memberBenefits";
import { formatMoney } from "../../utils/numberFormat";
import { mergeIssuedChecksSourcesNormalized } from "../treasury/helpers/issuedChecks";
import ResponsiveTable from "../../ui/ResponsiveTable";
import ArabicDatePicker from "../../ui/inputs/ArabicDatePicker";
import { Button, LoadingState, PageHeader, StatCard, StatusBadge, getModuleIcon } from "../../ui/enterprise";
import {
  printBoardAllowancesReport,
  printBoardMeetingAttendanceReport,
  printBoardMeetingsReport,
  printBoardOverview,
} from "./BoardPrints";
import {
  BOARD_MEMBERSHIPS_COLLECTION,
  BOARD_TERMS_COLLECTION,
  buildBoardMemberViewsFromMemberships,
  buildLegacyBoardMemberships,
  buildMeetingAttendancePayload,
  getActiveBoardTerm,
  getEligibleBoardMemberViews,
  getMeetingAttendanceRecords,
  getPresentMeetingAttendanceRecords,
  getMeetingAttendeeIds,
  isBoardMembershipActiveOnDate,
} from "./boardLifecycle";
import BoardTermsTab from "./BoardTermsTab";
import BoardElectionsTab, { useBoardElectionSubscriptions } from "./BoardElectionsTab";
import BoardBenefitsTab from "./BoardBenefitsTab";
import { sortBoardMembersUnified, compareBoardMembers, getMembersCoveringDate } from "./boardMembershipRules";
import clsx from "clsx";
import {
  ShieldCheck, Users, CalendarDays, Coins, PieChart, Activity,
  Target, PlusCircle, Trash2, Edit3, Eye, CheckCircle2, FileCheck2,
  MapPin, Clock, BadgeCheck, X, Save, Plus, Gavel, BarChart3,
  UserCheck, UserX, FileText, AlertTriangle, ChevronRight,
  Printer, Download, RefreshCw, Filter, Search,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// §1  الثوابت
// ═══════════════════════════════════════════════════════════════

const BOARD_ROLES = BOARD_MEMBERSHIP_ROLES;
const TARGET_BOARD_SIZE = 11;
const BOARD_TERM_START = "2022/06/01";
const BOARD_TERM_END = "2027/05/31";
const ROLE_META = {
  "رئيس المجلس": { icon: "👑", color: "amber", meeting_rate: 75 },
  "الأمين العام": { icon: "📝", color: "teal", meeting_rate: 75 },
  "أمين الصندوق": { icon: "💼", color: "emerald", meeting_rate: 75 },
  "نائب الرئيس": { icon: "⭐", color: "violet", meeting_rate: 75 },
  "عضو مجلس إدارة": { icon: "👤", color: "slate", meeting_rate: 75 },
  "عضو مجلس": { icon: "👤", color: "slate", meeting_rate: 75 },
};

const MONTHLY_ALLOWANCES = {
  "رئيس المجلس": { travel: 0, sessions: 0, hospitality: 0 },
  "الأمين العام": { travel: 0, sessions: 0, hospitality: 0 },
  "أمين الصندوق": { travel: 0, sessions: 0, hospitality: 0 },
  "عضو مجلس إدارة": { travel: 0, sessions: 0, hospitality: 0 },
  "عضو مجلس": { travel: 0, sessions: 0, hospitality: 0 },
};

const ALLOWANCE_LABELS = {
  sessions: "بدل جلسات",
  travel: "بدل انتقال",
  hospitality: "بدل ضيافة",
};

const MEETING_TYPES = { ordinary: "عادي", emergency: "طارئ", annual: "سنوي عام", extraordinary: "استثنائي" };
const MEETING_STATUSES = { scheduled: "مجدول", held: "منعقد", cancelled: "ملغي", postponed: "مؤجل" };

const STATUS_COLORS = {
  scheduled: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300",
  held: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300",
  postponed: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
};

const MEMBER_STATE_COLORS = {
  وفاة: "bg-slate-800 text-white border-slate-700",
  استقالة: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300",
  معاش: "bg-purple-100 text-purple-700 border-purple-200",
  موقوف: "bg-amber-100 text-amber-700 border-amber-200",
  نشط: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
};
const ARABIC_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

const parseBoardDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const timestampDate = value.toDate();
    return Number.isNaN(timestampDate.getTime()) ? null : timestampDate;
  }
  const parsedEmployeeDate = parseEmployeeDate(value);
  if (parsedEmployeeDate) return parsedEmployeeDate;
  const normalized = String(value).trim().replace(/\//g, "-");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (ds) => {
  if (!ds) return "—";
  try {
    const parsed = parseBoardDate(ds);
    return parsed
      ? parsed.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })
      : ds;
  }
  catch { return ds; }
};

const formatDateNumeric = (ds) => {
  const parsed = parseBoardDate(ds);
  if (!parsed) return "—";
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  return `${day}-${month}-${year}`;
};

const getDurationLabel = (startValue, endValue) => {
  const startDate = parseBoardDate(startValue);
  const endDate = parseBoardDate(endValue) || new Date();
  if (!startDate || !endDate || endDate.getTime() < startDate.getTime()) return "—";

  let years = endDate.getFullYear() - startDate.getFullYear();
  let months = endDate.getMonth() - startDate.getMonth();
  const dayDiff = endDate.getDate() - startDate.getDate();

  if (dayDiff < 0) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const yearsPart = years > 0 ? `${years} سنة` : "";
  const monthsPart = months > 0 ? `${months} شهر` : "";
  const daysOnly = Math.max(
    0,
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  if (!yearsPart && !monthsPart) return `${daysOnly} يوم`;
  return [yearsPart, monthsPart].filter(Boolean).join(" و ");
};

const getMemberTermStartDate = (member = {}, activeTerm = null) =>
  member?.boardMembership?.joinDate ||
  member?.boardMembershipStartDate ||
  activeTerm?.startDate ||
  BOARD_TERM_START;

const getDecisionVotesTotal = (decision = {}) =>
  Number(decision?.votes?.for || 0) +
  Number(decision?.votes?.against || 0) +
  Number(decision?.votes?.abstain || 0);

const getMeetingVotesTotal = (meeting = {}) =>
  (meeting?.decisions || []).reduce((sum, decision) => sum + getDecisionVotesTotal(decision), 0);

const getInitials = (name = "") => name.split(" ").slice(0, 2).map(w => w[0]).join("");

const AVATAR_BG = ["bg-teal-600", "bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-emerald-600", "bg-indigo-600", "bg-pink-600"];
const avatarBg = (id, idx = 0) => AVATAR_BG[(String(id || idx).charCodeAt(0) || idx) % AVATAR_BG.length];
const sortBoardMembers = (members = []) => sortBoardMembersUnified(members);

const buildHistoricalBoardMembers = ({ memberships = [], allEmployees = [], termId = "" } = {}) =>
  sortBoardMembers(
    buildBoardMemberViewsFromMemberships(memberships, allEmployees, { termId })
  );

const mergeAllowanceSnapshotMembers = (members = [], settlementTransactions = []) => {
  const merged = new Map((members || []).map((member) => [member.id, member]));

  (settlementTransactions || []).forEach((transaction) => {
    (transaction.settlementExpenses || []).forEach((expense) => {
      (expense.boardMemberSnapshots || []).forEach((snapshot) => {
        if (!snapshot?.memberId || merged.has(snapshot.memberId)) return;
        merged.set(snapshot.memberId, {
          id: snapshot.memberId,
          name: snapshot.name || "—",
          membershipStatus: snapshot.role || "—",
          boardRoleTitle: snapshot.role || "—",
          jobId: snapshot.jobId || "",
          workplace: snapshot.workplace || "",
          jobTitle: snapshot.jobTitle || "",
          memberState: snapshot.memberState || "",
          boardMembership: {
            id: snapshot.membershipId || "",
            termId: snapshot.termId || "",
            role: snapshot.role || "",
          },
          isAllowanceSnapshot: true,
        });
      });
    });
  });

  return sortBoardMembers(Array.from(merged.values()));
};

const getEligibleBoardMembersForDate = ({
  memberships = [],
  allEmployees = [],
  members = [],
  termId = "",
  onDate = new Date(),
} = {}) => {
  const membershipMembers = getEligibleBoardMemberViews({
    memberships,
    employees: allEmployees,
    termId,
    onDate,
  });
  if (membershipMembers.length > 0) return sortBoardMembers(membershipMembers);
  return sortBoardMembers(
    (members || []).filter((member) => isBoardMemberEligible(member, onDate))
  );
};

const getSettlementAllowanceTotal = (transactions = []) =>
  transactions
    .filter((t) => t.isSettled)
    .reduce((sum, tx) => {
      const txTotal = (tx.settlementExpenses || []).reduce((expenseSum, expense) => {
        if (!["بدل انتقال", "بدل جلسات", "ضيافة وبوفيه", "بدل ضيافة"].includes(expense.category)) {
          return expenseSum;
        }
        return expenseSum + Number(expense.amount || 0);
      }, 0);
      return sum + txTotal;
    }, 0);

// ═══════════════════════════════════════════════════════════════
// §2  مكونات مشتركة
// ═══════════════════════════════════════════════════════════════

/** Modal overlay */
function Modal({ open, onClose, title, children, size = "md", actions }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx("relative w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col max-h-[92vh]", widths[size])}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h3 className="text-base font-black text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-100 hover:text-rose-600 transition-colors">
            <X size={15} />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {/* Footer */}
        {actions && (
          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/** FormField wrapper */
function FormField({ label, required, children, hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 font-bold">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600";

/** Stat card */
function BoardStatCard({ label, value, sub, icon, color, T }) {
  const toneMap = {
    teal: "success",
    sky: "info",
    amber: "warning",
    emerald: "success",
    purple: "brand",
    slate: "neutral",
    rose: "danger",
  };
  return (
    <StatCard
      label={label}
      value={value}
      sub={sub}
      icon={icon}
      tone={toneMap[color] || "neutral"}
      compact
      className={clsx("transition hover:-translate-y-0.5 hover:shadow-md", T?.card)}
    />
  );
}

/** Status badge */
function StateBadge({ state }) {
  const s = state || "نشط";
  const cls = MEMBER_STATE_COLORS[s] || MEMBER_STATE_COLORS.نشط;
  return <span className={clsx("px-2.5 py-0.5 rounded-lg text-[9px] font-black border", cls)}>{s}</span>;
}

/** Avatar */
function Avatar({ member, size = "md", idx = 0 }) {
  const sz = { sm: "w-8 h-8 text-[10px]", md: "w-10 h-10 text-xs", lg: "w-14 h-14 text-base" }[size];
  return (
    <div className={clsx("rounded-full flex items-center justify-center font-black text-white shrink-0 overflow-hidden", sz, avatarBg(member?.id, idx))}>
      {member?.photo ? <img src={member.photo} className="w-full h-full object-cover" alt="" /> : getInitials(member?.name)}
    </div>
  );
}

/** Confirm delete dialog */
function ConfirmDelete({ open, onClose, onConfirm, label }) {
  return (
    <Modal open={open} onClose={onClose} title="تأكيد الحذف" size="sm"
      actions={<>
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">إلغاء</button>
        <button onClick={onConfirm} className="px-4 py-2 rounded-xl text-xs font-black bg-rose-500 text-white hover:bg-rose-600 transition-all flex items-center gap-1.5"><Trash2 size={13} /> تأكيد الحذف</button>
      </>}
    >
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
          <AlertTriangle size={28} className="text-rose-500" />
        </div>
        <p className="text-sm font-black text-slate-700 dark:text-slate-200">هل أنت متأكد من حذف</p>
        <p className="text-sm font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/20 px-4 py-2 rounded-xl border border-rose-100 dark:border-rose-800">{label}</p>
        <p className="text-[11px] text-slate-400 font-bold">لا يمكن التراجع عن هذا الإجراء</p>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// §3  تبويب النظرة العامة (Dashboard)
// ═══════════════════════════════════════════════════════════════

function DashboardTab({ members, meetings, allEmployees, settlementTransactions, activeTerm, movements = [], candidates = [], T, setActiveTab, openEmployeeModal }) {
  const activeMembers = members.filter((member) => isActiveMember(member)).length;
  const heldMeetings = meetings.filter(m => m.status === "held").length;
  const decisionsCount = meetings.reduce((acc, m) => acc + (m.decisions?.length || 0), 0);
  const settlementAllowanceTotal = getSettlementAllowanceTotal(settlementTransactions);
  const totalAllowances = members.reduce((sum, m) => {
    const monthly = Object.values(MONTHLY_ALLOWANCES[getBoardRoleLabel(m)] || {}).reduce((a, b) => a + b, 0) * 12;
    return sum + monthly;
  }, 0) + settlementAllowanceTotal;
  const executiveMembers = members.filter((m) => ["رئيس المجلس", "الأمين العام", "أمين الصندوق"].includes(getBoardRoleLabel(m))).length;
  const termStart = parseBoardDate(activeTerm?.startDate || BOARD_TERM_START);
  const termEnd = parseBoardDate(activeTerm?.endDate || BOARD_TERM_END);
  const termTotalDays = termStart && termEnd ? Math.max(1, Math.ceil((termEnd - termStart) / (1000 * 60 * 60 * 24))) : 1;
  const termRemainingDays = termEnd ? Math.max(0, Math.ceil((termEnd - new Date()) / (1000 * 60 * 60 * 24))) : 0;
  const termProgress = Math.min(100, Math.max(0, ((termTotalDays - termRemainingDays) / termTotalDays) * 100));
  const upcomingMeetings = meetings.filter((meeting) => meeting.status === "scheduled").slice(0, 2);
  const recentMovements = [...(movements || [])].slice(0, 5);
  const termCandidates = (candidates || []).filter((candidate) => !activeTerm?.id || candidate.termId === activeTerm.id);

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <BoardStatCard label="أعضاء المجلس" value={members.length} sub={`${activeMembers} نشط`} icon={Users} color="teal" T={T} />
        <BoardStatCard label="اجتماعات منعقدة" value={heldMeetings} sub={`${meetings.filter(m => m.status === "scheduled").length} مجدول`} icon={CalendarDays} color="sky" T={T} />
        <BoardStatCard label="قرارات صادرة" value={decisionsCount} sub="في محاضر رسمية" icon={Gavel} color="amber" T={T} />
        <BoardStatCard label="إجمالي البدلات" value={formatMoney(totalAllowances)} sub="بدلات معتمدة" icon={Coins} color="emerald" T={T} />
      </div>

      <div className={clsx("rounded-[2rem] border shadow-sm overflow-hidden", T.card)}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="p-5 bg-gradient-to-l from-amber-50 via-white to-white dark:from-amber-900/10 dark:via-slate-900 dark:to-slate-900">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-black border border-amber-200 dark:border-amber-800/40">
                الدورة النقابية الحالية
              </span>
              <span className="px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 text-[10px] font-black border border-teal-200 dark:border-teal-800/40">
                من {activeTerm?.startDate || BOARD_TERM_START} إلى {activeTerm?.endDate || BOARD_TERM_END}
              </span>
            </div>
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">لوحة قيادة مجلس الإدارة</h3>
            <p className={clsx("text-xs font-bold mt-1", T.muted)}>
              ترتيب الأعضاء معتمد حسب الصفة الوظيفية أولاً ثم الأكبر سنًا عند التساوي، والبدلات تُقرأ من التسويات المعتمدة فقط.
            </p>
            <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-4">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 transition-all duration-700" style={{ width: `${termProgress}%` }} />
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px] font-black">
              <span className="text-amber-600 dark:text-amber-400">{termRemainingDays.toLocaleString("ar-EG")} يومًا حتى نهاية الدورة</span>
              <span className="text-slate-400">بداية الدورة: {formatDate(activeTerm?.startDate || BOARD_TERM_START)}</span>
              <span className="text-slate-400">نهاية الدورة: {formatDate(activeTerm?.endDate || BOARD_TERM_END)}</span>
            </div>
          </div>
          <div className="p-5 border-t lg:border-t-0 lg:border-r border-slate-100 dark:border-slate-800">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-4">
                <div className="text-[10px] font-black text-slate-400 mb-1">القيادات التنفيذية</div>
                <div className="text-2xl font-black text-amber-600">{executiveMembers}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-4">
                <div className="text-[10px] font-black text-slate-400 mb-1">أعضاء المجلس</div>
                <div className="text-2xl font-black text-sky-600">{Math.max(members.length - executiveMembers, 0)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-4 col-span-2">
                <div className="text-[10px] font-black text-slate-400 mb-1">بدلات معتمدة من التسويات</div>
                <div className="text-2xl font-black text-emerald-600">{formatMoney(settlementAllowanceTotal)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Attendance bars */}
        <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
          <h2 className="text-sm font-black flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <Target size={16} className="text-purple-500" /> نسب حضور الأعضاء
          </h2>
          <div className="space-y-3">
            {members.length === 0 && <p className="text-xs text-slate-400 font-bold">لا توجد بيانات</p>}
            {members.map(m => {
              const attended = meetings.filter(mt => mt.status === "held" && getPresentMeetingAttendanceRecords(mt).some((record) => record.memberId === m.id)).length;
              const pct = heldMeetings === 0 ? 0 : Math.round((attended / heldMeetings) * 100);
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <span className="text-[11px] font-black text-slate-600 dark:text-slate-300">{m.name || "—"}</span>
                  <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={clsx("h-full rounded-full transition-all duration-1000", pct >= 85 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] font-black w-8">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent meetings */}
        <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <h2 className="text-sm font-black flex items-center gap-2"><Activity size={16} className="text-teal-500" /> آخر الاجتماعات</h2>
            <button onClick={() => setActiveTab("meetings")} className="text-[10px] font-black text-amber-600 hover:underline flex items-center gap-1">عرض الكل <ChevronRight size={12} /></button>
          </div>
          <div className="relative border-r-2 border-slate-100 dark:border-slate-800 pr-5 space-y-4 mr-2">
            {meetings.slice(0, 4).map(m => (
              <div key={m.id} className="relative">
                <span className={clsx("absolute -right-[25px] top-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900", m.status === "held" ? "bg-teal-500" : "bg-amber-500")} />
                <p className="text-[10px] font-bold text-slate-400 mb-0.5">{formatDate(m.date)}</p>
                <p className="text-xs font-black text-slate-800 dark:text-slate-100">{m.title}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className={clsx("px-2 py-0.5 rounded-md text-[9px] font-black border", STATUS_COLORS[m.status] || STATUS_COLORS.scheduled)}>{MEETING_STATUSES[m.status] || m.status}</span>
                  <span className="text-[10px] text-slate-400 font-bold">{m.decisions?.length || 0} قرارات</span>
                </div>
              </div>
            ))}
            {meetings.length === 0 && <p className="text-xs text-slate-400 font-bold">لا توجد اجتماعات</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-5">
        <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <h2 className="text-sm font-black flex items-center gap-2"><CalendarDays size={16} className="text-sky-500" /> أقرب اجتماعات</h2>
            <StatusBadge tone="info">{upcomingMeetings.length}</StatusBadge>
          </div>
          <div className="space-y-3">
            {upcomingMeetings.map((meeting) => (
              <div key={meeting.id} className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 dark:border-sky-800/40 dark:bg-sky-900/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{meeting.title || "اجتماع مجلس الإدارة"}</p>
                    <p className="mt-1 text-[10px] font-bold text-slate-500">{formatDate(meeting.date)}{meeting.time ? ` • ${meeting.time}` : ""}</p>
                    {meeting.venue && <p className="mt-1 text-[10px] font-bold text-slate-500">{meeting.venue}</p>}
                  </div>
                  <StatusBadge tone="info">{MEETING_STATUSES[meeting.status] || meeting.status}</StatusBadge>
                </div>
              </div>
            ))}
            {upcomingMeetings.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs font-bold text-slate-400 dark:border-slate-700">لا توجد اجتماعات قادمة مسجلة.</p>}
          </div>
        </div>

        <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <h2 className="text-sm font-black flex items-center gap-2"><Activity size={16} className="text-amber-500" /> نشاط الحوكمة</h2>
            <div className="flex items-center gap-2">
              <StatusBadge tone="warning">{recentMovements.length} حركة</StatusBadge>
              <StatusBadge tone="brand">{termCandidates.length} مرشح</StatusBadge>
            </div>
          </div>
          <div className="space-y-3">
            {recentMovements.map((movement, index) => (
              <div key={movement.id || index} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-700/60 dark:bg-slate-800/40">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{movement.title || movement.type || movement.action || "حركة حوكمة"}</p>
                  <p className="mt-1 text-[10px] font-bold leading-5 text-slate-500">{movement.description || movement.notes || movement.memberName || "سجل حركة مرتبط بدورات المجلس."}</p>
                  {(movement.date || movement.createdAt) && <p className="mt-1 text-[10px] font-black text-slate-400">{formatDate(movement.date || movement.createdAt)}</p>}
                </div>
              </div>
            ))}
            {recentMovements.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs font-bold text-slate-400 dark:border-slate-700">لا توجد حركات حوكمة حديثة.</p>}
          </div>
        </div>
      </div>

      {/* Board composition */}
      <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
        <h2 className="text-sm font-black flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
          <ShieldCheck size={16} className="text-amber-500" /> تركيبة مجلس الإدارة
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {BOARD_ROLES.map(role => {
            const ms = members.filter((member) => getBoardRoleLabel(member) === role);
            const meta = ROLE_META[role] || { icon: "👤", color: "slate" };
            return (
              <div key={role} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-center">
                <div className="text-2xl mb-2">{meta.icon}</div>
                <div className={clsx("text-[11px] font-black mb-2", `text-${meta.color}-600 dark:text-${meta.color}-400`)}>{role}</div>
                <div className="space-y-1">
                  {ms.map(m => (
                    <div key={m.id} onClick={() => openEmployeeModal(m)} className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-amber-600 cursor-pointer">
                      {m.name || "—"}
                    </div>
                  ))}
                  {ms.length === 0 && <div className="text-[10px] text-slate-400">شاغر</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ERB – وثيقة السجل الإلكتروني (مدمجة في اللوحة) */}
      <div className={clsx("p-5 rounded-2xl border shadow-sm bg-gradient-to-br from-amber-500/5 to-transparent", T.card)}>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-2xl shadow-md shrink-0">⚖️</div>
          <div className="text-center sm:text-right">
            <h3 className="text-sm font-black text-amber-600 dark:text-amber-500">السجل الإلكتروني الرسمي — ERB</h3>
            <p className="text-[10px] font-bold text-slate-400 mt-1">جميع القرارات الواردة أدناه معتمدة وموثقة رسمياً. الدورة النقابية من {activeTerm?.startDate || BOARD_TERM_START} إلى {activeTerm?.endDate || BOARD_TERM_END}</p>
          </div>
          <div className="sm:mr-auto flex gap-2">
            <button
              onClick={() => printBoardMeetingsReport({ meetings, members: allEmployees })}
              className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 text-[10px] font-black hover:bg-amber-500/20 transition-all flex items-center gap-1"
            >
              <Printer size={12} /> طباعة
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1"><Download size={12} /> تصدير</button>
          </div>
        </div>

        {/* Decisions log */}
        <h4 className="text-[11px] font-black text-slate-500 mb-3 uppercase tracking-wide">سجل القرارات الرسمية المُصادق عليها</h4>
        <div className="relative border-r-2 border-amber-200 dark:border-amber-900/50 pr-5 space-y-4 mr-2">
          {meetings.filter(m => m.status === "held").map(meeting =>
            meeting.decisions?.length ? (
              <div key={meeting.id} className="relative">
                <span className="absolute -right-[25px] top-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 bg-amber-500" />
                <p className="text-[10px] font-bold text-slate-400 mb-1">{formatDate(meeting.date)} • {meeting.title}</p>
                <div className="space-y-1.5">
                  {meeting.decisions.map((d, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                      <p className="text-[11px] font-black text-slate-700 dark:text-slate-200 mb-1.5">{d.text}</p>
                      <div className="flex gap-3 text-[9px] font-bold">
                        <span className="text-emerald-600">✓ موافق: {d.votes?.for ?? 0}</span>
                        <span className="text-rose-600">✗ معارض: {d.votes?.against ?? 0}</span>
                        <span className="text-slate-400">○ ممتنع: {d.votes?.abstain ?? 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          )}
          {!meetings.some(m => m.status === "held" && m.decisions?.length) && (
            <p className="text-xs font-bold text-slate-400">لا توجد قرارات مسجلة بعد</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// §4  تبويب الأعضاء (Members) — محافظ على الربط الأصلي
// ═══════════════════════════════════════════════════════════════

function MembersTab({
  members,
  meetings,
  allEmployees,
  activeTerm,
  T,
  openEmployeeModal,
}) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const heldMeetings = useMemo(
    () => meetings.filter((meeting) => meeting.status === "held"),
    [meetings]
  );
  const memberVotesMap = useMemo(() => {
    const votesMap = new Map();
    heldMeetings.forEach((meeting) => {
      const attendees = getMeetingAttendeeIds(meeting);
      const decisionsCount = meeting.decisions?.length || 0;
      attendees.forEach((memberId) => {
        const previous = votesMap.get(memberId) || { attendedMeetings: 0, voteCount: 0 };
        votesMap.set(memberId, {
          attendedMeetings: previous.attendedMeetings + 1,
          voteCount: previous.voteCount + decisionsCount,
        });
      });
    });
    return votesMap;
  }, [heldMeetings]);
  const employeesMap = useMemo(
    () => new Map((allEmployees || []).map((employee) => [employee.id, employee])),
    [allEmployees]
  );
  const filtered = members.filter((member) => {
    const matchFilter =
      filter === "all"
        ? true
        : filter === "active"
          ? isActiveMember(member)
          : filter === "inactive"
            ? !isActiveMember(member)
            : getBoardRoleLabel(member) === filter;
    const matchSearch =
      !search ||
      (member.name || "").includes(search) ||
      (getBoardRoleLabel(member) || "").includes(search);
    return matchFilter && matchSearch;
  });
  const activeCount = members.filter((member) => isActiveMember(member)).length;
  const totalMemberVotes = members.reduce((sum, member) => {
    const stats = memberVotesMap.get(member.id);
    return sum + Number(stats?.voteCount || 0);
  }, 0);
  const termStart = activeTerm?.startDate || BOARD_TERM_START;
  const termEnd = activeTerm?.endDate || BOARD_TERM_END;
  const termDurationLabel = getDurationLabel(termStart, termEnd);
  const getMemberRetirementFromProfile = useCallback((member = {}) => {
    const primaryProfile = employeesMap.get(member.id) || {};
    const legalRetirement =
      getRetirementDate(primaryProfile) ||
      getRetirementDate(member) ||
      null;
    return (
      legalRetirement ||
      primaryProfile.retirementDate ||
      primaryProfile.retiredAt ||
      primaryProfile.retireDate ||
      primaryProfile.pensionDate ||
      primaryProfile.membershipExpiry ||
      primaryProfile.membershipEndDate ||
      member.retirementDate ||
      member.retiredAt ||
      member.retireDate ||
      member.pensionDate ||
      member.membershipExpiry ||
      ""
    );
  }, [employeesMap]);
  const averageAttendancePct = members.length && heldMeetings.length
    ? Math.round(
      (members.reduce((sum, member) => sum + Number((memberVotesMap.get(member.id) || {}).attendedMeetings || 0), 0)
        / (members.length * heldMeetings.length))
      * 100
    )
    : 0;

  return (
    <div className="animate-in fade-in duration-500 space-y-4">
      <div className={clsx("p-4 rounded-3xl border shadow-sm bg-gradient-to-l from-teal-50/80 via-white to-white dark:from-teal-900/10 dark:via-slate-900 dark:to-slate-900", T.card)}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-100">الهيكل الرسمي لمجلس الإدارة</h3>
            <p className={clsx("text-[11px] font-bold mt-1", T.muted)}>
              العرض مرتب تلقائيًا حسب الصفة الوظيفية ثم السن من الأكبر إلى الأصغر داخل كل صفة.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="px-3 py-2 rounded-2xl bg-white/80 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-center">
              <div className="text-[10px] font-black text-slate-400">إجمالي المجلس</div>
              <div className="text-lg font-black text-teal-600">{members.length}</div>
            </div>
            <div className="px-3 py-2 rounded-2xl bg-white/80 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-center">
              <div className="text-[10px] font-black text-slate-400">الأعضاء النشطون</div>
              <div className="text-lg font-black text-emerald-600">{activeCount}</div>
            </div>
            <div className="px-3 py-2 rounded-2xl bg-white/80 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-center">
              <div className="text-[10px] font-black text-slate-400">عدد الأصوات</div>
              <div className="text-lg font-black text-amber-600">{totalMemberVotes}</div>
            </div>
            <div className="px-3 py-2 rounded-2xl bg-white/80 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-center">
              <div className="text-[10px] font-black text-slate-400">مدة الدورة</div>
              <div className="text-[11px] font-black text-slate-700 dark:text-slate-200">{termStart}</div>
              <div className="text-[11px] font-black text-slate-400">{termEnd}</div>
              <div className="text-[10px] font-black text-slate-500 mt-1">{termDurationLabel}</div>
            </div>
          </div>
        </div>
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/40">
          <Activity size={12} className="text-sky-600" />
          <span className="text-[10px] font-black text-sky-700 dark:text-sky-300">
            متوسط حضور الأعضاء في الاجتماعات المنعقدة: {averageAttendancePct}%
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-2">
        <h2 className="text-lg font-black flex items-center gap-2"><Users size={20} className="text-teal-500" /> أعضاء مجلس الإدارة</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={clsx(inputCls, "pr-8 py-2 text-xs w-full sm:w-56")} placeholder="بحث بالاسم أو الصفة..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {[
          { key: "all", label: "الكل" },
          { key: "active", label: "نشط" },
          { key: "رئيس المجلس", label: "الرئيس" },
          { key: "الأمين العام", label: "الأمين" },
          { key: "أمين الصندوق", label: "الصندوق" },
          { key: "نائب الرئيس", label: "نائب الرئيس" },
          { key: "عضو مجلس إدارة", label: "أعضاء الإدارة" },
          { key: "عضو مجلس", label: "عضو مجلس" },
          { key: "inactive", label: "غير نشط" },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={clsx("px-3 py-1.5 rounded-full text-[11px] font-black transition-all border",
            filter === f.key ? "bg-teal-500 text-white border-teal-500 shadow-sm" : "bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:border-teal-400 hover:text-teal-600")}>
            {f.label}
          </button>
        ))}
      </div>

      <ResponsiveTable
        data={filtered}
        emptyMessage="لا توجد نتائج مطابقة"
        headers={[
          { label: "العضو والصفة" },
          { label: "الكود" },
          { label: "جهة العمل" },
          { label: "الرقم القومي" },
          { label: "النوع" },
          { label: "تاريخ الالتحاق" },
          { label: "تاريخ الانتهاء" },
          { label: "تاريخ المعاش" },
          { label: "مدة العضوية" },
          { label: "عدد الاجتماعات" },
          { label: "عدد الأصوات" },
          { label: "الحالة", className: "text-center" },
          { label: "ملف", className: "text-left" },
        ]}
        renderDesktopRow={(emp, i) => {
          const effectiveState = getEffectiveMemberState(emp);
          const inactive = !isActiveMember(emp);
          const termStartDate = getMemberTermStartDate(emp, activeTerm);
          const termEndDate = activeTerm?.endDate || BOARD_TERM_END;
          const retirementDate = getMemberRetirementFromProfile(emp);
          const memberDurationLabel = termDurationLabel;
          const voteStats = memberVotesMap.get(emp.id) || { attendedMeetings: 0, voteCount: 0 };
          return (
            <tr onClick={() => openEmployeeModal(emp)} className={clsx("group transition-all cursor-pointer",
              inactive ? "bg-rose-50/20 dark:bg-rose-900/10 hover:bg-rose-50/40" : "hover:bg-teal-500/5")}>
              <td className="p-3.5">
                <div className="flex items-center gap-3">
                  <Avatar member={emp} size="md" idx={i} />
                  <div>
                    <p className={clsx("font-black text-sm", inactive && "line-through opacity-60")}>{emp.name}</p>
                    <p className="text-[10px] font-bold text-amber-600 mt-0.5">{getBoardRoleLabel(emp)}</p>
                  </div>
                </div>
              </td>
              <td className="p-3.5 font-bold text-xs text-slate-500 whitespace-nowrap">{emp.jobId || "—"}</td>
              <td className="p-3.5 font-bold text-xs text-slate-500 max-w-[160px] truncate">{emp.workplace || "—"}</td>
              <td className="p-3.5 font-bold text-xs text-slate-500 whitespace-nowrap" dir="ltr">{emp.nationalId || emp.nationalID || "—"}</td>
              <td className="p-3.5 font-bold text-xs text-slate-500 whitespace-nowrap">{emp.gender || "—"}</td>
              <td className="p-3.5 font-bold text-xs text-slate-500">{formatDateNumeric(termStartDate)}</td>
              <td className="p-3.5 font-bold text-xs text-slate-500">{formatDateNumeric(termEndDate)}</td>
              <td className="p-3.5 font-bold text-xs text-slate-500">{formatDateNumeric(retirementDate)}</td>
              <td className="p-3.5 font-bold text-xs text-slate-600 dark:text-slate-300">{memberDurationLabel}</td>
              <td className="p-3.5 text-center font-black text-xs text-sky-700 dark:text-sky-300">{voteStats.attendedMeetings}</td>
              <td className="p-3.5">
                <div className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 min-w-[68px]">
                  <span className="text-xs font-black leading-none">{voteStats.voteCount}</span>
                </div>
              </td>
              <td className="p-3.5 text-center"><StateBadge state={effectiveState} /></td>
              <td className="p-3.5 text-left">
                <button className="p-1.5 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-teal-600 rounded-lg transition-all"><Eye size={15} /></button>
              </td>
            </tr>
          );
        }}
        renderMobileCard={(emp, i) => {
          const effectiveState = getEffectiveMemberState(emp);
          const inactive = !isActiveMember(emp);
          const termStartDate = getMemberTermStartDate(emp, activeTerm);
          const termEndDate = activeTerm?.endDate || BOARD_TERM_END;
          const retirementDate = getMemberRetirementFromProfile(emp);
          const memberDurationLabel = termDurationLabel;
          const voteStats = memberVotesMap.get(emp.id) || { attendedMeetings: 0, voteCount: 0 };
          return (
            <div onClick={() => openEmployeeModal(emp)} className={clsx("p-4 rounded-2xl border shadow-sm flex gap-3 cursor-pointer hover:shadow-md transition-all", T.card,
              inactive && "border-rose-200 bg-rose-50/20 dark:border-rose-900/50")}>
              <Avatar member={emp} size="lg" idx={i} />
              <div className="flex-1 min-w-0">
                <h3 className={clsx("font-black text-sm leading-tight", inactive && "line-through opacity-60")}>{emp.name}</h3>
                <p className="text-[10px] font-bold text-amber-600 mt-0.5">{getBoardRoleLabel(emp)} • كود {emp.jobId || "—"}</p>
                <p className="text-[10px] text-slate-400 font-bold mt-1">جهة العمل: {emp.workplace || "—"}</p>
                <p className="text-[10px] text-slate-400 font-bold mt-1">الرقم القومي: {emp.nationalId || emp.nationalID || "—"} • النوع: {emp.gender || "—"}</p>
                <p className="text-[10px] text-slate-400 font-bold mt-1">تاريخ الالتحاق: {formatDateNumeric(termStartDate)}</p>
                <p className="text-[10px] text-slate-400 font-bold mt-1">تاريخ الانتهاء: {formatDateNumeric(termEndDate)}</p>
                <p className="text-[10px] text-slate-400 font-bold mt-1">تاريخ المعاش: {formatDateNumeric(retirementDate)}</p>
                <p className="text-[10px] text-slate-500 font-black mt-1">مدة العضوية: {memberDurationLabel}</p>
                <p className="text-[10px] text-sky-600 font-black mt-1">عدد الاجتماعات: {voteStats.attendedMeetings}</p>
                <p className="text-[10px] text-amber-600 font-black mt-1">عدد الأصوات: {voteStats.voteCount}</p>
                <div className="mt-2"><StateBadge state={effectiveState} /></div>
              </div>
              <Eye size={15} className="text-slate-300 mt-1 shrink-0" />
            </div>
          );
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// §5  تبويب الاجتماعات (Meetings) — جديد ومكتمل
// ═══════════════════════════════════════════════════════════════

const EMPTY_MEETING = { title: "", type: "ordinary", date: "", time: "10:00", venue: "", status: "scheduled", agenda: [""], notes: "" };

function MeetingForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...EMPTY_MEETING, ...initial });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addAgendaItem = () => set("agenda", [...(form.agenda || []), ""]);
  const removeAgendaItem = i => set("agenda", form.agenda.filter((_, idx) => idx !== i));
  const updateAgendaItem = (i, v) => set("agenda", form.agenda.map((a, idx) => idx === i ? v : a));

  const valid = form.title?.trim() && form.date;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="عنوان الاجتماع" required>
          <input className={inputCls} placeholder="مثال: الاجتماع العادي الأول 2025" value={form.title} onChange={e => set("title", e.target.value)} />
        </FormField>
        <FormField label="نوع الاجتماع" required>
          <select className={inputCls} value={form.type} onChange={e => set("type", e.target.value)}>
            {Object.entries(MEETING_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </FormField>
        <FormField label="التاريخ" required>
          <ArabicDatePicker label="" value={form.date} onChange={v => set("date", v)} />
        </FormField>
        <FormField label="الوقت">
          <input className={inputCls} type="time" value={form.time} onChange={e => set("time", e.target.value)} />
        </FormField>
        <FormField label="مكان الانعقاد">
          <input className={inputCls} placeholder="مثال: قاعة الاجتماعات الكبرى" value={form.venue} onChange={e => set("venue", e.target.value)} />
        </FormField>
        <FormField label="الحالة">
          <select className={inputCls} value={form.status} onChange={e => set("status", e.target.value)}>
            {Object.entries(MEETING_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </FormField>
      </div>

      {/* Agenda */}
      <FormField label="جدول الأعمال" hint="أضف بنود جدول الأعمال واحدة تلو الأخرى">
        <div className="space-y-2">
          {(form.agenda || []).map((item, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-[11px] font-black text-slate-400 w-5 text-center">{i + 1}</span>
              <input className={clsx(inputCls, "flex-1")} placeholder={`البند ${i + 1}`} value={item} onChange={e => updateAgendaItem(i, e.target.value)} />
              {(form.agenda || []).length > 1 && (
                <button type="button" onClick={() => removeAgendaItem(i)} className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-500 hover:bg-rose-100 transition-all flex items-center justify-center shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addAgendaItem} className="flex items-center gap-1.5 text-[11px] font-black text-amber-600 hover:text-amber-700 mt-1 px-2">
            <Plus size={14} /> إضافة بند
          </button>
        </div>
      </FormField>

      <FormField label="ملاحظات">
        <textarea className={clsx(inputCls, "resize-none")} rows={2} placeholder="أي ملاحظات إضافية..." value={form.notes} onChange={e => set("notes", e.target.value)} />
      </FormField>

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="px-4 py-2 rounded-xl text-xs font-black border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">إلغاء</button>
        <button onClick={() => valid && onSave(form)} disabled={!valid || saving} className={clsx("px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all",
          valid && !saving ? "bg-amber-500 text-white hover:bg-amber-600 shadow-sm shadow-amber-500/20" : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed")}>
          <Save size={13} />{saving ? "جاري الحفظ..." : "حفظ الاجتماع"}
        </button>
      </div>
    </div>
  );
}

function MeetingDetail({ meeting, members, allEmployees, memberships, activeTerm, onUpdate, onDelete, canManage }) {
  const [decisions, setDecisions] = useState(meeting.decisions || []);
  const [attendanceRecords, setAttendanceRecords] = useState(getMeetingAttendanceRecords(meeting));
  const [newDecision, setNewDecision] = useState("");
  const [newDecisionVotes, setNewDecisionVotes] = useState({ for: "", against: "", abstain: "" });
  const [attendees, setAttendees] = useState(getMeetingAttendeeIds(meeting));
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const meetingDate = meeting?.date || "";
  const resolvedTermId = meeting?.termId || activeTerm?.id || "";
  const eligibleMembers = useMemo(() => {
    const covering = getMembersCoveringDate(memberships, allEmployees, resolvedTermId, meetingDate || new Date());
    if (covering.length > 0) return covering;
    const membershipMembers = getEligibleBoardMembersForDate({
      memberships,
      allEmployees,
      members,
      termId: resolvedTermId,
      onDate: meetingDate || new Date(),
    });
    return sortBoardMembers(membershipMembers || []);
  }, [allEmployees, meetingDate, members, memberships, resolvedTermId]);
  const visibleMembers = useMemo(() => {
    const membersMap = new Map((allEmployees || []).map((member) => [member.id, member]));
    const visibleMap = new Map();

    eligibleMembers.forEach((member) => {
      if (member?.id) visibleMap.set(member.id, member);
    });

    attendanceRecords.forEach((record) => {
      if (!record?.memberId || visibleMap.has(record.memberId)) return;
      const employee = membersMap.get(record.memberId) || {};
      visibleMap.set(record.memberId, {
        ...employee,
        id: record.memberId,
        name: record.memberName || employee.name || "—",
        boardRoleTitle: record.role || employee.boardRoleTitle || employee.membershipStatus || "—",
        memberState: record.memberStateAtMeeting || employee.memberState || "—",
        workplace: record.workplace || employee.workplace || "—",
        jobTitle: record.jobTitle || employee.jobTitle || "—",
        boardMembership: { id: record.membershipId, termId: resolvedTermId, role: record.role },
        isHistoricalMember: true,
      });
    });

    attendees.forEach((memberId) => {
      if (visibleMap.has(memberId)) return;
      const employee = membersMap.get(memberId);
      if (!employee) return;
      visibleMap.set(memberId, {
        ...employee,
        boardRoleTitle: employee.boardRoleTitle || employee.membershipStatus || "—",
      });
    });

    return sortBoardMembers(Array.from(visibleMap.values()));
  }, [allEmployees, attendees, attendanceRecords, eligibleMembers, resolvedTermId]);
  const eligibleMemberIds = useMemo(() => eligibleMembers.map((member) => member.id), [eligibleMembers]);
  const presentCount = attendees.length;
  const allSelected = eligibleMembers.length > 0 && eligibleMembers.every((member) => attendees.includes(member.id));

  useEffect(() => {
    setDecisions(meeting.decisions || []);
    setAttendanceRecords(getMeetingAttendanceRecords(meeting));
    setAttendees(getMeetingAttendeeIds(meeting));
    setNewDecision("");
    setNewDecisionVotes({ for: "", against: "", abstain: "" });
  }, [meeting]);

  const persistAttendees = async (updated) => {
    if (!canManage) return;
    try {
      const attendancePayload = await runTransaction(db, async (transaction) => {
        const meetingRef = doc(db, "board_meetings", meeting.id);
        const latestSnapshot = await transaction.get(meetingRef);
        const latestMeeting = latestSnapshot.exists() ? { id: latestSnapshot.id, ...latestSnapshot.data() } : meeting;
        const payload = buildMeetingAttendancePayload({
          selectedMemberIds: updated,
          existingMeeting: latestMeeting,
          eligibleMembers,
          allEmployees,
          termId: resolvedTermId,
          meetingDate: meetingDate || new Date(),
        });
        transaction.update(meetingRef, payload);
        return payload;
      });
      setAttendees(attendancePayload.attendees);
      setAttendanceRecords(attendancePayload.attendanceRecords);
    } catch (e) {
      console.error(e);
      alert(`تعذر حفظ الحضور: ${e.message || "خطأ غير معروف"}`);
    }
  };

  // Toggle attendance
  const toggleAttendee = async (memberId) => {
    const isEligible = eligibleMemberIds.includes(memberId);
    const isAlreadySelected = attendees.includes(memberId);
    if (!isEligible && !isAlreadySelected) return;

    const updated = attendees.includes(memberId) ? attendees.filter(id => id !== memberId) : [...attendees, memberId];
    await persistAttendees(updated);
  };

  const markAllAttendees = async () => {
    await persistAttendees(eligibleMemberIds);
  };

  const clearAllAttendees = async () => {
    await persistAttendees([]);
  };

  // Add decision
  const addDecision = async () => {
    if (!canManage) return;
    if (!newDecision.trim()) return;
    const againstVotes = parseInt(newDecisionVotes.against) || 0;
    const abstainVotes = parseInt(newDecisionVotes.abstain) || 0;
    const explicitForVotes = newDecisionVotes.for === "" ? null : (parseInt(newDecisionVotes.for) || 0);
    const inferredForVotes = explicitForVotes ?? Math.max(presentCount - againstVotes - abstainVotes, 0);
    const totalVotes = inferredForVotes + againstVotes + abstainVotes;

    if (totalVotes > presentCount) {
      alert(`إجمالي الأصوات (${totalVotes}) أكبر من عدد الحاضرين (${presentCount}).`);
      return;
    }

    const d = { text: newDecision.trim(), votes: { for: inferredForVotes, against: againstVotes, abstain: abstainVotes } };
    try {
      const updated = await runTransaction(db, async (transaction) => {
        const meetingRef = doc(db, "board_meetings", meeting.id);
        const snapshot = await transaction.get(meetingRef);
        const latestDecisions = snapshot.exists() && Array.isArray(snapshot.data().decisions) ? snapshot.data().decisions : [];
        const next = [...latestDecisions, d];
        transaction.update(meetingRef, { decisions: next });
        return next;
      });
      setDecisions(updated);
      setNewDecision(""); setNewDecisionVotes({ for: "", against: "", abstain: "" });
    } catch (e) { console.error(e); alert(`تعذر حفظ القرار: ${e.message || "خطأ غير معروف"}`); }
  };

  // Remove decision
  const removeDecision = async (i) => {
    if (!canManage) return;
    try {
      const updated = await runTransaction(db, async (transaction) => {
        const meetingRef = doc(db, "board_meetings", meeting.id);
        const snapshot = await transaction.get(meetingRef);
        const latestDecisions = snapshot.exists() && Array.isArray(snapshot.data().decisions) ? snapshot.data().decisions : [];
        const next = latestDecisions.filter((_, index) => index !== i);
        transaction.update(meetingRef, { decisions: next });
        return next;
      });
      setDecisions(updated);
    } catch (e) { console.error(e); alert(`تعذر حذف القرار: ${e.message || "خطأ غير معروف"}`); }
  };

  // Mark meeting as held
  const markHeld = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "board_meetings", meeting.id), {
        status: "held",
        termId: resolvedTermId,
        attendees,
        attendanceRecords,
      });
      await logAuditEvent("board_meeting_marked_held", {
        meetingId: meeting.id,
        title: meeting.title || "",
        date: meeting.date || "",
      });
      onUpdate();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  return (
    <>
      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)} label={meeting.title}
        onConfirm={async () => { if (!canManage) return; try { await deleteDoc(doc(db, "board_meetings", meeting.id)); await logAuditEvent("board_meeting_deleted", { meetingId: meeting.id, title: meeting.title || "", date: meeting.date || "" }); onDelete(); } catch (e) { console.error(e); } }} />
      <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
        {/* Info header */}
        <div className="flex flex-col sm:flex-row gap-4 p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-200/30 dark:border-amber-800/20">
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <span className={clsx("px-2.5 py-1 rounded-lg text-[10px] font-black border", STATUS_COLORS[meeting.status] || STATUS_COLORS.scheduled)}>{MEETING_STATUSES[meeting.status] || meeting.status}</span>
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{MEETING_TYPES[meeting.type] || meeting.type}</span>
            </div>
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">{meeting.title}</h3>
            <div className="flex flex-wrap gap-4 text-[11px] font-bold text-slate-500">
              <span className="flex items-center gap-1"><CalendarDays size={12} />{formatDate(meeting.date)}</span>
              {meeting.time && <span className="flex items-center gap-1"><Clock size={12} />{meeting.time}</span>}
              {meeting.venue && <span className="flex items-center gap-1"><MapPin size={12} />{meeting.venue}</span>}
            </div>
          </div>
          <div className="flex gap-2 items-start flex-wrap">
            {meeting.status === "scheduled" && (
              <button onClick={markHeld} disabled={saving} className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-emerald-500 text-white hover:bg-emerald-600 transition-all flex items-center gap-1">
                <CheckCircle2 size={12} />{saving ? "..." : "تأكيد الانعقاد"}
              </button>
            )}
            <button
              onClick={() => printBoardMeetingAttendanceReport({ meeting: { ...meeting, attendees, attendanceRecords }, members: allEmployees, sessionAllowance: 75 })}
              className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-200 transition-all flex items-center gap-1"
            >
              <Printer size={12} /> طباعة كشف الحضور
            </button>
            <button onClick={onUpdate} className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 transition-all flex items-center gap-1"><Edit3 size={12} /> تعديل</button>
            <button onClick={() => setDeleteOpen(true)} className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-rose-100 dark:bg-rose-900/30 text-rose-600 hover:bg-rose-200 transition-all flex items-center gap-1"><Trash2 size={12} /> حذف</button>
          </div>
        </div>

        {/* Agenda */}
        {meeting.agenda?.filter(Boolean).length > 0 && (
          <div>
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><FileText size={13} /> جدول الأعمال</h4>
            <div className="space-y-2">
              {meeting.agenda.filter(Boolean).map((item, i) => (
                <div key={i} className="flex gap-2 items-start p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                  <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attendance */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <UserCheck size={13} /> الحضور والغياب
              <span className="font-bold text-emerald-600 normal-case ml-1">{attendees.length}/{eligibleMembers.length} حضر</span>
            </h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={markAllAttendees}
                disabled={eligibleMembers.length === 0 || allSelected}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all flex items-center gap-1",
                  eligibleMembers.length === 0 || allSelected
                    ? "border-slate-200 text-slate-300 cursor-not-allowed"
                    : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                )}
              >
                <CheckCircle2 size={12} /> تحديد كل المجلس
              </button>
              <button
                onClick={clearAllAttendees}
                disabled={attendees.length === 0}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all flex items-center gap-1",
                  attendees.length === 0
                    ? "border-slate-200 text-slate-300 cursor-not-allowed"
                    : "border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100"
                )}
              >
                <UserX size={12} /> إلغاء الكل
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {visibleMembers.map((m, i) => {
              const present = attendees.includes(m.id);
              const selectable = eligibleMemberIds.includes(m.id) || present;
              return (
                <div key={m.id} onClick={() => selectable && toggleAttendee(m.id)} className={clsx("flex items-center gap-3 p-2.5 rounded-xl border transition-all select-none",
                  selectable ? "cursor-pointer" : "opacity-60 cursor-not-allowed",
                  present ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-100" : "bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-800")}>
                  <Avatar member={m} size="sm" idx={i} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 leading-5">{m.name || "—"}</p>
                    <p className="text-[9px] font-bold text-slate-400">{getBoardRoleLabel(m)}</p>
                  </div>
                  <div className={clsx("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                    present ? "bg-emerald-500 border-emerald-500" : "border-slate-300 dark:border-slate-600")}>
                    {present && <CheckCircle2 size={12} className="text-white" />}
                  </div>
                </div>
              );
            })}
          </div>
          {members.length === 0 && <p className="text-xs text-slate-400 font-bold">لا يوجد أعضاء</p>}
        </div>

        {/* Decisions */}
        <div>
          <h4 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Gavel size={13} /> القرارات الصادرة</h4>
          <div className="space-y-2 mb-3">
            {decisions.map((d, i) => (
              <div key={i} className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 group">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex gap-2 items-start flex-1">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <p className="text-[11px] font-black text-slate-700 dark:text-slate-200">{d.text}</p>
                  </div>
                  <button onClick={() => removeDecision(i)} className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-500 hover:bg-rose-200 transition-all flex items-center justify-center shrink-0">
                    <X size={11} />
                  </button>
                </div>
                <div className="flex gap-3 mt-1.5 mr-7 text-[9px] font-bold">
                  <span className="text-emerald-600">✓ موافق: {d.votes?.for ?? 0}</span>
                  <span className="text-rose-600">✗ معارض: {d.votes?.against ?? 0}</span>
                  <span className="text-slate-400">○ ممتنع: {d.votes?.abstain ?? 0}</span>
                </div>
              </div>
            ))}
            {decisions.length === 0 && <p className="text-[11px] text-slate-400 font-bold py-2">لا توجد قرارات مسجلة</p>}
          </div>

          {/* Add decision */}
          <div className="p-3 rounded-xl border border-dashed border-amber-300 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-900/10 space-y-2">
            <textarea className={clsx(inputCls, "resize-none text-[11px]")} rows={2} placeholder="نص القرار الجديد..." value={newDecision} onChange={e => setNewDecision(e.target.value)} />
            <p className="text-[9px] font-black text-slate-500">عدد الحاضرين الحالي: {presentCount}. إذا تُركت خانة "موافق" فارغة فسيتم احتسابها تلقائيًا من الباقي.</p>
            <div className="grid grid-cols-3 gap-2">
              {["for", "against", "abstain"].map(k => (
                <div key={k} className="flex flex-col gap-1">
                  <label className="text-[9px] font-black text-slate-400">{k === "for" ? "موافق" : k === "against" ? "معارض" : "ممتنع"}</label>
                  <input type="number" min="0" className={clsx(inputCls, "text-center py-1.5 text-xs")} value={newDecisionVotes[k]} onChange={e => setNewDecisionVotes(v => ({ ...v, [k]: e.target.value }))} placeholder="0" />
                </div>
              ))}
            </div>
            <button onClick={addDecision} disabled={!newDecision.trim()} className={clsx("w-full py-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition-all",
              newDecision.trim() ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed")}>
              <Plus size={13} /> إضافة قرار
            </button>
          </div>
        </div>

        {meeting.notes && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
            <p className="text-[10px] font-black text-slate-400 mb-1">ملاحظات</p>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{meeting.notes}</p>
          </div>
        )}
      </div>
    </>
  );
}

function MeetingsTab({ members, allEmployees, memberships, activeTerm, meetings, T, canManage }) {
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editMeeting, setEditMeeting] = useState(null);
  const [detailMeeting, setDetailMeeting] = useState(null);
  const [saving, setSaving] = useState(false);

  const filtered = meetings.filter(m => {
    const matchStatus = filterStatus === "all" || m.status === filterStatus;
    const matchType = filterType === "all" || m.type === filterType;
    const matchSearch = !search || (m.title || "").includes(search) || (m.venue || "").includes(search);
    return matchStatus && matchType && matchSearch;
  });

  const heldCount = meetings.filter(m => m.status === "held").length;
  const scheduledCount = meetings.filter(m => m.status === "scheduled").length;
  const totalDecisions = meetings.reduce((sum, meeting) => sum + (meeting.decisions?.length || 0), 0);
  const totalVotes = meetings.reduce((sum, meeting) => sum + getMeetingVotesTotal(meeting), 0);

  const saveMeeting = async (form) => {
    if (!canManage) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        termId: editMeeting?.termId || activeTerm?.id || "",
        agenda: (form.agenda || []).filter(Boolean),
        updatedAt: serverTimestamp(),
      };
      if (editMeeting) {
        await updateDoc(doc(db, "board_meetings", editMeeting.id), payload);
        await logAuditEvent("board_meeting_updated", {
          meetingId: editMeeting.id,
          title: form.title || "",
          date: form.date || "",
          status: form.status || "",
        });
      } else {
        await addDoc(collection(db, "board_meetings"), {
          ...payload,
          decisions: [],
          attendees: [],
          attendanceRecords: [],
          createdAt: serverTimestamp(),
        });
        await logAuditEvent("board_meeting_created", {
          title: form.title || "",
          date: form.date || "",
          status: form.status || "",
        });
      }
      setShowForm(false); setEditMeeting(null);
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const openEdit = (meeting) => { setEditMeeting(meeting); setDetailMeeting(null); setShowForm(true); };

  const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const getMeetingDay = (ds) => { try { const d = new Date(ds); return { day: d.getDate(), month: monthNames[d.getMonth()], year: d.getFullYear() }; } catch { return { day: "?", month: "?", year: "?" }; } };

  return (
    <div className="animate-in fade-in duration-500 space-y-5">
      {/* Form Modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditMeeting(null); }} title={editMeeting ? "تعديل الاجتماع" : "إضافة اجتماع جديد"} size="lg">
        <MeetingForm initial={editMeeting || {}} onSave={saveMeeting} onCancel={() => { setShowForm(false); setEditMeeting(null); }} saving={saving} />
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!detailMeeting} onClose={() => setDetailMeeting(null)} title="تفاصيل الاجتماع" size="lg">
        {detailMeeting && (
          <MeetingDetail meeting={detailMeeting} members={members} allEmployees={allEmployees} memberships={memberships} activeTerm={activeTerm} canManage={canManage} onClose={() => setDetailMeeting(null)}
            onUpdate={() => { setDetailMeeting(null); openEdit(detailMeeting); }}
            onDelete={() => setDetailMeeting(null)} />
        )}
      </Modal>

      <div className={clsx("p-4 rounded-3xl border shadow-sm bg-gradient-to-l from-sky-50/80 via-white to-white dark:from-sky-900/10 dark:via-slate-900 dark:to-slate-900", T.card)}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-100">شاشة الاجتماعات المحسنة</h3>
            <p className={clsx("text-[11px] font-bold mt-1", T.muted)}>
              الدورة الحالية من {formatDate(activeTerm?.startDate || BOARD_TERM_START)} إلى {formatDate(activeTerm?.endDate || BOARD_TERM_END)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black border border-slate-200">
              إجمالي الأصوات: {totalVotes}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-black border border-amber-200">
              إجمالي القرارات: {totalDecisions}
            </span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "إجمالي الاجتماعات", value: meetings.length, color: "text-slate-700 dark:text-slate-200" },
          { label: "منعقد", value: heldCount, color: "text-emerald-600" },
          { label: "مجدول", value: scheduledCount, color: "text-sky-600" },
          { label: "القرارات", value: totalDecisions, color: "text-amber-600" },
          { label: "الأصوات", value: totalVotes, color: "text-violet-600" },
        ].map((s, i) => (
          <div key={i} className={clsx("p-4 rounded-2xl border text-center", T.card)}>
            <div className={clsx("text-3xl font-black", s.color)}>{s.value}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Status filter */}
          {[{ k: "all", l: "الكل" }, { k: "held", l: "منعقد" }, { k: "scheduled", l: "مجدول" }, { k: "cancelled", l: "ملغي" }].map(f => (
            <button key={f.k} onClick={() => setFilterStatus(f.k)} className={clsx("px-3 py-1.5 rounded-full text-[11px] font-black transition-all border",
              filterStatus === f.k ? "bg-amber-500 text-white border-amber-500 shadow-sm" : "bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:border-amber-400 hover:text-amber-600")}>
              {f.l}
            </button>
          ))}
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 hidden sm:block" />
          {/* Type filter */}
          {[{ k: "all", l: "كل الأنواع" }, { k: "ordinary", l: "عادي" }, { k: "emergency", l: "طارئ" }, { k: "annual", l: "سنوي عام" }, { k: "extraordinary", l: "استثنائي" }].map(f => (
            <button key={f.k} onClick={() => setFilterType(f.k)} className={clsx("px-3 py-1.5 rounded-full text-[11px] font-black transition-all border",
              filterType === f.k ? "bg-sky-500 text-white border-sky-500 shadow-sm" : "bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:border-sky-400 hover:text-sky-600")}>
              {f.l}
            </button>
          ))}
        </div>
        <div className="flex gap-2 w-full sm:w-auto items-center">
          <div className="relative flex-1 sm:flex-none">
            <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={clsx(inputCls, "pr-8 py-2 text-xs sm:w-48")} placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button disabled={!canManage} onClick={() => { setEditMeeting(null); setShowForm(true); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black bg-amber-500 text-white hover:bg-amber-600 shadow-sm shadow-amber-500/20 transition-all whitespace-nowrap shrink-0 disabled:opacity-40">
            <Plus size={14} /> اجتماع جديد
          </button>
        </div>
      </div>

      {/* Meetings list */}
      {filtered.length === 0 && (
        <div className="text-center py-16 border-2 border-dashed rounded-2xl">
          <CalendarDays size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="font-black text-slate-400 text-sm">لا توجد اجتماعات</p>
          <p className="text-[11px] text-slate-300 font-bold mt-1">اضغط «اجتماع جديد» للبدء</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(m => {
          const { day, month, year } = getMeetingDay(m.date);
          const eligibleMembersCount = getEligibleBoardMembersForDate({
            memberships,
            allEmployees,
            members,
            termId: m.termId || activeTerm?.id || "",
            onDate: m.date || new Date(),
          }).length;
          const presentCount = getMeetingAttendeeIds(m).length;
          const meetingVotesTotal = getMeetingVotesTotal(m);
          return (
            <div key={m.id} className={clsx("rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden group cursor-pointer", T.card)}
              onClick={() => setDetailMeeting(m)}>
              <div className="flex gap-4 p-4">
                {/* Date box */}
                <div className={clsx("rounded-2xl p-3 text-center shrink-0 flex flex-col items-center justify-center min-w-[84px]",
                  m.status === "held" ? "bg-emerald-500" : m.status === "cancelled" ? "bg-rose-500" : m.status === "postponed" ? "bg-amber-500" : "bg-sky-500")}>
                  <span className="text-white text-2xl font-black leading-none">{day}</span>
                  <span className="text-white/90 text-[10px] font-black mt-1 leading-4 whitespace-normal">{month}</span>
                  <span className="text-white/60 text-[8px] font-bold">{year}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5 items-center mb-1.5">
                    <span className={clsx("px-2 py-0.5 rounded-md text-[9px] font-black border", STATUS_COLORS[m.status] || STATUS_COLORS.scheduled)}>
                      {MEETING_STATUSES[m.status] || m.status}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {MEETING_TYPES[m.type] || m.type}
                    </span>
                    {m.type === "emergency" && <span className="text-rose-500 text-[9px] font-black">🚨 طارئ</span>}
                  </div>
                  <p className="font-black text-sm text-slate-800 dark:text-slate-100 truncate">{m.title}</p>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] font-bold text-slate-400">
                    {m.time && <span className="flex items-center gap-0.5"><Clock size={10} />{m.time}</span>}
                    {m.venue && <span className="flex items-center gap-0.5 truncate max-w-[160px]"><MapPin size={10} />{m.venue}</span>}
                    {m.status === "held" && <span className="flex items-center gap-0.5 text-emerald-600"><UserCheck size={10} />{presentCount}/{eligibleMembersCount} حضر</span>}
                    {m.status === "held" && <span className="flex items-center gap-0.5 text-violet-600"><BarChart3 size={10} />{meetingVotesTotal} صوت</span>}
                  </div>
                </div>

                {/* Right side stats */}
                <div className="text-center shrink-0 hidden sm:flex flex-col items-center justify-center gap-1.5">
                  <div className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 min-w-[68px]">
                    <span className="text-lg font-black leading-none block">{m.decisions?.length || 0}</span>
                    <span className="text-[9px] font-bold">قرار</span>
                  </div>
                  <div className="px-2.5 py-1 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 min-w-[68px]">
                    <span className="text-lg font-black leading-none block">{meetingVotesTotal}</span>
                    <span className="text-[9px] font-bold">صوت</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1 items-end justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={e => e.stopPropagation()}>
                  <button disabled={!canManage} onClick={() => openEdit(m)} className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 hover:bg-amber-200 transition-all flex items-center justify-center disabled:opacity-40">
                    <Edit3 size={13} />
                  </button>
                  <button disabled={!canManage} onClick={async () => { if (!canManage) return; try { await deleteDoc(doc(db, "board_meetings", m.id)); await logAuditEvent("board_meeting_deleted", { meetingId: m.id, title: m.title || "", date: m.date || "" }); } catch (e) { console.error(e); } }}
                    className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-500 hover:bg-rose-200 transition-all flex items-center justify-center">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Agenda preview */}
              {m.agenda?.filter(Boolean).length > 0 && (
                <div className="px-4 pb-3 border-t border-slate-50 dark:border-slate-800/50 pt-2 hidden sm:block">
                  <div className="flex gap-3 flex-wrap">
                    {m.agenda.filter(Boolean).slice(0, 3).map((item, i) => (
                      <div key={i} className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                        <span className="w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-600 text-[8px] font-black flex items-center justify-center">{i + 1}</span>
                        <span className="truncate max-w-[140px]">{item}</span>
                      </div>
                    ))}
                    {m.agenda.filter(Boolean).length > 3 && <span className="text-[10px] font-bold text-slate-400">+{m.agenda.filter(Boolean).length - 3} بنود أخرى</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// §6  تبويب البدلات — مفعّل مع الإضافة والحذف
// ═══════════════════════════════════════════════════════════════

function AllowancesTab({ members, memberships, allEmployees, activeTerm, settlementTransactions, T }) {
  const [subTab, setSubTab] = useState("members");
  const [filterMember, setFilterMember] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const historicalMembers = useMemo(
    () =>
      buildHistoricalBoardMembers({
        memberships,
        allEmployees,
        termId: activeTerm?.id || "",
      }),
    [activeTerm?.id, allEmployees, memberships]
  );
  const rosterMembers = useMemo(() => {
    const baseMembers = historicalMembers.length > 0 ? historicalMembers : members;
    return mergeAllowanceSnapshotMembers(baseMembers, settlementTransactions);
  }, [historicalMembers, members, settlementTransactions]);
  const membersMap = useMemo(
    () => new Map(rosterMembers.map((member) => [member.id, member])),
    [rosterMembers]
  );

  const matchesPeriod = useCallback((dateValue = "") => {
    const monthValue = String(dateValue || "").slice(5, 7);
    const yearValue = String(dateValue || "").slice(0, 4);
    const monthOk = filterMonth === "all" || monthValue === filterMonth;
    const yearOk = filterYear === "all" || yearValue === filterYear;
    return monthOk && yearOk;
  }, [filterMonth, filterYear]);

  const periodYears = useMemo(() => {
    const dates = settlementTransactions.flatMap((tx) => [
      tx.date || "",
      tx.settlementDate || "",
      ...(tx.settlementExpenses || []).map((expense) => expense.date || ""),
    ]);
    return [...new Set(dates.map((value) => String(value || "").slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  }, [settlementTransactions]);

  const settlementAllowanceMap = useMemo(() => {
    const result = {};
    settlementTransactions
      .filter((t) => t.isSettled)
      .forEach((tx) => {
        (tx.settlementExpenses || []).forEach((expense) => {
          if (!matchesPeriod(expense.date || tx.settlementDate || tx.date || "")) return;
          const allowanceKey =
            expense.category === "بدل انتقال"
              ? "travel"
              : expense.category === "بدل جلسات"
                ? "sessions"
                : ["ضيافة وبوفيه", "بدل ضيافة"].includes(expense.category)
                  ? "hospitality"
                  : null;

          if (!allowanceKey || !Array.isArray(expense.boardMembers) || expense.boardMembers.length === 0) return;

          const perMember = Number(expense.allowancePerMember || 0) || (Number(expense.amount || 0) / expense.boardMembers.length);
          expense.boardMembers.forEach((memberId) => {
            if (!result[memberId]) result[memberId] = { travel: 0, sessions: 0, hospitality: 0 };
            result[memberId][allowanceKey] += perMember;
          });
        });
      });
    return result;
  }, [matchesPeriod, settlementTransactions]);

  const memberRows = rosterMembers.map((m) => {
    const allowances = settlementAllowanceMap[m.id] || { travel: 0, sessions: 0, hospitality: 0 };
    const total = Number(allowances.sessions || 0) + Number(allowances.travel || 0) + Number(allowances.hospitality || 0);
    return { member: m, allowances, total };
  }).sort((a, b) => compareBoardMembers(a.member, b.member));

  const detailedRows = settlementTransactions
    .filter((t) => t.isSettled)
    .flatMap((tx) =>
      (tx.settlementExpenses || [])
        .filter((expense) => ["بدل انتقال", "بدل جلسات", "ضيافة وبوفيه", "بدل ضيافة"].includes(expense.category))
        .filter((expense) => matchesPeriod(expense.date || tx.settlementDate || tx.date || ""))
        .map((expense) => ({
          id: `${tx.id}-${expense.id || expense.category}-${expense.date || tx.settlementDate || tx.date || ""}`,
          category: expense.category === "ضيافة وبوفيه" ? "بدل ضيافة" : expense.category,
          amount: Number(expense.amount || 0),
          perMember: Number(expense.allowancePerMember || 0),
          memberIds: expense.boardMembers || [],
          memberSnapshots: expense.boardMemberSnapshots || [],
          date: expense.date || tx.settlementDate || tx.date || "",
          isMeetingLinked: Boolean(expense.meetingId),
          meetingTitle: expense.meetingTitle || "",
          sourceMode: expense.meetingId
            ? "meeting"
            : expense.category === "بدل انتقال"
              ? "individual_travel"
              : "direct",
          notes: expense.notes || "",
          sourceName: tx.employeeName || tx.party || "تسوية معتمدة",
        }))
    );
  const filteredDetailedRows = useMemo(
    () => detailedRows.filter((row) => filterMember === "all" || row.memberIds.includes(filterMember)),
    [detailedRows, filterMember]
  );
  const getAllowanceSourceLabel = useCallback((row) => {
    if (row.isMeetingLinked) return "مرتبط باجتماع";
    if (row.sourceMode === "individual_travel") return "انتقال فردي / مهمة مستقلة";
    return "بدل مباشر بدون اجتماع";
  }, []);
  const handleDetailedExport = useCallback(() => {
    const rows = filteredDetailedRows.map((row) => ({
      "نوع البدل": row.category,
      "مصدر البدل": getAllowanceSourceLabel(row),
      "الاجتماع": row.meetingTitle || "",
      "الأعضاء": row.memberIds
        .map((id) => {
          const member =
            membersMap.get(id) ||
            row.memberSnapshots.find((snapshot) => snapshot.memberId === id);
          return member?.name || "عضو";
        })
        .join("، "),
      "تاريخ التسوية": formatDate(row.date),
      "إجمالي البند": Number(row.amount || 0),
      "نصيب العضو": Number(row.perMember || 0),
      "البيان": row.notes || row.sourceName || "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 18 },
      { wch: 24 },
      { wch: 24 },
      { wch: 42 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 36 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "بدلات المجلس");
    XLSX.writeFile(
      wb,
      `بدلات_المجلس_${filterYear === "all" ? "كل_السنوات" : filterYear}_${filterMonth === "all" ? "كل_الشهور" : filterMonth}.xlsx`
    );
  }, [filterMonth, filterYear, filteredDetailedRows, getAllowanceSourceLabel, membersMap]);

  const grandSessionsTotal = memberRows.reduce((s, r) => s + Number(r.allowances.sessions || 0), 0);
  const grandTravelTotal = memberRows.reduce((s, r) => s + Number(r.allowances.travel || 0), 0);
  const grandHospitalityTotal = memberRows.reduce((s, r) => s + Number(r.allowances.hospitality || 0), 0);
  const grandTotal = grandSessionsTotal + grandTravelTotal + grandHospitalityTotal;

  return (
    <div className="animate-in fade-in duration-500 space-y-5">
      <div className={clsx("p-4 rounded-3xl border flex flex-wrap items-center gap-3 bg-gradient-to-l from-amber-50/80 to-white dark:from-amber-900/10 dark:to-slate-900", T.card)}>
        <span className="text-[11px] font-black text-slate-400 flex items-center gap-1"><Filter size={12} /> الفترة:</span>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className={clsx(inputCls, "w-auto py-1.5 text-xs min-w-[110px]")}>
          <option value="all">كل الشهور</option>
          {ARABIC_MONTHS.map((month, idx) => (
            <option key={month} value={String(idx + 1).padStart(2, "0")}>{month}</option>
          ))}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className={clsx(inputCls, "w-auto py-1.5 text-xs min-w-[95px]")}>
          <option value="all">كل السنوات</option>
          {periodYears.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
        <select className={clsx(inputCls, "w-auto py-1.5 text-xs min-w-[130px]")} value={filterMember} onChange={e => setFilterMember(e.target.value)}>
          <option value="all">كل الأعضاء</option>
          {rosterMembers.map(m => <option key={m.id} value={m.id}>{m.name || "—"}</option>)}
        </select>
        <span className="px-2.5 py-1 rounded-lg bg-amber-100/80 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-[10px] font-black border border-amber-200 dark:border-amber-800/40">
          تعرض البدلات المعتمدة من التسويات فقط
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "بدل الجلسات", value: grandSessionsTotal, color: "text-sky-600" },
          { label: "بدل الانتقال", value: grandTravelTotal, color: "text-indigo-600" },
          { label: "بدل الضيافة", value: grandHospitalityTotal, color: "text-emerald-600" },
          { label: "الإجمالي المعتمد", value: grandTotal, color: "text-amber-600" },
        ].map((s, i) => (
          <div key={i} className={clsx("p-4 rounded-2xl border text-center", T.card)}>
            <div className={clsx("text-xl font-black", s.color)}>{formatMoney(s.value)}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className={clsx("p-3 rounded-2xl border flex flex-wrap items-center gap-2 text-[10px] font-black", T.card)}>
        <span className="text-slate-400">تمييز مصدر البدل:</span>
        <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200">مرتبط باجتماع</span>
        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">انتقال فردي / مهمة مستقلة</span>
        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">بدل مباشر بدون اجتماع</span>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {[
            { k: "members", l: "👥 حسب العضو" },
            { k: "details", l: "🧾 سجل البدلات" },
            { k: "summary", l: "📊 ملخص" },
          ].map(t => (
            <button key={t.k} onClick={() => setSubTab(t.k)} className={clsx("px-3 py-1.5 rounded-xl text-[11px] font-black transition-all border",
              subTab === t.k ? "bg-amber-500 text-white border-amber-500 shadow-sm" : "bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:border-amber-400 hover:text-amber-600")}>
              {t.l}
            </button>
          ))}
        </div>
        {subTab === "details" && (
          <button
            onClick={handleDetailedExport}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-amber-600 hover:border-amber-400 transition-all"
          >
            <Download size={13} /> تصدير
          </button>
        )}
      </div>

      {subTab === "members" && (
        <div className={clsx("rounded-2xl border shadow-sm overflow-hidden", T.card)}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <th className="p-3.5 text-right text-[10px] font-black text-slate-500 uppercase tracking-wide">العضو</th>
                  <th className="p-3.5 text-center text-[10px] font-black text-slate-500 uppercase tracking-wide">بدل الجلسات</th>
                  <th className="p-3.5 text-center text-[10px] font-black text-slate-500 uppercase tracking-wide">بدل الانتقال</th>
                  <th className="p-3.5 text-center text-[10px] font-black text-slate-500 uppercase tracking-wide">بدل الضيافة</th>
                  <th className="p-3.5 text-center text-[10px] font-black text-slate-500 uppercase tracking-wide">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {memberRows.filter((r) => filterMember === "all" || r.member.id === filterMember).map((r, i) => (
                  <tr key={r.member.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-amber-500/3 transition-colors">
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar member={r.member} size="sm" idx={i} />
                        <div>
                          <p className="font-black text-xs text-slate-800 dark:text-slate-100">{r.member.name}</p>
                          <p className="text-[9px] font-bold text-slate-400">{getBoardRoleLabel(r.member)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 text-center text-xs font-bold text-sky-600">{formatMoney(r.allowances.sessions || 0)}</td>
                    <td className="p-3.5 text-center text-xs font-bold text-indigo-600">{formatMoney(r.allowances.travel || 0)}</td>
                    <td className="p-3.5 text-center text-xs font-bold text-emerald-600">{formatMoney(r.allowances.hospitality || 0)}</td>
                    <td className="p-3.5 text-center font-black text-base text-amber-600">{formatMoney(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-amber-50 dark:bg-amber-900/10 border-t-2 border-amber-200 dark:border-amber-800/30">
                  <td className="p-3.5 font-black text-xs text-slate-700 dark:text-slate-200">الإجمالي</td>
                  <td className="p-3.5 text-center font-black text-xs text-sky-600">{formatMoney(grandSessionsTotal)}</td>
                  <td className="p-3.5 text-center font-black text-xs text-indigo-600">{formatMoney(grandTravelTotal)}</td>
                  <td className="p-3.5 text-center font-black text-xs text-emerald-600">{formatMoney(grandHospitalityTotal)}</td>
                  <td className="p-3.5 text-center font-black text-lg text-amber-600">{formatMoney(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {subTab === "details" && (
        <div className={clsx("rounded-2xl border shadow-sm overflow-hidden", T.card)}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <th className="p-3.5 text-right text-[10px] font-black text-slate-500 uppercase">البدل</th>
                  <th className="p-3.5 text-right text-[10px] font-black text-slate-500 uppercase">أعضاء المجلس</th>
                  <th className="p-3.5 text-center text-[10px] font-black text-slate-500 uppercase">تاريخ التسوية</th>
                  <th className="p-3.5 text-center text-[10px] font-black text-slate-500 uppercase">إجمالي البند</th>
                  <th className="p-3.5 text-center text-[10px] font-black text-slate-500 uppercase">نصيب العضو</th>
                  <th className="p-3.5 text-right text-[10px] font-black text-slate-500 uppercase">البيان</th>
                </tr>
              </thead>
              <tbody>
                {filteredDetailedRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-emerald-500/3 transition-colors">
                    <td className="p-3.5">
                      <div className="space-y-1">
                        <div className="font-black text-xs text-slate-800 dark:text-slate-100">{row.category}</div>
                        <div className="flex flex-wrap gap-1">
                          {row.isMeetingLinked ? (
                            <span className="px-2 py-0.5 rounded-lg bg-sky-50 text-[9px] font-black text-sky-700 border border-sky-200">
                              مرتبط باجتماع
                            </span>
                          ) : row.sourceMode === "individual_travel" ? (
                            <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-[9px] font-black text-indigo-700 border border-indigo-200">
                              انتقال فردي
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-[9px] font-black text-slate-600 border border-slate-200">
                              بدل مباشر
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {row.memberIds.map((id) => {
                          const member =
                            membersMap.get(id) ||
                            row.memberSnapshots.find((snapshot) => snapshot.memberId === id);
                          return <span key={id} className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-black text-slate-600 dark:text-slate-300">{member?.name || "عضو"}</span>;
                        })}
                      </div>
                    </td>
                    <td className="p-3.5 text-center text-xs font-bold text-slate-500">{formatDate(row.date)}</td>
                    <td className="p-3.5 text-center font-black text-base text-amber-600">{formatMoney(row.amount)}</td>
                    <td className="p-3.5 text-center text-xs font-bold text-slate-600 dark:text-slate-300">{formatMoney(row.perMember || 0)}</td>
                    <td className="p-3.5 text-[11px] text-slate-400 font-bold max-w-[220px]">
                      <div className="space-y-1">
                        <div className="truncate">{row.notes || row.sourceName}</div>
                        {row.meetingTitle ? (
                          <div className="text-[9px] text-sky-600 font-black truncate">الاجتماع: {row.meetingTitle}</div>
                        ) : row.sourceMode === "individual_travel" ? (
                          <div className="text-[9px] text-indigo-600 font-black truncate">مهمة أو انتقال مستقل لعضو/أعضاء محددين</div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-50 dark:bg-emerald-900/10 border-t-2 border-emerald-200 dark:border-emerald-800/30">
                  <td className="p-3.5 font-black text-xs text-slate-700 dark:text-slate-200" colSpan={3}>الإجمالي المعتمد من التسويات</td>
                  <td className="p-3.5 text-center font-black text-lg text-emerald-600">{formatMoney(filteredDetailedRows.reduce((s, row) => s + row.amount, 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {subTab === "summary" && (
        <div className="space-y-3">
          {rosterMembers.map((m, i) => {
            const memberRow = memberRows.find(r => r.member.id === m.id);
            const meetTotal = memberRow?.allowances.sessions || 0;
            const travelTotal = memberRow?.allowances.travel || 0;
            const hospitalityTotal = memberRow?.allowances.hospitality || 0;
            const memberGrandTotal = meetTotal + travelTotal + hospitalityTotal;
            return (
              <div key={m.id} className={clsx("p-4 rounded-2xl border shadow-sm", T.card)}>
                <div className="flex items-center gap-3 mb-3">
                  <Avatar member={m} size="md" idx={i} />
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm text-slate-800 dark:text-slate-100 truncate">{m.name}</p>
                    <p className="text-[10px] font-bold text-amber-600">{getBoardRoleLabel(m)}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-xl font-black text-amber-600">{formatMoney(memberGrandTotal)}</div>
                    <div className="text-[9px] font-bold text-slate-400 text-left">إجمالي معتمد</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { l: "بدل الجلسات", v: meetTotal, c: "text-sky-600" },
                    { l: "بدل الانتقال", v: travelTotal, c: "text-indigo-600" },
                    { l: "بدل الضيافة", v: hospitalityTotal, c: "text-emerald-600" },
                  ].map((s, j) => (
                    <div key={j} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-center">
                      <div className={clsx("font-black text-sm", s.c)}>{formatMoney(s.v)}</div>
                      <div className="text-[9px] font-bold text-slate-400 mt-0.5">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// §7  تبويب التقارير (محافظ على الربط الأصلي + تحسين)
// ═══════════════════════════════════════════════════════════════

function ReportsTab({ members, meetings, memberships, allEmployees, settlementTransactions, activeTerm, T }) {
  const heldMeetings = meetings.filter(m => m.status === "held");
  const termEnd = parseBoardDate(activeTerm?.endDate || BOARD_TERM_END);
  const termStart = parseBoardDate(activeTerm?.startDate || BOARD_TERM_START);
  const termDaysLeft = termEnd ? Math.max(0, Math.floor((termEnd - new Date()) / (1000 * 60 * 60 * 24))) : 0;
  const termTotalDays = termStart && termEnd ? Math.max(1, Math.ceil((termEnd - termStart) / (1000 * 60 * 60 * 24))) : 1;
  const settlementAllowanceTotal = getSettlementAllowanceTotal(settlementTransactions);
  const historicalMembers = buildHistoricalBoardMembers({
    memberships,
    allEmployees,
    termId: activeTerm?.id || "",
  });
  const rosterMembers = mergeAllowanceSnapshotMembers(
    historicalMembers.length > 0 ? historicalMembers : members,
    settlementTransactions
  );
  const allowanceRows = rosterMembers.map((member) => {
    const totals = { sessions: 0, travel: 0, hospitality: 0 };
    settlementTransactions
      .filter((transaction) => transaction.isSettled)
      .forEach((transaction) => {
        (transaction.settlementExpenses || []).forEach((expense) => {
          if (!Array.isArray(expense.boardMembers) || !expense.boardMembers.includes(member.id)) return;
          const perMember = Number(expense.allowancePerMember || 0) || (
            Number(expense.amount || 0) / Math.max(expense.boardMembers.length || 1, 1)
          );
          if (expense.category === "بدل جلسات") totals.sessions += perMember;
          if (expense.category === "بدل انتقال") totals.travel += perMember;
          if (["ضيافة وبوفيه", "بدل ضيافة"].includes(expense.category)) totals.hospitality += perMember;
        });
      });

    return {
      member,
      allowances: totals,
      total: totals.sessions + totals.travel + totals.hospitality,
    };
  });
  let totalAttendancePct = 0;
  if (heldMeetings.length > 0) {
    const totalPresent = heldMeetings.reduce((acc, meeting) => acc + getMeetingAttendeeIds(meeting).length, 0);
    const totalEligible = heldMeetings.reduce((acc, meeting) => {
      return acc + getEligibleBoardMembersForDate({
        memberships,
        allEmployees,
        members: rosterMembers,
        termId: meeting.termId || activeTerm?.id || "",
        onDate: meeting.date || new Date(),
      }).length;
    }, 0);
    totalAttendancePct = totalEligible > 0 ? Math.round((totalPresent / totalEligible) * 100) : 0;
  }

  return (
    <div className="animate-in fade-in duration-500 space-y-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-black flex items-center gap-2"><BarChart3 size={20} className="text-purple-500" /> التقارير والإحصاءات</h2>
        <button
          onClick={() => printBoardOverview({ members: rosterMembers, meetings, allowances: allowanceRows, termStart: activeTerm?.startDate || BOARD_TERM_START, termEnd: activeTerm?.endDate || BOARD_TERM_END })}
          className="px-3 py-1.5 rounded-xl text-[11px] font-black border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-amber-600 hover:border-amber-400 transition-all flex items-center gap-1"
        >
          <Printer size={13} /> طباعة
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            title: "كشف التشكيل الرسمي",
            desc: "يتضمن الأسماء الكاملة والصفات والحالة الإدارية.",
            action: () => printBoardOverview({ members: rosterMembers, meetings, allowances: allowanceRows, termStart: activeTerm?.startDate || BOARD_TERM_START, termEnd: activeTerm?.endDate || BOARD_TERM_END }),
          },
          {
            title: "سجل الاجتماعات والقرارات",
            desc: "تقرير مطبوع للاجتماعات المنعقدة والحاضرين والقرارات.",
            action: () => printBoardMeetingsReport({ meetings, members: allEmployees }),
          },
          {
            title: "تقرير البدلات المعتمدة",
            desc: "يعرض الجلسات والانتقال والضيافة من التسويات فقط.",
            action: () => printBoardAllowancesReport({ allowances: allowanceRows, termStart: activeTerm?.startDate || BOARD_TERM_START, termEnd: activeTerm?.endDate || BOARD_TERM_END }),
          },
        ].map((report) => (
          <button
            key={report.title}
            onClick={report.action}
            className={clsx("p-4 rounded-2xl border shadow-sm text-right transition-all hover:-translate-y-0.5 hover:shadow-md", T.card)}
          >
            <div className="text-sm font-black text-slate-800 dark:text-slate-100">{report.title}</div>
            <div className="text-[11px] font-bold text-slate-400 mt-1">{report.desc}</div>
            <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-black text-amber-600"><Printer size={13} /> طباعة</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={clsx("p-5 rounded-2xl border shadow-sm text-center", T.card)}>
          <div className="text-[11px] font-black text-slate-400 mb-2">أيام متبقية للولاية</div>
          <div className="text-5xl font-black text-amber-500">{termDaysLeft.toLocaleString("ar-EG")}</div>
          <div className="text-[10px] font-bold text-slate-400 mt-2">حتى {activeTerm?.endDate || BOARD_TERM_END}</div>
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${Math.max(0, 100 - (termDaysLeft / termTotalDays) * 100)}%` }} />
          </div>
        </div>
        <div className={clsx("p-5 rounded-2xl border shadow-sm text-center", T.card)}>
          <div className="text-[11px] font-black text-slate-400 mb-2">متوسط الحضور العام</div>
          <div className={clsx("text-5xl font-black", totalAttendancePct >= 80 ? "text-emerald-500" : totalAttendancePct >= 60 ? "text-amber-500" : "text-rose-500")}>{totalAttendancePct}%</div>
          <div className="text-[10px] font-bold text-slate-400 mt-2">لجميع الاجتماعات المنعقدة</div>
        </div>
        <div className={clsx("p-5 rounded-2xl border shadow-sm text-center", T.card)}>
          <div className="text-[11px] font-black text-slate-400 mb-2">معدل الإنجاز</div>
          <div className="text-5xl font-black text-sky-500">{heldMeetings.length}/{meetings.length}</div>
          <div className="text-[10px] font-bold text-slate-400 mt-2">اجتماعات منفذة من المجدول</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
          <h3 className="text-xs font-black mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">توزيع الأعضاء حسب التخصص</h3>
          <div className="space-y-3">
            {Object.entries(members.reduce((acc, m) => { acc[m.specialization || "غير محدد"] = (acc[m.specialization || "غير محدد"] || 0) + 1; return acc; }, {}))
              .sort((a, b) => b[1] - a[1]).map(([spec, count]) => (
                <div key={spec} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 w-28 truncate">{spec}</span>
                  <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(count / Math.max(members.length, 1)) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-black text-purple-600 w-5 text-right">{count}</span>
                </div>
              ))}
            {members.length === 0 && <p className="text-xs font-bold text-slate-400">لا توجد بيانات</p>}
          </div>
        </div>

        <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
          <h3 className="text-xs font-black mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">مؤشرات الأداء الرئيسية (KPIs)</h3>
          <div className="space-y-3">
            {[
              { label: "متوسط القرارات لكل اجتماع", value: heldMeetings.length ? (meetings.reduce((s, m) => s + (m.decisions?.length || 0), 0) / heldMeetings.length).toFixed(1) : 0, color: "text-blue-500", icon: "📋" },
              { label: "نسبة تحقيق النصاب القانوني", value: "100%", color: "text-green-500", icon: "✅" },
              { label: "الأعضاء النشطون", value: `${members.filter((member) => isActiveMember(member)).length}/${members.length}`, color: "text-amber-500", icon: "👤" },
              { label: "إجمالي البدلات المصروفة", value: formatMoney(settlementAllowanceTotal), color: "text-violet-500", icon: "💰" },
            ].map((kpi, i) => (
              <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2"><span className="text-base">{kpi.icon}</span><span className="text-[11px] font-bold">{kpi.label}</span></div>
                <div className={clsx("text-sm font-black", kpi.color)}>{kpi.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// §8  المكون الرئيسي BoardDashboard
// ═══════════════════════════════════════════════════════════════

export default function BoardDashboard() {
  const T = useT();
  const { can } = useAuth();
  const canManageBoard = can(PERMISSIONS.boardManage);
  const canEditEmployees = can(PERMISSIONS.employeesEdit);
  const { openEmployeeModal } = useEmployeeModal();
  const [activeTab, setActiveTab] = useState("dashboard");
  const lifecycleSyncRef = useRef(new Set());

  const [allEmployees, setAllEmployees] = useState([]);
  const [boardTerms, setBoardTerms] = useState([]);
  const [boardMemberships, setBoardMemberships] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [issuedChecks, setIssuedChecks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { candidates: boardCandidates, movements: boardMovements, benefits: boardBenefits } = useBoardElectionSubscriptions();

  useEffect(() => {
    let empOk = false, termOk = false, membershipOk = false, meetOk = false, checksOk = false, txOk = false;
    const check = () => { if (empOk && termOk && membershipOk && meetOk && checksOk && txOk) setLoading(false); };

    const unsubEmp = onSnapshot(
      query(collection(db, "employees")),
      snap => { setAllEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() }))); empOk = true; check(); },
      err => { console.error("employees:", err); empOk = true; check(); }
    );

    const unsubTerms = onSnapshot(
      query(collection(db, BOARD_TERMS_COLLECTION)),
      snap => { setBoardTerms(snap.docs.map(d => ({ ...d.data(), id: d.id }))); termOk = true; check(); },
      err => { console.error("board_terms:", err); termOk = true; check(); }
    );

    const unsubMemberships = onSnapshot(
      query(collection(db, BOARD_MEMBERSHIPS_COLLECTION)),
      snap => { setBoardMemberships(snap.docs.map(d => ({ ...d.data(), id: d.id }))); membershipOk = true; check(); },
      err => { console.error("board_memberships:", err); membershipOk = true; check(); }
    );

    const unsubMeet = onSnapshot(
      query(collection(db, "board_meetings"), orderBy("date", "desc")),
      snap => { setMeetings(snap.docs.map(d => ({ id: d.id, ...d.data() }))); meetOk = true; check(); },
      err => { console.error("board_meetings:", err); meetOk = true; check(); }
    );

    const unsubChecks = onSnapshot(
      query(collection(db, "issued_checks"), orderBy("date", "desc")),
      snap => { setIssuedChecks(snap.docs.map(d => ({ id: d.id, ...d.data() }))); checksOk = true; check(); },
      err => { console.error("issued_checks:", err); checksOk = true; check(); }
    );

    const unsubTx = onSnapshot(
      query(collection(db, "transactions"), orderBy("date", "desc")),
      snap => { setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() }))); txOk = true; check(); },
      err => { console.error("transactions:", err); txOk = true; check(); }
    );

    return () => { unsubEmp(); unsubTerms(); unsubMemberships(); unsubMeet(); unsubChecks(); unsubTx(); };
  }, []);

  useEffect(() => {
    if (!canEditEmployees) return;
    allEmployees.forEach((employee) => {
      const updates = getAutomaticMemberLifecycleUpdates(employee);
      if (!updates) return;

      const syncKey = `${employee.id}:${JSON.stringify(updates)}`;
      if (lifecycleSyncRef.current.has(syncKey)) return;

      lifecycleSyncRef.current.add(syncKey);
      updateDoc(doc(db, "employees", employee.id), updates).catch((error) => {
        console.error("employee_lifecycle_sync:", error);
        lifecycleSyncRef.current.delete(syncKey);
      });
    });
  }, [allEmployees, canEditEmployees]);

  const settlementTransactions = useMemo(
    () => mergeIssuedChecksSourcesNormalized(issuedChecks, transactions),
    [issuedChecks, transactions]
  );

  const activeTerm = useMemo(
    () => getActiveBoardTerm(boardTerms, {
      startDate: BOARD_TERM_START,
      endDate: BOARD_TERM_END,
      title: "الدورة الحالية",
      targetSeats: TARGET_BOARD_SIZE,
    }),
    [boardTerms]
  );

  const effectiveBoardMemberships = useMemo(() => {
    if (boardMemberships.length > 0) return boardMemberships;
    return buildLegacyBoardMemberships(allEmployees, activeTerm);
  }, [activeTerm, allEmployees, boardMemberships]);

  const boardMembers = useMemo(
    () => {
      const membershipMembers = buildBoardMemberViewsFromMemberships(effectiveBoardMemberships, allEmployees, {
        termId: activeTerm?.id,
      });
      if (membershipMembers.length > 0) return sortBoardMembers(membershipMembers);
      return sortBoardMembers(allEmployees.filter((employee) => BOARD_ROLES.includes(employee.membershipStatus)));
    },
    [activeTerm?.id, allEmployees, effectiveBoardMemberships]
  );

  const currentBoardMembers = useMemo(
    () => boardMembers.filter((employee) =>
      employee.boardMembership
        ? isBoardMembershipActiveOnDate(employee.boardMembership)
        : isBoardMemberEligible(employee)
    ),
    [boardMembers]
  );

  const boardNavTabs = [
    { id: "dashboard", label: "نظرة عامة", icon: ShieldCheck },
    { id: "members", label: "أعضاء المجلس", icon: Users },
    { id: "terms", label: "الدورات والعضويات", icon: BadgeCheck },
    { id: "elections", label: "الانتخابات والترشيحات", icon: Gavel },
    { id: "benefits", label: "المزايا المالية", icon: Coins },
    { id: "meetings", label: "الاجتماعات", icon: CalendarDays },
    { id: "allowances", label: "البدلات", icon: Coins },
    { id: "reports", label: "التقارير", icon: PieChart },
  ];

  if (loading) return (
    <div className="mx-auto max-w-7xl py-10" dir="rtl">
      <LoadingState title="جاري تحميل بيانات مجلس الإدارة..." rows={5} />
    </div>
  );

  return (
    <div className={clsx("max-w-[1600px] mx-auto pb-20 animate-in fade-in duration-500", T.text)} dir="rtl">
      <PageHeader
        title="مساحة حوكمة مجلس الإدارة"
        hint="الدورات والعضويات والاجتماعات والقرارات في تجربة مؤسسية واحدة"
        icon={getModuleIcon("/board")}
        actions={(
          <div className="flex flex-wrap gap-2">
            {canManageBoard && <Button size="sm" iconStart={BadgeCheck} onClick={() => setActiveTab("terms")}>إدارة الدورات</Button>}
            {canManageBoard && <Button size="sm" variant="secondary" iconStart={CalendarDays} onClick={() => setActiveTab("meetings")}>الاجتماعات</Button>}
            <Button size="sm" variant="outline" iconStart={Printer} onClick={() => setActiveTab("reports")}>التقارير</Button>
          </div>
        )}
      />
      <div className="mb-4" />

      <div className={clsx(
        "px-4 pt-4 pb-0 rounded-[2rem] border shadow-sm mb-5 bg-white dark:bg-slate-900 overflow-hidden",
        T.card
      )}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">تنقلات شاشة مجلس الإدارة</h2>
            <p className={clsx("text-[10px] font-bold mt-0.5", T.muted)}>
              اللجنة النقابية • {currentBoardMembers.length} من {TARGET_BOARD_SIZE} عضو حاليًا • {meetings.filter(m => m.status === "held").length} اجتماعات • مع الاحتفاظ بالأعضاء المنتهية عضويتهم لأغراض التاريخ المالي والإداري
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black text-slate-400">مزامنة مباشرة</span>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto hide-scrollbar pb-px">
          {boardNavTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={clsx(
              "flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-[11px] font-black transition-all whitespace-nowrap border-b-2",
              activeTab === tab.id
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500"
                : "text-slate-500 dark:text-slate-400 border-transparent hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/10"
            )}>
              <tab.icon size={14} />
              <span className="hidden xs:inline sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={clsx("mb-5 rounded-[2rem] border shadow-sm overflow-hidden", T.card)}>
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="p-5 bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.18),_transparent_32%),linear-gradient(135deg,rgba(20,184,166,0.06),rgba(255,255,255,0.86))] dark:bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.14),_transparent_32%),linear-gradient(135deg,rgba(13,148,136,0.12),rgba(15,23,42,0.9))]">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-black border border-amber-200 dark:border-amber-800/40">
                مجلس الإدارة الحالي
              </span>
              <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 text-[10px] font-black border border-sky-200 dark:border-sky-800/40">
                الدورة من {activeTerm?.startDate || BOARD_TERM_START} إلى {activeTerm?.endDate || BOARD_TERM_END}
              </span>
            </div>
            <h1 className="text-2xl font-black text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <ShieldCheck size={24} className="hidden sm:block" /> مجلس الإدارة
            </h1>
            <p className={clsx("text-xs font-bold mt-2 max-w-3xl", T.muted)}>
              الشاشة تعرض التكوين الرسمي للمجلس، محاضر الاجتماعات، والبدلات المعتمدة من التسويات فقط بما فيها بدل الضيافة، مع استبعاد أي بدلات أخرى إلى حين إضافتها لاحقًا.
            </p>
          </div>
          <div className="p-5 border-t xl:border-t-0 xl:border-r border-slate-100 dark:border-slate-800">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 p-4">
                <div className="text-[10px] font-black text-slate-400">أعضاء المجلس</div>
                <div className="text-2xl font-black text-teal-600 mt-1">{currentBoardMembers.length}/{TARGET_BOARD_SIZE}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 p-4">
                <div className="text-[10px] font-black text-slate-400">اجتماعات منعقدة</div>
                <div className="text-2xl font-black text-sky-600 mt-1">{meetings.filter((m) => m.status === "held").length}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 p-4 col-span-2">
                <div className="text-[10px] font-black text-slate-400">بدلات معتمدة من التسويات</div>
                <div className="text-2xl font-black text-emerald-600 mt-1">{formatMoney(getSettlementAllowanceTotal(settlementTransactions))}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── محتوى التبويبات ── */}
      <div className="mt-2">
        {activeTab === "dashboard" && <DashboardTab members={boardMembers} meetings={meetings} allEmployees={allEmployees} settlementTransactions={settlementTransactions} activeTerm={activeTerm} movements={boardMovements} candidates={boardCandidates} T={T} setActiveTab={setActiveTab} openEmployeeModal={openEmployeeModal} />}
        {activeTab === "members" && <MembersTab members={boardMembers} meetings={meetings} allEmployees={allEmployees} activeTerm={activeTerm} T={T} openEmployeeModal={openEmployeeModal} />}
        {activeTab === "terms" && <BoardTermsTab boardTerms={boardTerms} memberships={boardMemberships} candidates={boardCandidates} movements={boardMovements} benefits={boardBenefits} financialDocs={settlementTransactions} allEmployees={allEmployees} activeTerm={activeTerm} T={T} canManage={canManageBoard} openEmployeeModal={openEmployeeModal} />}
        {activeTab === "elections" && <BoardElectionsTab boardTerms={boardTerms} candidates={boardCandidates} memberships={boardMemberships} movements={boardMovements} allEmployees={allEmployees} activeTerm={activeTerm} T={T} canManage={canManageBoard} />}
        {activeTab === "benefits" && <BoardBenefitsTab boardTerms={boardTerms} memberships={boardMemberships} allEmployees={allEmployees} settlementTransactions={settlementTransactions} manualBenefits={boardBenefits} activeTerm={activeTerm} T={T} canManage={canManageBoard} />}
        {activeTab === "meetings" && <MeetingsTab members={boardMembers} allEmployees={allEmployees} memberships={effectiveBoardMemberships} activeTerm={activeTerm} meetings={meetings} T={T} canManage={canManageBoard} />}
        {activeTab === "allowances" && <AllowancesTab members={boardMembers} memberships={effectiveBoardMemberships} allEmployees={allEmployees} activeTerm={activeTerm} settlementTransactions={settlementTransactions} T={T} />}
        {activeTab === "reports" && <ReportsTab members={boardMembers} meetings={meetings} memberships={effectiveBoardMemberships} allEmployees={allEmployees} settlementTransactions={settlementTransactions} activeTerm={activeTerm} T={T} />}
      </div>
    </div>
  );
}
