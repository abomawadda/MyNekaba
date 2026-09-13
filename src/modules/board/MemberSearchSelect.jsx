import React, { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown, Search, X } from "lucide-react";

export default function MemberSearchSelect({ value = "", onChange, options = [], placeholder = "ابحث بالاسم أو الكود أو جهة العمل..." }) {
  const selected = useMemo(
    () => (options || []).find((o) => String(o.id) === String(value)),
    [options, value]
  );
  const [query, setQuery] = useState(selected ? selected.name || "" : "");
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return (options || []).slice(0, 8);
    return (options || [])
      .filter((o) => `${o.name || ""} ${o.sub || ""}`.includes(q))
      .slice(0, 8);
  }, [options, query]);

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-14 pr-9 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
        />
        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); onChange?.(""); setOpen(true); }}
              className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
            >
              <X size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
      {selected && String(selected.id) === String(value) && query === (selected.name || "") && (
        <p className="text-[10px] font-bold text-emerald-600 mt-1">المختار: {selected.name}{selected.sub ? ` — ${selected.sub}` : ""}</p>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
          <div className="max-h-56 overflow-y-auto">
            {results.length === 0 ? (
              <p className="p-3 text-[11px] font-bold text-slate-400 text-center">لا توجد نتائج مطابقة</p>
            ) : (
              results.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { onChange?.(o.id); setQuery(o.name || ""); setOpen(false); }}
                  className={clsx(
                    "w-full text-right p-2.5 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-b last:border-b-0 border-slate-100 dark:border-slate-800 transition-colors",
                    String(o.id) === String(value) && "bg-amber-50/60 dark:bg-amber-900/10"
                  )}
                >
                  <span className="block text-xs font-black text-slate-800 dark:text-slate-100 truncate">{o.name || "بدون اسم"}</span>
                  <span className="block text-[10px] font-bold text-slate-400 truncate mt-0.5">
                    {o.sub || ""}
                    {o.badge ? ` — ${o.badge}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
          <p className="px-3 py-1.5 text-[9px] font-bold text-slate-400 border-t border-slate-100 dark:border-slate-800">
            {options.length} عضو متاح — اكتب لتضييق البحث
          </p>
        </div>
      )}
    </div>
  );
}
