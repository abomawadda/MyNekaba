/**
 * TreasuryForm — نموذج إصدار المستندات المالية
 * - استنتاج تلقائي لبيان الشيك / المستند
 * - تحديث حي لرقم الشيك
 * - دعم الرعاية، السلف، الرحلات، الأنشطة، البنود الأخرى، والخصم البنكي المباشر
 * - تحقق كامل قبل الحفظ
 * - دعم المرفقات والطباعة
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import clsx from "clsx";
import { collection, getDocs, query } from "firebase/firestore";
import { useLocation } from "react-router-dom";

import {
  Activity,
  AlertCircle,
  Building,
  CheckCircle2,
  DollarSign,
  FileText,
  Hash,
  Heart,
  Info,
  Landmark,
  Loader2,
  MapPin,
  Printer,
  RotateCcw,
  Search,
  Sparkles,
  Tag,
  User,
  UserCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";

import WorkflowStepper from "./WorkflowStepper";
import { printAidRequest, printVoucher } from "./VoucherPrint";
import FileUpload from "./FileUpload";

import ArabicDatePicker from "../../ui/inputs/ArabicDatePicker";
import DynamicSelect from "../../ui/inputs/DynamicSelect";

import { db } from "../../app/providers/FirebaseProvider";
import { useT } from "../../app/providers/ThemeProvider";

import {
  DIRECT_BANK_CHARGE_OPTIONS,
  EVENT_DETAILS_TYPES,
  EMPLOYEE_LOOKUP_TYPES,
  getDefaultRequiresSettlement,
  getIssuedCheckTypeLabel,
  getSettlementMode,
  ISSUED_CHECK_TYPE_COLORS,
  ISSUED_CHECK_TYPE_LABELS,
  ISSUED_CHECK_TYPES,
  normalizeIssuedCheckType,
  OPTIONAL_SETTLEMENT_TYPES,
} from "./helpers/issuedChecks";

import {
  formatEmployeeDate,
  getRetirementDate,
  isEligibleForBenefit,
  isRetiredMember,
  sortMembersByAgeThenJobId,
} from "../../utils/memberBenefits";

/* =========================
   Constants
========================= */

const AID_RELS = {
  "رعاية زواج": ["العضو نفسه", "ابن", "ابنة"],
  "رعاية وفاة": ["العضو نفسه", "الزوج", "الزوجة", "أب", "أم", "ابن", "ابنة"],
  "ظروف قهرية / صحية": ["العضو نفسه"],
  مناسبات: ["ميزانيات", "دور وطني", "جوائز مسابقات", "مبادرات"],
};

const AID_AMOUNTS = {
  "رعاية وفاة:العضو نفسه": 500,
  "رعاية وفاة:الزوج": 500,
  "رعاية وفاة:الزوجة": 500,
  "رعاية وفاة:أب": 300,
  "رعاية وفاة:أم": 300,
  "رعاية وفاة:ابن": 300,
  "رعاية وفاة:ابنة": 300,

  "رعاية زواج:العضو نفسه": 500,
  "رعاية زواج:ابن": 300,
  "رعاية زواج:ابنة": 300,

  "ظروف قهرية / صحية:العضو نفسه": 300,
};

const ACTIVITY_TYPES = [
  "رحلة ترفيهية",
  "رحلة دينية",
  "إفطار جماعي",
  "حفل تكريم",
  "مسابقة رياضية",
  "مسابقة ثقافية",
  "احتفالية سنوية",
  "ندوة / محاضرة",
  "أخرى",
];

const EXPENSE_ITEM_OPTIONS = [
  "ميزانية تشغيل",
  "دعم نشاط",
  "مصروف إداري",
  "مخصص لجنة",
  "بند خاص",
  "أخرى",
];

const COLOR_STYLES = {
  teal: {
    softBg: "bg-teal-500/10",
    lightBg: "bg-teal-50",
    border: "border-teal-500",
    softBorder: "border-teal-200",
    text: "text-teal-600",
    activeText: "text-teal-700",
    hoverBorder: "hover:border-teal-300",
    hoverBg: "hover:bg-teal-50/40",
    ring: "focus:ring-teal-500/20",
  },
  sky: {
    softBg: "bg-sky-500/10",
    lightBg: "bg-sky-50",
    border: "border-sky-500",
    softBorder: "border-sky-200",
    text: "text-sky-600",
    activeText: "text-sky-700",
    hoverBorder: "hover:border-sky-300",
    hoverBg: "hover:bg-sky-50/40",
    ring: "focus:ring-sky-500/20",
  },
  blue: {
    softBg: "bg-blue-500/10",
    lightBg: "bg-blue-50",
    border: "border-blue-500",
    softBorder: "border-blue-200",
    text: "text-blue-600",
    activeText: "text-blue-700",
    hoverBorder: "hover:border-blue-300",
    hoverBg: "hover:bg-blue-50/40",
    ring: "focus:ring-blue-500/20",
  },
  amber: {
    softBg: "bg-amber-500/10",
    lightBg: "bg-amber-50",
    border: "border-amber-500",
    softBorder: "border-amber-200",
    text: "text-amber-600",
    activeText: "text-amber-700",
    hoverBorder: "hover:border-amber-300",
    hoverBg: "hover:bg-amber-50/40",
    ring: "focus:ring-amber-500/20",
  },
  orange: {
    softBg: "bg-orange-500/10",
    lightBg: "bg-orange-50",
    border: "border-orange-500",
    softBorder: "border-orange-200",
    text: "text-orange-600",
    activeText: "text-orange-700",
    hoverBorder: "hover:border-orange-300",
    hoverBg: "hover:bg-orange-50/40",
    ring: "focus:ring-orange-500/20",
  },
  rose: {
    softBg: "bg-rose-500/10",
    lightBg: "bg-rose-50",
    border: "border-rose-500",
    softBorder: "border-rose-200",
    text: "text-rose-600",
    activeText: "text-rose-700",
    hoverBorder: "hover:border-rose-300",
    hoverBg: "hover:bg-rose-50/40",
    ring: "focus:ring-rose-500/20",
  },
  purple: {
    softBg: "bg-purple-500/10",
    lightBg: "bg-purple-50",
    border: "border-purple-500",
    softBorder: "border-purple-200",
    text: "text-purple-600",
    activeText: "text-purple-700",
    hoverBorder: "hover:border-purple-300",
    hoverBg: "hover:bg-purple-50/40",
    ring: "focus:ring-purple-500/20",
  },
  slate: {
    softBg: "bg-slate-500/10",
    lightBg: "bg-slate-50",
    border: "border-slate-500",
    softBorder: "border-slate-200",
    text: "text-slate-600",
    activeText: "text-slate-700",
    hoverBorder: "hover:border-slate-300",
    hoverBg: "hover:bg-slate-50/40",
    ring: "focus:ring-slate-500/20",
  },
};

