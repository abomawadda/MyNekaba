import { AlertTriangle, FileSearch, Loader2, RefreshCw } from "lucide-react";
import clsx from "clsx";
import Button from "./Button";
import { surfaceClass } from "./utils";

export function Skeleton({ variant = "text", rows = 1, className = "" }) {
  if (variant === "table") {
    return (
      <div className={clsx("space-y-2", className)} aria-hidden="true">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="grid grid-cols-4 gap-2">
            {[100, 80, 70, 55].map((width, cellIndex) => (
              <span key={cellIndex} className="h-8 rounded-lg bg-slate-200/80 dark:bg-slate-700/60" style={{ width: `${width}%` }} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={clsx("rounded-xl border p-4", surfaceClass, className)} aria-hidden="true">
        <div className="mb-4 h-8 w-8 rounded-lg bg-slate-200/80 dark:bg-slate-700/60" />
        <div className="mb-2 h-3 w-3/4 rounded bg-slate-200/80 dark:bg-slate-700/60" />
        <div className="h-3 w-1/2 rounded bg-slate-200/80 dark:bg-slate-700/60" />
      </div>
    );
  }

  return (
    <span
      className={clsx("block rounded bg-slate-200/80 dark:bg-slate-700/60", variant === "rectangle" ? "h-20" : "h-3", className)}
      aria-hidden="true"
    />
  );
}

export function LoadingState({ title = "جاري التحميل...", mode = "skeleton", rows = 3, className = "" }) {
  return (
    <div className={clsx("rounded-xl border p-5", surfaceClass, className)} aria-busy="true" aria-live="polite">
      <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Loader2 size={16} className="animate-spin text-brand-600" />
        <p>{title}</p>
      </div>
      {mode === "spinner" ? null : <Skeleton variant="table" rows={rows} />}
    </div>
  );
}

export function EmptyState({
  title = "لا توجد بيانات",
  hint = "",
  description = "",
  action = null,
  icon = FileSearch,
  className = "",
}) {
  const EmptyIcon = icon;

  return (
    <div className={clsx("flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center", surfaceClass, className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 dark:text-brand-300">
        <EmptyIcon size={22} />
      </div>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-100">{title}</p>
      {(hint || description) && <p className="mt-1 max-w-md text-[11px] font-semibold leading-5 text-slate-500">{hint || description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "حدث خطأ", hint = "", description = "", onRetry = null, retryLabel = "إعادة المحاولة", className = "" }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/70 p-8 text-center dark:border-rose-400/30 dark:bg-rose-500/10", className)}>
      <AlertTriangle size={26} className="mb-2 text-rose-600" />
      <p className="text-sm font-bold text-rose-700 dark:text-rose-200">{title}</p>
      {(hint || description) && <p className="mt-1 max-w-md text-[11px] font-semibold leading-5 text-slate-500">{hint || description}</p>}
      {onRetry && <Button variant="danger" size="sm" iconStart={RefreshCw} onClick={onRetry} className="mt-4">{retryLabel}</Button>}
    </div>
  );
}
