import clsx from "clsx";
import { ORG_LEFT_LOGO_URL, ORG_REPORT_SUBTITLE, ORG_REPORT_TITLE, ORG_RIGHT_LOGO_FALLBACK_URL, ORG_RIGHT_LOGO_URL } from "../utils/branding";

export default function BrandHeader({ sectionTitle = "", sectionHint = "", className = "" }) {
  return (
    <div className={clsx("rounded-2xl border shadow-sm p-4 md:p-5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm", className)} dir="rtl">
      <div className="flex items-center gap-3 md:gap-5">
        <div className="w-16 h-16 md:w-20 md:h-20 shrink-0 rounded-xl bg-brand-700/10 border border-brand-200 dark:border-brand-800/40 flex items-center justify-center p-2">
          <img
            src={ORG_RIGHT_LOGO_URL}
            alt="شعار WE"
            className="w-full h-full object-contain"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = ORG_RIGHT_LOGO_FALLBACK_URL;
            }}
          />
        </div>
        <div className="flex-1 text-center">
          <h1 className="text-base md:text-xl font-black text-slate-900 dark:text-slate-100 leading-tight">{ORG_REPORT_TITLE}</h1>
          <p className="text-xs md:text-sm font-bold text-brand-700 dark:text-brand-300 mt-1">{ORG_REPORT_SUBTITLE}</p>
          {sectionTitle && <p className="text-sm md:text-base font-semibold text-slate-700 dark:text-slate-200 mt-2">{sectionTitle}</p>}
          {sectionHint && <p className="text-[10px] md:text-xs font-semibold text-slate-400 mt-1">{sectionHint}</p>}
        </div>
        <div className="w-16 h-16 md:w-20 md:h-20 shrink-0 rounded-xl bg-brand-700/10 border border-brand-200 dark:border-brand-800/40 flex items-center justify-center p-2">
          <img src={ORG_LEFT_LOGO_URL} alt="شعار النقابة" className="w-full h-full object-contain" />
        </div>
      </div>
    </div>
  );
}
