import { AlertCircle, History, ReceiptText } from "lucide-react";
import { Tabs } from "../../../ui/enterprise";

const tabLabels = {
  current: "تسوية شيك",
  archive: "أرشيف التقارير",
  diagnostic: "تشخيص",
};

export default function SettlementWorkspaceTabs({ activeTab, onChange, openCount = 0 }) {
  const tabs = [
    {
      value: "current",
      label: (
        <span className="inline-flex items-center gap-1.5">
          <ReceiptText size={14} />
          {tabLabels.current}
          {openCount > 0 && <span className="num rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">{openCount}</span>}
        </span>
      ),
    },
    {
      value: "archive",
      label: (
        <span className="inline-flex items-center gap-1.5">
          <History size={14} />
          {tabLabels.archive}
        </span>
      ),
    },
    {
      value: "diagnostic",
      label: (
        <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-300">
          <AlertCircle size={14} />
          {tabLabels.diagnostic}
        </span>
      ),
    },
  ];

  return <Tabs tabs={tabs} value={activeTab} onChange={onChange} className="rounded-xl border bg-white px-3 pt-2 shadow-sm dark:border-slate-700 dark:bg-slate-800/70" />;
}
