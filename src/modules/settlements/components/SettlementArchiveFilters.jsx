import { Download } from "lucide-react";
import { FilterBar, SearchInput, StatusBadge } from "../../../ui/enterprise";

export default function SettlementArchiveFilters({
  search,
  onSearchChange,
  month,
  onMonthChange,
  year,
  onYearChange,
  months,
  years,
  resultCount = 0,
  attachmentCount = 0,
  onOpenMigration,
}) {
  return (
    <FilterBar collapsedLabel="فلاتر الأرشيف" className="justify-end">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder="بحث بالمسؤول أو الشيك..."
        className="min-w-[220px] md:w-64"
      />
      <select
        value={month}
        onChange={(event) => onMonthChange?.(event.target.value)}
        className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
      >
        <option value="all">كل الشهور</option>
        {months.map((monthName, index) => (
          <option key={monthName} value={String(index + 1).padStart(2, "0")}>
            {monthName}
          </option>
        ))}
      </select>
      <select
        value={year}
        onChange={(event) => onYearChange?.(event.target.value)}
        className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
      >
        <option value="all">كل السنوات</option>
        {years.map((yearValue) => (
          <option key={yearValue} value={yearValue}>
            {yearValue}
          </option>
        ))}
      </select>
      <StatusBadge tone="info">النتائج: {resultCount.toLocaleString("ar-EG")}</StatusBadge>
      <button
        type="button"
        onClick={onOpenMigration}
        title="ترحيل المرفقات المحفوظة كنصوص إلى التخزين السحابي"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 text-[10px] font-bold text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-800/40 dark:bg-sky-900/20 dark:text-sky-300"
      >
        <Download size={14} />
        ترحيل المرفقات ({attachmentCount.toLocaleString("ar-EG")})
      </button>
    </FilterBar>
  );
}
