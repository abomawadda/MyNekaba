import { Edit3, Printer, RotateCcw, Trash2 } from "lucide-react";
import { EmptyState, IconButton, StatusBadge } from "../../../ui/enterprise";

function SettlementActionButtons({ row, onEdit, onRecover, onDelete, onPrint }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <IconButton iconStart={Edit3} title="تعديل التسوية" aria-label="تعديل التسوية" onClick={() => onEdit?.(row.record)} className="text-slate-500 hover:text-amber-600" />
      <IconButton iconStart={RotateCcw} title="استرجاع من الأرشيف" aria-label="استرجاع من الأرشيف" onClick={() => onRecover?.(row.record)} className="text-slate-500 hover:text-blue-600" />
      <IconButton iconStart={Trash2} title="حذف التسوية" aria-label="حذف التسوية" onClick={() => onDelete?.(row.record)} className="text-slate-500 hover:text-rose-600" />
      <IconButton iconStart={Printer} title="طباعة التسوية" aria-label="طباعة التسوية" onClick={() => onPrint?.(row)} className="text-slate-500 hover:text-teal-600" />
    </div>
  );
}

export function SettlementMobileCard({ row, formatMoney, onEdit, onRecover, onDelete, onPrint }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">{row.partyName}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">اعتماد: {row.approvalDate || "—"} | شيك: {row.checkNumber || "—"}</p>
        </div>
        <StatusBadge tone="success">مكتملة</StatusBadge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/40">
          <p className="text-[10px] font-semibold text-slate-500">الأصل</p>
          <p className="num mt-1 font-bold text-slate-800 dark:text-slate-100">{formatMoney(row.advanceAmount)}</p>
        </div>
        <div className="rounded-lg bg-rose-50 p-2 dark:bg-rose-900/20">
          <p className="text-[10px] font-semibold text-rose-500">منصرف</p>
          <p className="num mt-1 font-bold text-rose-600">{formatMoney(row.spentAmount)}</p>
        </div>
        <div className="rounded-lg bg-teal-50 p-2 dark:bg-teal-900/20">
          <p className="text-[10px] font-semibold text-teal-600">متاح</p>
          <p className="num mt-1 font-bold text-teal-700 dark:text-teal-300">{formatMoney(row.availableAmount)}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-900/20">
          <p className="text-[10px] font-semibold text-emerald-600">المتبقي</p>
          <p className="num mt-1 font-bold text-emerald-700 dark:text-emerald-300">{formatMoney(row.remainingAmount)}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-700/80">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone="info">{row.typeLabel}</StatusBadge>
          {row.groupCount > 1 && <StatusBadge tone="info">مجموعة {row.groupCount} شيكات</StatusBadge>}
        </div>
        <SettlementActionButtons row={row} onEdit={onEdit} onRecover={onRecover} onDelete={onDelete} onPrint={onPrint} />
      </div>
    </article>
  );
}

export default function SettlementArchiveTable({
  rows,
  totalCount,
  visibleCount,
  onLoadMore,
  formatMoney,
  onEdit,
  onRecover,
  onDelete,
  onPrint,
}) {
  if (!rows.length) {
    return (
      <div className="p-4">
        <EmptyState title="لا توجد تسويات في الأرشيف" hint="جرّب تغيير البحث أو الفترة الزمنية" />
      </div>
    );
  }

  return (
    <div className="min-h-[400px]">
      <div className="grid grid-cols-1 gap-3 p-3 md:hidden">
        {rows.map((row) => (
          <SettlementMobileCard
            key={row.id}
            row={row}
            formatMoney={formatMoney}
            onEdit={onEdit}
            onRecover={onRecover}
            onDelete={onDelete}
            onPrint={onPrint}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="table-enterprise w-full text-right">
          <thead className="border-b-2 border-slate-200 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-800/50">
            <tr>
              {["الاعتماد", "المسؤول والحالة", "التمويل", "متاح", "منصرف", "المتبقي", "إجراءات"].map((heading) => (
                <th key={heading} className="p-3 text-[11px] font-bold text-slate-500">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                <td className="p-3 text-xs font-semibold text-slate-500 whitespace-nowrap">{row.approvalDate || "—"}</td>
                <td className="p-3">
                  <p className="max-w-[180px] break-words text-xs font-bold text-slate-800 dark:text-slate-100">{row.partyName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <StatusBadge tone="success">مكتملة</StatusBadge>
                    <StatusBadge tone="info">{row.typeLabel}</StatusBadge>
                    {row.groupCount > 1 && <StatusBadge tone="info">مجموعة {row.groupCount} شيكات</StatusBadge>}
                  </div>
                </td>
                <td className="p-3">
                  <p className="num text-xs font-semibold text-slate-600">شيك: {formatMoney(row.advanceAmount)}</p>
                  {row.subscriptionAmount > 0 && <p className="num mt-1 text-[10px] font-semibold text-indigo-500">اشتراكات: {formatMoney(row.subscriptionAmount)}</p>}
                  {row.previousBalance > 0 && <p className="num mt-1 text-[10px] font-semibold text-amber-600">مرحل: {formatMoney(row.previousBalance)}</p>}
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">رقم الشيك: {row.checkNumber || "—"}</p>
                </td>
                <td className="num p-3 text-sm font-bold text-teal-600">{formatMoney(row.availableAmount)}</td>
                <td className="num p-3 text-sm font-bold text-rose-600">{formatMoney(row.spentAmount)}</td>
                <td className="p-3">
                  <p className="num text-sm font-bold text-emerald-600">{formatMoney(row.remainingAmount)}</p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">{row.returnLabel}</p>
                </td>
                <td className="p-3">
                  <SettlementActionButtons row={row} onEdit={onEdit} onRecover={onRecover} onDelete={onDelete} onPrint={onPrint} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalCount > visibleCount && (
        <button
          type="button"
          onClick={onLoadMore}
          className="w-full border-t border-slate-100 py-2.5 text-[11px] font-bold text-teal-700 transition-colors hover:bg-teal-50 dark:border-slate-800 dark:hover:bg-teal-900/20"
        >
          عرض المزيد ({(totalCount - visibleCount).toLocaleString("ar-EG")} متبقٍ)
        </button>
      )}
    </div>
  );
}
