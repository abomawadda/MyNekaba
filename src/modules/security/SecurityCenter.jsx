/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  Activity,
  Clock3,
  FileSearch,
  Lock,
  ShieldCheck,
  ShieldEllipsis,
  Users,
  XCircle,
} from "lucide-react";
import clsx from "clsx";
import { db } from "../../app/providers/FirebaseProvider";
import { useT } from "../../app/providers/ThemeProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { ROLE_LABELS, ROLE_OPTIONS } from "../../security/permissions";
import { adminForcePasswordReset } from "../../security/memberAccountService";
import { summarizeIdentityMigration } from "../../security/identityMapping";
import NewsManager from "./NewsManager";

const _stat = { teal: "bg-teal-50 border-teal-100", sky: "bg-sky-50 border-sky-100", amber: "bg-amber-50 border-amber-100", rose: "bg-rose-50 border-rose-100" };
const _statIc = { teal: "bg-teal-100 text-teal-700", sky: "bg-sky-100 text-sky-700", amber: "bg-amber-100 text-amber-700", rose: "bg-rose-100 text-rose-700" };
const _statTx = { teal: "text-teal-700", sky: "text-sky-700", amber: "text-amber-700", rose: "text-rose-700" };

function Stat({ label, value, icon: Icon, tone = "teal" }) {
  return (
    <div className={clsx("p-4 rounded-2xl border shadow-sm", _stat[tone] || "bg-teal-50 border-teal-100")}>
      <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center mb-3", _statIc[tone] || "bg-teal-100 text-teal-700")}>
        <Icon size={18} />
      </div>
      <p className="text-[10px] font-black text-slate-500 uppercase">{label}</p>
      <p className={clsx("text-2xl font-black mt-1", _statTx[tone] || "text-teal-700")}>{value}</p>
    </div>
  );
}

