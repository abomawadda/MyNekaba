import clsx from "clsx";
import FormField from "./FormField";
import { inputBaseClass } from "./utils";

function controlClass(error, ltr, className) {
  return clsx(
    inputBaseClass,
    "rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:ring-brand-500/20 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-brand-400 dark:focus:ring-brand-400/20",
    error ? "border-rose-300 dark:border-rose-500/60" : "border-slate-300 dark:border-slate-600",
    ltr && "ltr text-left",
    className
  );
}

export function Input({ label, error, helper, required, description, prefix, suffix, icon: Icon, ltr = false, className = "", inputClassName = "", ...props }) {
  return (
    <FormField label={label} error={error} helper={helper} required={required} description={description} className={className}>
      <div className="relative">
        {Icon && <Icon size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />}
        {prefix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400">{prefix}</span>}
        <input className={controlClass(error, ltr, clsx((Icon || prefix) && "pr-9", suffix && "pl-10", inputClassName))} aria-invalid={Boolean(error)} required={required} {...props} />
        {suffix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400">{suffix}</span>}
      </div>
    </FormField>
  );
}

export function Select({ label, error, helper, required, description, className = "", inputClassName = "", children, ...props }) {
  return (
    <FormField label={label} error={error} helper={helper} required={required} description={description} className={className}>
      <select className={controlClass(error, false, inputClassName)} aria-invalid={Boolean(error)} required={required} {...props}>
        {children}
      </select>
    </FormField>
  );
}

export function Textarea({ label, error, helper, required, description, className = "", inputClassName = "", rows = 4, ...props }) {
  return (
    <FormField label={label} error={error} helper={helper} required={required} description={description} className={className}>
      <textarea className={controlClass(error, false, clsx("min-h-24 resize-y leading-5", inputClassName))} rows={rows} aria-invalid={Boolean(error)} required={required} {...props} />
    </FormField>
  );
}
