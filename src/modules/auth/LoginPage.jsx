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
import { USE_SUPABASE } from "../../lib/backend";

const normalize = (value = "") => String(value).trim();

function getFriendlyAuthError(error) {
  const raw = String(error?.message || error?.code || error || "");
  const lower = raw.toLowerCase();

  if (/قيد المراجعة|pending/.test(lower)) {
    return { type: "pending", message: "حسابك قيد المراجعة من إدارة النقابة. سيتم إشعارك بعد التفعيل، ويمكنك بعدها الدخول للحجز وطلب الخدمات." };
  }

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
    <main className="min-h-[100dvh] bg-slate-50 lg:grid lg:grid-cols-[1.05fr_1fr]" dir="rtl">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-[26rem] w-[26rem] rounded-full bg-fuchsia-400/20 blur-3xl" />
        <Link to="/" className="relative flex items-center gap-3">
          <img src="/brand-left.png" alt="" className="h-12 w-12 rounded-2xl bg-white object-contain p-1.5" />
          <span className="text-sm font-black">النقابة العامة للعاملين بالاتصالات</span>
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-black leading-[1.4]">بوابتك الموحدة لخدمات النقابة</h2>
          <p className="mt-4 text-sm font-semibold leading-8 text-white/75">
            حساب واحد للأعضاء وفريق العمل: احجز الرحلات، اطلب الخدمات، وتابع مزاياك وطلباتك لحظة بلحظة.
          </p>
          <ul className="mt-8 space-y-3 text-sm font-bold">
            {["طلب حجز الرحلات والمصايف إلكترونياً", "متابعة حالة الطلبات والحجوزات", "سجل المزايا والخدمات المصروفة", "حماية الحساب وإدارة الجلسات"].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <ShieldCheck size={18} className="shrink-0 text-fuchsia-200" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[11px] font-bold text-white/50">© {new Date().getFullYear()} النقابة العامة للعاملين بالاتصالات</p>
      </aside>

      {/* Form panel */}
      <section className="flex min-h-[100dvh] items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:text-right">
            <div className="lg:hidden"><BrandLockup /></div>
            <p className="mt-5 text-[11px] font-black tracking-wide text-brand-700 lg:mt-0">منظومة الخدمات النقابية الرقمية</p>
            <h1 className="mt-1 text-3xl font-black text-slate-950">تسجيل الدخول</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">أهلاً بعودتك. أدخل بيانات حسابك للمتابعة.</p>
          </div>

          <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">
            {resetComplete && (
              <div role="status" className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
                <div className="flex items-center gap-2 text-sm font-black">
                  <ShieldCheck size={17} className="shrink-0" />
                  تم تحديث كلمة المرور
                </div>
                <p className="mt-1 text-xs font-bold leading-5">يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.</p>
              </div>
            )}

            <form className="space-y-4" onSubmit={onSubmit} noValidate>
              <AuthField
                label={USE_SUPABASE ? "الكود الوظيفي" : "المعرّف"}
                icon={UserRound}
                value={form.identifier}
                onChange={(event) => setForm((prev) => ({ ...prev, identifier: event.target.value }))}
                onBlur={() => setTouched((prev) => ({ ...prev, identifier: true }))}
                error={touched.identifier ? fieldErrors.identifier : ""}
                placeholder={USE_SUPABASE ? "الكود الوظيفي أو اسم المستخدم" : "الكود الوظيفي أو الهاتف أو البريد الإلكتروني"}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
              />

              <AuthField
                label="كلمة المرور"
                icon={LockKeyhole}
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                error={touched.password ? fieldErrors.password : ""}
                placeholder="••••••••"
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
                disabled={loading}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <LoaderCircle size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                {loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
              </button>
            </form>

            <div className="mt-6 rounded-2xl bg-brand-50/70 p-4 text-center">
              <p className="text-xs font-bold text-slate-600">عضو بالنقابة وليس لديك حساب؟</p>
              <Link to="/register" className="mt-2 inline-flex items-center gap-1 text-sm font-black text-brand-700 hover:underline">
                إنشاء حساب عضو <ArrowLeft size={14} />
              </Link>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between text-[11px] font-bold text-slate-400">
            <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-brand-600" /> اتصال آمن ومشفّر</span>
            <Link to="/" className="inline-flex items-center gap-1 transition hover:text-slate-600">
              الصفحة الرئيسية <ArrowLeft size={13} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
