/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from "react";

const ThemeCtx = createContext({ dark: false, toggle: () => { } });

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(false);
  const toggle = () => setDark((d) => !d);

  return (
    <ThemeCtx.Provider value={{ dark, toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTh = () => useContext(ThemeCtx);

export const useT = () => {
  const { dark } = useTh();
  return {
    dark,
    page: dark ? 'bg-[#0c1220] text-slate-100' : 'bg-slate-50 text-slate-900',
    card: dark ? 'bg-slate-800/70 border-slate-700/80' : 'bg-white border-slate-200 shadow-sm',
    hdr: dark ? 'bg-slate-900/90 border-slate-700/80 backdrop-blur-md' : 'bg-white/95 border-slate-200 backdrop-blur-md',
    nav: dark ? 'bg-slate-900/95 border-slate-700/80' : 'bg-white border-slate-200 shadow-xl lg:shadow-none',
    inp: dark ? 'bg-slate-900/60 border-slate-600 text-slate-100 placeholder-slate-500 focus:border-brand-400 focus:ring-brand-400/20' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:ring-brand-500/20',
    sel: dark ? 'bg-slate-900/60 border-slate-600 text-slate-100 focus:border-brand-400' : 'bg-white border-slate-300 text-slate-900 focus:border-brand-500',
    btn: dark ? 'bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200',
    text: dark ? 'text-slate-100' : 'text-slate-900',
    sub: dark ? 'text-slate-400' : 'text-slate-600',
    muted: dark ? 'text-slate-500' : 'text-slate-500',
    div: dark ? 'border-slate-700/80' : 'border-slate-200',
    sxn: dark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200',
    row: dark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50/80',
    b: {
      teal: dark ? 'bg-teal-500/10 text-teal-400 border-teal-400/30' : 'bg-teal-50 text-teal-700 border-teal-300',
      rose: dark ? 'bg-rose-500/10 text-rose-400 border-rose-400/30' : 'bg-rose-50 text-rose-700 border-rose-300',
      amber: dark ? 'bg-amber-500/10 text-amber-400 border-amber-400/30' : 'bg-amber-50 text-amber-700 border-amber-300',
      sky: dark ? 'bg-sky-500/10 text-sky-400 border-sky-400/30' : 'bg-sky-50 text-sky-700 border-sky-300',
      purple: dark ? 'bg-purple-500/10 text-purple-400 border-purple-400/30' : 'bg-purple-50 text-purple-700 border-purple-300',
      green: dark ? 'bg-green-500/10 text-green-400 border-green-400/30' : 'bg-green-50 text-green-700 border-green-300',
      violet: dark ? 'bg-brand-500/10 text-brand-300 border-brand-400/30' : 'bg-brand-50 text-brand-700 border-brand-300',
    },
    brand: {
      solid: 'bg-brand-600 hover:bg-brand-700 text-white',
      soft: dark ? 'bg-brand-500/10 text-brand-300 border-brand-400/30' : 'bg-brand-50 text-brand-700 border-brand-200',
      text: dark ? 'text-brand-300' : 'text-brand-700',
    },
    btnPrimary: 'bg-brand-600 hover:bg-brand-700 text-white',
    btnSuccess: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    btnDanger: 'bg-rose-600 hover:bg-rose-700 text-white',
  };
};
