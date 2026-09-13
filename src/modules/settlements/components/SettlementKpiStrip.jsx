import { CheckCircle2, Clock3, FileCheck2, Layers3, RotateCcw, WalletCards } from "lucide-react";
import { StatCard } from "../../../ui/enterprise";

const asCount = (value) => Number(value || 0).toLocaleString("ar-EG");

export default function SettlementKpiStrip({ baseline, formatMoney }) {
  const returnedOrCarriedAmount = baseline?.totalRemainingAmount || 0;
  const statusCounts = baseline?.statusCounts || {};
  const settledDisplay = formatMoney?.(baseline?.totalSettledAmount || 0) ?? String(baseline?.totalSettledAmount || 0);

  const cards = [
    {
      label: "إجمالي سجلات التسوية",
      value: asCount(baseline?.totalSettlements),
      sub: `مرتبطة بشيك: ${asCount(baseline?.settlementsLinkedToChecks)} | خزينة: ${asCount(baseline?.settlementsLinkedToTreasuryTransactions)}`,
      icon: Layers3,
      tone: "brand",
    },
    {
      label: "مفتوحة",
      value: asCount(baseline?.openSettlements),
      sub: `تتطلب تسوية: ${asCount(baseline?.requiresSettlementTransactionsCount)}`,
      icon: Clock3,
      tone: "warning",
    },
    {
      label: "جزئية / مسودة",
      value: asCount(baseline?.partialSettlements),
      sub: `حالات مكتشفة: ${asCount(statusCounts.partial)}`,
      icon: FileCheck2,
      tone: "info",
    },
    {
      label: "مكتملة",
      value: asCount(baseline?.completedSettlements),
      sub: `المنصرف/المسوى: ${settledDisplay}`,
      icon: CheckCircle2,
      tone: "success",
    },
    {
      label: "مرتد أو مرحل",
      value: formatMoney?.(returnedOrCarriedAmount) ?? returnedOrCarriedAmount,
      sub: "رد نقدي / إيداع بنكي / رصيد مرحل",
      icon: returnedOrCarriedAmount > 0 ? RotateCcw : WalletCards,
      tone: returnedOrCarriedAmount > 0 ? "warning" : "success",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <StatCard
          key={card.label}
          label={card.label}
          value={card.value}
          sub={card.sub}
          icon={card.icon}
          tone={card.tone}
          compact
        />
      ))}
    </div>
  );
}
