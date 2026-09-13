import clsx from "clsx";
import { surfaceClass } from "./utils";

export default function Toolbar({ search, filters, actions, selectionInfo, className = "" }) {
  return (
    <div className={clsx("rounded-xl border p-2.5", surfaceClass, className)}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {search}
          {filters}
        </div>
        {(selectionInfo || actions) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {selectionInfo && <span className="text-[11px] font-semibold text-slate-500">{selectionInfo}</span>}
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
