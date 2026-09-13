import { Edit3, Save, Trash2 } from "lucide-react";
import { Button, StatusBadge } from "../../../ui/enterprise";

const getDraftTypeLabel = (draft) => {
  const mode = draft?.settlement_mode || draft?.settlementMode || "";
  if (mode === "check_plus_subscriptions") return "رحلة";
  if (mode === "carry_forward") return "سلفة";
  return "تسوية";
};

export default function SettlementDraftSection({ drafts = [], formatMoney, onContinue, onDiscard }) {
  if (!drafts.length) return null;

  return (
    <section className="border-b border-amber-200 bg-amber-50/30 dark:border-amber-800/40 dark:bg-amber-900/10">
      <div className="flex items-center gap-2 border-b border-amber-100 px-4 py-3 dark:border-amber-800/30">
        <Save size={14} className="text-amber-600" />
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
          مسودات معلقة ({drafts.length.toLocaleString("ar-EG")})
        </h4>
        <StatusBadge tone="warning">مسودة</StatusBadge>
      </div>
      <div className="overflow-x-auto">
        <table className="table-enterprise w-full text-right">
          <thead>
            <tr className="bg-amber-100/50 dark:bg-amber-900/20">
              {["المسؤول", "الحالة", "النوع", "المبلغ", "الفواتير", "تاريخ الحفظ", "إجراءات"].map((heading) => (
                <th key={heading} className="p-3 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100 dark:divide-amber-800/30">
            {drafts.map((draft) => (
              <tr key={draft.id} className="hover:bg-amber-50/80 dark:hover:bg-amber-900/20">
                <td className="p-3 text-xs font-bold text-slate-800 dark:text-slate-100">
                  <span className="block max-w-[180px] break-words">{draft.employeeName || draft.party || "—"}</span>
                  {draft.settlementGroupMemberIds?.length > 1 && (
                    <span className="mt-1 block">
                      <StatusBadge tone="info">مجموعة {draft.settlementGroupMemberIds.length} شيكات</StatusBadge>
                    </span>
                  )}
                </td>
                <td className="p-3"><StatusBadge tone="warning">مسودة</StatusBadge></td>
                <td className="p-3 text-xs font-semibold text-slate-500">{getDraftTypeLabel(draft)}</td>
                <td className="num p-3 text-xs font-bold text-slate-700 dark:text-slate-100">{formatMoney(Number(draft.advanceAmountBase || draft.amount || 0))}</td>
                <td className="num p-3 text-xs font-semibold text-slate-500">{draft.settlementExpenses?.length || 0}</td>
                <td className="p-3 text-[10px] font-semibold text-slate-400">{draft.updatedAt?.slice(0, 10) || "—"}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" iconStart={Edit3} onClick={() => onContinue?.(draft)} className="border-amber-200 text-amber-700 hover:bg-amber-50">
                      استكمال
                    </Button>
                    <Button size="sm" variant="danger" iconOnly iconStart={Trash2} aria-label="حذف المسودة" title="حذف المسودة" onClick={() => onDiscard?.(draft.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
