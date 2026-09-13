import { createElement, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  Activity,
  AlertTriangle,
  Banknote,
  CalendarDays,
  ChevronLeft,
  FileText,
  Landmark,
  LayoutDashboard,
  PlusCircle,
  ReceiptText,
  ShieldCheck,
  UploadCloud,
  UserCircle,
  Users,
  Wallet,
} from "lucide-react";
import clsx from "clsx";
import { db } from "../../app/providers/FirebaseProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { useEmployeeModal } from "../../app/providers/GlobalEmployeeModal";
import { formatMoney } from "../../utils/numberFormat";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  StatCard,
  StatusBadge,
} from "../../ui/enterprise";
import {
  getIssuedCheckDisplayParty,
  getIssuedCheckTypeLabel,
  mergeIssuedChecksSourcesNormalized,
  normalizeRequiresSettlement,
} from "../treasury/helpers/issuedChecks";
import { TREASURY_OPENING_BALANCE as OPENING_BALANCE } from "../treasury/helpers/financeLedger";

const DIRECT_LEDGER_TYPES = ["deposit", "refund", "subs", "bank_charge"];
const BOARD_ROLES = ["رئيس المجلس", "الأمين العام", "أمين الصندوق", "عضو مجلس إدارة"];
const ROLE_ORDER = { "رئيس المجلس": 1, "الأمين العام": 2, "أمين الصندوق": 3, "عضو مجلس إدارة": 4 };

function useCollectionSubscription(enabled, collectionName, queryOptions, onData) {
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      const disabledTimer = window.setTimeout(() => {
        setLoading(false);
        setError("");
        onData([]);
      }, 0);

      return () => window.clearTimeout(disabledTimer);
    }

    const loadingTimer = window.setTimeout(() => {
      setLoading(true);
    }, 0);
    const constraints = queryOptions || [];
    const ref = constraints.length
      ? query(collection(db, collectionName), ...constraints)
      : query(collection(db, collectionName));

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        onData(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error(`${collectionName}:`, err);
        onData([]);
        setLoading(false);
        setError(err?.message || "تعذر تحميل البيانات");
      }
    );

    return () => {
      window.clearTimeout(loadingTimer);
      unsubscribe();
    };
  }, [collectionName, enabled, onData, queryOptions]);

  return { loading, error };
}

function formatDateTime(value) {
  if (!value) return "بدون تاريخ";
  const raw = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(raw.getTime())) return String(value);
  return raw.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
}

function isPosted(tx) {
  return tx.state === "posted" || tx.state === "approved" || !tx.state;
}

function getDateKey(value) {
  if (!value) return "";
  const raw = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(raw.getTime())) return String(value);
  return raw.toISOString().slice(0, 10);
}

function buildMonthBuckets(transactions) {
  const buckets = new Map();

  transactions.filter(isPosted).forEach((tx) => {
    const dateKey = getDateKey(tx.date);
    if (!dateKey) return;
    const month = dateKey.slice(0, 7);
    const current = buckets.get(month) || { income: 0, expense: 0, count: 0 };
    if (tx.type === "deposit") current.income += Number(tx.amount || 0);
    else current.expense += Number(tx.amount || 0);
    current.count += 1;
    buckets.set(month, current);
  });

  return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
}

function QuickAction({ to, icon: Icon, label, description, tone = "brand" }) {
  return (
    <Button as={Link} to={to} variant="outline" className="h-auto min-h-14 w-full justify-start px-3 py-2.5 text-right">
      <span className={clsx(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
        tone === "success" && "bg-emerald-500/10 text-emerald-700",
        tone === "warning" && "bg-amber-500/10 text-amber-700",
        tone === "info" && "bg-sky-500/10 text-sky-700",
        tone === "neutral" && "bg-slate-500/10 text-slate-600",
        tone === "brand" && "bg-brand-600/10 text-brand-700"
      )}>
        {createElement(Icon, { size: 17 })}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold">{label}</span>
        <span className="block truncate text-[10px] font-semibold text-slate-500">{description}</span>
      </span>
      <ChevronLeft size={14} className="text-slate-400" />
    </Button>
  );
}