export default function SecurityCenter() {
  const T = useT();
  const {
    user,
    session,
    sessionIntegrity,
    updateAccountAccess,
    revokeUserSessions,
    logout,
  } = useAuth();

  const [accounts, setAccounts] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const accountsQuery = query(collection(db, "user_accounts"), orderBy("createdAtIso", "desc"));
    const sessionsQuery = query(collection(db, "auth_sessions"), orderBy("lastSeenAtIso", "desc"), limit(25));
    const logsQuery = query(collection(db, "audit_logs"), orderBy("createdAtIso", "desc"), limit(30));

    const unsubAccounts = onSnapshot(accountsQuery, (snapshot) => {
      setAccounts(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });
    const unsubSessions = onSnapshot(sessionsQuery, (snapshot) => {
      setSessions(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });
    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      setAuditLogs(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });

    return () => {
      unsubAccounts();
      unsubSessions();
      unsubLogs();
    };
  }, []);

  const activeSessions = useMemo(
    () => sessions.filter((item) => item.status === "active"),
    [sessions]
  );
  const blockedAccounts = useMemo(
    () => accounts.filter((item) => item.accountStatus === "blocked"),
    [accounts]
  );
  const pendingAccounts = useMemo(
    () => accounts.filter((item) => item.accountStatus === "pending_approval"),
    [accounts]
  );
  const identitySummary = useMemo(() => summarizeIdentityMigration(accounts), [accounts]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleRoleChange = async (account, role) => {
    try {
      const updates = {
        role,
        ...(account?.accountStatus === "pending_approval"
          ? { accountStatus: "active" }
          : {}),
      };
      await updateAccountAccess(account.id, updates);
      showToast(
        account?.accountStatus === "pending_approval"
          ? "تم تحديد الصفة وتفعيل الحساب بنجاح."
          : "تم تحديث دور الحساب."
      );
    } catch (error) {
      showToast(error.message || "تعذر تحديث الدور.", "error");
    }
  };

  const handleStatusChange = async (accountId, accountStatus) => {
    try {
      await updateAccountAccess(accountId, { accountStatus });
      showToast("تم تحديث حالة الحساب.");
    } catch (error) {
      showToast(error.message || "تعذر تحديث حالة الحساب.", "error");
    }
  };

  const handleForceReset = async (account) => {
    if (!window.confirm(`إجبار ${account.fullName} على إعادة تعيين كلمة المرور؟ سيتم إبطال كلمته الحالية.`)) return;
    try {
      await adminForcePasswordReset(account.id, user);
      await revokeUserSessions(account.id);
      showToast("تم إبطال كلمة المرور — على العضو استخدام استعادة كلمة المرور.");
    } catch (error) {
      showToast(error.message || "تعذر إعادة التعيين.", "error");
    }
  };

  const mySessions = useMemo(
    () => activeSessions.filter((item) => item.userId === user?.id),
    [activeSessions, user]
  );

  return (
    <div className={clsx("max-w-7xl mx-auto space-y-6 pb-10", T.text)} dir="rtl">
      {toast && (
        <div
          className={clsx(
            "fixed top-20 left-1/2 -translate-x-1/2 z-[5000] px-5 py-3 rounded-2xl text-sm font-black text-white shadow-xl",
            toast.type === "error" ? "bg-rose-600" : "bg-teal-600"
          )}
        >
          {toast.msg}
        </div>
      )}

      <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-black text-teal-700 uppercase">Security, Roles & Protection Engine</p>
            <h1 className="text-2xl font-black text-slate-900">مركز الأمان والصلاحيات</h1>
            <p className="text-sm font-bold text-slate-500 leading-7">
              إدارة الحسابات والأدوار والجلسات وسجل التدقيق من شاشة واحدة مع عزل الصلاحيات المالية.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => revokeUserSessions(user?.id)}
              className="px-4 py-2.5 rounded-xl bg-amber-100 text-amber-700 text-xs font-black hover:bg-amber-200 transition-colors"
            >
              إنهاء جلساتي الأخرى
            </button>
            <button
              onClick={() => logout({ allDevices: true })}
              className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700 transition-colors"
            >
              تسجيل خروج من كل الأجهزة
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Stat label="الحسابات" value={accounts.length} icon={Users} tone="sky" />
        <Stat label="الجلسات النشطة" value={activeSessions.length} icon={ShieldCheck} tone="teal" />
        <Stat label="طلبات تفعيل" value={pendingAccounts.length} icon={Clock3} tone="sky" />
        <Stat label="حسابات موقوفة" value={blockedAccounts.length} icon={Lock} tone="amber" />
        <Stat label="سجلات التدقيق" value={auditLogs.length} icon={FileSearch} tone="rose" />
      </div>

      <section className={clsx("rounded-3xl border shadow-sm p-5", T.card)}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black flex items-center gap-2">
              <ShieldEllipsis size={16} className="text-sky-600" />
              Firebase Identity Migration
            </h2>
            <p className="text-[11px] font-bold text-slate-500 mt-1">
              Read-only migration diagnostics. No Firebase UID values can be edited from here.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
            <div className="rounded-2xl bg-sky-50 px-4 py-3 border border-sky-100">
              <p className="text-[10px] font-black text-sky-700">Linked</p>
              <p className="text-xl font-black text-sky-800">{identitySummary.linked}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
              <p className="text-[10px] font-black text-slate-600">Legacy</p>
              <p className="text-xl font-black text-slate-800">{identitySummary.unlinked}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 px-4 py-3 border border-rose-100">
              <p className="text-[10px] font-black text-rose-700">UID Duplicates</p>
              <p className="text-xl font-black text-rose-800">{identitySummary.duplicateFirebaseUids}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3 border border-amber-100">
              <p className="text-[10px] font-black text-amber-700">Email Duplicates</p>
              <p className="text-xl font-black text-amber-800">{identitySummary.duplicateEmails}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3 border border-amber-100">
              <p className="text-[10px] font-black text-amber-700">Missing IDs</p>
              <p className="text-xl font-black text-amber-800">{identitySummary.missingIdentifiers}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-4">
        <section className={clsx("rounded-3xl border shadow-sm overflow-hidden", T.card)}>
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-black flex items-center gap-2">
              <Users size={16} className="text-teal-600" />
              الحسابات والصلاحيات
            </h2>
            <span className="text-[10px] font-black text-slate-400">{accounts.length} حساب</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-right text-[11px]">
              <thead className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-black text-slate-500">الحساب</th>
                  <th className="py-3 px-4 font-black text-slate-500">الموظف المرتبط</th>
                  <th className="py-3 px-4 font-black text-slate-500">الهاتف</th>
                  <th className="py-3 px-4 font-black text-slate-500">الدور</th>
                  <th className="py-3 px-4 font-black text-slate-500">الحالة</th>
                  <th className="py-3 px-4 font-black text-slate-500">جلسات</th>
                  <th className="py-3 px-4 font-black text-slate-500">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const accountSessions = activeSessions.filter((item) => item.userId === account.id).length;
                  return (
                    <tr key={account.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-3 px-4">
                        <div className="font-black">{account.fullName}</div>
                        <div className="text-[10px] font-bold text-slate-400">{account.email || account.username}</div>
                      </td>
                      <td className="py-3 px-4 font-bold">
                        {account.employeeCode || account.employeeId ? (
                          <span>كود: {account.employeeCode || account.employeeId}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {account.mustResetPassword && <span className="block text-[9px] text-amber-600 font-black">مطلوب إعادة تعيين</span>}
                      </td>
                      <td className="py-3 px-4 font-bold">{account.phone || "—"}</td>
                      <td className="py-3 px-4">
                        <select
                          value={account.role || "viewer"}
                          onChange={(e) => handleRoleChange(account, e.target.value)}
                          className={clsx("px-3 py-2 rounded-xl border text-[11px] font-black", T.sel)}
                        >
                          {ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={account.accountStatus || "active"}
                          onChange={(e) => handleStatusChange(account.id, e.target.value)}
                          className={clsx("px-3 py-2 rounded-xl border text-[11px] font-black", T.sel)}
                        >
                          <option value="active">نشط</option>
                          <option value="pending_approval">بانتظار التفعيل</option>
                          <option value="blocked">موقوف</option>
                          <option value="inactive">غير مفعل</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          <button
                            onClick={() => revokeUserSessions(account.id)}
                            className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black hover:bg-slate-200 transition-colors"
                          >
                            {accountSessions} جلسة
                          </button>
                          <button
                            onClick={() => handleForceReset(account)}
                            title="إبطال كلمة المرور وإجبار العضو على إعادة التعيين"
                            className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-[10px] font-black hover:bg-amber-100 transition-colors"
                          >
                            إعادة تعيين
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <div className={clsx("rounded-3xl border shadow-sm p-5", T.card)}>
            <h2 className="text-sm font-black flex items-center gap-2 mb-4">
              <ShieldEllipsis size={16} className="text-amber-600" />
              سلامة الجلسة الحالية
            </h2>
            <div className="space-y-3 text-sm font-bold">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">المستخدم</span>
                <span>{user?.displayName || "—"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">الدور</span>
                <span>{ROLE_LABELS[user?.role] || "—"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">معرف الجلسة</span>
                <span className="text-[11px]">{session?.sessionId || "—"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">جلسات أخرى</span>
                <span className={sessionIntegrity.hasOtherActiveSessions ? "text-amber-600" : "text-emerald-600"}>
                  {sessionIntegrity.hasOtherActiveSessions ? "تم رصد جلسات أخرى" : "لا توجد جلسات أخرى"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">جلساتي النشطة</span>
                <span>{mySessions.length}</span>
              </div>
            </div>
          </div>

          <div className={clsx("rounded-3xl border shadow-sm overflow-hidden", T.card)}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-black flex items-center gap-2">
                <Clock3 size={16} className="text-sky-600" />
                الجلسات الحديثة
              </h2>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {sessions.map((item) => (
                <div key={item.id} className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black">{item.userSnapshot?.displayName || item.userId}</p>
                      <p className="text-[10px] font-bold text-slate-400">{item.lastSeenAtIso || item.createdAtIso}</p>
                    </div>
                    <span
                      className={clsx(
                        "px-2.5 py-1 rounded-full text-[10px] font-black border",
                        item.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      )}
                    >
                      {item.status === "active" ? "نشطة" : item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <NewsManager />

      <section className={clsx("rounded-3xl border shadow-sm overflow-hidden", T.card)}>
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-black flex items-center gap-2">
            <Activity size={16} className="text-rose-600" />
            Audit Log المتقدم
          </h2>
          <span className="text-[10px] font-black text-slate-400">{auditLogs.length} سجل</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-right text-[11px]">
            <thead className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-black text-slate-500">الوقت</th>
                <th className="py-3 px-4 font-black text-slate-500">المستخدم</th>
                <th className="py-3 px-4 font-black text-slate-500">العملية</th>
                <th className="py-3 px-4 font-black text-slate-500">الصفحة</th>
                <th className="py-3 px-4 font-black text-slate-500">المستوى</th>
                <th className="py-3 px-4 font-black text-slate-500">الهدف</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-3 px-4 font-bold">{log.createdAtIso || "—"}</td>
                  <td className="py-3 px-4">
                    <div className="font-black">{log.userName || "نظام"}</div>
                    <div className="text-[10px] font-bold text-slate-400">{ROLE_LABELS[log.role] || log.role || "—"}</div>
                  </td>
                  <td className="py-3 px-4 font-black text-slate-800">{log.action}</td>
                  <td className="py-3 px-4 font-bold text-slate-500">{log.page || "—"}</td>
                  <td className="py-3 px-4">
                    <span
                      className={clsx(
                        "px-2.5 py-1 rounded-full text-[10px] font-black border",
                        log.riskLevel === "high"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : log.riskLevel === "medium"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      )}
                    >
                      {log.riskLevel || "low"}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-500">{log.targetId || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
