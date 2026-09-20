/* eslint-disable no-empty, no-unused-vars, react-hooks/set-state-in-effect */
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useFirebase } from "../../app/providers/FirebaseProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { useT } from "../../app/providers/ThemeProvider";
import DynamicSelect from "../../ui/inputs/DynamicSelect";
import {
  User, Phone, Mail, CreditCard, Briefcase, Calendar,
  Save, X, Building, MapPin, Plus, UserCircle, Search,
  ShieldCheck, Map, GraduationCap, Upload, FileText, Trash2,
  Check, Heart, AlertCircle, ChevronRight, ChevronLeft,
  MessageSquare, Award, PhoneCall, Users, Home, DollarSign,
  Landmark, Star, Clipboard, Badge, TrendingUp, Shield,
  Stethoscope, Camera, Hash, Info, CheckCircle2, Settings,
  Printer, AlertTriangle, RefreshCw
} from "lucide-react";
import clsx from "clsx";
import { formatEmployeeDate, getBirthDateFromNationalId, getLegalRetirementDate } from "../../utils/memberBenefits";
import { validateSecureAttachment, SECURE_ATTACHMENT_ACCEPT, PERMISSIONS } from "../../security/permissions";
import {
  buildEmployeeAttachmentPath,
  hasStoragePermissions,
  requireManagedAttachmentPath,
  requireStoragePermissions,
} from "../../security/storageAuthorization";

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAYS_AR = ["سبت", "أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة"];

const GOVS = {
  "01": "القاهرة", "02": "الإسكندرية", "03": "بورسعيد", "04": "السويس",
  "11": "دمياط", "12": "الدقهلية", "13": "الشرقية", "14": "القليوبية",
  "15": "كفر الشيخ", "16": "الغربية", "17": "المنوفية", "18": "البحيرة",
  "19": "الإسماعيلية", "21": "الجيزة", "22": "بني سويف", "23": "الفيوم",
  "24": "المنيا", "25": "أسيوط", "26": "سوهاج", "27": "قنا", "28": "أسوان",
  "29": "الأقصر", "31": "البحر الأحمر", "32": "الوادي الجديد", "33": "مطروح",
  "34": "شمال سيناء", "35": "جنوب سيناء", "88": "خارج الجمهورية"
};

const MARITAL = ["أعزب", "متزوج", "مطلق", "أرمل"];
const GRADES = ["وزير مفوض", "كبيرة", "الأولى", "الثانية", "الثالثة", "الرابعة", "عقود", "يومية"];
const QUALS = ["بدون مؤهل", "دبلوم متوسط", "مؤهل فوق متوسط", "عالي (بكالوريوس/ليسانس)", "ماجستير", "دكتوراه"];
const BLOOD_TYPES = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"];

const WORKPLACE_GROUPS = [
  { groupName: "الدقهلية الأولى", options: ["المنصورة شرق", "المنصورة غرب", "أقاليم شرق", "أقاليم غرب", "أجا", "السنبلاوين", "تمي الأمديد", "ميت غمر"] },
  { groupName: "الدقهلية الثانية", options: ["طلخا", "نبروه", "بلقاس", "شربين", "دكرنس", "منية النصر", "المنزلة"] },
];

const MEMBERSHIP_TYPES = ["عضو جمعية عمومية", "رئيس المجلس", "الأمين العام", "أمين الصندوق", "نائب الرئيس", "عضو مجلس إدارة", "عضو مجلس", "نقابة مستقلة"];
const MEMBER_STATE = ["نشط", "موقوف", "إجازة بدون أجر", "معاش", "استقالة", "وفاة"];
const SUBSCRIPTION_STATUS = ["مسدد", "متأخر", "معفي", "موقوف"];
const INSURANCE_TYPES = ["تأمين صحي حكومي", "تأمين خاص", "كلاهما", "لا يوجد"];

const TABS = [
  { id: "identity", label: "الهوية", icon: ShieldCheck, color: "teal" },
  { id: "job", label: "الوظيفة", icon: Briefcase, color: "sky" },
  { id: "union", label: "النقابة", icon: Star, color: "amber" },
  { id: "financial", label: "المالية", icon: DollarSign, color: "emerald" },
  { id: "contact", label: "التواصل", icon: PhoneCall, color: "purple" },
  { id: "medical", label: "الصحة", icon: Stethoscope, color: "rose" },
  { id: "attachments", label: "المرفقات", icon: FileText, color: "slate" },
];

const _erpBg = { teal: "bg-teal-500/10", sky: "bg-sky-500/10", amber: "bg-amber-500/10", emerald: "bg-emerald-500/10", purple: "bg-purple-500/10", rose: "bg-rose-500/10", slate: "bg-slate-500/10" };
const _erpTx = { teal: "text-teal-600", sky: "text-sky-600", amber: "text-amber-600", emerald: "text-emerald-600", purple: "text-purple-600", rose: "text-rose-600", slate: "text-slate-600" };
const _tabAct = { teal: "bg-teal-600 text-white shadow-sm border-teal-500 scale-105 z-10", sky: "bg-sky-600 text-white shadow-sm border-sky-500 scale-105 z-10", amber: "bg-amber-600 text-white shadow-sm border-amber-500 scale-105 z-10", emerald: "bg-emerald-600 text-white shadow-sm border-emerald-500 scale-105 z-10", purple: "bg-purple-600 text-white shadow-sm border-purple-500 scale-105 z-10", rose: "bg-rose-600 text-white shadow-sm border-rose-500 scale-105 z-10", slate: "bg-slate-600 text-white shadow-sm border-slate-500 scale-105 z-10" };
const _tabIna = { teal: "bg-teal-50 text-teal-600 hover:bg-teal-100 border-teal-100 dark:bg-teal-900/20 dark:border-teal-900/30", sky: "bg-sky-50 text-sky-600 hover:bg-sky-100 border-sky-100 dark:bg-sky-900/20 dark:border-sky-900/30", amber: "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-100 dark:bg-amber-900/20 dark:border-amber-900/30", emerald: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-900/30", purple: "bg-purple-50 text-purple-600 hover:bg-purple-100 border-purple-100 dark:bg-purple-900/20 dark:border-purple-900/30", rose: "bg-rose-50 text-rose-600 hover:bg-rose-100 border-rose-100 dark:bg-rose-900/20 dark:border-rose-900/30", slate: "bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-100 dark:bg-slate-900/20 dark:border-slate-900/30" };

const toEn = (str) => {
  if (!str && str !== 0) return "";
  return str.toString()
    .replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 1632 + 48))
    .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 1776 + 48));
};

const fmtDate = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

const parseDateStr = (str) => {
  if (!str || str === "—") return null;
  const p = str.split("/");
  if (p.length !== 3) return null;
  return new Date(p[2], p[1] - 1, p[0]);
};