function SectionTitle({ icon: Icon, title, meta }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        {createElement(Icon, { size: 17, className: "text-brand-700" })}
        {title}
      </h2>
      {meta && <span className="text-[10px] font-semibold text-slate-500">{meta}</span>}
    </div>
  );
}

function FinanceTrendBars({ buckets }) {
  if (!buckets.length) {
    return <EmptyState title="لا توجد حركة مالية كافية" description="ستظهر الحركة الشهرية بعد ترحيل معاملات فعلية." className="p-6" />;
  }

  const maxValue = Math.max(...buckets.flatMap(([, value]) => [value.income, value.expense]), 1);

  return (
    <div className="space-y-3">
      {buckets.map(([month, value]) => (
        <div key={month} className="grid grid-cols-[5rem_1fr] items-center gap-3">
          <span className="text-[10px] font-semibold text-slate-500">{month}</span>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.max((value.income / maxValue) * 100, 3)}%` }} />
              <span className="num text-[10px] font-semibold text-emerald-700">{formatMoney(value.income)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 rounded-full bg-rose-500" style={{ width: `${Math.max((value.expense / maxValue) * 100, 3)}%` }} />
              <span className="num text-[10px] font-semibold text-rose-700">{formatMoney(value.expense)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BoardMemberRow({ member, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(member)}
      className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-right transition hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700">
        {member.photo ? <img src={member.photo} alt={member.name} className="h-9 w-9 rounded-lg object-cover" /> : <UserCircle size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold">{member.name}</span>
        <span className="block truncate text-[10px] font-semibold text-amber-700">{member.membershipStatus}</span>
      </span>
    </button>
  );
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const { openEmployeeModal } = useEmployeeModal();

  const canFinance = can("/treasury/admin") || can("/treasury/ledger") || can("/treasury/settlements") || can("/treasury/checks");
  const canEmployees = can("/employees");
  const canBoard = can("/board");
  const canActivities = can("/activities/master") || can("/activities/bookings");
  const canReports = can("/reports");
  const canImporter = can("/importer");
  const canAudit = can("/security");

  const [issuedChecks, setIssuedChecks] = useState([]);
  const [legacyTransactions, setLegacyTransactions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [events, setEvents] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [nowTime] = useState(() => Date.now());

  const orderByDateDesc = useMemo(() => [orderBy("date", "desc")], []);
  const recentAuditQuery = useMemo(() => [orderBy("createdAtIso", "desc"), limit(6)], []);
  const recentEventsQuery = useMemo(() => [orderBy("date", "desc"), limit(6)], []);

  const checksState = useCollectionSubscription(canFinance, "issued_checks", orderByDateDesc, setIssuedChecks);
  const txState = useCollectionSubscription(canFinance, "transactions", orderByDateDesc, setLegacyTransactions);
  const employeesState = useCollectionSubscription(canEmployees || canBoard, "employees", null, setEmployees);
  const meetingsState = useCollectionSubscription(canBoard, "board_meetings", orderByDateDesc, setMeetings);
  const eventsState = useCollectionSubscription(canActivities, "events", recentEventsQuery, setEvents);
  const auditState = useCollectionSubscription(canAudit, "audit_logs", recentAuditQuery, setAuditLogs);

  const loading = checksState.loading || txState.loading || employeesState.loading || meetingsState.loading || eventsState.loading || auditState.loading;
  const errors = [checksState, txState, employeesState, meetingsState, eventsState, auditState].filter((state) => state.error);

  const transactions = useMemo(() => {
    if (!canFinance) return [];
    const normalizedChecks = mergeIssuedChecksSourcesNormalized(issuedChecks, legacyTransactions);
    const directTransactions = legacyTransactions
      .filter((tx) => DIRECT_LEDGER_TYPES.includes(tx?.type))
      .map((tx) => ({ ...tx, sourceCollection: tx?.sourceCollection || "transactions" }));

    return [...directTransactions, ...normalizedChecks].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [canFinance, issuedChecks, legacyTransactions]);

  const posted = useMemo(() => transactions.filter(isPosted), [transactions]);
  const totalIn = useMemo(() => posted.filter((tx) => tx.type === "deposit").reduce((sum, tx) => sum + Number(tx.amount || 0), 0), [posted]);
  const totalOut = useMemo(() => posted.filter((tx) => tx.type !== "deposit").reduce((sum, tx) => sum + Number(tx.amount || 0), 0), [posted]);
  const balance = OPENING_BALANCE + totalIn - totalOut;
  const openSettlements = useMemo(() => transactions.filter((tx) => normalizeRequiresSettlement(tx) && !tx.isSettled && isPosted(tx)), [transactions]);
  const draftCount = useMemo(() => transactions.filter((tx) => tx.state === "draft").length, [transactions]);
  const recentTransactions = useMemo(() => transactions.slice(0, 5), [transactions]);
  const monthBuckets = useMemo(() => buildMonthBuckets(transactions), [transactions]);

  const boardMembers = useMemo(() => {
    return employees
      .filter((employee) => BOARD_ROLES.includes(employee.membershipStatus) && employee.memberState !== "وفاة" && employee.memberState !== "استقالة")
      .sort((a, b) => (ROLE_ORDER[a.membershipStatus] || 99) - (ROLE_ORDER[b.membershipStatus] || 99));
  }, [employees]);

  const operationalAlerts = useMemo(() => {
    if (!canFinance && !canBoard) return [];

    const msPerDay = 1000 * 60 * 60 * 24;
    const getAgeDays = (dateValue) => {
      const parsed = new Date(dateValue || "");
      if (Number.isNaN(parsed.getTime())) return 0;
      return Math.floor((nowTime - parsed.getTime()) / msPerDay);
    };

    const staleSettlements = canFinance ? openSettlements.filter((tx) => getAgeDays(tx.date) >= 30) : [];
    const invalidMeetings = canBoard
      ? meetings.filter((meeting) =>
          (meeting.decisions || []).some((decision) => {
            const presentCount = meeting.attendees?.length || 0;
            const voteTotal = Number(decision?.votes?.for || 0) + Number(decision?.votes?.against || 0) + Number(decision?.votes?.abstain || 0);
            return voteTotal > presentCount;
          })
        )
      : [];

    return [
      staleSettlements.length > 0
        ? {
            key: "stale-settlements",
            tone: "warning",
            title: "تسويات متأخرة",
            description: `${staleSettlements.length} شيك مر عليه 30 يوماً أو أكثر بدون تسوية.`,
            to: "/treasury/settlements",
          }
        : null,
      draftCount > 0 && canFinance
        ? {
            key: "drafts",
            tone: "info",
            title: "مسودات مالية",
            description: `${draftCount} حركة أو شيك ما زال في وضع المسودة.`,
            to: "/treasury/admin?filter=draft",
          }
        : null,
      invalidMeetings.length > 0
        ? {
            key: "invalid-votes",
            tone: "danger",
            title: "محاضر تحتاج مراجعة",
            description: `${invalidMeetings.length} اجتماع به أصوات تتجاوز عدد الحاضرين.`,
            to: "/board",
          }
        : null,
    ].filter(Boolean);
  }, [canBoard, canFinance, draftCount, meetings, nowTime, openSettlements]);

  const primaryKpis = useMemo(() => {
    const items = [];

    if (canFinance) {
      items.push(
        { key: "balance", label: "الرصيد الدفتري", value: formatMoney(balance), sub: `افتتاحي: ${formatMoney(OPENING_BALANCE)}`, icon: Wallet, tone: balance >= 0 ? "success" : "danger" },
        { key: "out", label: "إجمالي المنصرف", value: formatMoney(totalOut), sub: `${posted.filter((tx) => tx.type !== "deposit").length} حركة`, icon: Banknote, tone: "danger" }
      );
    }

    if (canEmployees) {
      items.push({ key: "employees", label: "الأعضاء المسجلون", value: String(employees.length), sub: "من سجل الأعضاء", icon: Users, tone: "info" });
    }

    if (canBoard) {
      items.push({ key: "board", label: "تشكيل المجلس", value: String(boardMembers.length), sub: "أعضاء مجلس الإدارة النشطون", icon: ShieldCheck, tone: "warning" });
    }

    if (canActivities) {
      items.push({ key: "events", label: "الفعاليات الأخيرة", value: String(events.length), sub: "آخر سجلات متاحة", icon: CalendarDays, tone: "brand" });
    }

    return items.slice(0, 5);
  }, [balance, boardMembers.length, canActivities, canBoard, canEmployees, canFinance, employees.length, events.length, posted, totalOut]);

  const quickActions = useMemo(() => {
    return [
      canEmployees ? { to: "/employees", label: "إدارة الأعضاء", description: "بحث وإضافة وتعديل", icon: Users, tone: "info" } : null,
      canFinance ? { to: "/treasury/admin", label: "إصدار سند", description: "الخزينة والشيكات", icon: PlusCircle, tone: "success" } : null,
      canFinance ? { to: "/treasury/settlements", label: "التسويات", description: "متابعة العهد المفتوحة", icon: ReceiptText, tone: "warning" } : null,
      canActivities ? { to: "/activities/master", label: "الفعاليات", description: "إدارة الأنشطة والحجز", icon: CalendarDays, tone: "brand" } : null,
      canReports ? { to: "/reports", label: "مركز التقارير", description: "تقارير تنفيذية ومخصصة", icon: FileText, tone: "neutral" } : null,
      canImporter ? { to: "/importer", label: "استيراد البيانات", description: "أدوات التشغيل", icon: UploadCloud, tone: "neutral" } : null,
    ].filter(Boolean).slice(0, 6);
  }, [canActivities, canEmployees, canFinance, canImporter, canReports]);

  const todayLabel = useMemo(() => new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" }), []);

  if (loading && primaryKpis.length === 0) {
    return <LoadingState title="جاري تجهيز لوحة القيادة..." rows={4} />;
  }

  return (
    <div className="space-y-4 pb-8" dir="rtl">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/70">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge tone="brand">Command Center</Badge>
              <span className="text-[11px] font-semibold text-slate-500">{todayLabel}</span>
            </div>
            <h1 className="text-xl font-bold text-slate-950 dark:text-white">لوحة القيادة التشغيلية</h1>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-6 text-slate-500">
              مرحباً {user?.displayName || "بك"}، هذه نظرة مركزة على البيانات المسموح لك بعرضها داخل المنظومة.
            </p>
          </div>
          {quickActions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {quickActions.slice(0, 2).map((action) => (
                <Button key={action.to} as={Link} to={action.to} variant="primary" size="sm" iconStart={action.icon}>
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </section>

      {errors.length > 0 && (
        <Alert
          tone="warning"
          title="بعض مصادر البيانات لم يتم تحميلها"
          description="ستظل اللوحة تعرض الأقسام المتاحة، ويمكن مراجعة الاتصال أو الصلاحيات للمصادر المتعثرة."
        />
      )}

      {primaryKpis.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {primaryKpis.map((kpi) => (
            <StatCard key={kpi.key} label={kpi.label} value={kpi.value} sub={kpi.sub} icon={kpi.icon} tone={kpi.tone} />
          ))}
        </div>
      ) : (
        <EmptyState title="لا توجد مؤشرات متاحة" description="لا توجد حالياً صلاحيات تعرض مؤشرات تشغيلية على اللوحة." />
      )}

      {operationalAlerts.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {operationalAlerts.map((alert) => (
            <Link key={alert.key} to={alert.to}>
              <Alert tone={alert.tone} title={alert.title} description={alert.description} className="h-full transition hover:shadow-sm" />
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <div className="space-y-4">
          {canFinance && (
            <Card
              title="نظرة مالية"
              description="تعتمد على نفس بيانات الخزينة والشيكات الحالية دون تغيير طريقة الحساب."
              action={<Button as={Link} to="/treasury/ledger" variant="outline" size="sm" iconStart={Landmark}>كشف الحساب</Button>}
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div>
                  <SectionTitle icon={Activity} title="الحركة الشهرية" meta="آخر 6 أشهر بها بيانات" />
                  <FinanceTrendBars buckets={monthBuckets} />
                </div>
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500">إجمالي المقبوضات</span>
                    <span className="num text-xs font-bold text-emerald-700">{formatMoney(totalIn)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500">إجمالي المنصرف</span>
                    <span className="num text-xs font-bold text-rose-700">{formatMoney(totalOut)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500">تسويات مفتوحة</span>
                    <StatusBadge tone={openSettlements.length ? "warning" : "success"}>{openSettlements.length}</StatusBadge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500">مسودات</span>
                    <StatusBadge tone={draftCount ? "warning" : "neutral"}>{draftCount}</StatusBadge>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {canFinance && (
            <Card
              title="أحدث الحركات المالية"
              description="آخر الحركات المتاحة من الخزينة والشيكات."
              action={<Button as={Link} to="/treasury/admin" variant="ghost" size="sm">عرض الخزينة</Button>}
            >
              {recentTransactions.length ? (
                <div className="overflow-x-auto">
                  <table className="table-enterprise w-full text-right">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                        <th className="p-2 font-semibold">التاريخ</th>
                        <th className="p-2 font-semibold">الجهة / البيان</th>
                        <th className="p-2 font-semibold">النوع</th>
                        <th className="p-2 text-left font-semibold">القيمة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/70">
                      {recentTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                          <td className="p-2 text-xs font-semibold text-slate-500">{tx.date || "-"}</td>
                          <td className="p-2">
                            <p className="max-w-md truncate text-xs font-bold">{getIssuedCheckDisplayParty(tx) || tx.party || "-"}</p>
                            {tx.notes && <p className="max-w-md truncate text-[10px] font-semibold text-slate-500">{tx.notes}</p>}
                          </td>
                          <td className="p-2 text-xs font-semibold text-slate-500">{getIssuedCheckTypeLabel(tx.type)}</td>
                          <td className={clsx("num p-2 text-left text-xs font-bold", tx.type === "deposit" ? "text-emerald-700" : "text-rose-700")}>
                            {formatMoney(Number(tx.amount || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="لا توجد حركات مالية" description="لم يتم العثور على حركات متاحة للعرض." className="p-6" />
              )}
            </Card>
          )}

          {!canFinance && canActivities && (
            <Card title="الفعاليات والأنشطة" description="آخر فعاليات مسجلة ومسموح بعرضها.">
              {events.length ? (
                <div className="space-y-2">
                  {events.slice(0, 5).map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold">{event.title || event.name || "فعالية"}</p>
                        <p className="text-[10px] font-semibold text-slate-500">{event.date || "بدون تاريخ"}</p>
                      </div>
                      <StatusBadge tone="brand">{event.status || "مسجلة"}</StatusBadge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="لا توجد فعاليات متاحة" className="p-6" />
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="إجراءات سريعة" description="تظهر حسب الصلاحيات الحالية.">
            {quickActions.length ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {quickActions.map((action) => (
                  <QuickAction key={action.to} {...action} />
                ))}
              </div>
            ) : (
              <EmptyState title="لا توجد إجراءات متاحة" description="لا توجد مسارات تشغيلية مسموح بها حالياً." className="p-6" />
            )}
          </Card>

          {canBoard && (
            <Card title="الحوكمة ومجلس الإدارة" description="ملخص فعلي من سجلات الأعضاء والاجتماعات.">
              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-[10px] font-semibold text-slate-500">أعضاء المجلس</p>
                  <p className="num mt-1 text-xl font-bold">{boardMembers.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-[10px] font-semibold text-slate-500">الاجتماعات</p>
                  <p className="num mt-1 text-xl font-bold">{meetings.length}</p>
                </div>
              </div>
              {boardMembers.length ? (
                <div className="space-y-1">
                  {boardMembers.slice(0, 5).map((member) => (
                    <BoardMemberRow key={member.id} member={member} onClick={openEmployeeModal} />
                  ))}
                </div>
              ) : (
                <EmptyState title="لا يوجد تشكيل مجلس مسجل" className="p-6" />
              )}
            </Card>
          )}

          {canAudit && (
            <Card title="آخر الإجراءات" description="آخر 6 سجلات تدقيق فقط.">
              {auditState.error ? (
                <ErrorState title="تعذر تحميل سجل التدقيق" description={auditState.error} className="p-6" />
              ) : auditLogs.length ? (
                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-700">
                          <FileText size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold">{log.action || "إجراء"}</p>
                          <p className="truncate text-[10px] font-semibold text-slate-500">
                            {log.module || log.collection || "النظام"} · {formatDateTime(log.createdAtIso || log.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="لا توجد سجلات تدقيق" className="p-6" />
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
