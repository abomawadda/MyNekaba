import { AlertCircle, TrendingDown, TrendingUp, Wallet, RefreshCw } from "lucide-react";
import { StatCard } from "../../ui/enterprise";
import { formatMoney } from "../../utils/numberFormat";

export default function TreasuryStatsBar({
  currentBalance,
  totalIncome,
  totalExpenses,
  unpostedCount,
  requiresSettlementCount,
  openSettlements,
  settledChecks,
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
      <StatCard label="الرصيد الحالي" value={formatMoney(currentBalance)} icon={Wallet} tone={currentBalance >= 0 ? "success" : "danger"} />
      <StatCard label="إجمالي الوارد" value={formatMoney(totalIncome)} icon={TrendingUp} tone="success" />
      <StatCard label="إجمالي المنصرف" value={formatMoney(totalExpenses)} icon={TrendingDown} tone="danger" />
      <StatCard label="غير المرحل" value={`${unpostedCount}`} icon={AlertCircle} tone={unpostedCount ? "warning" : "neutral"} />
      <StatCard label="تسويات مفتوحة" value={`${openSettlements}`} icon={RefreshCw} tone={openSettlements ? "warning" : "success"} sub={`${requiresSettlementCount} تتطلب تسوية / ${settledChecks} مغلقة`} />
    </div>
  );
}