const getColorStyle = (color = "teal") =>
  COLOR_STYLES[color] || COLOR_STYLES.teal;

const getTodayISO = () => new Date().toISOString().split("T")[0];

const normalizeNumericInput = (value = "") => {
  const cleaned = String(value).replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
};

const normalizeIntegerInput = (value = "") =>
  String(value).replace(/[^\d]/g, "");

const formatMoney = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString("ar-EG") : "0";
};

const safeTheme = (T = {}) => ({
  card:
    T.card ||
    "bg-white border-slate-200 text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-50",
  text: T.text || "text-slate-800 dark:text-slate-100",
  muted: T.muted || "text-slate-500 dark:text-slate-400",
  inp:
    T.inp ||
    "bg-white border-slate-200 text-slate-800 focus:border-teal-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100",
  sel:
    T.sel ||
    "bg-white border-slate-200 text-slate-800 focus:border-teal-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100",
  btn:
    T.btn ||
    "bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500",
});

/* =========================
   UI Components
========================= */

function ERPSection({
  title,
  icon: Icon = FileText, // eslint-disable-line no-unused-vars
  colorClass = "teal",
  children,
  badge,
}) {
  const T = safeTheme(useT?.());
  const color = getColorStyle(colorClass);

  return (
    <section
      className={clsx(
        "p-4 rounded-2xl border shadow-sm space-y-4 relative z-0",
        T.card
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={clsx("p-1.5 rounded-lg", color.softBg)}>
            <Icon size={15} className={color.text} />
          </div>

          <h3
            className={clsx(
              "font-black text-[12px] uppercase tracking-wide",
              T.text
            )}
          >
            {title}
          </h3>
        </div>

        {badge && (
          <span
            className={clsx(
              "text-[10px] font-black px-2 py-1 rounded-full border",
              color.lightBg,
              color.activeText,
              color.softBorder
            )}
          >
            {badge}
          </span>
        )}
      </div>

      {children}
    </section>
  );
}

function ERPInput({
  label,
  icon: Icon,
  error,
  isNumeric,
  hint,
  required,
  fullWidth,
  footer,
  className,
  ...props
}) {
  const T = safeTheme(useT?.());

  return (
    <div
      className={clsx(
        "space-y-1 relative w-full group",
        fullWidth && "sm:col-span-2"
      )}
    >
      {label && (
        <label className={clsx("text-[11px] font-black flex gap-1", T.text)}>
          <span>{label}</span>
          {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {hint && <p className={clsx("text-[10px]", T.muted)}>{hint}</p>}

      <div className="relative">
        {Icon && (
          <Icon
            size={14}
            className={clsx(
              "absolute right-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none transition-colors",
              error
                ? "text-rose-500"
                : "text-slate-400 group-focus-within:text-teal-500"
            )}
          />
        )}

        <input
          {...props}
          inputMode={isNumeric ? "decimal" : props.inputMode || "text"}
          className={clsx(
            "w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none transition-all h-[38px]",
            "focus:ring-2 focus:ring-teal-500/10",
            Icon ? "pr-9" : "pr-3",
            props.disabled
              ? "bg-slate-50/50 opacity-70 cursor-not-allowed"
              : T.inp,
            error && "!border-rose-500 bg-rose-50/10",
            className
          )}
        />
      </div>

      {error && (
        <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
          <AlertCircle size={11} />
          {error}
        </p>
      )}

      {footer}
    </div>
  );
}

function ERPSelect({
  label,
  icon: Icon,
  error,
  required,
  fullWidth,
  children,
  className,
  ...props
}) {
  const T = safeTheme(useT?.());

  return (
    <div
      className={clsx(
        "space-y-1 relative w-full group",
        fullWidth && "sm:col-span-2"
      )}
    >
      {label && (
        <label className={clsx("text-[11px] font-black flex gap-1", T.text)}>
          <span>{label}</span>
          {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className="relative">
        {Icon && (
          <Icon
            size={14}
            className={clsx(
              "absolute right-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none",
              error ? "text-rose-500" : "text-slate-400"
            )}
          />
        )}

        <select
          {...props}
          className={clsx(
            "w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none h-[38px] transition-all",
            "focus:ring-2 focus:ring-teal-500/10",
            Icon ? "pr-9" : "pr-3",
            T.sel,
            props.disabled && "opacity-60 cursor-not-allowed",
            error && "!border-rose-500 bg-rose-50/10",
            className
          )}
        >
          {children}
        </select>
      </div>

      {error && (
        <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
          <AlertCircle size={11} />
          {error}
        </p>
      )}
    </div>
  );
}

function ERPTextarea({
  label,
  error,
  required,
  fullWidth,
  className,
  ...props
}) {
  const T = safeTheme(useT?.());

  return (
    <div className={clsx("space-y-1", fullWidth && "sm:col-span-2")}>
      {label && (
        <label className={clsx("text-[11px] font-black flex gap-1", T.text)}>
          <span>{label}</span>
          {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <textarea
        {...props}
        className={clsx(
          "w-full min-h-[84px] px-3 py-2 rounded-xl border text-xs font-bold outline-none transition-all resize-none",
          "focus:ring-2 focus:ring-teal-500/10",
          props.disabled ? "opacity-60 cursor-not-allowed" : T.inp,
          error && "!border-rose-500 bg-rose-50/10",
          className
        )}
      />

      {error && (
        <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
          <AlertCircle size={11} />
          {error}
        </p>
      )}
    </div>
  );
}

function TypeSelector({ value, onChange }) {
  const iconMap = {
    aid: Heart,
    budget: Wallet,
    activities: Activity,
    trip: MapPin,
    event: Sparkles,
    advance: User,
    other: FileText,
    bank_charge: Landmark,
    deposit: DollarSign,
  };

  const subMap = {
    aid: "بدون تسوية",
    budget: "مرن حسب التحديد",
    activities: "مرن حسب التحديد",
    trip: "شيك + اشتراكات",
    event: "تتطلب تسوية",
    advance: "عهدة تُسوّى",
    other: "مرن حسب التحديد",
    bank_charge: "خصم مباشر من الحساب",
    deposit: "توريد نقدي",
  };

  const types = [
    ...ISSUED_CHECK_TYPES,
    {
      id: "bank_charge",
      label: "خصم مباشر",
      color: "slate",
    },
    {
      id: "deposit",
      label: "إيداع نقدي",
      color: "teal",
    },
  ].map((item) => ({
    ...item,
    icon: iconMap[item.id] || Landmark,
    sub: subMap[item.id] || "",
  }));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-8 gap-2">
      {types.map((t) => {
        const Icon = t.icon;
        const active = value === t.id;
        const color = getColorStyle(t.color || "teal");

        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={clsx(
              "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 transition-all font-black text-[11px] min-h-[86px]",
              active
                ? clsx(
                  color.border,
                  color.lightBg,
                  color.activeText,
                  "shadow-sm"
                )
                : clsx(
                  "border-slate-200 text-slate-500",
                  color.hoverBorder,
                  color.hoverBg
                )
            )}
          >
            <Icon
              size={18}
              className={active ? color.text : "text-slate-400"}
            />
            <span>{t.label || ISSUED_CHECK_TYPE_LABELS[t.id] || t.id}</span>
            {t.sub && (
              <span className="text-[9px] font-bold opacity-70">{t.sub}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SettlementBadge({ enabled }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full border",
        enabled
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-emerald-50 text-emerald-700 border-emerald-200"
      )}
    >
      {enabled ? <RotateCcw size={12} /> : <CheckCircle2 size={12} />}
      {enabled ? "يتطلب تسوية" : "لا يتطلب تسوية"}
    </span>
  );
}

/* =========================
   Main Component
========================= */

export default function TreasuryForm({
  userRole,
  canPost = false,
  onSubmit,
  nextCheque,
  initialData,
  onCancel,
  showToast,
}) {
  const T = safeTheme(useT?.());
  const location = useLocation();

  const isEdit = Boolean(initialData?.id);

  const urlParams = useMemo(
    () => new URLSearchParams(location?.search || ""),
    [location?.search]
  );

  const requestedType = normalizeIssuedCheckType(urlParams.get("type") || "aid");

  const defaultType =
    requestedType === "bank_charge" || ISSUED_CHECK_TYPE_LABELS[requestedType]
      ? requestedType
      : "aid";

  const requiresChequeNumber = useCallback(
    (type) => {
      const cleanType = normalizeIssuedCheckType(type);
      return cleanType !== "bank_charge" && cleanType !== "deposit";
    },
    []
  );

  const getEmptyTx = useCallback(
    () => ({
      type: defaultType,
      date: getTodayISO(),
      amount: "",
      party: "",
      beneficiaryName: "",
      expenseItem: "",
      bankChargeCategory: "",
      bankReference: "",
      employeeId: "",
      notes: "",
      checkNum: requiresChequeNumber(defaultType) ? String(nextCheque || "") : "",

      aidCategory: "",
      aidRel: "",
      incidentDate: "",

      activityName: "",
      activityType: "",
      activityDate: "",
      participantsCount: "",
      activityLocation: "",
      memberSubscriptions: "",

      requires_settlement: getDefaultRequiresSettlement(defaultType),
      attachments: [],
      state: canPost ? "posted" : "draft",
    }),
    [canPost, defaultType, nextCheque, requiresChequeNumber]
  );

  const [tx, setTx] = useState(() => {
    if (!isEdit) return getEmptyTx();

    const normalizedType = normalizeIssuedCheckType(
      initialData?.type || defaultType
    );

    return {
      ...getEmptyTx(),
      ...initialData,
      type: normalizedType,
      beneficiaryName:
        initialData?.beneficiaryName ||
        (normalizedType === "deposit" ? initialData?.party || "" : ""),
      requires_settlement:
        initialData?.requires_settlement ??
        initialData?.requiresSettlement ??
        getDefaultRequiresSettlement(normalizedType),
    };
  });

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [employeesDB, setEmployeesDB] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const [searchQ, setSearchQ] = useState(
    initialData?.party || initialData?.beneficiaryName || ""
  );
  const [searchRes, setSearchRes] = useState([]);
  const [showRes, setShowRes] = useState(false);
  const [empData, setEmpData] = useState(null);

  const [amountManuallyEdited, setAmountManuallyEdited] = useState(
    Boolean(isEdit)
  );
  const [notesManuallyEdited, setNotesManuallyEdited] = useState(
    Boolean(isEdit && initialData?.notes)
  );

  const saveRef = useRef(null);

  const normalizedType = normalizeIssuedCheckType(tx.type);

  const isAid = normalizedType === "aid";
  const isAdvance = normalizedType === "advance";
  const isTrip = normalizedType === "trip";
  const isEvent = normalizedType === "event";
  const isDirectCharge = normalizedType === "bank_charge";
  const isDeposit = normalizedType === "deposit";

  const usesEmployeeLookup = EMPLOYEE_LOOKUP_TYPES.includes(normalizedType);
  const usesEventDetails = EVENT_DETAILS_TYPES.includes(normalizedType);
  const allowsOptionalSettlement =
    OPTIONAL_SETTLEMENT_TYPES.includes(normalizedType);

  const currentRequiresSettlement = Boolean(tx.requires_settlement);

  const typeColor = ISSUED_CHECK_TYPE_COLORS[normalizedType] || "teal";
  const typeLabel =
    normalizedType === "bank_charge"
      ? "خصم مباشر"
      : getIssuedCheckTypeLabel(normalizedType);

  const suggestedAidAmount = useMemo(() => {
    if (!tx.aidCategory || !tx.aidRel) return "";
    return AID_AMOUNTS[`${tx.aidCategory}:${tx.aidRel}`] || 300;
  }, [tx.aidCategory, tx.aidRel]);

  const aidRelOptions = useMemo(() => {
    if (!tx.aidCategory) return [];
    return AID_RELS[tx.aidCategory] || [];
  }, [tx.aidCategory]);

  const update = useCallback((key, value) => {
    setTx((prev) => ({
      ...prev,
      [key]: value,
    }));

    setErrors((prevErr = {}) => {
      if (!prevErr[key]) return prevErr;
      const nextErr = { ...prevErr };
      delete nextErr[key];
      return nextErr;
    });
  }, []);

  const patchTx = useCallback((patch) => {
    setTx((prev) => ({
      ...prev,
      ...patch,
    }));

    setErrors((prevErr = {}) => {
      const nextErr = { ...prevErr };
      Object.keys(patch).forEach((key) => delete nextErr[key]);
      return nextErr;
    });
  }, []);

  /* =========================
     Load Employees
  ========================= */

  useEffect(() => {
    let mounted = true;

    async function loadEmployees() {
      setLoadingEmployees(true);

      try {
        const snap = await getDocs(query(collection(db, "employees")));

        if (!mounted) return;

        setEmployeesDB(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      } catch (err) {
        console.error("خطأ في جلب الأعضاء:", err);
        showToast?.("تعذر تحميل بيانات الأعضاء", "error");
      } finally {
        if (mounted) setLoadingEmployees(false);
      }
    }

    loadEmployees();

    return () => {
      mounted = false;
    };
  }, [showToast]);

  /* =========================
     Employee Search
  ========================= */

  useEffect(() => {
    if (!searchQ || searchQ.trim().length < 2 || !showRes) {
      setSearchRes([]);
      return;
    }

    const handle = window.setTimeout(() => {
      const lq = searchQ.trim().toLowerCase();

      const filtered = employeesDB.filter((e) => {
        const name = e.name?.toLowerCase() || "";
        const jobId = e.jobId?.toString() || "";
        const nationalId = e.nationalId?.toString() || "";

        return (
          name.includes(lq) || jobId.includes(lq) || nationalId.includes(lq)
        );
      });

      setSearchRes(sortMembersByAgeThenJobId(filtered).slice(0, 8));
    }, 180);

    return () => window.clearTimeout(handle);
  }, [employeesDB, searchQ, showRes]);

  /* =========================
     Auto Cheque Number
  ========================= */

  useEffect(() => {
    if (isEdit) return;

    if (requiresChequeNumber(normalizedType)) {
      if (!tx.checkNum || String(tx.checkNum).trim().length === 0) {
        update("checkNum", String(nextCheque || ""));
      }
    } else if (tx.checkNum) {
      update("checkNum", "");
    }
  }, [
    isEdit,
    nextCheque,
    normalizedType,
    requiresChequeNumber,
    tx.checkNum,
    update,
  ]);

  /* =========================
     Auto Aid Amount
  ========================= */

  useEffect(() => {
    if (!isAid) return;
    if (isEdit) return;
    if (amountManuallyEdited) return;
    if (!tx.aidCategory || !tx.aidRel) return;

    update("amount", String(suggestedAidAmount));
  }, [
    amountManuallyEdited,
    isAid,
    isEdit,
    suggestedAidAmount,
    tx.aidCategory,
    tx.aidRel,
    update,
  ]);

  /* =========================
     Auto Notes
  ========================= */

  const buildAutoNotes = useCallback(() => {
    if (isAid) {
      return [
        "صرف",
        tx.aidCategory,
        tx.aidRel ? `عن ${tx.aidRel}` : "",
        tx.party ? `لصالح ${tx.party}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (isAdvance) {
      return tx.party
        ? `صرف سلفة مؤقتة باسم ${tx.party}`
        : "صرف سلفة مؤقتة";
    }

    if (isTrip) {
      return [
        "صرف مصروفات رحلة",
        tx.activityName,
        tx.activityLocation ? `بـ ${tx.activityLocation}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (isEvent) {
      return [
        "صرف مصروفات فعالية",
        tx.activityName,
        tx.activityType ? `نوع ${tx.activityType}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (isDirectCharge) {
      return [
        "خصم مباشر من الحساب",
        tx.bankChargeCategory,
        tx.bankReference ? `مرجع ${tx.bankReference}` : "",
      ]
        .filter(Boolean)
        .join(" - ");
    }

    if (isDeposit) {
      return [
        "إيداع نقدي",
        tx.party || tx.beneficiaryName ? `من ${tx.party || tx.beneficiaryName}` : "",
        tx.bankReference ? `مرجع ${tx.bankReference}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (tx.expenseItem) {
      return [
        "صرف",
        tx.expenseItem,
        tx.beneficiaryName ? `لصالح ${tx.beneficiaryName}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    return "";
  }, [
    isAid,
    isAdvance,
    isTrip,
    isEvent,
    isDirectCharge,
    isDeposit,
    tx.aidCategory,
    tx.aidRel,
    tx.party,
    tx.activityName,
    tx.activityLocation,
    tx.activityType,
    tx.bankChargeCategory,
    tx.bankReference,
    tx.expenseItem,
    tx.beneficiaryName,
  ]);

  useEffect(() => {
    if (notesManuallyEdited) return;

    const generated = buildAutoNotes();

    if (generated && generated !== tx.notes) {
      update("notes", generated);
    }
  }, [buildAutoNotes, notesManuallyEdited, tx.notes, update]);

  /* =========================
     Type Change
  ========================= */

  const handleTypeChange = useCallback(
    (nextType) => {
      const cleanType = normalizeIssuedCheckType(nextType);
      const requiresSettlement = getDefaultRequiresSettlement(cleanType);
      const needsCheque = requiresChequeNumber(cleanType);

      patchTx({
        type: cleanType,
        requires_settlement: requiresSettlement,
        checkNum: needsCheque ? tx.checkNum || String(nextCheque || "") : "",

        aidCategory: cleanType === "aid" ? tx.aidCategory : "",
        aidRel: cleanType === "aid" ? tx.aidRel : "",
        incidentDate: cleanType === "aid" ? tx.incidentDate : "",

        bankChargeCategory:
          cleanType === "bank_charge" ? tx.bankChargeCategory : "",
        bankReference: cleanType === "bank_charge" ? tx.bankReference : "",
      });

      setNotesManuallyEdited(false);

      if (cleanType !== "aid") {
        setAmountManuallyEdited(false);
      }
    },
    [
      nextCheque,
      patchTx,
      requiresChequeNumber,
      tx.aidCategory,
      tx.aidRel,
      tx.bankChargeCategory,
      tx.bankReference,
      tx.checkNum,
      tx.incidentDate,
    ]
  );

  /* =========================
     Employee Select
  ========================= */

  const selectEmployee = useCallback(
    (emp) => {
      patchTx({
        party: emp.name || "",
        employeeId: emp.jobId || emp.id || "",
      });

      setEmpData(emp);
      setSearchQ(emp.name || "");
      setShowRes(false);
    },
    [patchTx]
  );

  const clearEmployee = useCallback(() => {
    patchTx({
      party: "",
      employeeId: "",
    });

    setEmpData(null);
    setSearchQ("");
    setShowRes(false);
  }, [patchTx]);

  /* =========================
     Validation
  ========================= */

  const validate = useCallback(() => {
    const e = {};
    const amount = Number(tx.amount);

    if (!tx.date) {
      e.date = "التاريخ مطلوب";
    }

    if (!tx.amount || !Number.isFinite(amount) || amount <= 0) {
      e.amount = "أدخل مبلغاً موجباً";
    }

    if (
      requiresChequeNumber(normalizedType) &&
      !String(tx.checkNum || "").trim()
    ) {
      e.checkNum = "رقم الشيك مطلوب";
    }

    if (usesEmployeeLookup && !tx.party?.trim()) {
      e.party = isAdvance
        ? "اسم مسؤول السلفة مطلوب"
        : "اسم العضو أو المسؤول مطلوب";
    }

    if (!usesEmployeeLookup && !isDirectCharge && !(tx.beneficiaryName?.trim() || (isDeposit && tx.party?.trim()))) {
      e.beneficiaryName = "اسم المستفيد مطلوب";
    }

    if (isDirectCharge && !tx.bankChargeCategory?.trim()) {
      e.bankChargeCategory = "اختر نوع الخصم المباشر";
    }

    if (isAid) {
      if (!tx.aidCategory) e.aidCategory = "اختر نوع الرعاية";
      if (!tx.aidRel) e.aidRel = "اختر صلة المستفيد";
    }

    if (usesEventDetails) {
      if (!tx.activityName?.trim()) {
        e.activityName = "اسم النشاط / الفعالية مطلوب";
      }

      if (!tx.activityType?.trim()) {
        e.activityType = "نوع النشاط مطلوب";
      }
    }

    if (isTrip && tx.participantsCount && Number(tx.participantsCount) < 0) {
      e.participantsCount = "عدد المشاركين غير صحيح";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }, [
    isAdvance,
    isAid,
    isDirectCharge,
    isDeposit,
    isTrip,
    normalizedType,
    requiresChequeNumber,
    tx,
    usesEmployeeLookup,
    usesEventDetails,
  ]);

  /* =========================
     Save
  ========================= */

  const save = useCallback(async () => {
    if (!validate()) {
      showToast?.(
        "برجاء استكمال الحقول المطلوبة والمظللة باللون الأحمر",
        "error"
      );
      return;
    }

    setSaving(true);

    try {
      const cleanType = normalizeIssuedCheckType(tx.type);
      const requiresSettlement = Boolean(tx.requires_settlement);

      const normalizedParty = usesEmployeeLookup
        ? tx.party?.trim()
        : tx.beneficiaryName?.trim();

      const finalParty = isDirectCharge
        ? tx.beneficiaryName?.trim() ||
        tx.party?.trim() ||
        "خصم بنكي مباشر"
        : normalizedParty;

      const payload = {
        ...tx,
        id: initialData?.id,
        type: cleanType,
        typeLabel:
          cleanType === "bank_charge"
            ? "خصم مباشر"
            : getIssuedCheckTypeLabel(cleanType),

        amount: Number(tx.amount),
        date: tx.date,

        checkNum:
          cleanType === "deposit"
            ? String(tx.checkNum || tx.bankReference || "").trim()
            : requiresChequeNumber(cleanType)
              ? String(tx.checkNum || "").trim()
              : "",

        party: finalParty || "",
        beneficiaryName: tx.beneficiaryName?.trim() || finalParty || "",

        employeeId: tx.employeeId || "",
        notes: tx.notes?.trim() || buildAutoNotes(),

        requires_settlement: requiresSettlement,
        requiresSettlement,
        settlement_mode: getSettlementMode(cleanType, requiresSettlement),

        state: tx.state || (canPost ? "posted" : "draft"),

        updatedAt: new Date().toISOString(),
        createdAt: initialData?.createdAt || new Date().toISOString(),
      };

      await onSubmit?.(payload);

      showToast?.(
        isEdit ? "تم تحديث المستند بنجاح" : "تم حفظ المستند بنجاح",
        "success"
      );
    } catch (error) {
      console.error("خطأ أثناء الحفظ:", error);
      showToast?.("حدث خطأ أثناء الحفظ، برجاء المحاولة مرة أخرى", "error");
    } finally {
      setSaving(false);
    }
  }, [
    buildAutoNotes,
    canPost,
    initialData?.createdAt,
    initialData?.id,
    isDirectCharge,
    isEdit,
    onSubmit,
    requiresChequeNumber,
    showToast,
    tx,
    usesEmployeeLookup,
    validate,
  ]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  /* =========================
     Print
  ========================= */

  const handlePrintVoucher = useCallback(() => {
    const isDepositTx = normalizedType === "deposit";
    printVoucher?.({
      vType: isDepositTx ? "سند إيداع نقدي" : `سند ${typeLabel || "صرف"}`,
      vNum: tx.checkNum || tx.bankReference || "",
      date: tx.date,
      party:
        tx.party ||
        tx.beneficiaryName ||
        (isDirectCharge ? "خصم بنكي مباشر" : ""),
      amount: Number(tx.amount || 0),
      notes: tx.notes || buildAutoNotes(),
      checkNum: tx.checkNum || tx.bankReference || "",
      extraFields: [],
    });
  }, [buildAutoNotes, isDirectCharge, normalizedType, tx, typeLabel]);

  const handlePrintAidRequest = useCallback(() => {
    printAidRequest?.({
      emp: empData || { jobId: tx.employeeId || "", name: tx.party || "" },
      aidCat: tx.aidCategory || "",
      aidRel: tx.aidRel || "",
      incDate: tx.incidentDate || "",
      amount: Number(tx.amount || 0),
      date: tx.date,
      notes: tx.notes || buildAutoNotes(),
    });
  }, [buildAutoNotes, empData, tx]);

  const regenerateNotes = useCallback(() => {
    const generated = buildAutoNotes();

    update("notes", generated);
    setNotesManuallyEdited(false);

    showToast?.("تم إعادة توليد البيان تلقائياً", "success");
  }, [buildAutoNotes, showToast, update]);

  /* =========================
     Render Helpers
  ========================= */

  const renderEmployeeLookup = () => (
    <div className="space-y-2 sm:col-span-2 relative">
      <label className={clsx("text-[11px] font-black flex gap-1", T.text)}>
        {isAdvance ? "مسؤول السلفة" : "العضو / المسؤول"}
        <span className="text-rose-500">*</span>
      </label>

      <div className="relative">
        <Search
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
        />

        <input
          value={searchQ}
          onChange={(e) => {
            setSearchQ(e.target.value);
            update("party", e.target.value);
            setShowRes(true);
          }}
          onFocus={() => setShowRes(true)}
          placeholder="ابحث بالاسم أو رقم العضوية أو الرقم القومي..."
          className={clsx(
            "w-full h-[38px] rounded-xl border px-3 pr-9 text-xs font-bold outline-none focus:ring-2 focus:ring-teal-500/10",
            T.inp,
            errors.party && "!border-rose-500 bg-rose-50/10"
          )}
        />

        {searchQ && (
          <button
            type="button"
            onClick={clearEmployee}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100"
          >
            <X size={13} className="text-slate-400" />
          </button>
        )}
      </div>

      {errors.party && (
        <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
          <AlertCircle size={11} />
          {errors.party}
        </p>
      )}

      {showRes && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border bg-white shadow-xl overflow-hidden">
          {loadingEmployees ? (
            <div className="p-3 text-xs font-bold text-slate-500 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              جاري تحميل بيانات الأعضاء...
            </div>
          ) : searchRes.length ? (
            searchRes.map((emp) => {
              const retired = isRetiredMember?.(emp);
              const eligible = isEligibleForBenefit?.(emp);
              const retirementDate = getRetirementDate?.(emp);

              return (
                <button
                  key={emp.id || emp.jobId || emp.nationalId}
                  type="button"
                  onClick={() => selectEmployee(emp)}
                  className="w-full text-right p-3 hover:bg-teal-50 border-b last:border-b-0 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-slate-800 truncate">
                        {emp.name}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 truncate">
                        رقم: {emp.jobId || "—"}
                        {emp.department ? ` • ${emp.department}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {retired && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          متقاعد
                        </span>
                      )}

                      {eligible === false && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                          غير مستحق
                        </span>
                      )}

                      {retirementDate && (
                        <span className="text-[9px] text-slate-400">
                          تقاعد: {formatEmployeeDate?.(retirementDate)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          ) : searchQ.trim().length >= 2 ? (
            <div className="p-3 text-xs font-bold text-slate-500">
              لا توجد نتائج مطابقة
            </div>
          ) : (
            <div className="p-3 text-xs font-bold text-slate-500">
              اكتب حرفين على الأقل للبحث
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderBeneficiaryInput = () => (
    <ERPInput
      label={isDirectCharge ? "اسم الجهة / المستفيد" : "اسم المستفيد"}
      icon={Building}
      required={!isDirectCharge}
      value={tx.beneficiaryName || ""}
      onChange={(e) => update("beneficiaryName", e.target.value)}
      error={errors.beneficiaryName}
      placeholder="مثال: شركة / مورد / جهة مستفيدة"
      fullWidth
    />
  );

  const renderAidFields = () => {
    if (!isAid) return null;

    return (
      <ERPSection
        title="بيانات الرعاية"
        icon={Heart}
        colorClass="rose"
        badge={suggestedAidAmount ? `${formatMoney(suggestedAidAmount)} ج.م` : ""}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ERPSelect
            label="نوع الرعاية"
            icon={Heart}
            required
            value={tx.aidCategory || ""}
            onChange={(e) => {
              patchTx({
                aidCategory: e.target.value,
                aidRel: "",
              });
              setNotesManuallyEdited(false);
            }}
            error={errors.aidCategory}
          >
            <option value="">اختر نوع الرعاية</option>
            {Object.keys(AID_RELS).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </ERPSelect>

          <ERPSelect
            label="صلة المستفيد"
            icon={Users}
            required
            value={tx.aidRel || ""}
            onChange={(e) => {
              update("aidRel", e.target.value);
              setNotesManuallyEdited(false);
            }}
            error={errors.aidRel}
            disabled={!tx.aidCategory}
          >
            <option value="">اختر الصلة</option>
            {aidRelOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </ERPSelect>

          <ArabicDatePicker
            label="تاريخ الواقعة"
            value={tx.incidentDate || ""}
            onChange={(value) => update("incidentDate", value)}
          />

          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[11px] font-black text-teal-700">
                قيمة الرعاية المقترحة
              </p>
              <p className="text-[10px] font-bold text-teal-600">
                يتم تحديث المبلغ تلقائياً ما لم يتم تعديله يدوياً
              </p>
            </div>

            <strong className="text-sm font-black text-teal-700 shrink-0 whitespace-nowrap">
              {formatMoney(suggestedAidAmount || tx.amount)} ج.م
            </strong>
          </div>
        </div>
      </ERPSection>
    );
  };

  const renderActivityFields = () => {
    if (!usesEventDetails && !isTrip && !isEvent) return null;

    return (
      <ERPSection
        title={isTrip ? "بيانات الرحلة" : "بيانات النشاط / الفعالية"}
        icon={isTrip ? MapPin : Activity}
        colorClass={isTrip ? "blue" : "purple"}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ERPInput
            label="اسم النشاط / الفعالية"
            icon={Sparkles}
            required
            value={tx.activityName || ""}
            onChange={(e) => {
              update("activityName", e.target.value);
              setNotesManuallyEdited(false);
            }}
            error={errors.activityName}
            placeholder="مثال: رحلة القاهرة / حفل تكريم"
          />

          <ERPSelect
            label="نوع النشاط"
            icon={Activity}
            required
            value={tx.activityType || ""}
            onChange={(e) => {
              update("activityType", e.target.value);
              setNotesManuallyEdited(false);
            }}
            error={errors.activityType}
          >
            <option value="">اختر النوع</option>
            {ACTIVITY_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </ERPSelect>

          <ERPInput
            label="تاريخ النشاط"
            icon={Info}
            type="date"
            value={tx.activityDate || ""}
            onChange={(e) => update("activityDate", e.target.value)}
          />

          <ERPInput
            label="مكان النشاط"
            icon={MapPin}
            value={tx.activityLocation || ""}
            onChange={(e) => update("activityLocation", e.target.value)}
            placeholder="المكان / المدينة"
          />

          <ERPInput
            label="عدد المشاركين"
            icon={Users}
            isNumeric
            value={tx.participantsCount || ""}
            onChange={(e) =>
              update("participantsCount", normalizeIntegerInput(e.target.value))
            }
            error={errors.participantsCount}
          />

          <ERPInput
            label="اشتراكات الأعضاء"
            icon={DollarSign}
            isNumeric
            value={tx.memberSubscriptions || ""}
            onChange={(e) =>
              update("memberSubscriptions", normalizeNumericInput(e.target.value))
            }
            placeholder="إن وجدت"
          />
        </div>
      </ERPSection>
    );
  };

  const renderDirectChargeFields = () => {
    if (!isDirectCharge) return null;

    return (
      <ERPSection
        title="بيانات الخصم البنكي المباشر"
        icon={Landmark}
        colorClass="slate"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ERPSelect
            label="نوع الخصم"
            icon={Landmark}
            required
            value={tx.bankChargeCategory || ""}
            onChange={(e) => {
              update("bankChargeCategory", e.target.value);
              setNotesManuallyEdited(false);
            }}
            error={errors.bankChargeCategory}
          >
            <option value="">اختر نوع الخصم</option>
            {DIRECT_BANK_CHARGE_OPTIONS.map((item) => (
              <option key={item.value || item} value={item.value || item}>
                {item.label || item}
              </option>
            ))}
          </ERPSelect>

          <ERPInput
            label="مرجع العملية البنكية"
            icon={Hash}
            value={tx.bankReference || ""}
            onChange={(e) => {
              update("bankReference", e.target.value);
              setNotesManuallyEdited(false);
            }}
            placeholder="رقم العملية / المرجع البنكي"
          />
        </div>
      </ERPSection>
    );
  };

  const renderOtherFields = () => {
    if (isAid || isDirectCharge || isAdvance || isTrip || isEvent) return null;

    return (
      <ERPSection title="بيانات البند" icon={Tag} colorClass="amber">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ERPSelect
            label="بند الصرف"
            icon={Tag}
            value={tx.expenseItem || ""}
            onChange={(e) => {
              update("expenseItem", e.target.value);
              setNotesManuallyEdited(false);
            }}
          >
            <option value="">اختر بند الصرف</option>
            {EXPENSE_ITEM_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </ERPSelect>
        </div>
      </ERPSection>
    );
  };

  /* =========================
     Component Render
  ========================= */

  return (
    <div dir="rtl" className="w-full max-w-6xl mx-auto space-y-4">
      <div className={clsx("rounded-2xl border shadow-sm p-4", T.card)}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div
                className={clsx(
                  "p-2 rounded-xl",
                  getColorStyle(typeColor).softBg
                )}
              >
                <FileText
                  size={18}
                  className={getColorStyle(typeColor).text}
                />
              </div>

              <div>
                <h2 className={clsx("text-lg font-black", T.text)}>
                  {isEdit ? "تعديل مستند مالي" : "إصدار مستند مالي"}
                </h2>
                <p className={clsx("text-xs font-bold", T.muted)}>
                  النوع الحالي: {typeLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SettlementBadge enabled={currentRequiresSettlement} />

            {requiresChequeNumber(normalizedType) && tx.checkNum && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full border bg-sky-50 text-sky-700 border-sky-200">
                <Hash size={12} />
                شيك رقم: {tx.checkNum}
              </span>
            )}
          </div>
        </div>

        {WorkflowStepper && (
          <div className="mt-4">
            <WorkflowStepper
              state={tx.state}
              type={normalizedType}
              requiresSettlement={currentRequiresSettlement}
              userRole={userRole}
            />
          </div>
        )}
      </div>

      <ERPSection title="نوع المستند" icon={FileText} colorClass={typeColor}>
        <TypeSelector value={normalizedType} onChange={handleTypeChange} />
      </ERPSection>

      <ERPSection title="البيانات الأساسية" icon={Info} colorClass="teal">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label
              className={clsx("text-[11px] font-black flex gap-1", T.text)}
            >
              التاريخ
              <span className="text-rose-500">*</span>
            </label>

            {ArabicDatePicker ? (
              <ArabicDatePicker
                value={tx.date || ""}
                onChange={(value) => update("date", value)}
                className={clsx(
                  "w-full h-[38px]",
                  errors.date && "!border-rose-500"
                )}
              />
            ) : (
              <input
                type="date"
                value={tx.date || ""}
                onChange={(e) => update("date", e.target.value)}
                className={clsx(
                  "w-full h-[38px] rounded-xl border px-3 text-xs font-bold",
                  T.inp,
                  errors.date && "!border-rose-500"
                )}
              />
            )}

            {errors.date && (
              <p className="text-[10px] font-bold text-rose-600">
                {errors.date}
              </p>
            )}
          </div>

          <ERPInput
            label="المبلغ"
            icon={DollarSign}
            required
            isNumeric
            value={tx.amount || ""}
            onChange={(e) => {
              update("amount", normalizeNumericInput(e.target.value));
              setAmountManuallyEdited(true);
            }}
            error={errors.amount}
            placeholder="0"
            footer={
              tx.amount ? (
                <p className="text-[10px] font-bold text-slate-500">
                  القيمة: {formatMoney(tx.amount)} ج.م
                </p>
              ) : null
            }
          />

          {requiresChequeNumber(normalizedType) && (
            <ERPInput
              label="رقم الشيك"
              icon={Hash}
              required
              value={tx.checkNum || ""}
              onChange={(e) =>
                update("checkNum", normalizeIntegerInput(e.target.value))
              }
              error={errors.checkNum}
              placeholder="رقم الشيك"
            />
          )}

          <ERPSelect
            label="حالة المستند"
            icon={CheckCircle2}
            value={tx.state || "draft"}
            onChange={(e) => update("state", e.target.value)}
          >
            <option value="draft">مسودة</option>
            <option value="posted">مرحل</option>
            <option value="paid">مدفوع</option>
            <option value="cancelled">ملغي</option>
          </ERPSelect>

          {allowsOptionalSettlement && (
            <ERPSelect
              label="التسوية"
              icon={RotateCcw}
              value={currentRequiresSettlement ? "yes" : "no"}
              onChange={(e) =>
                update("requires_settlement", e.target.value === "yes")
              }
            >
              <option value="no">لا يتطلب تسوية</option>
              <option value="yes">يتطلب تسوية</option>
            </ERPSelect>
          )}
        </div>
      </ERPSection>

      <ERPSection
        title="المستفيد / الطرف"
        icon={usesEmployeeLookup ? UserCheck : Building}
        colorClass="sky"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {usesEmployeeLookup ? renderEmployeeLookup() : renderBeneficiaryInput()}
        </div>

        {empData && (
          <div className="mt-3 rounded-xl border bg-slate-50 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <p className="text-xs font-black text-slate-800">
                {empData.name}
              </p>
              <p className="text-[10px] font-bold text-slate-500">
                رقم العضوية: {empData.jobId || "—"}
                {empData.department ? ` • ${empData.department}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {isRetiredMember?.(empData) && (
                <span className="text-[10px] font-black px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  عضو متقاعد
                </span>
              )}

              {isEligibleForBenefit?.(empData) === false && (
                <span className="text-[10px] font-black px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  غير مستحق للرعاية
                </span>
              )}
            </div>
          </div>
        )}
      </ERPSection>

      {renderAidFields()}
      {renderActivityFields()}
      {renderDirectChargeFields()}
      {renderOtherFields()}

      <ERPSection title="البيان والمرفقات" icon={FileText} colorClass="teal">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ERPTextarea
            label="البيان"
            fullWidth
            value={tx.notes || ""}
            onChange={(e) => {
              update("notes", e.target.value);
              setNotesManuallyEdited(true);
            }}
            placeholder="يتم توليد البيان تلقائياً ويمكن تعديله..."
          />

          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={regenerateNotes}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100"
            >
              <Sparkles size={14} />
              إعادة توليد البيان
            </button>

            {notesManuallyEdited && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-2 py-1">
                <Info size={12} />
                تم تعديل البيان يدوياً
              </span>
            )}
          </div>

          <div className="sm:col-span-2">
            <label
              className={clsx("text-[11px] font-black flex gap-1 mb-2", T.text)}
            >
              المرفقات
            </label>

            {FileUpload ? (
              <FileUpload
                value={tx.attachments || []}
                onChange={(files) => update("attachments", files || [])}
              />
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-xs font-bold text-slate-500">
                مكون رفع الملفات غير متاح
              </div>
            )}
          </div>
        </div>
      </ERPSection>

      <div
        className={clsx(
          "sticky bottom-3 z-20 rounded-2xl border shadow-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3",
          T.card
        )}
      >
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
          <Info size={14} />
          <span>
            راجع البيانات قبل الحفظ. المبلغ الحالي:{" "}
            <strong className="text-slate-800">
              {formatMoney(tx.amount)} ج.م
            </strong>
          </span>
        </div>

        <div className="flex flex-wrap gap-2 justify-stretch sm:justify-end">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="flex-1 sm:flex-none justify-center px-4 py-2 rounded-xl text-xs font-black border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              إلغاء
            </button>
          )}

          {isAid && (
            <button
              type="button"
              onClick={handlePrintAidRequest}
              disabled={saving}
              className="flex-1 sm:flex-none justify-center inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-60"
            >
              <Printer size={14} />
              طباعة طلب الرعاية
            </button>
          )}

          <button
            type="button"
            onClick={handlePrintVoucher}
            disabled={saving}
            className="flex-1 sm:flex-none justify-center inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-60"
          >
            <Printer size={14} />
            طباعة المستند
          </button>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={clsx(
              "flex-1 sm:flex-none justify-center inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black transition-all disabled:opacity-60 disabled:cursor-not-allowed",
              T.btn
            )}
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />
                {isEdit ? "تحديث المستند" : "حفظ المستند"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}