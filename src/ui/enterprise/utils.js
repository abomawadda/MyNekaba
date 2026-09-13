import clsx from "clsx";

export const toneClasses = {
  brand: "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:border-brand-400/30",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-400/30",
  danger: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-400/30",
  warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-400/30",
  info: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-400/30",
  neutral: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-400/30",
};

export const iconToneClasses = {
  brand: "bg-brand-600/10 text-brand-700 dark:text-brand-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  danger: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  neutral: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
};

export const statusVariants = {
  active: "success",
  enabled: "success",
  paid: "success",
  completed: "success",
  posted: "success",
  pending: "warning",
  draft: "warning",
  waiting: "warning",
  partial: "info",
  info: "info",
  cancelled: "danger",
  canceled: "danger",
  rejected: "danger",
  failed: "danger",
  inactive: "neutral",
  archived: "neutral",
};

export const inputBaseClass =
  "w-full border px-3 py-2 text-xs font-semibold outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

export const surfaceClass =
  "border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/70 dark:text-slate-100";

export function getTone(tone = "neutral") {
  return toneClasses[tone] || toneClasses.neutral;
}

export function getIconTone(tone = "neutral") {
  return iconToneClasses[tone] || iconToneClasses.neutral;
}

export function getStatusTone(status, fallback = "neutral") {
  if (!status) return fallback;
  return statusVariants[String(status).toLowerCase()] || fallback;
}

export function cx(...values) {
  return clsx(values);
}
