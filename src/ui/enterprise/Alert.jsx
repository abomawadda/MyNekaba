import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import clsx from "clsx";
import Button from "./Button";

const config = {
  success: { icon: CheckCircle2, className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200" },
  info: { icon: Info, className: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200" },
  warning: { icon: AlertTriangle, className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200" },
  error: { icon: AlertCircle, className: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200" },
};

export default function Alert({ tone = "info", title, description, action, onDismiss, className = "" }) {
  const item = config[tone] || config.info;
  const Icon = item.icon;

  return (
    <div role="alert" className={clsx("flex items-start gap-3 rounded-xl border px-4 py-3 text-xs font-semibold leading-5", item.className, className)}>
      <Icon size={17} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold">{title}</p>}
        {description && <p className={clsx(title && "mt-0.5", "opacity-85")}>{description}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onDismiss && (
        <Button variant="ghost" size="sm" iconOnly iconStart={X} aria-label="إغلاق التنبيه" onClick={onDismiss} className="-my-1 -ms-1 text-current hover:bg-white/40" />
      )}
    </div>
  );
}
