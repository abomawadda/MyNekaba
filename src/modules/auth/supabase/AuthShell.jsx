import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import clsx from "clsx";

export function AuthShell({ eyebrow, title, subtitle, children, footer }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-8" dir="rtl">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <img src="/brand-left.png" alt="شعار النقابة" className="h-full w-full object-contain" />
          </Link>
          {eyebrow && <p className="mt-4 text-[11px] font-black tracking-wide text-brand-700">{eyebrow}</p>}
          <h1 className="mt-1 text-2xl font-black text-slate-950">{title}</h1>
          {subtitle && <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{subtitle}</p>}
        </div>
        <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">{children}</div>
        <div className="mt-5 flex items-center justify-between text-[11px] font-bold text-slate-400">
          {footer || <span />}
          <Link to="/" className="inline-flex items-center gap-1 hover:text-slate-600">الصفحة الرئيسية <ArrowLeft size={13} /></Link>
        </div>
      </div>
    </main>
  );
}

export function Field({ label, error, hint, type = "text", ...props }) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-extrabold text-slate-600">{label}</span>
      <div className="relative">
        <input
          {...props}
          type={isPassword && reveal ? "text" : type}
          aria-invalid={Boolean(error)}
          className={clsx(
            "min-h-12 w-full rounded-2xl border bg-slate-50/80 px-4 text-sm font-semibold text-slate-900 outline-none transition focus:bg-white focus:ring-4",
            isPassword && "pl-12",
            error ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:border-brand-500 focus:ring-brand-500/10"
          )}
        />
        {isPassword && (
          <button type="button" onClick={() => setReveal((v) => !v)} className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 hover:text-brand-700" aria-label={reveal ? "إخفاء" : "إظهار"}>
            {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error ? <span className="block text-[11px] font-bold text-rose-600">{error}</span> : hint ? <span className="block text-[11px] font-semibold text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function SubmitButton({ loading, children, ...props }) {
  return (
    <button
      type="submit"
      disabled={loading}
      {...props}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "جارٍ التنفيذ..." : children}
    </button>
  );
}

export function Notice({ tone = "rose", children }) {
  const tones = {
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    brand: "border-brand-100 bg-brand-50 text-brand-800",
  };
  return <div role={tone === "rose" ? "alert" : "status"} className={clsx("rounded-2xl border px-4 py-3 text-xs font-bold leading-6", tones[tone])}>{children}</div>;
}
