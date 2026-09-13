import clsx from "clsx";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { getIconTone, surfaceClass } from "./utils";

const trendIcons = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
};

export default function StatCard({
  label,
  value,
  sub,
  comparison,
  trend,
  icon: Icon,
  tone = "brand",
  compact = false,
  className = "",
}) {
  const TrendIcon = trendIcons[trend?.direction] || null;

  return (
    <section className={clsx("rounded-xl border p-4", surfaceClass, compact ? "space-y-2" : "space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold leading-5 text-slate-500">{label}</p>
          <p className="num mt-1 text-2xl font-bold leading-none text-slate-950 dark:text-white">{value}</p>
        </div>
        {Icon && (
          <div className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", getIconTone(tone))}>
            <Icon size={18} />
          </div>
        )}
      </div>
      {(sub || comparison || trend) && (
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-500">
          {sub && <span>{sub}</span>}
          {comparison && <span>{comparison}</span>}
          {trend && (
            <span className={clsx("inline-flex items-center gap-1", trend.direction === "up" && "text-emerald-600", trend.direction === "down" && "text-rose-600")}>
              {TrendIcon && <TrendIcon size={12} />}
              {trend.label}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
