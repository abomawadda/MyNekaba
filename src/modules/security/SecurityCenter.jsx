import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  KeyRound,
  Lock,
  Mail,
  Printer,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useT } from "../../app/providers/ThemeProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { ROLE_LABELS, ROLE_OPTIONS } from "../../security/permissions";
import { fetchSecurityAccounts, runSecurityAccountAction } from "../../security/registrationApi";

const TABS = [
  { id: "accounts", label: "الحسابات", icon: Users },
  { id: "pending", label: "طلبات الاعتماد", icon: Clock3 },
  { id: "email", label: "التحقق من البريد", icon: Mail },
  { id: "recoveries", label: "طلبات الاسترداد", icon: KeyRound },
  { id: "audit", label: "سجل الأمان", icon: Activity },
  { id: "reports", label: "التقارير", icon: FileText },
];

const STATUS_LABELS = {
  active: "نشط",
  pending_approval: "بانتظار الاعتماد",
  rejected: "مرفوض",
  suspended: "موقوف",
  deleted: "محذوف",
  blocked: "موقوف",
  inactive: "غير مفعل",
};

const EMAIL_LABELS = {
  verified: "متحقق",
  unverified: "غير متحقق",
  overridden: "تجاوز إداري",
  not_applicable: "غير مرتبط",
};

