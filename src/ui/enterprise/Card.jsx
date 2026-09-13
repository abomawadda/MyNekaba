import clsx from "clsx";
import { surfaceClass } from "./utils";

export default function Card({
  title,
  description,
  action,
  footer,
  compact = false,
  children,
  className = "",
  bodyClassName = "",
}) {
  return (
    <section className={clsx("rounded-xl", surfaceClass, className)}>
      {(title || description || action) && (
        <header className={clsx("flex flex-col gap-2 border-b border-slate-200 dark:border-slate-700/80 sm:flex-row sm:items-start sm:justify-between", compact ? "px-4 py-3" : "px-5 py-4")}>
          <div className="min-w-0">
            {title && <h2 className="text-sm font-bold leading-6">{title}</h2>}
            {description && <p className="mt-0.5 text-[11px] font-semibold leading-5 text-slate-500">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={clsx(compact ? "p-4" : "p-5", bodyClassName)}>{children}</div>
      {footer && (
        <footer className={clsx("border-t border-slate-200 bg-slate-50/70 dark:border-slate-700/80 dark:bg-slate-900/30", compact ? "px-4 py-3" : "px-5 py-4")}>
          {footer}
        </footer>
      )}
    </section>
  );
}
