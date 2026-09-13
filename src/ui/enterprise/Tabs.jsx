import clsx from "clsx";

export default function Tabs({ tabs = [], value, onChange, className = "" }) {
  return (
    <div className={clsx("overflow-x-auto", className)} role="tablist" aria-orientation="horizontal">
      <div className="inline-flex min-w-full items-center gap-1 border-b border-slate-200 dark:border-slate-700/80">
        {tabs.map((tab) => {
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={tab.disabled}
              onClick={() => onChange?.(tab.value)}
              className={clsx(
                "relative h-9 shrink-0 px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50",
                active ? "text-brand-700 dark:text-brand-300" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              {tab.label}
              {tab.count !== undefined && <span className="num ms-1 text-[10px] text-slate-400">{tab.count}</span>}
              {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-600" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
