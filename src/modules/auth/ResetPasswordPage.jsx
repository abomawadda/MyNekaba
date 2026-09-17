import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Hash,
  IdCard,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Phone,
  ShieldCheck,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../app/providers/AuthProvider";
import { validatePasswordPolicy } from "../../security/passwordPolicy";
import { requestAccountRecovery } from "../../security/registrationApi";

const digits = (value = "") => String(value).replace(/\D/g, "");
const text = (value = "") => String(value).trim();
const EMAIL_SUCCESS = "إذا كان البريد مرتبطًا بحساب صالح، فستصلك رسالة تحتوي على رابط إعادة تعيين كلمة المرور. يرجى مراجعة البريد الوارد ومجلد الرسائل غير المرغوب فيها أو Quarantine.";
const ADMIN_SUCCESS = "إذا كانت البيانات مرتبطة بحساب صالح، فقد تم تسجيل طلب الاسترداد لإتمام المراجعة من الإدارة.";
const RESEND_COOLDOWN_SECONDS = 60;

function friendlyError(error, fallback) {
  const raw = String(error?.message || error?.code || error || "");
  const reason = String(error?.reason || "");
  if (/INVALID_EMAIL/.test(reason)) return "يرجى إدخال بريد إلكتروني بصيغة صحيحة.";
  if (/TOO_MANY_REQUESTS/.test(reason)) return "تم إرسال عدد كبير من الطلبات. يرجى الانتظار قليلًا قبل المحاولة مرة أخرى.";
  if (/NETWORK_ERROR|PROVIDER_DISABLED|UNAUTHORIZED_CONTINUE_URI|PROVIDER_ERROR/.test(reason)) {
    return "تعذر إكمال الطلب حاليًا. يرجى المحاولة مرة أخرى بعد قليل.";
  }
  if (/network|unavailable|failed to fetch|timeout/i.test(raw)) return "تعذر إكمال الطلب حاليًا. يرجى المحاولة مرة أخرى بعد قليل.";
  return fallback;
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
  const [method, setMethod] = useState("email");
  const [email, setEmail] = useState("");
  const [adminForm, setAdminForm] = useState({ nationalId: "", jobCode: "", phone: "" });
  const [loading, setLoading] = useState("");
  const [emailError, setEmailError] = useState("");
  const [adminError, setAdminError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [adminSuccess, setAdminSuccess] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [adminTouched, setAdminTouched] = useState({});
  const [cooldown, setCooldown] = useState(0);

  const normalizedEmail = text(email).toLowerCase();
  const emailValidationError = useMemo(
    () => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ? "" : "يرجى إدخال بريد إلكتروني بصيغة صحيحة."),
    [normalizedEmail]
  );
  const adminErrors = useMemo(() => ({
    nationalId: digits(adminForm.nationalId).length !== 14 ? "الرقم القومي يجب أن يتكون من 14 رقمًا." : "",
    jobCode: !text(adminForm.jobCode) ? "أدخل كود الموظف." : "",
    phone: !/^01\d{9}$/.test(digits(adminForm.phone)) ? "أدخل رقم الهاتف المسجل بصورة صحيحة." : "",
  }), [adminForm]);
  const adminInvalid = Object.values(adminErrors).some(Boolean);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const submitEmailReset = async (event) => {
    event.preventDefault();
    setEmailTouched(true);
    setEmailError("");
    if (emailValidationError || loading || cooldown > 0) return;

    setLoading("email");
    try {
      await requestPasswordReset({ email: normalizedEmail });
      setEmailSuccess(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (submitError) {
      setEmailError(friendlyError(submitError, "تعذر إكمال الطلب حاليًا. يرجى المحاولة مرة أخرى بعد قليل."));
    } finally {
      setLoading("");
    }
  };

  const submitAdminRecovery = async (event) => {
    event.preventDefault();
    setAdminTouched({ nationalId: true, jobCode: true, phone: true });
    setAdminError("");
    if (adminInvalid || loading) return;

    setLoading("admin");
    try {
      await requestAccountRecovery({
        nationalId: digits(adminForm.nationalId),
        jobCode: text(adminForm.jobCode),
        phone: digits(adminForm.phone),
      });
      setAdminSuccess(true);
    } catch (submitError) {
      setAdminError(friendlyError(submitError, "تعذر تسجيل طلب الاسترداد حاليًا. يرجى المحاولة مرة أخرى بعد قليل."));
    } finally {
      setLoading("");
    }
  };

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-slate-50 px-4 py-6 sm:py-10" dir="rtl">
      <div className="pointer-events-none absolute inset-0"><div className="absolute -right-28 -top-24 h-80 w-80 rounded-full bg-brand-600/10 blur-3xl" /><div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" /></div>
      <section className="relative mx-auto w-full max-w-2xl">
        <div className="overflow-hidden rounded-[28px] border border-white/80 bg-white/95 shadow-[0_26px_80px_rgba(15,23,42,0.12)]">
          <header className="border-b border-slate-100 bg-gradient-to-b from-brand-50/80 to-white px-6 pb-5 pt-7 sm:px-8">
            <BrandLockup />
            <div className="mt-4 text-center"><p className="text-[11px] font-black text-brand-700">استرداد آمن للحساب</p><h1 className="mt-1 text-xl font-black text-slate-950">استرداد الحساب</h1><p className="mt-2 text-xs font-semibold leading-6 text-slate-500">اختر الطريقة المناسبة لاسترداد الوصول إلى حسابك. إذا كان لديك وصول إلى بريدك المسجل، استخدم إعادة تعيين كلمة المرور بالبريد. وإذا لم تتمكن من الوصول إلى البريد، يمكنك تقديم طلب استرداد لمراجعته من الإدارة.</p></div>
          </header>

          <div className="px-6 py-6 sm:px-8">
            <div className="mb-5 grid grid-cols-1 gap-2 rounded-2xl bg-slate-100 p-1 sm:grid-cols-2" role="tablist" aria-label="طرق استرداد الحساب">
              <button type="button" role="tab" aria-selected={method === "email"} onClick={() => setMethod("email")} className={clsx("min-h-11 rounded-xl px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-brand-500/30", method === "email" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>إعادة التعيين بالبريد</button>
              <button type="button" role="tab" aria-selected={method === "admin"} onClick={() => setMethod("admin")} className={clsx("min-h-11 rounded-xl px-3 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-brand-500/30", method === "admin" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>لا أستطيع الوصول إلى بريدي</button>
            </div>

            {method === "email" && <div role="tabpanel" className="rounded-3xl border border-slate-200 p-4 sm:p-5">
              <h2 className="text-base font-black text-slate-900">إعادة تعيين كلمة المرور بالبريد الإلكتروني</h2>
              <p className="mt-2 text-xs font-semibold leading-6 text-slate-500">سنرسل رابطًا آمنًا إلى البريد الإلكتروني المسجل بالحساب. لن نعرض ما إذا كان البريد مسجلًا أم لا حفاظًا على الخصوصية.</p>
              <form className="mt-4 space-y-4" onSubmit={submitEmailReset} noValidate>
                <InputField label="البريد الإلكتروني المسجل" icon={Mail} value={email} onChange={(event) => setEmail(event.target.value)} onBlur={() => setEmailTouched(true)} error={emailTouched ? emailValidationError : ""} inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} dir="ltr" />
                {emailError && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700"><AlertCircle size={17} className="mt-0.5 shrink-0" />{emailError}</div>}
                {emailSuccess && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-800"><div className="flex items-center gap-2 text-sm font-black"><CheckCircle2 size={18} />تم استلام طلب إعادة تعيين كلمة المرور</div><p className="mt-2 text-xs font-bold leading-6">{EMAIL_SUCCESS}</p></div>}
                <button type="submit" disabled={loading !== "" || Boolean(emailValidationError) || cooldown > 0} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-sm font-black text-white hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50">{loading === "email" && <LoaderCircle size={18} className="animate-spin" />}{loading === "email" ? "جاري الإرسال..." : cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ثانية` : emailSuccess ? "إعادة الإرسال" : "إرسال رابط إعادة تعيين كلمة المرور"}</button>
              </form>
            </div>}

            {method === "admin" && <div role="tabpanel" className="rounded-3xl border border-slate-200 p-4 sm:p-5">
              <h2 className="text-base font-black text-slate-900">لا أستطيع الوصول إلى بريدي</h2>
              <p className="mt-2 text-xs font-semibold leading-6 text-slate-500">يمكنك تقديم طلب استرداد للحساب لمراجعته من الإدارة بعد مطابقة بيانات الموظف. هذا الطلب لا يغيّر كلمة المرور مباشرة.</p>
              {!adminSuccess ? <form className="mt-4 space-y-4" onSubmit={submitAdminRecovery} noValidate>
                <InputField label="الرقم القومي" icon={IdCard} value={adminForm.nationalId} onChange={(event) => setAdminForm((prev) => ({ ...prev, nationalId: event.target.value }))} onBlur={() => setAdminTouched((prev) => ({ ...prev, nationalId: true }))} error={adminTouched.nationalId ? adminErrors.nationalId : ""} inputMode="numeric" maxLength={14} autoComplete="off" dir="ltr" />
                <InputField label="كود الموظف" icon={Hash} value={adminForm.jobCode} onChange={(event) => setAdminForm((prev) => ({ ...prev, jobCode: event.target.value }))} onBlur={() => setAdminTouched((prev) => ({ ...prev, jobCode: true }))} error={adminTouched.jobCode ? adminErrors.jobCode : ""} inputMode="numeric" autoComplete="off" dir="ltr" />
                <InputField label="رقم الهاتف المسجل" icon={Phone} value={adminForm.phone} onChange={(event) => setAdminForm((prev) => ({ ...prev, phone: event.target.value }))} onBlur={() => setAdminTouched((prev) => ({ ...prev, phone: true }))} error={adminTouched.phone ? adminErrors.phone : ""} inputMode="tel" maxLength={11} autoComplete="tel" dir="ltr" />
                {adminError && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700"><AlertCircle size={17} className="mt-0.5 shrink-0" />{adminError}</div>}
                <button type="submit" disabled={loading !== "" || adminInvalid} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-sm font-black text-white hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50">{loading === "admin" && <LoaderCircle size={18} className="animate-spin" />}{loading === "admin" ? "جارٍ تسجيل الطلب..." : "تسجيل طلب استرداد الحساب"}</button>
              </form> : <div role="status" className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-800"><div className="flex items-center gap-2 text-sm font-black"><CheckCircle2 size={18} />تم تسجيل طلب استرداد الحساب</div><p className="mt-2 text-xs font-bold leading-6">{ADMIN_SUCCESS}</p><button type="button" onClick={() => { setAdminSuccess(false); setAdminForm({ nationalId: "", jobCode: "", phone: "" }); setAdminTouched({}); }} className="mt-3 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-black text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30">تقديم طلب جديد</button></div>}
            </div>}

            <div className="mt-6 border-t border-slate-100 pt-5 text-center"><Link to="/login" className="text-xs font-black text-brand-700 hover:underline">العودة لتسجيل الدخول</Link></div>
          </div>
        </div>
      </section>
    </main>
  );
}
