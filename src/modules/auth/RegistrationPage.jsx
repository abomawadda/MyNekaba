import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Check,
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
import { validatePasswordPolicy } from "../../security/passwordPolicy";
import {
  clearRegistrationFirebaseSession,
  completeEmployeeRegistration,
  resendCurrentUserVerificationEmail,
  verifyEmployeeRegistrationIdentity,
} from "../../security/registrationApi";

const normalizeDigits = (value = "") =>
  String(value ?? "")
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
const normalizeText = (value = "") => String(value).trim();
const isEmail = (value = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value));

function friendlyError(error, fallback) {
  const raw = String(error?.message || error?.code || error || "");
  if (/network|unavailable|failed to fetch|timeout/i.test(raw)) {
    return "تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.";
  }
  return raw || fallback;
}

function InputField({ label, icon, type = "text", error, hint, ...props }) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";

  return (
    <label className="block space-y-2">
      <span className="text-xs font-extrabold text-slate-600">{label}</span>
      <div className="relative">
        {React.createElement(icon, { size: 18, className: "pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" })}
        <input
          {...props}
          type={isPassword && reveal ? "text" : type}
          aria-invalid={Boolean(error)}
          className={clsx(
            "min-h-12 w-full rounded-2xl border bg-slate-50/80 pr-11 text-sm font-semibold text-slate-900 outline-none transition",
            "placeholder:font-normal placeholder:text-slate-400 focus:bg-white focus:ring-4",
            isPassword ? "pl-12" : "pl-4",
            error ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-slate-200 focus:border-brand-500 focus:ring-brand-500/10"
          )}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((value) => !value)}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-700"
            aria-label={reveal ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          >
            {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error ? <span className="block text-[11px] font-bold text-rose-600">{error}</span> : hint ? <span className="block text-[10px] font-semibold text-slate-400">{hint}</span> : null}
    </label>
  );
}

function BrandLockup() {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm">
        <img src="/we-logo.png" alt="الشركة المصرية للاتصالات WE" className="h-full w-full object-contain" />
      </div>
      <div className="text-center">
        <p className="text-[10px] font-black text-brand-700">منظومة النقابة الرقمية</p>
      </div>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm">
        <img src="/brand-left.png" alt="شعار النقابة العامة" className="h-full w-full object-contain" />
      </div>
    </div>
  );
}

const steps = ["التحقق", "البريد", "كلمة المرور", "الاعتماد"];