const addYearsToStr = (dateStr, years) => {
  if (!dateStr || dateStr === "—") return undefined;
  const [d, m, y] = dateStr.split("/").map(Number);
  if (!y) return undefined;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y + years}`;
};

const calcYearsService = (hireDateStr) => {
  if (!hireDateStr) return null;
  const [d, m, y] = hireDateStr.split("/").map(Number);
  if (!y) return null;
  const hire = new Date(y, m - 1, d), now = new Date();
  const yrs = now.getFullYear() - hire.getFullYear();
  return now.getMonth() - hire.getMonth() < 0 ? yrs - 1 : yrs;
};

const calcAge = (birthDateStr) => {
  if (!birthDateStr) return null;
  const [d, m, y] = birthDateStr.split("/").map(Number);
  if (!y) return null;
  const birth = new Date(y, m - 1, d), now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
};

const genMembershipId = () => "SY-" + new Date().getFullYear() + "-" + String(Math.floor(Math.random() * 99999)).padStart(5, "0");

const WorkplaceSelect = ({ value, onChange, employeesDB, T }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newVal, setNewVal] = useState("");

  const allKnown = useMemo(() => [
    ...WORKPLACE_GROUPS[0].options,
    ...WORKPLACE_GROUPS[1].options
  ], []);

  const extWorkplaces = useMemo(() => {
    const fromDB = employeesDB.map(e => e.workplace).filter(Boolean);
    let fromLS = [];
    try { const s = localStorage.getItem("workplaces"); if (s) fromLS = JSON.parse(s); } catch { }
    return [...new Set([...fromDB, ...fromLS].filter(w => !allKnown.includes(w)))];
  }, [employeesDB, allKnown]);

  const allExt = [...new Set([...extWorkplaces, value].filter(Boolean))].filter(w => !allKnown.includes(w));

  const save = () => {
    const val = newVal.trim();
    if (val) {
      onChange(val);
      try {
        const s = localStorage.getItem("workplaces");
        const list = s ? JSON.parse(s) : [];
        if (!list.includes(val)) localStorage.setItem("workplaces", JSON.stringify([...list, val]));
      } catch { }
    }
    setIsAdding(false);
    setNewVal("");
  };

  if (isAdding) return (
    <div className="space-y-1 animate-in fade-in duration-200">
      <label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1.5 mb-1">
        <Building size={13} className="text-teal-500" /> إضافة مكان عمل جديد
      </label>
      <div className="flex items-center gap-2">
        <input autoFocus value={newVal} onChange={e => setNewVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && save()}
          placeholder="اكتب اسم السنترال واضغط Enter..."
          className={clsx("flex-1 px-3 py-2 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:border-teal-500", T.inp)}
        />
        <button type="button" onClick={save} className="p-2.5 bg-teal-600 text-white hover:bg-teal-700 rounded-xl transition-colors">
          <Check size={15} />
        </button>
        <button type="button" onClick={() => setIsAdding(false)} className="p-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl transition-colors">
          <X size={15} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1.5 mb-1">
        <Building size={13} className="text-teal-500" /> مكان العمل / السنترال
      </label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Building size={13} className="absolute right-3 top-2.5 z-10 text-slate-400 pointer-events-none" />
          <select value={value || ""} onChange={e => onChange(e.target.value)}
            className={clsx("w-full pr-9 pl-3 py-2 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:border-sky-500", T.inp)}>
            <option value="" disabled>اختر مكان العمل...</option>
            {WORKPLACE_GROUPS.map((g, i) => (
              <optgroup key={i} label={`📍 ${g.groupName}`}>
                {g.options.map(o => <option key={o} value={o}>{o}</option>)}
              </optgroup>
            ))}
            {allExt.length > 0 && (
              <optgroup label="🌍 خارج الدقهلية">
                {allExt.map(o => <option key={o} value={o}>{o}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <button type="button" onClick={() => setIsAdding(true)}
          className={clsx("p-2.5 rounded-xl border transition-colors hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200", T.btn)}
          title="إضافة مكان عمل جديد">
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
};

const ERPSection = ({ title, icon: Icon, colorClass, children, T, cols = 4 }) => (
  <div className={clsx("p-4 rounded-xl border shadow-sm space-y-3 transition-all", T.card)}>
    <div className="flex items-center gap-2 border-b pb-2.5 border-slate-100 dark:border-slate-800">
      <div className={clsx("p-1.5 rounded-lg", _erpBg[colorClass] || "bg-teal-500/10")}>
        <Icon size={14} className={_erpTx[colorClass] || "text-teal-600"} />
      </div>
      <h3 className={clsx("font-black text-xs uppercase tracking-wider", T.text)}>{title}</h3>
    </div>
    <div className={clsx(
      "grid grid-cols-1 sm:grid-cols-2 gap-3",
      cols === 4 && "lg:grid-cols-4",
      cols === 3 && "lg:grid-cols-3",
      cols === 2 && "lg:grid-cols-2",
    )}>
      {children}
    </div>
  </div>
);

const ERPInput = ({ label, icon: Icon, error, isDerived, isNumeric, hint, onChange, type, ...props }) => {
  const T = useT();

  const handleChange = useCallback((e) => {
    if (!onChange) return;
    if (isNumeric) {
      const converted = toEn(e.target.value);
      onChange({ ...e, target: { ...e.target, value: converted } });
    } else {
      onChange(e);
    }
  }, [isNumeric, onChange]);

  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black text-slate-500 uppercase pr-1 flex justify-between items-center">
        <span>{label}</span>
        <span className="flex gap-1">
          {isDerived && <span className="text-teal-500 font-bold normal-case text-[9px]">(آلي)</span>}
          {hint && <span title={hint} className="text-slate-300 cursor-help"><Info size={10} /></span>}
        </span>
      </label>
      <div className="relative group">
        {Icon && (
          <Icon size={13} className={clsx(
            "absolute right-3 top-2.5 z-10 transition-colors pointer-events-none",
            error ? "text-rose-500" : "text-slate-400 group-focus-within:text-teal-500"
          )} />
        )}
        <input
          {...props}
          onChange={handleChange}
          readOnly={isDerived}
          type={type}
          inputMode={isNumeric ? "numeric" : type === "email" ? "email" : "text"}
          className={clsx(
            "w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none transition-all h-[36px]",
            Icon ? "pr-8" : "pr-3",
            isDerived
              ? "bg-slate-50/60 dark:bg-slate-900/30 cursor-not-allowed opacity-70"
              : clsx(T.inp, "focus:ring-2 focus:border-teal-500"),
            error && "!border-rose-500 bg-rose-50/10 ring-2 ring-rose-500/20"
          )}
        />
      </div>
      {error && (
        <p className="text-[9px] text-rose-500 font-black pr-1 mt-0.5 flex items-center gap-1">
          <AlertCircle size={9} /> {error}
        </p>
      )}
    </div>
  );
};

const ArabicDatePicker = ({ label, value, onChange, minDate, maxDate, T }) => {
  const [open, setOpen] = useState(false);
  const [vDate, setVDate] = useState(new Date());
  const ref = useRef(null);
  const years = useMemo(() => Array.from({ length: 80 }, (_, i) => 1950 + i), []);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const onSelect = useCallback((d) => {
    onChange(fmtDate(new Date(vDate.getFullYear(), vDate.getMonth(), d)));
    setOpen(false);
  }, [vDate, onChange]);

  const firstDay = (new Date(vDate.getFullYear(), vDate.getMonth(), 1).getDay() + 1) % 7;
  const totalDays = new Date(vDate.getFullYear(), vDate.getMonth() + 1, 0).getDate();
  const [selD, selM, selY] = (value || "").split("/").map(Number);

  const isSelected = (d) => selD === d && selM === vDate.getMonth() + 1 && selY === vDate.getFullYear();
  const isToday = (d) => { const n = new Date(); return d === n.getDate() && vDate.getMonth() === n.getMonth() && vDate.getFullYear() === n.getFullYear(); };

  const minD = parseDateStr(minDate);
  const maxD = parseDateStr(maxDate);
  const isDisabled = (d) => {
    const curr = new Date(vDate.getFullYear(), vDate.getMonth(), d);
    curr.setHours(0, 0, 0, 0);
    if (minD) { const m = new Date(minD); m.setHours(0, 0, 0, 0); if (curr < m) return true; }
    if (maxD) { const m = new Date(maxD); m.setHours(0, 0, 0, 0); if (curr > m) return true; }
    return false;
  };

  return (
    <div className="relative" ref={ref}>
      {label && <label className="text-[10px] font-black text-slate-500 uppercase block mb-1 pr-1">{label}</label>}
      <button type="button" onClick={() => setOpen(!open)}
        className={clsx("w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-bold transition-all focus:ring-2 focus:border-teal-500 h-[36px]", T.inp)}>
        <span className={value ? "" : "text-slate-400"}>{value || "يوم / شهر / سنة"}</span>
        <Calendar size={13} className="text-slate-400 flex-shrink-0" />
      </button>

      {open && (
        <div className={clsx("absolute z-[300] top-full mt-1 w-60 p-3 rounded-2xl shadow-2xl border animate-in fade-in zoom-in-95 duration-150", T.card)}>
          <div className="flex items-center justify-between mb-2 gap-1">
            <button type="button" onClick={() => setVDate(d => new Date(d.getFullYear(), d.getMonth() - 1))}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              <ChevronRight size={13} />
            </button>
            <div className="flex gap-1 text-[10px] font-black flex-1 justify-center">
              <select value={vDate.getMonth()} onChange={e => setVDate(d => new Date(d.getFullYear(), +e.target.value))}
                className="bg-transparent outline-none cursor-pointer text-center">
                {MONTHS_AR.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={vDate.getFullYear()} onChange={e => setVDate(d => new Date(+e.target.value, d.getMonth()))}
                className="bg-transparent outline-none cursor-pointer">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => setVDate(d => new Date(d.getFullYear(), d.getMonth() + 1))}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              <ChevronLeft size={13} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DAYS_AR.map(d => <div key={d} className="text-[8px] font-black text-center text-slate-400 py-0.5">{d}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {Array(firstDay).fill(null).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => {
              const disabled = isDisabled(d);
              return (
                <button type="button" key={d} disabled={disabled} onClick={() => onSelect(d)}
                  className={clsx(
                    "py-1 text-[10px] font-bold rounded-lg transition-all",
                    disabled ? "opacity-20 cursor-not-allowed" :
                      isSelected(d) ? "bg-teal-500 text-white shadow-sm" :
                        isToday(d) ? "border border-teal-400 text-teal-600" :
                          "hover:bg-teal-500/10 hover:text-teal-600"
                  )}>
                  {d}
                </button>
              );
            })}
          </div>

          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button"
              onClick={() => { if (!isDisabled(new Date().getDate())) { onChange(fmtDate(new Date())); setOpen(false); } }}
              className="w-full text-[10px] font-black text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 py-1 rounded-lg transition-colors">
              اليوم الحالي
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ProfileCard = ({ emp, T }) => {
  const age = calcAge(emp.birthDate);
  const yrs = calcYearsService(emp.hireDate);
  const isDead = ["وفاة", "استقالة"].includes(emp.memberState);

  return (
    <div className={clsx("p-4 rounded-2xl border shadow-sm", T.card, isDead && "border-rose-200 dark:border-rose-900/50 bg-rose-50/10")}>
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
        <div className="relative flex-shrink-0">
          <div className={clsx("w-20 h-20 rounded-2xl border-2 overflow-hidden flex items-center justify-center shadow-md",
            isDead ? "border-rose-500/30 bg-rose-100" : "border-teal-500/20 bg-gradient-to-br from-teal-50 to-sky-100 dark:from-teal-900/30 dark:to-sky-900/20")}>
            {emp.photo
              ? <img src={emp.photo} className="w-full h-full object-cover" alt="" />
              : <UserCircle size={40} className={isDead ? "text-rose-400" : "text-teal-400"} />
            }
          </div>
        </div>

        <div className="flex-1 min-w-0 text-center sm:text-right">
          <h2 className={clsx("font-black text-lg truncate", isDead ? "text-rose-700 dark:text-rose-400 line-through opacity-80" : T.text)}>
            {emp.name || <span className="text-slate-400 font-bold text-base">ملف عضو جديد</span>}
          </h2>
          <p className={clsx("text-xs font-bold truncate mt-0.5", T.muted)}>
            {[emp.jobTitle, emp.workplace].filter(Boolean).join(" — ") || "لم تُحدَّد تفاصيل الوظيفة بعد"}
          </p>
          <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 mt-2">
            {emp.jobId && (
              <span className="flex items-center gap-1 text-[10px] font-black bg-sky-500/10 text-sky-600 px-2 py-0.5 rounded-lg border border-sky-500/20">
                <Hash size={11} /> {emp.jobId}
              </span>
            )}
            {emp.membershipId && (
              <span className="flex items-center gap-1 text-[10px] font-black bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-lg border border-amber-500/20">
                <Star size={11} /> {emp.membershipId}
              </span>
            )}
            {emp.membershipStatus && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-lg text-white bg-teal-500">{emp.membershipStatus}</span>
            )}
            {emp.memberState && emp.memberState !== "نشط" && (
              <span className={clsx("text-[10px] font-black px-2 py-0.5 rounded-lg text-white", isDead ? "bg-rose-500" : "bg-amber-500")}>
                {emp.memberState}
              </span>
            )}
          </div>
        </div>

        <div className="hidden lg:flex gap-5 text-center border-r border-slate-100 dark:border-slate-800 pr-5">
          {age !== null && (
            <div><p className="text-2xl font-black text-teal-600">{age}</p><p className="text-[9px] font-bold text-slate-400 uppercase">العمر</p></div>
          )}
          {yrs !== null && (
            <div><p className="text-2xl font-black text-sky-600">{yrs}</p><p className="text-[9px] font-bold text-slate-400 uppercase">سنة خدمة</p></div>
          )}
          {emp.jobGrade && (
            <div><p className="text-sm font-black text-amber-600 mt-1">{emp.jobGrade}</p><p className="text-[9px] font-bold text-slate-400 uppercase">الدرجة</p></div>
          )}
        </div>
      </div>
    </div>
  );
};

const TabBar = ({ activeTab, setActiveTab, completeness, T, tabs = TABS }) => (
  <div className={clsx("flex gap-1.5 p-1.5 rounded-xl border shadow-sm overflow-x-auto", T.card)} style={{ scrollbarWidth: "none" }}>
    {tabs.map(tab => {
      const Icon = tab.icon;
      const isActive = activeTab === tab.id;
      const pct = completeness[tab.id] || 0;
      return (
        <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black whitespace-nowrap transition-all flex-shrink-0 relative border",
            isActive
              ? (_tabAct[tab.color] || "bg-teal-600 text-white shadow-sm border-teal-500 scale-105 z-10")
              : (_tabIna[tab.color] || "bg-teal-50 text-teal-600 hover:bg-teal-100 border-teal-100 dark:bg-teal-900/20 dark:border-teal-900/30")
          )}>
          <Icon size={13} />
          <span className="hidden sm:inline">{tab.label}</span>
          {pct === 100 && !isActive && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full flex items-center justify-center border border-white dark:border-slate-900 shadow-sm">
              <Check size={7} className="text-white" />
            </span>
          )}
        </button>
      );
    })}
  </div>
);

// ─────────────────────────────────────────────────────────────
// المكوّن الرئيسي لنموذج الموظف
// ─────────────────────────────────────────────────────────────
export default function EmployeeForm({
  initialData, data, employee,
  modalMode, mode,
  onSave, onSubmit,
  onCancel, onClose,
  employeesDB = []
}) {
  const T = useT();
  const { app } = useFirebase();
  const { can } = useAuth();
  const storage = useMemo(() => getStorage(app), [app]);

  const actualData = initialData || data || employee || null;
  const actualMode = modalMode || mode || "add";
  const handleSaveSubmit = onSave || onSubmit;
  const attachmentBusinessPermission = actualData || actualMode === "edit"
    ? PERMISSIONS.employeesEdit
    : PERMISSIONS.employeesCreate;
  const canViewAttachments = hasStoragePermissions(can, [
    PERMISSIONS.employeesView,
    PERMISSIONS.attachmentsView,
  ]);
  const canUploadAttachments = hasStoragePermissions(can, [
    attachmentBusinessPermission,
    PERMISSIONS.attachmentsUpload,
  ]);
  const canDeleteAttachments = hasStoragePermissions(can, [
    PERMISSIONS.employeesEdit,
    PERMISSIONS.attachmentsDelete,
  ]);
  const visibleTabs = TABS.filter((tab) => tab.id !== "attachments" || canViewAttachments || canUploadAttachments);

  const getEmptyEmp = () => ({
    name: "", nationalId: "", jobId: "", phone: "", phone2: "", email: "",
    membershipStatus: "عضو جمعية عمومية", memberState: "نشط",
    attachments: [], membershipId: genMembershipId()
  });

  const [emp, setEmp] = useState(getEmptyEmp());
  const [errors, setErrors] = useState({});
  const [activeTab, setActiveTab] = useState("identity");
  const [q, setQ] = useState("");
  const [toast, setToast] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [promotions, setPromotions] = useState([]);
  const photoRef = useRef(null);

  const handleClose = useCallback(() => {
    if (isDirty && !window.confirm("لديك تعديلات غير محفوظة. هل أنت متأكد من الخروج؟")) return;
    if (onCancel) onCancel();
    else if (onClose) onClose();
  }, [isDirty, onCancel, onClose]);

  useEffect(() => {
    if (actualData && Object.keys(actualData).length > 0) {
      setEmp({
        ...actualData,
        birthDate: actualData.birthDate || actualData.dateOfBirth || "",
        retirementDate: actualData.retirementDate || actualData.retireDate || "",
        membershipExpiry: actualData.membershipExpiry || actualData.retirementDate || actualData.retireDate || "",
        deathDate: actualData.deathDate || actualData.dateOfDeath || "",
        membershipStatus: actualData.membershipStatus || "عضو جمعية عمومية",
        memberState: actualData.memberState || "نشط",
        attachments: actualData.attachments || [],
        membershipId: actualData.membershipId || genMembershipId(),
      });
      setPromotions(actualData.promotions || []);
    } else {
      setEmp(getEmptyEmp());
      setPromotions([]);
    }
    setErrors({});
    setIsDirty(false);
    setActiveTab("identity");
  }, [actualData]);

  const upd = useCallback((fields) => {
    setEmp(prev => ({ ...prev, ...fields }));
    setIsDirty(true);
  }, []);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const nid = toEn(emp.nationalId || "");
    if (nid.length !== 14 || !/^\d{14}$/.test(nid)) return;

    const derivedBirthDate = getBirthDateFromNationalId(nid);
    if (!derivedBirthDate) return;

    const govCode = nid.substring(7, 9);
    const seq = parseInt(nid.substring(12, 13), 10);
    const gender = seq % 2 === 0 ? "أنثى" : "ذكر";
    const gov = GOVS[govCode] || "محافظة أخرى";
    const legalRetirementDate = getLegalRetirementDate({ nationalId: nid });

    setEmp((prev) => ({
      ...prev,
      gender,
      birthDate: formatEmployeeDate(derivedBirthDate) || prev.birthDate || "",
      placeOfBirth: gov,
      retirementDate: formatEmployeeDate(legalRetirementDate) || prev.retirementDate || "",
      membershipExpiry: formatEmployeeDate(legalRetirementDate) || prev.membershipExpiry || "",
    }));
  }, [emp.nationalId]);

  const validate = useCallback(() => {
    const e = {};
    if (!emp.name || emp.name.trim().split(/\s+/).length < 3) e.name = "الاسم الثلاثي مطلوب على الأقل";
    if (emp.name && employeesDB.some(x => x.name === emp.name && x.id !== emp.id)) e.name = "الاسم مسجل مسبقاً لعضو آخر";

    const nid = toEn(emp.nationalId || "");
    if (!nid || nid.length !== 14 || !/^\d{14}$/.test(nid)) e.nationalId = "يجب إدخال 14 رقماً صحيحاً";
    if (nid && employeesDB.some(x => x.nationalId === nid && x.id !== emp.id)) e.nationalId = "الرقم القومي مسجل مسبقاً";

    if (!emp.jobId?.trim()) e.jobId = "الكود الوظيفي مطلوب";
    if (emp.jobId && employeesDB.some(x => x.jobId === emp.jobId && x.id !== emp.id)) e.jobId = "الكود الوظيفي مسجل مسبقاً";

    const p1 = toEn(emp.phone || "").trim();
    if (!p1) e.phone = "رقم الهاتف مطلوب";
    else if (p1.length !== 11 || !p1.startsWith("01")) e.phone = "11 رقماً ويبدأ بـ 01";

    const p2 = toEn(emp.phone2 || "").trim();
    if (p2 && (p2.length !== 11 || !p2.startsWith("01"))) e.phone2 = "11 رقماً ويبدأ بـ 01";

    if (emp.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emp.email)) e.email = "صيغة البريد غير صحيحة";

    setErrors(e);
    const hasErrors = Object.keys(e).length > 0;
    if (hasErrors) {
      showToast("يرجى إكمال الحقول الإلزامية المُعلَّمة باللون الأحمر", "error");
      if (e.name || e.nationalId) setActiveTab("identity");
      else if (e.jobId) setActiveTab("job");
      else if (e.phone || e.phone2 || e.email) setActiveTab("contact");
    }
    return !hasErrors;
  }, [emp, employeesDB, showToast]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    showToast("جاري توثيق السجل...");
    try {
      await handleSaveSubmit?.({ ...emp, promotions, updatedAt: new Date().toISOString() });
      setIsDirty(false);
      if (actualMode === "add") {
        setEmp(getEmptyEmp());
        setPromotions([]);
        setActiveTab("identity");
        setErrors({});
      }
    } catch (err) {
      showToast("حدث خطأ أثناء الحفظ", "error");
      console.error(err);
    }
  }, [validate, emp, promotions, handleSaveSubmit, showToast, actualMode]);

  const searchRes = useMemo(() => {
    if (!q || q.length < 2) return [];
    return employeesDB.filter(x =>
      x.name?.includes(q) || x.jobId?.includes(q) || x.nationalId?.includes(q) || x.phone?.includes(q)
    ).slice(0, 5);
  }, [q, employeesDB]);

  // 🎯 إصلاح الشاشة البيضاء: التحقق الآمن من القيم
  const completeness = useMemo(() => {
    const has = (v) => v !== null && v !== undefined && String(v).trim().length > 0;
    return {
      identity: [emp.name, emp.nationalId, emp.gender, emp.birthDate, emp.maritalStatus].filter(has).length / 5 * 100,
      job: [emp.jobId, emp.workplace, emp.jobTitle, emp.jobGrade, emp.hireDate, emp.qualification].filter(has).length / 6 * 100,
      union: [emp.membershipId, emp.membershipStatus, emp.unionBranch, emp.subscriptionStatus].filter(has).length / 4 * 100,
      financial: [emp.basicSalary, emp.allowances, emp.insuranceNumber].filter(has).length / 3 * 100,
      contact: [emp.phone, emp.address].filter(has).length / 2 * 100,
      medical: [emp.bloodType, emp.insuranceType].filter(has).length / 2 * 100,
      attachments: (emp.attachments?.length > 0) ? 100 : 0,
    };
  }, [emp]);

  const renderTabContent = () => {
    switch (activeTab) {

      case "identity": return (
        <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
          <ERPSection title="بيانات الهوية الشخصية" icon={ShieldCheck} colorClass="teal" T={T}>
            <div className="sm:col-span-2 lg:col-span-2">
              <ERPInput label="الاسم الرباعي الكامل *" value={emp.name || ""} onChange={e => upd({ name: e.target.value })} error={errors.name} icon={User} />
            </div>
            <ERPInput label="الرقم القومي (14 رقم) *" value={emp.nationalId || ""} onChange={e => upd({ nationalId: toEn(e.target.value) })} maxLength={14} isNumeric icon={CreditCard} error={errors.nationalId} />
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase pr-1">الحالة الاجتماعية</label>
              <select value={emp.maritalStatus || ""} onChange={e => upd({ maritalStatus: e.target.value })} className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:ring-2 focus:border-teal-500 h-[36px]", T.inp)}>
                <option value="">اختر...</option>
                {MARITAL.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <ERPInput label="الجنس" value={emp.gender || "—"} isDerived icon={Award} />
            <ERPInput label="تاريخ الميلاد" value={emp.birthDate || "—"} isDerived icon={Calendar} />
            <ERPInput label="محافظة الميلاد" value={emp.placeOfBirth || "—"} isDerived icon={Map} />
            <ERPInput label="تاريخ الخروج للمعاش" value={emp.retirementDate || "—"} isDerived icon={Calendar} />
            <ERPInput label="عدد الأبناء" value={emp.childrenCount || ""} onChange={e => upd({ childrenCount: e.target.value })} isNumeric icon={Users} />
          </ERPSection>
        </div>
      );

      case "job": {
        const sortedPromotions = [...promotions].sort((a, b) => {
          const dA = parseDateStr(a.date)?.getTime() || 0;
          const dB = parseDateStr(b.date)?.getTime() || 0;
          return dA !== dB ? dB - dA : a.id - b.id;
        });
        return (
          <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
            <ERPSection title="السجل الوظيفي ومكان العمل" icon={Briefcase} colorClass="sky" T={T}>
              <ERPInput label="الكود الوظيفي *" value={emp.jobId || ""} onChange={e => upd({ jobId: e.target.value })} isNumeric icon={Hash} error={errors.jobId} />
              <WorkplaceSelect value={emp.workplace} onChange={v => upd({ workplace: v })} employeesDB={employeesDB} T={T} />
              <DynamicSelect label="المسمى الوظيفي" listKey="jobTitles" value={emp.jobTitle} onChange={v => upd({ jobTitle: v })} icon={Briefcase} defaultOptions={["محاسب", "مهندس", "فني", "خدمة عملاء", "أمين مخزن", "مراجع"]} />
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase pr-1">الدرجة الوظيفية</label>
                <select value={emp.jobGrade || ""} onChange={e => upd({ jobGrade: e.target.value })} className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:ring-2 focus:border-sky-500 h-[36px]", T.inp)}>
                  <option value="">اختر الدرجة...</option>
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <ArabicDatePicker label="تاريخ التعيين" value={emp.hireDate} onChange={v => upd({ hireDate: v })} maxDate={fmtDate(new Date())} minDate={addYearsToStr(emp.birthDate, 18)} T={T} />
              <ArabicDatePicker label="تاريخ آخر ترقية" value={emp.lastPromotionDate} onChange={v => upd({ lastPromotionDate: v })} minDate={emp.hireDate} maxDate={fmtDate(new Date())} T={T} />
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase pr-1">المؤهل الدراسي</label>
                <select value={emp.qualification || ""} onChange={e => upd({ qualification: e.target.value })} className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:ring-2 focus:border-sky-500 h-[36px]", T.inp)}>
                  <option value="">اختر المؤهل...</option>
                  {QUALS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
              <ERPInput label="التخصص / مجال العمل" value={emp.specialization || ""} onChange={e => upd({ specialization: e.target.value })} icon={GraduationCap} />
            </ERPSection>

            <div className={clsx("p-4 rounded-xl border shadow-sm", T.card)}>
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-center border-b pb-3 border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-black text-xs uppercase text-amber-600 flex items-center gap-2"><TrendingUp size={14} /> سجل الحركات الوظيفية والترقيات</h3>
                  <p className={clsx("text-[10px] font-bold mt-0.5", T.muted)}>إجمالي الحركات: ({promotions.length})</p>
                </div>
                <button type="button" onClick={() => setPromotions(prev => [...prev, { id: Date.now(), date: fmtDate(new Date()), from: "", to: "", note: "" }])}
                  className="text-[10px] font-black bg-amber-500 text-white px-4 py-2 rounded-xl hover:bg-amber-600 transition-all shadow-sm active:scale-95 flex items-center gap-1.5 w-full sm:w-auto justify-center">
                  <Plus size={13} /> إضافة حركة ترقية
                </button>
              </div>
              {promotions.length === 0 ? (
                <div className="text-center text-slate-400 py-10 bg-slate-50 dark:bg-slate-900/30 rounded-xl border-2 border-dashed mt-3">
                  <Award size={28} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs font-black">لا توجد حركات ترقية مسجلة</p>
                </div>
              ) : (
                <div className="overflow-x-auto mt-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                  <table className="w-full text-right text-xs whitespace-nowrap min-w-max">
                    <thead className="bg-slate-100 dark:bg-slate-800 border-b">
                      <tr>
                        <th className="p-3 font-black w-40 border-l border-slate-200 dark:border-slate-700">تاريخ الحركة</th>
                        <th className="p-3 font-black w-48 border-l border-slate-200 dark:border-slate-700">من درجة / وظيفة</th>
                        <th className="p-3 font-black w-48 border-l border-slate-200 dark:border-slate-700">إلى درجة / وظيفة</th>
                        <th className="p-3 font-black min-w-[200px] border-l border-slate-200 dark:border-slate-700">رقم القرار / الملاحظات</th>
                        <th className="p-3 font-black w-12 text-center bg-slate-50 dark:bg-slate-800/50"><Settings size={13} className="mx-auto" /></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {sortedPromotions.map(pr => (
                        <tr key={pr.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="p-1.5 border-l border-slate-200 dark:border-slate-700">
                            <ArabicDatePicker value={pr.date} onChange={v => setPromotions(prev => prev.map(x => x.id === pr.id ? { ...x, date: v } : x))} minDate={emp.hireDate} maxDate={fmtDate(new Date())} T={T} />
                          </td>
                          {["from", "to", "note"].map(field => (
                            <td key={field} className="p-1.5 border-l border-slate-200 dark:border-slate-700">
                              <input
                                value={pr[field]}
                                onChange={e => setPromotions(prev => prev.map(x => x.id === pr.id ? { ...x, [field]: e.target.value } : x))}
                                placeholder={field === "from" ? "الدرجة السابقة" : field === "to" ? "الدرجة الجديدة" : "مثال: قرار رقم 123..."}
                                className={clsx("w-full px-3 py-2 rounded-lg border-transparent hover:border-slate-200 dark:hover:border-slate-600 bg-transparent focus:bg-white dark:focus:bg-slate-900 text-xs font-bold outline-none focus:ring-2 focus:border-amber-500 transition-all", T.inp)}
                              />
                            </td>
                          ))}
                          <td className="p-1.5 text-center bg-slate-50/50 dark:bg-slate-800/20">
                            <button type="button" onClick={() => setPromotions(prev => prev.filter(x => x.id !== pr.id))}
                              className="p-2 text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/50 rounded-lg transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      }

      case "union": return (
        <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
          <ERPSection title="بيانات العضوية النقابية" icon={Star} colorClass="amber" T={T} cols={3}>
            <ERPInput label="رقم العضوية" value={emp.membershipId || ""} onChange={e => upd({ membershipId: e.target.value })} icon={Badge} hint="يُولَّد تلقائياً" />
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase pr-1">طبيعة العضوية</label>
              <select value={emp.membershipStatus || ""} onChange={e => upd({ membershipStatus: e.target.value })} className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:ring-2 focus:border-amber-500 h-[36px]", T.inp)}>
                <option value="">اختر...</option>
                {MEMBERSHIP_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase pr-1">حالة العضوية</label>
              <select value={emp.memberState || "نشط"} onChange={e => upd({ memberState: e.target.value })}
                className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-black outline-none focus:ring-2 focus:border-amber-500 h-[36px]", T.inp, ["وفاة", "استقالة"].includes(emp.memberState) && "text-rose-600 bg-rose-50 border-rose-300")}>
                {MEMBER_STATE.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <DynamicSelect label="الفرع النقابي" listKey="unionBranches" value={emp.unionBranch} onChange={v => upd({ unionBranch: v })} icon={Building} defaultOptions={["النقابة العامة", "اللجنة النقابية بالمنصورة", "اللجنة النقابية بطلخا"]} />
            <ArabicDatePicker label="تاريخ الانتساب" value={emp.unionJoinDate} onChange={v => upd({ unionJoinDate: v })} minDate={emp.hireDate || addYearsToStr(emp.birthDate, 18)} maxDate={fmtDate(new Date())} T={T} />
            {emp.memberState === "وفاة" && (
              <ArabicDatePicker
                label="تاريخ الوفاة"
                value={emp.deathDate || ""}
                onChange={v => upd({ deathDate: v })}
                maxDate={fmtDate(new Date())}
                minDate={emp.birthDate || undefined}
                T={T}
              />
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase pr-1">حالة الاشتراك</label>
              <select value={emp.subscriptionStatus || ""} onChange={e => upd({ subscriptionStatus: e.target.value })} className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:ring-2 focus:border-amber-500 h-[36px]", T.inp)}>
                <option value="">اختر...</option>
                {SUBSCRIPTION_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <ERPInput label="رقم شهادة العضوية" value={emp.membershipCertNo || ""} onChange={e => upd({ membershipCertNo: e.target.value })} icon={FileText} />
          </ERPSection>
          <ERPSection title="الاشتراكات والمستحقات النقابية" icon={DollarSign} colorClass="amber" T={T} cols={3}>
            <ERPInput label="الاشتراك الشهري (جنيه)" value={emp.monthlySubscription || ""} onChange={e => upd({ monthlySubscription: e.target.value })} isNumeric icon={DollarSign} />
            <ERPInput label="إجمالي الاشتراكات المسددة" value={emp.totalPaidSubscriptions || ""} onChange={e => upd({ totalPaidSubscriptions: e.target.value })} isNumeric icon={CheckCircle2} />
            <ERPInput label="المتأخرات (جنيه)" value={emp.subscriptionArrears || ""} onChange={e => upd({ subscriptionArrears: e.target.value })} isNumeric icon={AlertCircle} />
            <ArabicDatePicker label="تاريخ آخر تجديد" value={emp.lastRenewalDate} onChange={v => upd({ lastRenewalDate: v })} maxDate={fmtDate(new Date())} T={T} />
            <ERPInput label="تاريخ انتهاء عضوية النقابة" value={emp.membershipExpiry || emp.retirementDate || "—"} isDerived icon={Calendar} />
            <ERPInput label="ملاحظات العضوية" value={emp.membershipNotes || ""} onChange={e => upd({ membershipNotes: e.target.value })} icon={Clipboard} />
          </ERPSection>
        </div>
      );

      case "financial": return (
        <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
          <ERPSection title="الراتب الأساسي والمكافآت" icon={DollarSign} colorClass="emerald" T={T}>
            <ERPInput label="الراتب الأساسي (جنيه)" value={emp.basicSalary || ""} onChange={e => upd({ basicSalary: e.target.value })} isNumeric icon={DollarSign} />
            <ERPInput label="إجمالي البدلات والحوافز" value={emp.allowances || ""} onChange={e => upd({ allowances: e.target.value })} isNumeric icon={Plus} />
            <ERPInput label="صافي المرتب التقديري" value={emp.netSalary || ""} onChange={e => upd({ netSalary: e.target.value })} isNumeric icon={TrendingUp} />
            <ERPInput label="رقم الحساب البنكي (الآيبان)" value={emp.bankAccount || ""} onChange={e => upd({ bankAccount: e.target.value })} icon={Landmark} />
            <ERPInput label="اسم البنك" value={emp.bankName || ""} onChange={e => upd({ bankName: e.target.value })} icon={Landmark} />
            <ERPInput label="فرع البنك" value={emp.bankBranch || ""} onChange={e => upd({ bankBranch: e.target.value })} icon={MapPin} />
            <ERPInput label="رقم بطاقة الصرف (فيزا)" value={emp.atmCardNo || ""} onChange={e => upd({ atmCardNo: e.target.value })} isNumeric icon={CreditCard} />
          </ERPSection>
          <ERPSection title="التأمينات الاجتماعية" icon={Shield} colorClass="emerald" T={T} cols={3}>
            <ERPInput label="الرقم التأميني" value={emp.insuranceNumber || ""} onChange={e => upd({ insuranceNumber: e.target.value })} isNumeric icon={Shield} />
            <ERPInput label="رقم ملف التأمين" value={emp.insuranceFile || ""} onChange={e => upd({ insuranceFile: e.target.value })} icon={FileText} />
            <ERPInput label="الاستقطاع التأميني الشهري" value={emp.insuranceContrib || ""} onChange={e => upd({ insuranceContrib: e.target.value })} isNumeric icon={DollarSign} />
            <ArabicDatePicker label="تاريخ بداية التأمين" value={emp.insuranceStartDate} onChange={v => upd({ insuranceStartDate: v })} minDate={emp.hireDate} maxDate={fmtDate(new Date())} T={T} />
          </ERPSection>
        </div>
      );

      case "contact": return (
        <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
          <ERPSection title="بيانات الاتصال الأساسية" icon={PhoneCall} colorClass="purple" T={T} cols={2}>
            <ERPInput label="رقم الموبايل الأساسي *" value={emp.phone || ""} onChange={e => upd({ phone: e.target.value })} isNumeric icon={Phone} error={errors.phone} placeholder="010xxxxxxxx" maxLength={11} />
            <ERPInput label="رقم موبايل إضافي" value={emp.phone2 || ""} onChange={e => upd({ phone2: e.target.value })} isNumeric icon={PhoneCall} error={errors.phone2} placeholder="011xxxxxxxx" maxLength={11} />
            <ERPInput label="البريد الإلكتروني" type="email" value={emp.email || ""} onChange={e => upd({ email: e.target.value })} icon={Mail} error={errors.email} placeholder="example@domain.com" />
            <ERPInput label="المحافظة" value={emp.governorate || ""} onChange={e => upd({ governorate: e.target.value })} icon={Map} />
            <div className="sm:col-span-2">
              <ERPInput label="العنوان التفصيلي كما هو في البطاقة" value={emp.address || ""} onChange={e => upd({ address: e.target.value })} icon={Home} />
            </div>
            <ERPInput label="المدينة / المركز / الحي" value={emp.city || ""} onChange={e => upd({ city: e.target.value })} icon={MapPin} />
          </ERPSection>
          <div className={clsx("p-4 rounded-xl border space-y-3 bg-rose-50/40 dark:bg-rose-950/10 border-rose-100 dark:border-rose-900/30", T.card)}>
            <div className="flex items-center gap-2 text-rose-600 border-b border-rose-100 dark:border-rose-900/40 pb-2 font-black text-[11px] uppercase tracking-widest">
              <Heart size={13} /> بيانات الاتصال في حالات الطوارئ
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <ERPInput label="اسم جهة الطوارئ" value={emp.emergencyName || ""} onChange={e => upd({ emergencyName: e.target.value })} icon={User} />
              <ERPInput label="هاتف جهة الطوارئ" value={emp.emergencyPhone || ""} onChange={e => upd({ emergencyPhone: e.target.value })} isNumeric icon={Phone} />
              <ERPInput label="صلة القرابة" value={emp.emergencyRelation || ""} onChange={e => upd({ emergencyRelation: e.target.value })} icon={Users} />
              <ERPInput label="هاتف بديل" value={emp.emergencyPhone2 || ""} onChange={e => upd({ emergencyPhone2: e.target.value })} isNumeric icon={PhoneCall} />
              <div className="sm:col-span-2">
                <ERPInput label="عنوان جهة الطوارئ" value={emp.emergencyAddress || ""} onChange={e => upd({ emergencyAddress: e.target.value })} icon={Home} />
              </div>
            </div>
          </div>
        </div>
      );

      case "medical": return (
        <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
          <ERPSection title="البيانات الصحية والتأمين الطبي" icon={Stethoscope} colorClass="rose" T={T} cols={3}>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase pr-1">فصيلة الدم</label>
              <select value={emp.bloodType || ""} onChange={e => upd({ bloodType: e.target.value })} className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:ring-2 focus:border-rose-500 h-[36px]", T.inp)}>
                <option value="">غير معروف</option>
                {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase pr-1">نوع التأمين الصحي</label>
              <select value={emp.insuranceType || ""} onChange={e => upd({ insuranceType: e.target.value })} className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:ring-2 focus:border-rose-500 h-[36px]", T.inp)}>
                <option value="">اختر...</option>
                {INSURANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <ERPInput label="رقم بطاقة التأمين الصحي" value={emp.healthCardNo || ""} onChange={e => upd({ healthCardNo: e.target.value })} icon={CreditCard} />
            <ERPInput label="جهة الرعاية / العيادة" value={emp.healthProvider || ""} onChange={e => upd({ healthProvider: e.target.value })} icon={Stethoscope} />
            <ERPInput label="إعاقة / حالة خاصة (إن وجد)" value={emp.specialNeeds || ""} onChange={e => upd({ specialNeeds: e.target.value })} icon={Heart} />
            <ERPInput label="ملاحظات طبية هامة" value={emp.medicalNotes || ""} onChange={e => upd({ medicalNotes: e.target.value })} icon={Clipboard} />
          </ERPSection>
        </div>
      );

      case "attachments": return (
        !canViewAttachments && !canUploadAttachments ? null :
        <div className={clsx("p-5 rounded-2xl border space-y-4 animate-in slide-in-from-right-4 duration-300", T.card)}>
          <div className="flex justify-between items-center border-b pb-3 border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-teal-600">
              <FileText size={14} /> الأرشيف والمرفقات {canViewAttachments ? `(${emp.attachments?.length || 0})` : ""}
            </div>
            {canUploadAttachments && <label className="cursor-pointer bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 shadow-md transition-all active:scale-95 text-[11px] font-black flex items-center gap-1.5">
              <Upload size={13} /> رفع ملف
              <input type="file" hidden multiple accept={SECURE_ATTACHMENT_ACCEPT.join(",")} onChange={async (e) => {
                if (!requireStoragePermissions(can, [attachmentBusinessPermission, PERMISSIONS.attachmentsUpload], (message) => showToast(message, "error"))) {
                  e.target.value = "";
                  return;
                }
                const files = Array.from(e.target.files || []);
                const uploaded = [];
                for (const file of files) {
                  const validationError = validateSecureAttachment(file);
                  if (validationError) {
                    showToast(`${file.name}: ${validationError}`, "error");
                    continue;
                  }
                  try {
                    const attachmentId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    const storagePath = buildEmployeeAttachmentPath({
                      employeeId: emp.id || emp.membershipId || "new",
                      attachmentId,
                      fileName: file.name,
                    });
                    const storageRef = ref(storage, storagePath);
                    await uploadBytes(storageRef, file, { contentType: file.type });
                    const url = await getDownloadURL(storageRef);
                    uploaded.push({
                      id: attachmentId,
                      name: file.name,
                      size: file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`,
                      type: file.type,
                      url,
                      storagePath,
                      uploadedAt: fmtDate(new Date()),
                    });
                  } catch (error) {
                    showToast(`تعذر رفع ${file.name}: ${error.message || "خطأ غير معروف"}`, "error");
                  }
                }
                if (uploaded.length > 0) {
                  upd({ attachments: [...(emp.attachments || []), ...uploaded] });
                  showToast(`تم رفع ${uploaded.length} ملف`);
                }
                e.target.value = "";
              }} />
            </label>}
          </div>
          {canViewAttachments && <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {emp.attachments?.map(f => (
              <a key={f.id} href={f.url || "#"} target={f.url ? "_blank" : undefined} rel="noreferrer" onClick={(event) => { if (!f.url) event.preventDefault(); }} className={clsx("flex flex-col items-center gap-2 p-3 rounded-xl border group hover:border-teal-500 hover:shadow-md transition-all cursor-pointer relative", T.sxn)}>
                {canDeleteAttachments && <button type="button" onClick={async (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!requireStoragePermissions(can, [PERMISSIONS.employeesEdit, PERMISSIONS.attachmentsDelete], (message) => showToast(message, "error"))) return;
                  if (f.storagePath) {
                    try {
                      const managedPath = requireManagedAttachmentPath(f.storagePath);
                      await deleteObject(ref(storage, managedPath));
                    } catch (error) { showToast(`تعذر حذف الملف من التخزين: ${error.message || "خطأ غير معروف"}`, "error"); return; }
                  }
                  upd({ attachments: emp.attachments.filter(x => x.id !== f.id) });
                }}
                  className="absolute top-1.5 right-1.5 p-1 bg-white dark:bg-slate-800 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 shadow-sm transition-all z-10">
                  <Trash2 size={11} />
                </button>}
                <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                  f.name.endsWith(".pdf") ? "bg-rose-100 text-rose-600" :
                    f.type?.startsWith("image/") ? "bg-sky-100 text-sky-600" : "bg-teal-100 text-teal-600")}>
                  <FileText size={20} />
                </div>
                <div className="w-full text-center">
                  <p className="text-[10px] font-black truncate w-full" title={f.name}>{f.name}</p>
                  <p className="text-[9px] font-bold text-slate-400 mt-0.5">{f.size} · {f.uploadedAt}</p>
                </div>
              </a>
            ))}
            {(!emp.attachments || emp.attachments.length === 0) && (
              <div className="col-span-full flex flex-col items-center justify-center py-12 gap-2 text-slate-400 bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl border-2 border-dashed">
                <FileText size={36} className="opacity-20" />
                <p className="text-xs font-black">لا توجد مرفقات</p>
                <p className="text-[10px] font-bold opacity-70">يُفضل رفع: صورة البطاقة، شهادة الميلاد، المؤهل</p>
              </div>
            )}
          </div>}
        </div>
      );

      default: return null;
    }
  };

  const totalPct = Math.round(Object.values(completeness).reduce((a, b) => a + b, 0) / Object.keys(completeness).length);

  return (
    <div className={clsx("flex flex-col gap-4 w-full", T.text)} dir="rtl">
      {/* شريط الرأس */}
      <div className={clsx("p-3 px-4 rounded-2xl border shadow-sm flex flex-wrap items-center justify-between gap-3", T.card)}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative cursor-pointer group flex-shrink-0" onClick={() => photoRef.current?.click()} title="تغيير الصورة">
            <div className="w-12 h-12 rounded-xl border-2 border-teal-500/20 overflow-hidden bg-gradient-to-br from-teal-50 to-sky-100 dark:from-teal-900 dark:to-sky-900 flex items-center justify-center transition-transform group-hover:scale-105 shadow-sm">
              {emp.photo ? <img src={emp.photo} className="w-full h-full object-cover" alt="" /> : <UserCircle size={28} className="text-teal-400" />}
            </div>
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-xl transition-opacity">
              <Camera size={13} className="text-white" />
            </div>
            <input type="file" ref={photoRef} hidden accept="image/*" onChange={e => {
              const f = e.target.files[0];
              if (f) { const r = new FileReader(); r.onloadend = () => upd({ photo: r.result }); r.readAsDataURL(f); }
            }} />
          </div>

          <div className="hidden md:block min-w-0 flex-1">
            <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">{emp.name || "جاري تسجيل عضو جديد..."}</p>
            <p className="text-[10px] font-bold text-teal-600 truncate mt-0.5">{emp.jobTitle || "الوظيفة غير محددة"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isDirty && (
            <div className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-600 rounded-lg text-[9px] font-black border border-amber-200 animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> غير محفوظ
            </div>
          )}
          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />
          <button type="button" onClick={handleSave}
            className="flex items-center gap-1.5 px-5 py-2 bg-teal-600 text-white font-black rounded-xl shadow-sm hover:bg-teal-700 hover:-translate-y-0.5 active:translate-y-0 text-xs transition-all">
            <Save size={13} /> <span className="hidden sm:inline">حفظ البيانات</span>
          </button>
        </div>
      </div>

      <ProfileCard emp={emp} T={T} />
      <TabBar activeTab={activeTab} setActiveTab={setActiveTab} completeness={completeness} T={T} tabs={visibleTabs} />

      <div className="min-h-[360px]">{renderTabContent()}</div>

      {/* شريط الأسفل */}
      <div className={clsx("flex flex-col sm:flex-row justify-between items-center gap-4 p-4 sm:px-6 border-t mt-4 rounded-2xl border shadow-sm", T.card)}>
        <div className="flex w-full sm:w-1/3 items-center gap-3">
          <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
            <div className={clsx("h-full rounded-full transition-all duration-700", totalPct > 80 ? "bg-emerald-500" : totalPct > 40 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${totalPct}%` }} />
          </div>
          <span className="text-[10px] font-black text-slate-500 whitespace-nowrap">مكتمل {totalPct}%</span>
        </div>
        <div className="flex w-full sm:w-auto gap-2">
          <button type="button" onClick={handleClose}
            className={clsx("flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-black text-xs border hover:bg-slate-50 dark:hover:bg-slate-800 transition-all", T.btn)}>
            إلغاء التعديلات
          </button>
          <button type="button" onClick={handleSave}
            className="flex-1 sm:flex-none px-8 py-2.5 bg-teal-600 text-white font-black rounded-xl shadow-md hover:bg-teal-700 active:scale-95 flex items-center justify-center gap-1.5 transition-all text-xs">
            <CheckCircle2 size={15} /> اعتماد السجل
          </button>
        </div>
      </div>
    </div>
  );
}
