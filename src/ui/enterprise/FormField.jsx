import clsx from "clsx";

export default function FormField({
  label,
  required = false,
  helper = "",
  description = "",
  error = "",
  children,
  className = "",
}) {
  return (
    <label className={clsx("block space-y-1.5", className)}>
      {label && (
        <span className="block text-[11px] font-semibold leading-5 text-slate-600 dark:text-slate-300">
          {label}
          {required && <span className="me-1 text-rose-600" aria-hidden="true">*</span>}
        </span>
      )}
      {description && <span className="block text-[10px] font-semibold leading-4 text-slate-400">{description}</span>}
      {children}
      {(error || helper) && (
        <span className={clsx("block text-[10px] font-semibold leading-4", error ? "text-rose-600" : "text-slate-400")}>
          {error || helper}
        </span>
      )}
    </label>
  );
}
