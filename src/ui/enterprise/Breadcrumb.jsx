import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import clsx from "clsx";

export default function Breadcrumb({ items = [], className = "" }) {
  if (!items.length) return null;

  return (
    <nav className={clsx("overflow-x-auto text-[10px] font-semibold text-slate-500", className)} aria-label="مسار الصفحة">
      <ol className="flex min-w-0 items-center gap-1 whitespace-nowrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronLeft size={11} className="text-slate-400" aria-hidden="true" />}
              {item.to && !isLast ? (
                <Link to={item.to} className="hover:text-brand-700">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined} className={clsx(isLast && "text-slate-700 dark:text-slate-200")}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
