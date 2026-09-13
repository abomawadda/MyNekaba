import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "./Button";

export default function Pagination({
  page = 1,
  pageCount = 1,
  total,
  onPageChange,
  previousLabel = "السابق",
  nextLabel = "التالي",
  className = "",
}) {
  const safePage = Math.min(Math.max(page, 1), Math.max(pageCount, 1));

  return (
    <nav className={`flex flex-col gap-2 text-xs font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between ${className}`} aria-label="ترقيم الصفحات">
      <span>
        صفحة <span className="num">{safePage}</span> من <span className="num">{pageCount}</span>
        {total !== undefined && <>، الإجمالي <span className="num">{total}</span></>}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" iconStart={ChevronRight} disabled={safePage <= 1} onClick={() => onPageChange?.(safePage - 1)}>
          {previousLabel}
        </Button>
        <Button variant="outline" size="sm" iconEnd={ChevronLeft} disabled={safePage >= pageCount} onClick={() => onPageChange?.(safePage + 1)}>
          {nextLabel}
        </Button>
      </div>
    </nav>
  );
}
