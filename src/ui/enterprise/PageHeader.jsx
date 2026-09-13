import clsx from "clsx";
import Breadcrumb from "./Breadcrumb";
import { getIconTone, surfaceClass } from "./utils";

export default function PageHeader({
  title,
  hint,
  description,
  crumbs = [],
  breadcrumb,
  actions = null,
  primaryAction = null,
  secondaryActions = null,
  metadata = null,
  icon: Icon = null,
  tone = "brand",
  className = "",
}) {
  return (
    <header className={clsx("rounded-xl border p-4 md:p-5", surfaceClass, className)}>
      {(breadcrumb || crumbs.length > 0) && (
        <div className="mb-2">
          {breadcrumb || <Breadcrumb items={crumbs} />}
        </div>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <div className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", getIconTone(tone))}>
              <Icon size={20} />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-7 tracking-normal md:text-xl">{title}</h1>
            {(hint || description) && <p className="mt-0.5 max-w-3xl text-[11px] font-semibold leading-5 text-slate-500">{hint || description}</p>}
            {metadata && <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-500">{metadata}</div>}
          </div>
        </div>
        {(actions || primaryAction || secondaryActions) && (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {secondaryActions}
            {actions}
            {primaryAction}
          </div>
        )}
      </div>
    </header>
  );
}