function formatDate(value) {
  if (!value) return "غير متاح";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "غير متاح";
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function badgeClass(kind) {
  if (["active", "verified", "low"].includes(kind)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["pending_approval", "unverified", "medium"].includes(kind)) return "bg-amber-50 text-amber-700 border-amber-200";
  if (kind === "overridden") return "bg-violet-50 text-violet-700 border-violet-200";
  if (["suspended", "deleted", "rejected", "blocked", "high"].includes(kind)) return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function Badge({ value, label }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black", badgeClass(value))}>
      {label || STATUS_LABELS[value] || EMAIL_LABELS[value] || value || "غير متاح"}
    </span>
  );
}

function Kpi({ label, value, icon, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    sky: "bg-sky-50 border-sky-200 text-sky-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
  };
  return (
    <div className={clsx("rounded-2xl border p-4 shadow-sm", tones[tone])}>
      {React.createElement(icon, { size: 18 })}
      <p className="mt-3 text-[11px] font-black text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function Info({ label, value, dir = "rtl" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-black text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-900" dir={dir}>{value || "غير متاح"}</p>
    </div>
  );
}

function Action({ icon, label, onClick, tone = "teal" }) {
  const styles = {
    teal: "bg-teal-50 text-teal-700 hover:bg-teal-100",
    amber: "bg-amber-50 text-amber-700 hover:bg-amber-100",
    rose: "bg-rose-50 text-rose-700 hover:bg-rose-100",
  };
  return (
    <button onClick={onClick} className={clsx("inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-black", styles[tone])}>
      {React.createElement(icon, { size: 15 })} {label}
    </button>
  );
}

function ReportPrint({ accounts, auditLogs, filters, generatedBy }) {
  return (
    <section id="security-print-report" className="hidden print:block" dir="rtl">
      <div className="security-print-page">
        <header className="security-print-header">
          <div>
            <p className="text-xs font-bold text-slate-500">منظومة النقابة الرقمية</p>
            <h1>تقرير مركز الأمان وإدارة الحسابات</h1>
          </div>
          <div className="text-left text-xs">
            <p>تاريخ الإنشاء: {formatDate(new Date().toISOString())}</p>
            <p>بواسطة: {generatedBy || "النظام"}</p>
          </div>
        </header>
        <div className="security-print-filters">
          الحالة: {filters.status || "كل الحالات"} | الدور: {filters.role || "كل الأدوار"} | البحث: {filters.search || "بدون"}
        </div>
        <table className="security-print-table">
          <thead>
            <tr>
              <th>الحساب</th>
              <th>رقم العامل</th>
              <th>الدور</th>
              <th>الحالة</th>
              <th>البريد</th>
              <th>نمط المصادقة</th>
              <th>آخر دخول</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.fullName || account.username || "غير متاح"}</td>
                <td>{account.employeeCode || "غير متاح"}</td>
                <td>{ROLE_LABELS[account.role] || account.role}</td>
                <td>{STATUS_LABELS[account.accountStatus] || account.accountStatus}</td>
                <td>{EMAIL_LABELS[account.emailVerificationState] || account.emailVerificationState}</td>
                <td>{account.authMode}</td>
                <td>{formatDate(account.lastSignInAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>آخر أحداث الأمان</h2>
        <table className="security-print-table">
          <thead>
            <tr>
              <th>الوقت</th>
              <th>العملية</th>
              <th>المستوى</th>
              <th>الهدف</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.slice(0, 25).map((log) => (
              <tr key={log.id}>
                <td>{formatDate(log.createdAtIso)}</td>
                <td>{log.action}</td>
                <td>{log.riskLevel || "low"}</td>
                <td>{log.targetId || "غير متاح"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer>تم إنشاء التقرير بواسطة منظومة النقابة الرقمية</footer>
      </div>
    </section>
  );
}

export default function SecurityCenter() {
  const T = useT();
  const { user } = useAuth();
  const [payload, setPayload] = useState({ accounts: [], sessions: [], auditLogs: [], recoveryRequests: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("accounts");
  const [selected, setSelected] = useState(null);
  const [verificationLink, setVerificationLink] = useState("");
  const [filters, setFilters] = useState({ search: "", role: "", status: "", email: "" });

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchSecurityAccounts();
      setPayload(data);
      setSelected((current) => (current ? data.accounts.find((item) => item.id === current.id) || null : null));
    } catch (loadError) {
      setError(loadError.message || "تعذر تحميل مركز الأمان.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const accounts = useMemo(() => payload.accounts || [], [payload.accounts]);
  const auditLogs = useMemo(() => payload.auditLogs || [], [payload.auditLogs]);
  const recoveryRequests = useMemo(() => payload.recoveryRequests || [], [payload.recoveryRequests]);

  const filteredAccounts = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return accounts.filter((account) => {
      const text = [account.fullName, account.username, account.email, account.employeeCode, account.employeeId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (!search || text.includes(search)) &&
        (!filters.role || account.role === filters.role) &&
        (!filters.status || account.accountStatus === filters.status) &&
        (!filters.email || account.emailVerificationState === filters.email)
      );
    });
  }, [accounts, filters]);

  const pendingAccounts = accounts.filter((item) => item.accountStatus === "pending_approval");
  const activeAccounts = accounts.filter((item) => item.accountStatus === "active");
  const unverifiedActive = accounts.filter((item) => item.accountStatus === "active" && item.emailVerificationState === "unverified");
  const overrides = accounts.filter((item) => item.emailVerificationState === "overridden");
  const suspended = accounts.filter((item) => ["suspended", "blocked"].includes(item.accountStatus));
  const rejected = accounts.filter((item) => item.accountStatus === "rejected");

  const runAction = async (actionPayload, successMessage) => {
    try {
      const result = await runSecurityAccountAction(actionPayload);
      if (result.verificationLink) setVerificationLink(result.verificationLink);
      showToast(successMessage);
      await load();
      return result;
    } catch (actionError) {
      showToast(actionError.message || "تعذر تنفيذ الإجراء.", "error");
      return null;
    }
  };

  const requireReason = (message) => {
    const reason = window.prompt(message);
    return reason?.trim() || "";
  };

  const approve = (account) => runAction({ action: "setStatus", accountId: account.id, accountStatus: "active", reason: "approval" }, "تم اعتماد الحساب.");
  const reject = (account) => {
    const reason = requireReason("اكتب سبب رفض الطلب:");
    if (!reason) return null;
    return runAction({ action: "setStatus", accountId: account.id, accountStatus: "rejected", reason }, "تم رفض الحساب.");
  };
  const suspend = (account) => {
    const reason = requireReason("اكتب سبب إيقاف الحساب:");
    if (!reason) return null;
    return runAction({ action: "setStatus", accountId: account.id, accountStatus: "suspended", reason }, "تم إيقاف الحساب وإنهاء جلساته.");
  };
  const reactivate = (account) => runAction({ action: "setStatus", accountId: account.id, accountStatus: "active", reason: "reactivate" }, "تمت إعادة تفعيل الحساب.");
  const deleteAccount = (account) => {
    const reason = requireReason("إجراء خطر: اكتب سبب حذف الحساب. لا يتم حذف سجل الموظف أو سجل التدقيق.");
    if (!reason) return null;
    return runAction({ action: "delete", accountId: account.id, reason }, "تم حذف الحساب مع حفظ سجل التدقيق.");
  };
  const overrideEmail = (account) => {
    const reason = requireReason("اكتب سبب التجاوز الإداري للتحقق من البريد:");
    if (!reason) return null;
    return runAction({ action: "overrideEmailVerification", accountId: account.id, reason }, "تم تفعيل التجاوز الإداري.");
  };
  const removeOverride = (account) => runAction({ action: "removeEmailVerificationOverride", accountId: account.id }, "تم إلغاء التجاوز الإداري.");
  const resendVerification = (account) => runAction({ action: "resendVerification", accountId: account.id }, "تم إنشاء رابط تحقق جديد. انسخه من اللوحة.");
  const revokeSessions = (account) => runAction({ action: "revokeSessions", accountId: account.id }, "تم إنهاء الجلسات النشطة.");
  const changeRole = (account, role) => {
    if (["admin", "treasurer"].includes(role) && !window.confirm("هذا الدور عالي الصلاحية. هل تريد المتابعة؟")) return null;
    return runAction({ action: "changeRole", accountId: account.id, role }, "تم تحديث الدور.");
  };

  const currentRows = activeTab === "pending"
    ? pendingAccounts
    : activeTab === "email"
      ? accounts.filter((item) => ["unverified", "overridden"].includes(item.emailVerificationState))
      : filteredAccounts;

  return (
    <div className={clsx("mx-auto max-w-7xl space-y-5 pb-10", T.text)} dir="rtl">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #security-print-report, #security-print-report * { visibility: visible !important; }
          #security-print-report { display: block !important; position: absolute; inset: 0; background: white; color: #0f172a; }
          @page { size: A4; margin: 14mm; }
          .security-print-page { font-family: Arial, sans-serif; direction: rtl; font-size: 11px; }
          .security-print-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 12px; }
          .security-print-header h1 { font-size: 18px; margin: 4px 0 0; }
          .security-print-filters { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; margin-bottom: 10px; }
          .security-print-table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; page-break-inside: auto; }
          .security-print-table th, .security-print-table td { border: 1px solid #cbd5e1; padding: 6px; text-align: right; vertical-align: top; }
          .security-print-table th { background: #ecfeff; color: #115e59; font-weight: 800; }
          .security-print-table tr { page-break-inside: avoid; }
          .security-print-page footer { border-top: 1px solid #cbd5e1; margin-top: 16px; padding-top: 8px; color: #475569; }
        }
      `}</style>

      {toast && (
        <div className={clsx("fixed top-20 left-1/2 z-[5000] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-black text-white shadow-xl", toast.type === "error" ? "bg-rose-600" : "bg-teal-600")}>
          {toast.msg}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black text-teal-700">Security Center 2.0</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">مركز الأمان وإدارة الحسابات</h1>
            <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-slate-500">
              إدارة حسابات المستخدمين، التحقق، الصلاحيات، الجلسات، وسجل العمليات الأمنية من مركز مؤسسي موثوق.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-200">
              <RefreshCcw size={15} /> تحديث
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-black text-white hover:bg-teal-700">
              <Printer size={15} /> طباعة تقرير A4
            </button>
          </div>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">{error}</div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="إجمالي الحسابات" value={accounts.length} icon={Users} tone="sky" />
        <Kpi label="الحسابات النشطة" value={activeAccounts.length} icon={ShieldCheck} tone="emerald" />
        <Kpi label="في انتظار الاعتماد" value={pendingAccounts.length} icon={Clock3} tone="amber" />
        <Kpi label="بريد غير متحقق" value={accounts.filter((a) => a.emailVerificationState === "unverified").length} icon={Mail} tone="amber" />
        <Kpi label="حسابات موقوفة" value={suspended.length} icon={Lock} tone="rose" />
        <Kpi label="حسابات مرفوضة" value={rejected.length} icon={UserX} tone="rose" />
        <Kpi label="استثناءات التحقق" value={overrides.length} icon={ShieldAlert} tone="violet" />
        <Kpi label="طلبات استرداد" value={recoveryRequests.length} icon={KeyRound} tone="slate" />
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {unverifiedActive.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            <AlertTriangle size={18} className="mb-2" />
            توجد حسابات نشطة ببريد غير متحقق. الدخول سيظل ممنوعا حتى التحقق أو التجاوز الإداري.
          </div>
        )}
        {overrides.length > 0 && (
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-bold text-violet-800">
            <ShieldAlert size={18} className="mb-2" />
            توجد استثناءات تحقق نشطة. راجع الأسباب وسجل التدقيق دوريا.
          </div>
        )}
        {pendingAccounts.length > 0 && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-bold text-sky-800">
            <UserCheck size={18} className="mb-2" />
            توجد طلبات اعتماد معلقة تحتاج مراجعة إدارية.
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 p-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={clsx("inline-flex min-w-fit items-center gap-2 rounded-2xl px-4 py-2 text-xs font-black transition", activeTab === tab.id ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
                <Icon size={15} /> {tab.label}
              </button>
            );
          })}
        </div>

        {["accounts", "pending", "email"].includes(activeTab) && (
          <>
            <div className="grid gap-3 border-b border-slate-100 p-4 lg:grid-cols-4">
              <label className="relative">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input name="security-search" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="بحث" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pr-10 text-sm font-bold outline-none focus:border-teal-500" />
              </label>
              <select name="role-filter" value={filters.role} onChange={(e) => setFilters((prev) => ({ ...prev, role: e.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold">
                <option value="">كل الأدوار</option>
                {ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
              <select name="status-filter" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold">
                <option value="">كل الحالات</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select name="email-filter" value={filters.email} onChange={(e) => setFilters((prev) => ({ ...prev, email: e.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold">
                <option value="">كل حالات البريد</option>
                {Object.entries(EMAIL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-right text-xs">
                <thead className="bg-slate-50 text-[11px] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-black">الحساب</th>
                    <th className="px-4 py-3 font-black">رقم العامل</th>
                    <th className="px-4 py-3 font-black">البريد</th>
                    <th className="px-4 py-3 font-black">حالة البريد</th>
                    <th className="px-4 py-3 font-black">الدور</th>
                    <th className="px-4 py-3 font-black">الحالة</th>
                    <th className="px-4 py-3 font-black">نمط المصادقة</th>
                    <th className="px-4 py-3 font-black">آخر دخول</th>
                    <th className="px-4 py-3 font-black">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center font-black text-slate-400">جاري تحميل مركز الأمان...</td></tr>
                  ) : currentRows.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center font-black text-slate-400">لا توجد بيانات مطابقة.</td></tr>
                  ) : currentRows.map((account) => (
                    <tr key={account.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <button onClick={() => setSelected(account)} className="text-right font-black text-slate-900 hover:text-teal-700">{account.fullName || account.username || "غير متاح"}</button>
                        <p className="mt-1 text-[10px] font-bold text-slate-400">{account.username || account.id}</p>
                      </td>
                      <td className="px-4 py-3 font-bold">{account.employeeCode || "غير متاح"}</td>
                      <td className="px-4 py-3 font-bold" dir="ltr">{account.email || "غير متاح"}</td>
                      <td className="px-4 py-3"><Badge value={account.emailVerificationState} /></td>
                      <td className="px-4 py-3">
                        <select name={`role-${account.id}`} value={account.role || "viewer"} onChange={(e) => changeRole(account, e.target.value)} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-[11px] font-black">
                          {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3"><Badge value={account.accountStatus} /></td>
                      <td className="px-4 py-3 font-bold">{account.authMode}</td>
                      <td className="px-4 py-3 font-bold">{formatDate(account.lastSignInAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {account.accountStatus === "pending_approval" && <button onClick={() => approve(account)} className="rounded-lg bg-emerald-50 px-2 py-1 font-black text-emerald-700">اعتماد</button>}
                          {account.accountStatus === "pending_approval" && <button onClick={() => reject(account)} className="rounded-lg bg-rose-50 px-2 py-1 font-black text-rose-700">رفض</button>}
                          {account.accountStatus === "active" && <button onClick={() => suspend(account)} className="rounded-lg bg-amber-50 px-2 py-1 font-black text-amber-700">إيقاف</button>}
                          {["suspended", "blocked", "inactive"].includes(account.accountStatus) && <button onClick={() => reactivate(account)} className="rounded-lg bg-sky-50 px-2 py-1 font-black text-sky-700">إعادة تفعيل</button>}
                          <button onClick={() => setSelected(account)} className="rounded-lg bg-slate-100 px-2 py-1 font-black text-slate-700">تفاصيل</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "recoveries" && (
          <div className="p-4">
            {recoveryRequests.length === 0 ? <p className="py-8 text-center text-sm font-black text-slate-400">لا توجد طلبات استرداد.</p> : recoveryRequests.map((request) => (
              <div key={request.id} className="mb-2 rounded-2xl border border-slate-200 p-4 text-sm font-bold">
                <div className="flex justify-between gap-3"><span>{request.status}</span><span>{formatDate(request.createdAtIso)}</span></div>
                <p className="mt-1 text-xs text-slate-500">Account: {request.accountId || "غير متاح"}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === "audit" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-right text-xs">
              <thead className="bg-slate-50 text-[11px] text-slate-500">
                <tr><th className="px-4 py-3">الوقت</th><th className="px-4 py-3">العملية</th><th className="px-4 py-3">المستخدم</th><th className="px-4 py-3">المستوى</th><th className="px-4 py-3">الهدف</th></tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{formatDate(log.createdAtIso)}</td>
                    <td className="px-4 py-3 font-black">{log.action}</td>
                    <td className="px-4 py-3">{log.userName || log.userId || "النظام"}</td>
                    <td className="px-4 py-3"><Badge value={log.riskLevel || "low"} label={log.riskLevel || "low"} /></td>
                    <td className="px-4 py-3">{log.targetId || "غير متاح"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "reports" && (
          <div className="grid gap-4 p-4 lg:grid-cols-3">
            {[
              ["تقرير الحسابات", "حالة الحسابات، الأدوار، نمط المصادقة، وآخر دخول."],
              ["تقرير التحقق من البريد", "الحسابات غير المتحققة والاستثناءات الإدارية."],
              ["تقرير التدقيق الأمني", "آخر أحداث الأمان والإجراءات عالية الخطورة."],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-2xl border border-slate-200 p-4">
                <FileText size={18} className="text-teal-700" />
                <h3 className="mt-3 font-black text-slate-900">{title}</h3>
                <p className="mt-2 text-xs font-bold leading-6 text-slate-500">{desc}</p>
                <button onClick={() => window.print()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-xs font-black text-white">
                  <Printer size={14} /> معاينة وطباعة
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <aside className="fixed inset-0 z-[4500] bg-slate-950/30 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="mr-auto h-full w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white p-5">
              <div>
                <h2 className="text-lg font-black text-slate-950">{selected.fullName || selected.username}</h2>
                <p className="text-xs font-bold text-slate-400">{selected.id}</p>
              </div>
              <button aria-label="إغلاق" onClick={() => setSelected(null)} className="rounded-xl bg-slate-100 p-2 text-slate-600"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <Info label="رقم العامل" value={selected.employeeCode} />
                <Info label="الرقم القومي" value={selected.nationalIdMasked || "مخفي"} />
                <Info label="البريد" value={selected.email} dir="ltr" />
                <Info label="Firebase UID" value={selected.firebaseUidMasked || "غير مرتبط"} dir="ltr" />
                <Info label="تاريخ الإنشاء" value={formatDate(selected.createdAt)} />
                <Info label="آخر دخول" value={formatDate(selected.lastSignInAt)} />
                <Info label="آخر نشاط" value={formatDate(selected.lastAppActivityAt)} />
                <Info label="الجلسات النشطة" value={selected.activeSessionCount} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge value={selected.accountStatus} />
                <Badge value={selected.emailVerificationState} />
                <Badge value={selected.firebase?.disabled ? "suspended" : "active"} label={selected.firebase?.disabled ? "Firebase معطل" : "Firebase فعال"} />
              </div>

              {verificationLink && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                  <p className="text-xs font-black text-sky-800">رابط التحقق الإداري المؤقت</p>
                  <p className="mt-2 break-all text-left text-[11px] font-bold text-sky-900" dir="ltr">{verificationLink}</p>
                  <button onClick={() => navigator.clipboard?.writeText(verificationLink)} className="mt-3 rounded-xl bg-sky-600 px-3 py-2 text-xs font-black text-white">نسخ الرابط</button>
                </div>
              )}

              <div className="grid gap-2 md:grid-cols-2">
                <Action icon={Mail} label="إعادة إنشاء رابط التحقق" onClick={() => resendVerification(selected)} />
                {selected.emailVerificationOverride ? (
                  <Action icon={ShieldAlert} label="إلغاء التجاوز الإداري" tone="amber" onClick={() => removeOverride(selected)} />
                ) : (
                  <Action icon={ShieldAlert} label="تجاوز تحقق البريد" tone="rose" onClick={() => overrideEmail(selected)} />
                )}
                <Action icon={RefreshCcw} label="إنهاء الجلسات" tone="amber" onClick={() => revokeSessions(selected)} />
                {selected.accountStatus === "active" ? (
                  <Action icon={Lock} label="إيقاف الحساب" tone="amber" onClick={() => suspend(selected)} />
                ) : (
                  <Action icon={CheckCircle2} label="إعادة تفعيل الحساب" onClick={() => reactivate(selected)} />
                )}
                <Action icon={Trash2} label="حذف الحساب" tone="rose" onClick={() => deleteAccount(selected)} />
              </div>
            </div>
          </div>
        </aside>
      )}

      <ReportPrint accounts={filteredAccounts} auditLogs={auditLogs} filters={filters} generatedBy={user?.displayName || user?.fullName} />
    </div>
  );
}
