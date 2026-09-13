import { Loader2, Search, X } from "lucide-react";
import clsx from "clsx";
import Button from "./Button";

export default function SearchInput({
  value,
  onChange,
  placeholder = "بحث...",
  loading = false,
  clearable = true,
  className = "",
  inputClassName = "",
}) {
  const hasValue = value !== undefined && value !== null && String(value).length > 0;

  return (
    <div className={clsx("relative min-w-[180px] flex-1", className)}>
      <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className={clsx("h-9 w-full rounded-lg border border-slate-300 bg-white pr-9 pl-9 text-xs font-semibold outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100", inputClassName)}
      />
      {loading ? (
        <Loader2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
      ) : clearable && hasValue ? (
        <Button iconOnly variant="ghost" size="sm" iconStart={X} aria-label="مسح البحث" onClick={() => onChange?.("")} className="absolute left-1 top-1/2 -translate-y-1/2" />
      ) : null}
    </div>
  );
}
