import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../app/providers/AuthProvider";
import { validatePasswordPolicy } from "../../security/passwordPolicy";

const text = (value = "") => String(value).trim();
const RESET_GENERIC =
  "إذا كان الحساب صالحا ومرتبطا بوسيلة استرداد، سيتم إرسال تعليمات إعادة تعيين كلمة المرور.";

function friendlyError(error, fallback) {
  const raw = String(error?.message || error?.code || error || "");
  if (/network|unavailable|failed to fetch|timeout/i.test(raw)) return "تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.";
  return raw || fallback;
}

function InputField({ label, icon, type = "text", error, ...props }) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  return (
    <label className="block space-y-2">
      <span className="text-xs font-extrabold text-slate-600">{label}</span>
      <div className="relative">
        {React.createElement(icon, { size: 18, className: "pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" })}
        <input {...props} type={isPassword && reveal ? "text" : type} aria-invalid={Boolean(error)} className={clsx("min-h-12 w-full rounded-2xl border bg-slate-50/80 pr-11 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:bg-white focus:ring-4", isPassword ? "pl-12" : "pl-4", error ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-slate-200 focus:border-brand-500 focus:ring-brand-500/10")} />
        {isPassword && <button type="button" onClick={() => setReveal((v) => !v)} className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-700" aria-label={reveal ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{reveal ? <EyeOff size={18} /> : <Eye size={18} />}</button>}
      </div>
      {error && <span className="block text-[11px] font-bold text-rose-600">{error}</span>}
    </label>
  );
}

function BrandLockup() {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm"><img src="/we-logo.png" alt="الشركة المصرية للاتصالات WE" className="h-full w-full object-contain" /></div>
      <div className="h-9 w-px bg-slate-200" />
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm"><img src="/brand-left.png" alt="شعار النقابة العامة" className="h-full w-full object-contain" /></div>
    </div>
  );
}

export function ChangePasswordCard({ onDone }) {
  const { changePassword } = useAuth();
  const [form, setForm] = useState({ currentPassword: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const check = validatePasswordPolicy(form.password, {});
  const mismatch = Boolean(form.confirmPassword) && form.password !== form.confirmPassword;

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!form.currentPassword || !check.valid || mismatch || !form.confirmPassword || loading) return;
    setLoading(true);
    try {
      await changePassword(form);
      setSuccess("تم تغيير كلمة المرور بنجاح. سجل الدخول مجددا بكلمة المرور الجديدة.");
      setForm({ currentPassword: "", password: "", confirmPassword: "" });
      onDone?.();
    } catch (submitError) {
      setError(friendlyError(submitError, "تعذر تغيير كلمة المرور."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <InputField label="كلمة المرور الحالية" icon={LockKeyhole} type="password" value={form.currentPassword} onChange={(event) => setForm((prev) => ({ ...prev, currentPassword: event.target.value }))} autoComplete="current-password" />
      <InputField label="كلمة المرور الجديدة" icon={LockKeyhole} type="password" value={form.password} onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))} autoComplete="new-password" error={form.password && !check.valid ? check.errors?.[0] : ""} />
      <InputField label="تأكيد كلمة المرور الجديدة" icon={LockKeyhole} type="password" value={form.confirmPassword} onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))} autoComplete="new-password" error={mismatch ? "كلمتا المرور غير متطابقتين." : ""} />
      {error && <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700"><AlertCircle size={16} className="shrink-0" />{error}</div>}
      {success && <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700"><CheckCircle2 size={16} className="shrink-0" />{success}</div>}
      <button type="submit" disabled={loading || !form.currentPassword || !check.valid || mismatch || !form.confirmPassword} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-sm font-black text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{loading && <LoaderCircle size={18} className="animate-spin" />}{loading ? "جاري الحفظ..." : "تغيير كلمة المرور"}</button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [touched, setTouched] = useState(false);

  const identifierError = useMemo(() => (!text(identifier) ? "أدخل البريد الإلكتروني أو المعرّف المسجل." : ""), [identifier]);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(identifier).toLowerCase());

  const onSubmit = async (event) => {
    event.preventDefault();
    setTouched(true);
    setError("");
    setSuccess("");
    if (identifierError || loading) return;

    setLoading(true);
    try {
      await requestPasswordReset({ identifier: text(identifier).toLowerCase() });
      setSuccess(RESET_GENERIC);
    } catch (submitError) {
      setError(friendlyError(submitError, "تعذر تسجيل طلب الاسترداد."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-slate-50 px-4 py-6 sm:py-10" dir="rtl">
      <div className="pointer-events-none absolute inset-0"><div className="absolute -right-28 -top-24 h-80 w-80 rounded-full bg-brand-600/10 blur-3xl" /><div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" /></div>
      <section className="relative mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-[28px] border border-white/80 bg-white/95 shadow-[0_26px_80px_rgba(15,23,42,0.12)]">
          <header className="border-b border-slate-100 bg-gradient-to-b from-brand-50/80 to-white px-6 pb-5 pt-7 sm:px-8">
            <BrandLockup />
            <div className="mt-4 text-center"><p className="text-[11px] font-black text-brand-700">استرداد آمن للحساب</p><h1 className="mt-1 text-xl font-black text-slate-950">إعادة تعيين كلمة المرور</h1><p className="mt-2 text-xs font-semibold leading-6 text-slate-500">أدخل بريد الحساب لإرسال رسالة إعادة تعيين من Firebase. للمعرّفات غير البريدية سيتم تسجيل طلب مراجعة آمن.</p></div>
          </header>

          <div className="px-6 py-6 sm:px-8">
            <div className="mb-5 flex items-start gap-2 rounded-2xl bg-slate-50 px-3.5 py-3 text-[11px] font-bold leading-5 text-slate-500"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-600" />لن نعرض ما إذا كان الحساب موجودا أم لا. تحقق من الوارد وJunk أو Quarantine إذا كان البريد مؤسسيا.</div>
            <form className="space-y-4" onSubmit={onSubmit} noValidate>
              <InputField label="البريد الإلكتروني أو المعرّف" icon={Mail} value={identifier} onChange={(event) => setIdentifier(event.target.value)} onBlur={() => setTouched(true)} error={touched ? identifierError : ""} inputMode={isEmail ? "email" : "text"} autoComplete="email" dir="ltr" />

              {error && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}
              {success && <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold leading-5 text-emerald-700"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{success}</div>}
              <button type="submit" disabled={loading || Boolean(identifierError)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-sm font-black text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{loading && <LoaderCircle size={18} className="animate-spin" />}{loading ? "جاري الإرسال..." : "إرسال تعليمات إعادة التعيين"}</button>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-5 text-center"><Link to="/login" className="text-xs font-black text-brand-700 hover:underline">العودة لتسجيل الدخول</Link></div>
          </div>
        </div>
      </section>
    </main>
  );
}
