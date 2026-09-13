import React from "react";
import {
  Edit2,
  Trash2,
  Paperclip,
  ChevronDown
} from "lucide-react";
import { formatMoney } from "../../utils/numberFormat";
import { getIssuedCheckTypeLabel } from "./helpers/issuedChecks";
import { getCheckStatusLabel, getFinanceAmount, getRecordStateLabel } from "./helpers/financeLedger";
import { StatusBadge } from "../../ui/enterprise";

export default function TreasuryTable({
  visible,
  paginatedVisible,
  setShowAll,
  canEditFinancial,
  canDeleteFinancial,
  canViewAttachments,
  onEdit,
  onDelete,
  onViewAttachments,
}) {
  const totalDebit = (visible || [])
    .filter((t) => t.type !== "deposit")
    .reduce((s, t) => s + Number(getFinanceAmount(t) || 0), 0);
  const totalCredit = (visible || [])
    .filter((t) => t.type === "deposit")
    .reduce((s, t) => s + Number(getFinanceAmount(t) || 0), 0);

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 gap-3 p-3 md:hidden">
        {paginatedVisible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs font-bold text-slate-400">
            لا توجد سجلات مالية مطابقة.
          </div>
        ) : paginatedVisible.map((tx) => {
          const isDeposit = tx.type === "deposit";
          const amt = Number(getFinanceAmount(tx) || 0);
          return (
            <article key={tx.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{tx.party || tx.beneficiaryName || "—"}</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">{tx.date || "—"} · {tx.checkNum || tx.bankReference || "—"}</p>
                </div>
                <StatusBadge tone={isDeposit ? "success" : "brand"}>{isDeposit ? "وارد" : "منصرف"}</StatusBadge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600">
                <span>النوع: {isDeposit ? "إيداع بنكي" : getIssuedCheckTypeLabel(tx.type)}</span>
                <span className="text-left tabular-nums">{formatMoney(amt)}</span>
                <span>الترحيل: {getRecordStateLabel(tx.state)}</span>
                <span className="text-left">الشيك: {getCheckStatusLabel(tx)}</span>
              </div>
              {tx.notes && <p className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] font-semibold text-slate-500">{tx.notes}</p>}
              <div className="mt-3 flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
                {tx.attachments?.length > 0 && canViewAttachments && (
                  <button onClick={() => onViewAttachments(tx.attachments)} className="text-slate-500 hover:text-slate-700 transition-colors" title="عرض المرفقات">
                    <Paperclip size={15} />
                  </button>
                )}
                {canEditFinancial && (
                  <button onClick={() => onEdit(tx)} className="text-slate-500 hover:text-slate-900 transition-colors" title="تعديل">
                    <Edit2 size={15} />
                  </button>
                )}
                {canDeleteFinancial && (
                  <button onClick={() => onDelete(tx)} className="text-slate-500 hover:text-red-600 transition-colors" title="حذف">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-right text-[10px] border-collapse">
          <thead>
            <tr className="bg-slate-800 dark:bg-slate-950 text-white">
              <th className="py-2 px-2 font-black border border-slate-700 dark:border-slate-800 text-center whitespace-nowrap">التاريخ</th>
              <th className="py-2 px-2 font-black border border-slate-700 dark:border-slate-800 text-center whitespace-nowrap">المرجع / الشيك</th>
              <th className="py-2 px-2 font-black border border-slate-700 dark:border-slate-800">المستفيد</th>
              <th className="py-2 px-2 font-black border border-slate-700 dark:border-slate-800 text-center whitespace-nowrap">النوع</th>
              <th className="py-2 px-2 font-black border border-slate-700 dark:border-slate-800">البيان</th>
              <th className="py-2 px-2 font-black border border-slate-700 dark:border-slate-800 text-left whitespace-nowrap">مدين (−)</th>
              <th className="py-2 px-2 font-black border border-slate-700 dark:border-slate-800 text-left whitespace-nowrap">دائن (+)</th>
              <th className="py-2 px-2 font-black border border-slate-700 dark:border-slate-800 text-center whitespace-nowrap">الحالة</th>
              <th className="py-2 px-2 font-black border border-slate-700 dark:border-slate-800 text-center whitespace-nowrap">التسوية</th>
              <th className="py-2 px-2 font-black border border-slate-700 dark:border-slate-800 text-left whitespace-nowrap">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {paginatedVisible.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 text-center text-[11px] font-bold text-slate-400">
                  لا توجد سجلات مالية مطابقة.
                </td>
              </tr>
            ) : (
              paginatedVisible.map((tx, i) => {
                const isDeposit = tx.type === "deposit";
                const amt = Number(getFinanceAmount(tx) || 0);
                return (
                  <tr key={tx.id} className={i % 2 ? "bg-slate-50/70 dark:bg-slate-800/30 hover:bg-slate-100/80 dark:hover:bg-slate-800/60" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}>
                    <td className="py-1.5 px-2 border border-slate-200 dark:border-slate-700/60 text-center font-bold whitespace-nowrap">
                      {tx.date || "—"}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-200 dark:border-slate-700/60 text-center font-black text-amber-700 dark:text-amber-400 whitespace-nowrap">
                      {tx.checkNum || tx.bankReference || "—"}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-200 dark:border-slate-700/60 font-black text-slate-800 dark:text-slate-100 max-w-[130px] xl:max-w-[190px] truncate" title={tx.party || tx.beneficiaryName || ""}>
                      {tx.party || tx.beneficiaryName || "—"}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-200 dark:border-slate-700/60 text-center whitespace-nowrap">
                      <span className="text-[9px] font-black text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {isDeposit ? "إيداع بنكي" : getIssuedCheckTypeLabel(tx.type)}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 truncate max-w-[110px] lg:max-w-[170px] xl:max-w-[230px]" title={tx.notes}>
                      {tx.notes || "—"}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-200 dark:border-slate-700/60 font-black tabular-nums text-rose-600 whitespace-nowrap text-left">
                      {!isDeposit ? formatMoney(amt) : "—"}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-200 dark:border-slate-700/60 font-black tabular-nums text-emerald-600 whitespace-nowrap text-left">
                      {isDeposit ? formatMoney(amt) : "—"}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-200 dark:border-slate-700/60 whitespace-nowrap text-center">
                      <span className="text-[9px] font-black text-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {getRecordStateLabel(tx.state)}
                      </span>
                      {(tx.checkNum || tx.sourceCollection === "issued_checks") && (
                        <span className="mr-1 text-[9px] font-black text-amber-700 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                          {getCheckStatusLabel(tx)}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-200 dark:border-slate-700/60 whitespace-nowrap text-center">
                      {isDeposit ? (
                        <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">مقيد</span>
                      ) : tx.requires_settlement || tx.requiresSettlement ? (
                        tx.isSettled ? (
                          <span className="text-[9px] font-black text-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">مسوى</span>
                        ) : (
                          <span className="text-[9px] font-black text-amber-700 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">معلق</span>
                        )
                      ) : (
                        <span className="text-slate-300 text-[9px]">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-200 dark:border-slate-700/60 whitespace-nowrap text-left">
                      <div className="flex items-center justify-end gap-2">
                        {tx.attachments?.length > 0 && canViewAttachments && (
                          <button onClick={() => onViewAttachments(tx.attachments)} className="text-slate-400 hover:text-slate-600 transition-colors" title="عرض المرفقات">
                            <Paperclip size={14} />
                          </button>
                        )}
                        {canEditFinancial && (
                          <button onClick={() => onEdit(tx)} className="text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors" title="تعديل">
                            <Edit2 size={14} />
                          </button>
                        )}
                        {canDeleteFinancial && (
                          <button onClick={() => onDelete(tx)} className="text-slate-400 hover:text-red-600 transition-colors" title="حذف">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          {paginatedVisible.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 dark:bg-slate-800 font-black">
                <td colSpan={5} className="py-1.5 px-2 border border-slate-300 dark:border-slate-600 text-left text-slate-600 dark:text-slate-300">إجمالي السجلات المعروضة</td>
                <td className="py-1.5 px-2 border border-slate-300 dark:border-slate-600 text-left tabular-nums text-rose-700 whitespace-nowrap">{formatMoney(totalDebit)}</td>
                <td className="py-1.5 px-2 border border-slate-300 dark:border-slate-600 text-left tabular-nums text-emerald-700 whitespace-nowrap">{formatMoney(totalCredit)}</td>
                <td colSpan={3} className="py-1.5 px-2 border border-slate-300 dark:border-slate-600"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {visible.length > paginatedVisible.length && (
        <div className="border-t border-slate-200 bg-slate-50 dark:bg-slate-800/40">
          <button
            onClick={() => setShowAll(true)}
            className="w-full py-2.5 flex items-center justify-center gap-2 text-[11px] font-black text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            عرض باقي السجلات ({visible.length - paginatedVisible.length})
            <ChevronDown size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
