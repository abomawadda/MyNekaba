import React, { useState, useEffect, useMemo } from "react";
import { doc, onSnapshot, setDoc, updateDoc, arrayUnion, getDoc } from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";
import { useT } from "../../app/providers/ThemeProvider";
import { Plus, Check, X } from "lucide-react";
import clsx from "clsx";

export default function DynamicSelect({ label, listKey, value, onChange, icon: Icon, defaultOptions = [] }) {
  const T = useT();
  const defaultOptionsKey = defaultOptions.map((option) => String(option)).join("\u001f");
  const stableDefaultOptions = useMemo(
    () => (defaultOptionsKey ? defaultOptionsKey.split("\u001f") : []),
    [defaultOptionsKey]
  );
  const [options, setOptions] = useState(stableDefaultOptions);
  const [addMode, setAddMode] = useState(false);
  const [tempVal, setTempVal] = useState("");

  useEffect(() => {
    const docRef = doc(db, "settings", "dropdowns");
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data[listKey] && Array.isArray(data[listKey])) {
          const merged = Array.from(new Set([...stableDefaultOptions, ...data[listKey]]));
          setOptions(merged);
        }
      } else {
        setDoc(docRef, { [listKey]: stableDefaultOptions }, { merge: true });
      }
    });
    return unsub;
  }, [listKey, stableDefaultOptions]);

  const handleAdd = async () => {
    const val = tempVal.trim();
    if (!val) return;

    if (!options.includes(val)) setOptions(prev => [...prev, val]);
    onChange(val);
    setAddMode(false);
    setTempVal("");

    try {
      const docRef = doc(db, "settings", "dropdowns");
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        await setDoc(docRef, { [listKey]: [val] }, { merge: true });
      } else {
        await updateDoc(docRef, { [listKey]: arrayUnion(val) });
      }
    } catch (e) {
      console.error("Error saving dropdown option:", e);
    }
  };

  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-slate-400 pr-1">{label}</label>
      {addMode ? (
        <div className="flex gap-1 animate-in fade-in zoom-in-95">
          <input
            autoFocus
            value={tempVal}
            onChange={e => setTempVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className={clsx("flex-1 px-3 py-1.5 rounded-lg border text-sm font-semibold focus:ring-2 focus:border-brand-500 outline-none", T.inp)}
            placeholder="اكتب العنصر الجديد..."
          />
          <button type="button" onClick={handleAdd} className="p-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 shadow-sm"><Check size={16} /></button>
          <button type="button" onClick={() => setAddMode(false)} className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-300 transition-colors"><X size={16} /></button>
        </div>
      ) : (
        <div className="flex gap-1">
          <div className="relative flex-1">
            {Icon && <Icon size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none z-10" />}
            <select
              value={value || ""}
              onChange={e => onChange(e.target.value)}
              className={clsx("w-full px-3 py-2.5 rounded-lg border text-sm font-semibold appearance-none outline-none focus:ring-2 focus:border-brand-500 transition-all", Icon ? "pr-9" : "pr-3", T.inp)}
            >
              <option value="">اختر...</option>
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <button type="button" onClick={() => setAddMode(true)}
            className="p-2.5 text-brand-700 bg-brand-50 dark:bg-brand-900/20 rounded-lg hover:bg-brand-100 transition-colors shadow-sm" title="إضافة خيار جديد للمنظومة">
            <Plus size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
