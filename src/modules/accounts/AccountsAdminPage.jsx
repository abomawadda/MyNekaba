import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Check, Copy, KeyRound, Link2, LogOut, RefreshCw, ShieldCheck, UserPlus, X } from "lucide-react";
import { useAuth } from "../../app/providers/AuthProvider";
import { callAccounts } from "../../lib/backend";
import { ROLE_OPTIONS, ROLE_LABELS } from "../../security/permissions";

const STATUS = {
  pending_approval: { label: "قيد المراجعة", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  active: { label: "مفعّل", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  suspended: { label: "موقوف", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  rejected: { label: "مرفوض", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};
const FILTERS = [
  { id: "attention", label: "تحتاج إجراء" },
  { id: "members", label: "الأعضاء" },
  { id: "staff", label: "فريق العمل" },
  { id: "all", label: "الكل" },
];
const STAFF_ROLES = ROLE_OPTIONS.filter((r) => r.value !== "member");

function TempPasswordDialog({ info, onClose }) {
  if (!info) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" dir="rtl" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <KeyRound size={28} className="mx-auto text-brand-600" />
        <h3 className="mt-3 text-base font-black">كلمة مرور مؤقتة</h3>
        <p className="mt-1 text-xs font-semibold leading-6 text-slate-500">
          سلّمها إلى <b>{info.name}</b> بشكل مباشر. لن تظهر مرة أخرى، وسيُطلب تغييرها عند أول دخول.
        </p>
        <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl bg-slate-100 px-4 py-3" dir="ltr">
          <code className="select-all text-base font-black tracking-wider">{info.password}</code>
          <button onClick={() => navigator.clipboard?.writeText(info.password)} className="rounded-lg p-2 text-slate-500 hover:bg-white" aria-label="نسخ"><Copy size={16} /></button>
        </div>
        <button onClick={onClose} className="mt-5 w-full rounded-2xl bg-brand-600 py-3 text-sm font-black text-white hover:bg-brand-700">تم</button>
      </div>
    </div>
  );
}

function CreateStaffForm({ onCreated }) {
  const [form, setForm] = useState({ username: "", displayName: "", role: "dataEntry" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await callAccounts("create-staff", form);
      onCreated({ name: form.displayName, password: result.tempPassword });
      setForm({ username: "", displayName: "", role: "dataEntry" });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const input = "min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-brand-500 focus:bg-white";
  return (
    <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-black"><UserPlus size={16} className="text-brand-600" /> إضافة حساب لفريق العمل</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input className={input} placeholder="الاسم" value={form.displayName} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} />
        <input className={input} dir="ltr" placeholder="username" value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
        <select className={input} value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
          {STAFF_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button disabled={busy} className="min-h-11 rounded-xl bg-brand-600 text-xs font-black text-white hover:bg-brand-700 disabled:opacity-60">إنشاء</button>
      </div>
      {error && <p className="mt-2 text-xs font-bold text-rose-600">{error}</p>}
    </form>
  );
}

export default function AccountsAdminPage() {
  const { user, logout } = useAuth();
  const [data, setData] = useState({ profiles: [], recoveries: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [filter, setFilter] = useState("attention");
  const [search, setSearch] = useState("");
  const [temp, setTemp] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callAccounts("list");
      setData({ profiles: result.profiles, recoveries: result.recoveries });
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recoverySet = useMemo(() => new Set(data.recoveries.map((r) => r.profile_id)), [data.recoveries]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.profiles.filter((p) => {
      const needsAttention = p.account_status === "pending_approval" || recoverySet.has(p.id) || (p.role === "member" && !p.member_id);
      if (filter === "attention" && !needsAttention) return false;
      if (filter === "members" && p.role !== "member") return false;
      if (filter === "staff" && p.role === "member") return false;
      if (!q) return true;
      return [p.display_name, p.username, p.phone, p.members?.name, p.members?.job_id].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [data.profiles, filter, search, recoverySet]);

  const run = async (profile, action, payload = {}, confirmText = "") => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(profile.id);
    setError("");
    try {
      const result = await callAccounts(action, { profileId: profile.id, ...payload });
      if (result.tempPassword) setTemp({ name: profile.display_name || profile.username, password: result.tempPassword });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId("");
    }
  };

  const linkMember = (profile) => {
    const jobCode = window.prompt("الكود الوظيفي للعضو المراد ربطه بهذا الحساب:");
    if (jobCode) run(profile, "link-member", { jobCode });
  };

  const attentionCount = data.profiles.filter((p) => p.account_status === "pending_approval" || recoverySet.has(p.id)).length;
  const btn = "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black disabled:opacity-50";

  return (
    <div className="min-h-screen bg-slate-50 pb-16 text-slate-900" dir="rtl">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-[11px] font-black text-brand-600">مركز الحسابات</p>
            <h1 className="text-xl font-black">الحسابات والصلاحيات</h1>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <ShieldCheck size={15} className="text-brand-600" /> {user?.displayName}
            <button onClick={() => logout()} className="mr-2 inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 font-black hover:bg-slate-50"><LogOut size={14} /> خروج</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-4 pt-5">
        <CreateStaffForm onCreated={(info) => { setTemp(info); load(); }} />

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={clsx("rounded-xl px-4 py-2 text-xs font-black", filter === f.id ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-slate-600")}>
              {f.label}{f.id === "attention" && attentionCount > 0 ? ` (${attentionCount})` : ""}
            </button>
          ))}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الكود أو الهاتف" className="min-h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-brand-500" />
          <button onClick={load} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 hover:text-brand-700" aria-label="تحديث"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
        </div>

        {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error}</p>}

        <div className="space-y-2">
          {!loading && rows.length === 0 && (
            <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-bold text-slate-400">
              {filter === "attention" ? "لا توجد حسابات تحتاج إجراء." : "لا توجد حسابات."}
            </p>
          )}
          {rows.map((p) => {
            const st = STATUS[p.account_status] || STATUS.rejected;
            const busy = busyId === p.id;
            const isSelf = p.id === user?.id;
            return (
              <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black">{p.display_name || p.username || "—"} {isSelf && <span className="text-[10px] text-slate-400">(أنت)</span>}</p>
                    <p className="mt-1 text-[11px] font-bold text-slate-500">
                      <span dir="ltr">{p.username}</span>{p.phone ? ` • ${p.phone}` : ""}
                      {p.members ? ` • ${p.members.membership_status || "عضو"}` : p.role === "member" ? " • غير مرتبط بسجل عضو" : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className={clsx("rounded-full border px-2.5 py-0.5 text-[10px] font-black", st.cls)}>{st.label}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-black text-slate-600">{ROLE_LABELS[p.role] || p.role}</span>
                      {recoverySet.has(p.id) && <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-black text-violet-700">طلب استعادة</span>}
                      {p.must_change_password && <span className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[10px] font-black text-slate-500">كلمة مرور مؤقتة</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.account_status === "pending_approval" && (
                      <>
                        <button disabled={busy} onClick={() => run(p, "approve")} className={clsx(btn, "bg-emerald-600 text-white hover:bg-emerald-700")}><Check size={13} /> اعتماد</button>
                        <button disabled={busy} onClick={() => run(p, "reject", {}, "رفض هذا الطلب وحذف الحساب؟")} className={clsx(btn, "border border-rose-200 text-rose-600 hover:bg-rose-50")}><X size={13} /> رفض</button>
                      </>
                    )}
                    {p.account_status !== "pending_approval" && (
                      <button disabled={busy} onClick={() => run(p, "reset-password", {}, "إنشاء كلمة مرور مؤقتة جديدة لهذا الحساب؟")} className={clsx(btn, "border border-slate-200 text-slate-700 hover:bg-slate-50")}><KeyRound size={13} /> كلمة مرور مؤقتة</button>
                    )}
                    {p.role === "member" && !p.member_id && (
                      <button disabled={busy} onClick={() => linkMember(p)} className={clsx(btn, "border border-brand-200 text-brand-700 hover:bg-brand-50")}><Link2 size={13} /> ربط بعضو</button>
                    )}
                    {!isSelf && p.account_status === "active" && (
                      <button disabled={busy} onClick={() => run(p, "set-status", { status: "suspended" }, "إيقاف هذا الحساب؟")} className={clsx(btn, "text-rose-600 hover:bg-rose-50")}>إيقاف</button>
                    )}
                    {!isSelf && p.account_status === "suspended" && (
                      <button disabled={busy} onClick={() => run(p, "set-status", { status: "active" })} className={clsx(btn, "text-emerald-700 hover:bg-emerald-50")}>إعادة تفعيل</button>
                    )}
                    {!isSelf && p.account_status !== "pending_approval" && (
                      <select
                        disabled={busy}
                        value={p.role}
                        onChange={(e) => run(p, "set-role", { role: e.target.value }, `تغيير الدور إلى «${ROLE_LABELS[e.target.value]}»؟`)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-black"
                        aria-label="الدور"
                      >
                        {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <TempPasswordDialog info={temp} onClose={() => setTemp(null)} />
    </div>
  );
}
