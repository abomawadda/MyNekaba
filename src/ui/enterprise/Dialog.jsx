import { X } from "lucide-react";
import clsx from "clsx";
import Button from "./Button";
import { surfaceClass } from "./utils";

const sizes = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export default function Dialog({
  open = true,
  title,
  description,
  children,
  footer,
  onClose,
  size = "md",
  className = "",
  bodyClassName = "",
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "enterprise-dialog-title" : undefined}
        className={clsx("flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-xl", sizes[size] || sizes.md, surfaceClass, className)}
      >
        {(title || description || onClose) && (
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700/80">
            <div className="min-w-0">
              {title && <h2 id="enterprise-dialog-title" className="text-sm font-bold leading-6">{title}</h2>}
              {description && <p className="mt-0.5 text-[11px] font-semibold leading-5 text-slate-500">{description}</p>}
            </div>
            {onClose && <Button variant="ghost" size="sm" iconOnly iconStart={X} aria-label="إغلاق النافذة" onClick={onClose} />}
          </header>
        )}
        <div className={clsx("min-h-0 flex-1 overflow-y-auto p-5", bodyClassName)}>{children}</div>
        {footer && <footer className="border-t border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-700/80 dark:bg-slate-900/30">{footer}</footer>}
      </section>
    </div>
  );
}
