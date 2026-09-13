import { Loader2 } from "lucide-react";
import clsx from "clsx";

const variants = {
  primary: "border-brand-600 bg-brand-600 text-white hover:bg-brand-700 hover:border-brand-700",
  secondary: "border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
  outline: "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
  ghost: "border-transparent bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
  danger: "border-rose-600 bg-rose-600 text-white hover:bg-rose-700 hover:border-rose-700",
};

const sizes = {
  sm: "h-8 px-3 text-[11px]",
  md: "h-9 px-4 text-xs",
  lg: "h-10 px-5 text-sm",
};

const iconSizes = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-10 w-10",
};

export default function Button({
  as: Component = "button",
  type = "button",
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  iconStart: IconStart,
  iconEnd: IconEnd,
  iconOnly = false,
  children,
  className = "",
  title,
  "aria-label": ariaLabel,
  ...props
}) {
  const isDisabled = disabled || loading;
  const label = ariaLabel || (typeof children === "string" ? children : title);

  return (
    <Component
      type={Component === "button" ? type : undefined}
      disabled={Component === "button" ? isDisabled : undefined}
      aria-disabled={Component !== "button" ? isDisabled : undefined}
      aria-label={iconOnly ? label : ariaLabel}
      title={title || (iconOnly ? label : undefined)}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55",
        iconOnly ? iconSizes[size] || iconSizes.md : sizes[size] || sizes.md,
        variants[variant] || variants.primary,
        className
      )}
      {...props}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : IconStart ? <IconStart size={15} /> : null}
      {!iconOnly && children}
      {!loading && IconEnd ? <IconEnd size={15} /> : null}
    </Component>
  );
}

export function IconButton(props) {
  return <Button iconOnly variant="ghost" {...props} />;
}
