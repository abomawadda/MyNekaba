/* eslint-disable no-unused-vars */
import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  UserRound,
  WifiOff,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../app/providers/AuthProvider";

const normalize = (value = "") => String(value).trim();

function getFriendlyAuthError(error) {
  const raw = String(error?.message || error?.code || error || "");
  const lower = raw.toLowerCase();

  if (/digest|crypto\.subtle|subtle/.test(lower)) {
    return {
      type: "secure-context",
      message:
        "المتصفح لا يتيح التشفير المطلوب على هذا الاتصال. افتح المنظومة عبر HTTPS أو من عنوان آمن، ثم أعد المحاولة.",
    };
  }

  if (/network|unavailable|failed to fetch|timeout|offline/.test(lower)) {
    return { type: "network", message: "تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة." };
  }

  if (/permission-denied|unauthorized|forbidden|blocked|referer/.test(lower)) {
    return {
      type: "permission",
      message: "تم رفض الاتصال بالخدمة. راجع إعدادات النطاقات المسموح بها وصلاحيات خدمة المصادقة.",
    };
  }

  if (/invalid|wrong|password|credential|user-not-found/.test(lower)) {
    return { type: "credentials", message: "المعرّف أو كلمة المرور غير صحيحة." };
  }

  return { type: "generic", message: raw || "تعذر تسجيل الدخول. حاول مرة أخرى." };
}

function AuthField({ label, icon: Icon, type = "text", error, className, ...props }) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && reveal ? "text" : type;

  return (
    <label className="block space-y-2">
      <span className="text-xs font-extrabold text-slate-600">{label}</span>
      <div className="relative">
        <Icon
          size={18}
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          {...props}
          type={inputType}
          aria-invalid={Boolean(error)}
          className={clsx(
            "min-h-12 w-full rounded-2xl border bg-slate-50/80 pr-11 text-sm font-semibold text-slate-900 outline-none transition",
            "placeholder:font-normal placeholder:text-slate-400 focus:bg-white focus:ring-4",
            isPassword ? "pl-12" : "pl-4",
            error
              ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
              : "border-slate-200 focus:border-brand-500 focus:ring-brand-500/10",
            className
          )}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((value) => !value)}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            aria-label={reveal ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          >
            {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error && <span className="block text-[11px] font-bold text-rose-600">{error}</span>}
    </label>
  );
}

function BrandLockup() {
  return (
    <div className="flex items-center justify-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm">
        <img src="/brand-left.png" alt="شعار النقابة العامة" className="h-full w-full object-contain" />
      </div>
      <div className="h-9 w-px bg-slate-200" />
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm">
        <img src="/we-logo.png" alt="الشركة المصرية للاتصالات WE" className="h-full w-full object-contain" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithPassword } = useAuth();

  const [form, setForm] = useState({ identifier: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState({});

  const redirectTo = location.state?.from?.pathname || "/dashboardpage";
  const resetComplete = useMemo(
    () => new URLSearchParams(location.search).get("resetComplete") === "1",
    [location.search]
  );
  const fieldErrors = useMemo(
    () => ({
      identifier: !normalize(form.identifier) ? "أدخل اسم المستخدم أو البريد الإلكتروني أو الهاتف." : "",
      password: !form.password ? "أدخل كلمة المرور." : "",
    }),
    [form]
  );

  const isFormValid = !fieldErrors.identifier && !fieldErrors.password;

  const onSubmit = async (event) => {
    event.preventDefault();
    setTouched({ identifier: true, password: true });
    setError(null);

    if (!isFormValid || loading) return;

    setLoading(true);
    try {
      const loggedUser = await loginWithPassword({
        identifier: normalize(form.identifier),
        password: form.password,
      });
      navigate(loggedUser?.role === "member" ? "/portal" : redirectTo, { replace: true });
    } catch (submitError) {
      setError(getFriendlyAuthError(submitError));
    } finally {
      setLoading(false);
    }
  };

  const errorIcon = error?.type === "network" ? WifiOff : AlertCircle;
  const ErrorIcon = errorIcon;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-slate-50 px-4 py-6 sm:py-10" dir="rtl">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-28 -top-24 h-80 w-80 rounded-full bg-brand-600/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-brand-50/80 to-transparent" />
      </div>

      <section className="relative mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md items-center sm:min-h-[calc(100dvh-5rem)]">
        <div className="w-full overflow-hidden rounded-[28px] border border-white/80 bg-white/95 shadow-[0_26px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <header className="border-b border-slate-100 bg-gradient-to-b from-brand-50/80 via-white to-white px-6 pb-6 pt-7 sm:px-8">
            <BrandLockup />
            <div className="mt-5 text-center">
              <p className="mb-1 text-[11px] font-black tracking-wide text-brand-700">منظومة الخدمات النقابية الرقمية</p>
              <h1 className="text-2xl font-black text-slate-950">نظام النقابة العامة</h1>
              <p className="mt-2 text-xs font-semibold leading-6 text-slate-500">سجّل الدخول للوصول إلى الخدمات والبيانات المصرح بها.</p>
            </div>
          </header>

          <div className="px-6 py-6 sm:px-8 sm:py-7">
            {resetComplete && (
              <div role="status" className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
                <div className="flex items-center gap-2 text-sm font-black">
                  <ShieldCheck size={17} className="shrink-0" />
                  تم تحديث كلمة المرور
                </div>
                <p className="mt-1 text-xs font-bold leading-5">يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.</p>
              </div>
            )}
            <div className="mb-5 flex items-center gap-2 rounded-2xl bg-slate-50 px-3.5 py-3 text-[11px] font-bold text-slate-500">
              <ShieldCheck size={16} className="shrink-0 text-brand-600" />
              اتصال آمن وحسابات مخصصة لمنسوبي المنظومة
            </div>

            <form className="space-y-4" onSubmit={onSubmit} noValidate>
              <AuthField
                label="المعرّف"
                icon={UserRound}
                value={form.identifier}
                onChange={(event) => setForm((prev) => ({ ...prev, identifier: event.target.value }))}
                onBlur={() => setTouched((prev) => ({ ...prev, identifier: true }))}
                error={touched.identifier ? fieldErrors.identifier : ""}
                placeholder="الهاتف أو البريد الإلكتروني أو اسم المستخدم"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />

              <AuthField
                label="كلمة المرور"
                icon={LockKeyhole}
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                error={touched.password ? fieldErrors.password : ""}
                placeholder="كلمة المرور"
                autoComplete="current-password"
              />

              <div className="flex justify-end">
                <Link to="/reset-password" className="text-xs font-black text-brand-700 hover:underline">
                  نسيت كلمة المرور؟
                </Link>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">
                  <ErrorIcon size={17} className="mt-0.5 shrink-0" />
                  <span>{error.message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !isFormValid}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-lg shadow-brand-600/15 transition hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <LoaderCircle size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                {loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-5 text-center">
              <p className="text-xs font-semibold text-slate-500">
                لا تملك حسابًا؟{" "}
                <Link to="/register" className="font-black text-brand-700 hover:underline">إنشاء حساب عضو</Link>
              </p>
              <Link to="/" className="mt-4 inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 transition hover:text-slate-600">
                العودة للصفحة الرئيسية <ArrowLeft size={13} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