export default function RegistrationPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [identity, setIdentity] = useState({ nationalId: "", jobCode: "", phone: "" });
  const [employee, setEmployee] = useState(null);
  const [verification, setVerification] = useState(null);
  const [emailMode, setEmailMode] = useState("new");
  const [credentials, setCredentials] = useState({ email: "", password: "", confirmPassword: "" });
  const [created, setCreated] = useState(null);
  const [resendCooldownUntil, setResendCooldownUntil] = useState(0);
  const [resendMessage, setResendMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState({});

  const emailForPolicy = emailMode === "registered" ? employee?.maskedEmail || "" : credentials.email;
  const passwordCheck = validatePasswordPolicy(credentials.password, {
    fullName: employee?.name,
    phone: identity.phone,
    email: emailForPolicy,
  });

  const identityErrors = useMemo(() => ({
    nationalId: normalizeDigits(identity.nationalId).length !== 14 ? "الرقم القومي يجب أن يتكون من 14 رقما." : "",
    jobCode: !normalizeText(identity.jobCode) ? "أدخل كود الموظف." : "",
    phone: !/^01\d{9}$/.test(normalizeDigits(identity.phone)) ? "أدخل رقم هاتف مصري صحيح من 11 رقما." : "",
  }), [identity]);

  const credentialsErrors = useMemo(() => ({
    email: emailMode === "registered" ? "" : !isEmail(credentials.email) ? "أدخل بريدا إلكترونيا صحيحا." : "",
    password: !passwordCheck.valid ? passwordCheck.errors?.[0] || "كلمة المرور لا تطابق سياسة الأمان." : "",
    confirmPassword: credentials.password !== credentials.confirmPassword ? "كلمتا المرور غير متطابقتين." : "",
  }), [credentials, emailMode, passwordCheck]);

  const handleVerify = async (event) => {
    event.preventDefault();
    setTouched({ nationalId: true, jobCode: true, phone: true });
    setError("");
    if (Object.values(identityErrors).some(Boolean) || submitting) return;

    setSubmitting(true);
    try {
      const result = await verifyEmployeeRegistrationIdentity({
        nationalId: normalizeDigits(identity.nationalId),
        employeeCode: normalizeDigits(identity.jobCode),
        phone: normalizeDigits(identity.phone),
      });
      setEmployee(result.employee);
      setVerification({
        id: result.verificationId,
        token: result.verificationToken,
        expiresAt: result.expiresAt,
      });
      setEmailMode(result.employee?.hasRegisteredEmail ? "registered" : "new");
      setTouched({});
      setStep(2);
    } catch (submitError) {
      setError(friendlyError(submitError, "تعذر التحقق من البيانات المدخلة. راجع البيانات وحاول مرة أخرى."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setTouched({ email: true, password: true, confirmPassword: true });
    setError("");
    if (Object.values(credentialsErrors).some(Boolean) || submitting) return;

    setSubmitting(true);
    try {
      const result = await completeEmployeeRegistration({
        verificationId: verification?.id,
        verificationToken: verification?.token,
        emailMode,
        email: emailMode === "registered" ? "" : normalizeText(credentials.email).toLowerCase(),
        password: credentials.password,
        confirmPassword: credentials.confirmPassword,
      });
      setCreated(result);
      setResendCooldownUntil(Date.now() + 60 * 1000);
      setResendMessage("تم إرسال رسالة تحقق إلى بريدك الإلكتروني. تحقق من الوارد وJunk أو Quarantine.");
      setStep(4);
    } catch (submitError) {
      setError(friendlyError(submitError, "تعذر إنشاء الحساب."));
    } finally {
      setSubmitting(false);
    }
  };

  const resendVerification = async () => {
    if (submitting || Date.now() < resendCooldownUntil) return;
    setSubmitting(true);
    setError("");
    setResendMessage("");
    try {
      await resendCurrentUserVerificationEmail();
      setResendCooldownUntil(Date.now() + 60 * 1000);
      setResendMessage("تم إرسال رسالة تحقق جديدة. إذا لم تظهر، تحقق من Junk أو Quarantine.");
    } catch (submitError) {
      setError(friendlyError(submitError, "تعذر إعادة إرسال رسالة التحقق."));
    } finally {
      setSubmitting(false);
    }
  };

  const goToLogin = async () => {
    await clearRegistrationFirebaseSession();
    navigate("/login", { replace: true });
  };

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-slate-50 px-4 py-6 sm:py-10" dir="rtl">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-28 -top-24 h-80 w-80 rounded-full bg-brand-600/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <section className="relative mx-auto w-full max-w-lg">
        <div className="overflow-hidden rounded-[28px] border border-white/80 bg-white/95 shadow-[0_26px_80px_rgba(15,23,42,0.12)]">
          <header className="border-b border-slate-100 bg-gradient-to-b from-brand-50/80 to-white px-6 pb-5 pt-7 sm:px-8">
            <BrandLockup />
            <div className="mt-4 text-center">
              <p className="text-[11px] font-black text-brand-700">عضوية رقمية موثقة</p>
              <h1 className="mt-1 text-xl font-black text-slate-950">إنشاء حساب عضو</h1>
              <p className="mt-2 text-xs font-semibold leading-6 text-slate-500">يتم التحقق من بيانات العضوية عبر الخادم قبل إنشاء الحساب.</p>
            </div>
          </header>

          <div className="px-6 py-6 sm:px-8">
            <div className="mb-6 grid grid-cols-4 gap-2">
              {steps.map((label, index) => {
                const current = index + 1;
                const done = step > current;
                const active = step === current;
                return (
                  <div key={label} className="text-center">
                    <div className={clsx("mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full text-xs font-black", done ? "bg-emerald-500 text-white" : active ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20" : "bg-slate-100 text-slate-400")}>{done ? <Check size={15} /> : current}</div>
                    <p className={clsx("text-[9px] font-bold leading-4", active || done ? "text-slate-600" : "text-slate-400")}>{label}</p>
                  </div>
                );
              })}
            </div>

            {error && (
              <div role="alert" className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">
                <AlertCircle size={17} className="mt-0.5 shrink-0" />{error}
              </div>
            )}

            {step === 1 && (
              <form className="space-y-4" onSubmit={handleVerify} noValidate>
                <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3.5 py-3 text-[11px] font-bold text-slate-500">
                  <ShieldCheck size={16} className="shrink-0 text-brand-600" />
                  أدخل البيانات كما هي مسجلة في سجلات العضوية.
                </div>
                <InputField label="الرقم القومي" icon={IdCard} value={identity.nationalId} onChange={(event) => setIdentity((prev) => ({ ...prev, nationalId: event.target.value }))} onBlur={() => setTouched((prev) => ({ ...prev, nationalId: true }))} error={touched.nationalId ? identityErrors.nationalId : ""} placeholder="14 رقما" inputMode="numeric" autoComplete="off" maxLength={14} dir="ltr" />
                <InputField label="كود الموظف" icon={Hash} value={identity.jobCode} onChange={(event) => setIdentity((prev) => ({ ...prev, jobCode: event.target.value }))} onBlur={() => setTouched((prev) => ({ ...prev, jobCode: true }))} error={touched.jobCode ? identityErrors.jobCode : ""} placeholder="الكود الوظيفي" inputMode="numeric" autoComplete="off" dir="ltr" />
                <InputField label="رقم الهاتف المسجل" icon={Phone} value={identity.phone} onChange={(event) => setIdentity((prev) => ({ ...prev, phone: event.target.value }))} onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))} error={touched.phone ? identityErrors.phone : ""} placeholder="01xxxxxxxxx" inputMode="tel" autoComplete="tel" maxLength={11} dir="ltr" />
                <button type="submit" disabled={submitting || Object.values(identityErrors).some(Boolean)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-sm font-black text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting && <LoaderCircle size={18} className="animate-spin" />}{submitting ? "جار التحقق..." : "تحقق من بياناتي"}</button>
              </form>
            )}

            {step === 2 && employee && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="mb-2 flex items-center gap-2 text-xs font-black text-emerald-700"><CheckCircle2 size={16} />تم التحقق من العضوية بنجاح</p>
                  <div className="grid gap-1.5 text-[11px] font-bold text-slate-600 sm:grid-cols-2">
                    <p>الاسم: <span className="text-slate-900">{employee.name || "عضو"}</span></p>
                    <p>الكود: <span className="text-slate-900">{employee.employeeCode || "—"}</span></p>
                    <p>الرقم القومي: <span className="text-slate-900" dir="ltr">{employee.maskedNationalId || "—"}</span></p>
                    <p>الصفة: <span className="text-slate-900">{employee.membershipStatus || "—"}</span></p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-3 text-xs font-black text-slate-700">اختيار البريد الإلكتروني</p>
                  {employee.hasRegisteredEmail && (
                    <label className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700">
                      <input type="radio" name="emailMode" checked={emailMode === "registered"} onChange={() => setEmailMode("registered")} />
                      استخدام البريد المسجل: <span dir="ltr">{employee.maskedEmail}</span>
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <input type="radio" name="emailMode" checked={emailMode === "new"} onChange={() => setEmailMode("new")} />
                    استخدام بريد إلكتروني آخر
                  </label>
                </div>

                <button type="button" onClick={() => setStep(3)} className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-brand-600 text-sm font-black text-white hover:bg-brand-700">متابعة</button>
              </div>
            )}

            {step === 3 && employee && (
              <form className="space-y-4" onSubmit={handleRegister} noValidate>
                {emailMode === "new" && (
                  <InputField label="البريد الإلكتروني" icon={Mail} type="email" value={credentials.email} onChange={(event) => setCredentials((prev) => ({ ...prev, email: event.target.value }))} onBlur={() => setTouched((prev) => ({ ...prev, email: true }))} error={touched.email ? credentialsErrors.email : ""} placeholder="name@example.com" autoComplete="email" dir="ltr" />
                )}
                {emailMode === "registered" && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
                    سيتم استخدام البريد المسجل: <span dir="ltr">{employee.maskedEmail}</span>
                  </div>
                )}
                <InputField label="كلمة المرور" icon={LockKeyhole} type="password" value={credentials.password} onChange={(event) => setCredentials((prev) => ({ ...prev, password: event.target.value }))} onBlur={() => setTouched((prev) => ({ ...prev, password: true }))} error={touched.password ? credentialsErrors.password : ""} autoComplete="new-password" hint="استخدم كلمة مرور قوية ومختلفة عن بياناتك الشخصية." />
                <InputField label="تأكيد كلمة المرور" icon={LockKeyhole} type="password" value={credentials.confirmPassword} onChange={(event) => setCredentials((prev) => ({ ...prev, confirmPassword: event.target.value }))} onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))} error={touched.confirmPassword ? credentialsErrors.confirmPassword : ""} autoComplete="new-password" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(2)} className="min-h-12 rounded-2xl border border-slate-200 px-5 text-sm font-black text-slate-600 hover:bg-slate-50">رجوع</button>
                  <button type="submit" disabled={submitting || Object.values(credentialsErrors).some(Boolean)} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-600 text-sm font-black text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting && <LoaderCircle size={18} className="animate-spin" />}{submitting ? "جار إنشاء الحساب..." : "إنشاء الحساب"}</button>
                </div>
              </form>
            )}

            {step === 4 && (
              <div className="space-y-4 py-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 size={30} /></div>
                <h2 className="mt-4 text-lg font-black text-slate-900">تم إنشاء حسابك بنجاح</h2>
                {created?.username && <p className="mt-2 text-xs font-bold text-slate-600">اسم المستخدم: <span dir="ltr" className="text-slate-900">{created.username}</span></p>}
                <p className="mt-2 text-xs font-semibold leading-6 text-slate-500">تم إرسال رسالة تحقق إلى بريدك الإلكتروني. بعد التحقق سيظل الحساب بانتظار اعتماد الإدارة قبل الدخول.</p>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right text-xs font-bold leading-6 text-slate-600">
                  <p>✓ تم إنشاء الحساب</p>
                  <p>○ التحقق من البريد الإلكتروني</p>
                  <p>○ انتظار اعتماد الإدارة</p>
                  <p>○ جاهز لتسجيل الدخول</p>
                </div>
                {resendMessage && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold leading-5 text-emerald-700">{resendMessage}</div>}
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={resendVerification} disabled={submitting || Date.now() < resendCooldownUntil} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                    {submitting && <LoaderCircle size={18} className="animate-spin" />}
                    إعادة إرسال رسالة التحقق
                  </button>
                  <button type="button" onClick={goToLogin} className="min-h-12 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white hover:bg-brand-700">
                    العودة لتسجيل الدخول
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 border-t border-slate-100 pt-5 text-center text-xs font-semibold text-slate-500">لديك حساب بالفعل؟ <Link to="/login" className="font-black text-brand-700 hover:underline">العودة لتسجيل الدخول</Link></div>
          </div>
        </div>
      </section>
    </main>
  );
}
