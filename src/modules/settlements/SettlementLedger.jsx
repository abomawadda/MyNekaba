import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Calendar, ChevronRight, ChevronLeft } from "lucide-react";
import { useT } from "../../app/providers/ThemeProvider";
import clsx from "clsx";

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAYS_AR = ["سبت", "أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة"];

// 🎯 العرض للمستخدم (DD-MM-YYYY)
const displayFormat = (isoString) => {
  if (!isoString) return "";
  const [y, m, d] = isoString.split("-");
  return `${d}-${m}-${y}`;
};

export default function ArabicDatePicker({ label, value, onChange, minVal, maxVal, readOnly }) {
  const T = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  
  const today = new Date();
  const years = useMemo(() => Array.from({ length: 80 }, (_, i) => 1950 + i).reverse(), []);

  // 🎯 استخراج السنة والشهر بأمان
  const getInitialYear = () => value && value.includes("-") ? parseInt(value.split("-")[0]) : today.getFullYear();
  const getInitialMonth = () => value && value.includes("-") ? parseInt(value.split("-")[1]) - 1 : today.getMonth();

  const [vY, setVY] = useState(getInitialYear());
  const [vM, setVM] = useState(getInitialMonth());

  useEffect(() => { 
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; 
    document.addEventListener("mousedown", h); 
    return () => document.removeEventListener("mousedown", h); 
  }, []);

  // 🎯 التخزين الحقيقي في النظام (YYYY-MM-DD)
  const toISO = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const onSelect = useCallback((d) => { 
    onChange(toISO(vY, vM, d)); 
    setOpen(false); 
  }, [vY, vM, onChange]);

  const rawDay = new Date(vY, vM, 1).getDay();
  const firstDay = (rawDay + 1) % 7; 
  const totalDays = new Date(vY, vM + 1, 0).getDate();
  
  const isDisabled = (d) => {
    const currentDateISO = toISO(vY, vM, d);
    if (minVal && currentDateISO < minVal) return true;
    if (maxVal && currentDateISO > maxVal) return true;
    return false;
  };

  const isToday = (d) => toISO(vY, vM, d) === toISO(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="relative space-y-1 w-full" ref={ref} dir="rtl">
      {label && <label className="text-[10px] font-black text-slate-500 uppercase pr-1">{label}</label>}
      <button 
        type="button" 
        disabled={readOnly} 
        onClick={() => !readOnly && setOpen(!open)} 
        className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-all outline-none h-[42px]", T.inp, readOnly && "opacity-60 cursor-not-allowed")}
      >
        <span className={value ? "tracking-widest" : "text-slate-400"}>{value ? displayFormat(value) : "يوم - شهر - سنة"}</span>
        <Calendar size={14} className={value ? "text-teal-500" : "text-slate-400 shrink-0"} />
      </button>
      
      {open && (
        <div className={clsx("absolute z-[999] top-full mt-1 p-3 rounded-2xl shadow-2xl border animate-in fade-in zoom-in-95 duration-150", T.card)} style={{ minWidth: "260px" }}>
          <div className="flex items-center justify-between mb-3 gap-1">
            <button type="button" onClick={() => vM === 0 ? (setVM(11), setVY(y=>y-1)) : setVM(m=>m-1)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><ChevronRight size={14}/></button>
            <div className="flex gap-1 text-[11px] font-black flex-1 justify-center">
              <select value={vM} onChange={e => setVM(parseInt(e.target.value))} className="bg-transparent outline-none cursor-pointer text-center">{MONTHS_AR.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
              <select value={vY} onChange={e => setVY(parseInt(e.target.value))} className="bg-transparent outline-none cursor-pointer">{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
            </div>
            <button type="button" onClick={() => vM === 11 ? (setVM(0), setVY(y=>y+1)) : setVM(m=>m+1)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><ChevronLeft size={14}/></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">{DAYS_AR.map(d => <div key={d} className="text-[9px] font-black text-center text-slate-400 py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {Array(firstDay).fill(null).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => {
              const dis = isDisabled(d);
              const sel = value === toISO(vY, vM, d);
              return (
                <button type="button" key={d} disabled={dis} onClick={() => onSelect(d)} 
                  className={clsx("py-1 text-[11px] font-bold rounded-lg transition-all", 
                    sel ? "bg-teal-500 text-white shadow-md" : 
                    dis ? "opacity-20 cursor-not-allowed bg-slate-50 dark:bg-slate-800" : 
                    isToday(d) ? "border border-teal-400 text-teal-600" : "hover:bg-teal-500/10 hover:text-teal-600")}>
                  {d}
                </button>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={() => { if(!isDisabled(today.getDate())) { onChange(toISO(today.getFullYear(), today.getMonth(), today.getDate())); setOpen(false); } }} className="w-full text-[10px] font-black text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 py-1.5 rounded-lg transition-colors">تحديد اليوم</button>
          </div>
        </div>
      )}
    </div>
  );
}