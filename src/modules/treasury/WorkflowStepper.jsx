import React from "react";
import { FileText, Eye, CheckCircle2, Send } from "lucide-react";
import { WORKFLOW_STATES } from "./helpers/workflow";

const WF_CFG = {
  draft: { label: "مسودة", icon: FileText, color: "gray" },
  review: { label: "قيد المراجعة", icon: Eye, color: "amber" },
  approved: { label: "معتمد", icon: CheckCircle2, color: "teal" },
  posted: { label: "مُرحّل نهائيًا", icon: Send, color: "green" },
};

export default function WorkflowStepper({ state }) {
  const cur = WORKFLOW_STATES.indexOf(state);

  return (
    <div className="flex items-center gap-0 flex-wrap" dir="rtl">
      {WORKFLOW_STATES.map((st, i) => {
        const done = i <= cur;
        const active = i === cur;
        const cfg = WF_CFG[st] || WF_CFG.draft;

        return (
          <React.Fragment key={st}>
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  done
                    ? "bg-teal-500 text-white shadow-lg shadow-teal-500/30"
                    : "bg-slate-200 text-slate-400"
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-[10px] mt-1 font-semibold whitespace-nowrap ${
                  active ? "text-teal-600" : done ? "text-slate-600" : "text-slate-400"
                }`}
              >
                {cfg.label}
              </span>
            </div>

            {i < WORKFLOW_STATES.length - 1 && (
              <div
                className={`h-0.5 w-6 mx-1 mb-4 transition-all ${
                  i < cur ? "bg-teal-500" : "bg-slate-200"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}