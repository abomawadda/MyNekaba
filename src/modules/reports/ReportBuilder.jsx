/* eslint-disable react-hooks/set-state-in-effect */
import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";
import { useSearchParams } from "react-router-dom";
import { useT } from "../../app/providers/ThemeProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { useAlert } from "../../app/providers/AlertProvider";
import ArabicDatePicker from "../../ui/inputs/ArabicDatePicker";
import BrandHeader from "../../ui/BrandHeader";
import { downloadAs } from "../../utils/downloadData";
import {
  AlertTriangle,
  Calendar,
  Columns,
  Download,
  FileText,
  Filter,
  Layers,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  TableProperties,
  Wallet,
} from "lucide-react";
import clsx from "clsx";
import { REPORT_GROUPS, REPORT_MODULES } from "./reportModules";
import { compareArabic, formatDisplayValue, getDateRange, getTodayISO, normalizeText, toNumber } from "./reportUtils";
import { renderPrintReport } from "./reportPrint";
import { filterDataByScope, PERMISSIONS } from "../../security/permissions";

class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center p-20 gap-3 text-rose-500">
          <AlertTriangle size={36} />
          <p className="font-black text-sm">حدث خطأ في شاشة التقارير</p>
          <p className="text-[10px] font-bold opacity-70">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-rose-100 text-rose-700 rounded-xl font-black text-xs"
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const EXECUTIVE_REPORTS = [
  {
    id: "treasury_ledger",
    title: "كشف الحركة المالية",
    description: "نظرة تنفيذية على كامل الوارد والمنصرف والرصيد النهائي.",
  },
  {
    id: "issued_checks",
    title: "الشيكات الصادرة",
    description: "متابعة الشيكات حسب النوع والمستفيد وحالة التسوية.",
  },
  {
    id: "settlements",
    title: "التسويات المعتمدة",
    description: "مراجعة الشيكات التي أغلقت فعليًا بفواتير وتسويات معتمدة.",
  },
  {
    id: "aids",
    title: "الإعانات المصروفة",
    description: "تقرير إداري مباشر بالإعانات وأنواعها والمستفيدين منها.",
  },
  {
    id: "general_assembly_members",
    title: "أعضاء الجمعية العمومية",
    description: "كشف عضوية مع فلاتر الإدارة والحالة والمؤهل والانضمام.",
  },
  {
    id: "balance_sheet_simplified",
    title: "Balance Sheet مبسط",
    description: "ملخص نقدي ومحاسبي سريع للسلف والتسويات والمدينين والدائنين.",
  },
  {
    id: "monthly_financial_analysis",
    title: "التحليل المالي الشهري",
    description: "إيرادات ومصروفات وصافي الشهر مع مقارنة ونمو وتوزيع شهري.",
  },
  {
    id: "board_allowances",
    title: "بدلات المجلس",
    description: "متابعة بدل الجلسات والانتقال والضيافة من التسويات المعتمدة.",
  },
  {
    id: "member_benefits",
    title: "مزايا الأعضاء",
    description: "كل ما حصل عليه الأعضاء من دعم ومزايا وخدمات داخل المنظومة.",
  },
  {
    id: "events",
    title: "الفعاليات والأنشطة",
    description: "متابعة السعات والحجوزات والتسعير والدعم لكل فعالية.",
  },
  {
    id: "bookings",
    title: "حجوزات الفعاليات",
    description: "كشف سريع بالحجوزات والحالة والسداد والتكلفة.",
  },
];

const getInitialModuleFilters = (config) =>
  Object.fromEntries((config?.customFilters || []).map((filter) => [filter.key, filter.defaultValue || ""]));

const getFilterRowKey = (filter) => filter.rowKey || filter.key;

const doesRowMatchFilter = (row, filter, value) => {
  const filterValue = String(value || "").trim();
  if (!filterValue) return true;

  const rowValue = String(row?.[getFilterRowKey(filter)] || "").trim();
  if (filter.type === "text") {
    return normalizeText(rowValue).includes(normalizeText(filterValue));
  }

  return rowValue === filterValue;
};

function ReportBuilderInner() {
  const T = useT();
  const { user, can } = useAuth();
  const { showToast } = useAlert();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedModule, setSelectedModule] = useState("treasury_ledger");
  const [selectedFields, setSelectedFields] = useState([]);
  const [sourceData, setSourceData] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [moduleFilters, setModuleFilters] = useState(() => getInitialModuleFilters(REPORT_MODULES.treasury_ledger));

  const activeConfig = REPORT_MODULES[selectedModule];
  const isExecutiveMode = searchParams.get("mode") === "executive";

  const openModule = (moduleId, preserveExecutive = false) => {
    setSelectedModule(moduleId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (preserveExecutive) next.set("mode", "executive");
      else next.delete("mode");
      return next;
    });
  };

  useEffect(() => {
    setSelectedFields(activeConfig.fields.map((field) => field.key));
    setSearchQ("");
    setDateRange({ from: "", to: "" });
    setModuleFilters(getInitialModuleFilters(activeConfig));
  }, [selectedModule, activeConfig]);

  useEffect(() => {
    setLoading(true);
    setSourceData({});

    const sourceNames = activeConfig.sources || [];
    if (sourceNames.length === 0) {
      setLoading(false);
      return undefined;
    }

    const firstLoadState = new Set(sourceNames);
    const markReady = (sourceName) => {
      firstLoadState.delete(sourceName);
      if (firstLoadState.size === 0) setLoading(false);
    };

    const unsubscribers = sourceNames.map((sourceName) => {
      try {
        return onSnapshot(
          query(collection(db, sourceName)),
          (snapshot) => {
            setSourceData((prev) => ({
              ...prev,
              [sourceName]: snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
            }));
            markReady(sourceName);
          },
          (error) => {
            console.error(`${sourceName}:`, error);
            setSourceData((prev) => ({ ...prev, [sourceName]: [] }));
            markReady(sourceName);
          }
        );
      } catch (error) {
        console.error(`${sourceName}:`, error);
        setSourceData((prev) => ({ ...prev, [sourceName]: [] }));
        markReady(sourceName);
        return () => { };
      }
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe && unsubscribe());
  }, [activeConfig]);

  const scopedSourceData = useMemo(() => {
    const scoped = { ...sourceData };
    if (scoped.employees) {
      scoped.employees = filterDataByScope(scoped.employees, "employees", user);
    }
    if (scoped.transactions || scoped.issued_checks) {
      scoped.transactions = filterDataByScope(scoped.transactions || [], "treasury", user);
      scoped.issued_checks = filterDataByScope(scoped.issued_checks || [], "treasury", user);
    }
    return scoped;
  }, [sourceData, user]);

  const rawRows = useMemo(() => activeConfig.buildRows(scopedSourceData), [activeConfig, scopedSourceData]);

  const handleModuleFilterChange = (changedFilter, nextValue) => {
    setModuleFilters((prev) => {
      const next = { ...prev, [changedFilter.key]: nextValue };
      const filters = activeConfig.customFilters || [];
      const changedIndex = filters.findIndex((filter) => filter.key === changedFilter.key);

      if (changedFilter.cascade && changedIndex >= 0) {
        filters.slice(changedIndex + 1).forEach((filter) => {
          if (filter.cascade) next[filter.key] = filter.defaultValue || "";
        });
      }

      return next;
    });
  };

  const moduleFilterOptions = useMemo(() => {
    return (activeConfig.customFilters || []).reduce((acc, filter, index, filters) => {
      if (filter.type !== "select") {
        acc[filter.key] = [];
        return acc;
      }

      const scopedRows = filter.cascade
        ? rawRows.filter((row) =>
          filters.slice(0, index).every((previousFilter) => {
            if (!previousFilter.cascade) return true;
            return doesRowMatchFilter(row, previousFilter, moduleFilters[previousFilter.key]);
          })
        )
        : rawRows;

      const options = Array.from(
        new Set(
          scopedRows
            .map((row) => String(row?.[getFilterRowKey(filter)] || "").trim())
            .filter(Boolean)
        )
      ).sort(compareArabic);

      acc[filter.key] = options;
      return acc;
    }, {});
  }, [activeConfig.customFilters, moduleFilters, rawRows]);

  const filteredRows = useMemo(() => {
    let rows = [...rawRows];

    if (activeConfig.dateField && dateRange.from) {
      rows = rows.filter((row) => String(row[activeConfig.dateField] || "").slice(0, 10) >= dateRange.from);
    }
    if (activeConfig.dateField && dateRange.to) {
      rows = rows.filter((row) => String(row[activeConfig.dateField] || "").slice(0, 10) <= dateRange.to);
    }
    if (searchQ.trim()) {
      const normalizedQuery = normalizeText(searchQ);
      rows = rows.filter((row) => normalizeText(row.__search || Object.values(row).join(" ")).includes(normalizedQuery));
    }

    if ((activeConfig.customFilters || []).length > 0) {
      rows = rows.filter((row) =>
        activeConfig.customFilters.every((filter) => {
          return doesRowMatchFilter(row, filter, moduleFilters[filter.key]);
        })
      );
    }

    return activeConfig.sortRows(rows);
  }, [activeConfig, dateRange.from, dateRange.to, moduleFilters, rawRows, searchQ]);

  const period = useMemo(
    () => getDateRange(filteredRows, activeConfig.dateField),
    [activeConfig.dateField, filteredRows]
  );

  const summary = useMemo(() => {
    const currencyFields = activeConfig.fields.filter((field) => field.currency);
    const totals = currencyFields.reduce((acc, field) => {
      acc[field.key] = filteredRows.reduce((sum, row) => sum + toNumber(row[field.key]), 0);
      return acc;
    }, {});

    return {
      count: filteredRows.length,
      currencyFields,
      totals,
      customSummary: activeConfig.buildSummary
        ? activeConfig.buildSummary({
          rows: filteredRows,
          sourceData: scopedSourceData,
          filters: moduleFilters,
        })
        : null,
    };
  }, [activeConfig, filteredRows, moduleFilters, scopedSourceData]);

  const previewRows = useMemo(() => filteredRows.slice(0, 80), [filteredRows]);

  const toggleField = (key) => {
    setSelectedFields((prev) =>
      prev.includes(key)
        ? prev.length > 1
          ? prev.filter((fieldKey) => fieldKey !== key)
          : prev
        : [...prev, key]
    );
  };

  const getSafeDisplayValue = (field, value) => {
    const formatted = formatDisplayValue(field, value);
    return String(formatted ?? "").trim() ? formatted : "—";
  };

  const exportData = async (format) => {
    if (!can(PERMISSIONS.reportsExport)) {
      showToast("لا تملك صلاحية تصدير التقارير", "error");
      return;
    }

    const fields = activeConfig.fields.filter((field) => selectedFields.includes(field.key));
    const rows = filteredRows.map((row, index) => {
      const exportedRow = { "#": index + 1 };
      fields.forEach((field) => {
        exportedRow[field.label] = getSafeDisplayValue(field, row[field.key]);
      });
      return exportedRow;
    });
    const filename = `${activeConfig.id}_${period.from || "all"}_${period.to || getTodayISO()}`;
    await downloadAs(format, rows, filename);
  };

  const activeFields = activeConfig.fields.filter((field) => selectedFields.includes(field.key));
  const ModuleIcon = activeConfig.icon || TableProperties;
  const reportSpecificSummary = summary.customSummary;
  const hasActiveModuleFilters = Object.values(moduleFilters).some((value) => String(value || "").trim());

  return (
    <div className={clsx("max-w-7xl mx-auto space-y-4 pb-20", T.text)} dir="rtl">
      <BrandHeader sectionTitle="مركز التقارير المخصصة" sectionHint="تجميع وطباعة وتحليل شامل لكل وحدات المنظومة" />

      <div className={clsx("rounded-[2rem] border shadow-sm overflow-hidden", T.card)}>
        <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border-l border-slate-100 dark:border-slate-800 p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/20">
            <div className="rounded-2xl border border-teal-100 dark:border-teal-900/40 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-teal-500/10 text-teal-600">
                  <Layers size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">وحدات التقارير</h2>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">
                    تم توحيد الفرز والطباعة على A4 لكل تقرير داخل هذه الشاشة.
                  </p>
                </div>
              </div>
            </div>

            {REPORT_GROUPS.map((group) => (
              <div key={group.id} className={clsx("rounded-2xl border p-3 shadow-sm", T.card)}>
                <div className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                  {group.label}
                </div>
                <div className="space-y-2">
                  {group.moduleIds.map((moduleId) => {
                    const moduleConfig = REPORT_MODULES[moduleId];
                    const Icon = moduleConfig.icon || TableProperties;
                    const isActive = selectedModule === moduleId;
                    return (
                      <button
                        key={moduleId}
                        onClick={() => openModule(moduleId)}
                        className={clsx(
                          "w-full text-right px-3 py-3 rounded-xl border transition-all flex items-start gap-3",
                          isActive
                            ? "bg-teal-500/10 border-teal-400 text-teal-700 dark:text-teal-300"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-teal-300"
                        )}
                      >
                        <div className={clsx("p-2 rounded-xl shrink-0", isActive ? "bg-teal-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500")}>
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-black">{moduleConfig.title}</div>
                          <div className="text-[10px] font-bold opacity-75 mt-1 line-clamp-2">
                            {moduleConfig.subtitle}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className={clsx("rounded-2xl border p-3 shadow-sm", T.card)}>
              <div className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                الأعمدة الظاهرة
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {activeConfig.fields.map((field) => (
                  <label key={field.key} className="flex items-center gap-2 text-[11px] font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(field.key)}
                      onChange={() => toggleField(field.key)}
                      className="accent-teal-600 w-4 h-4"
                    />
                    <span className={selectedFields.includes(field.key) ? "text-slate-700 dark:text-slate-200" : "text-slate-400"}>
                      {field.label}
                      {field.currency ? <span className="text-emerald-500 mr-1">قيمة</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </aside>

          <section className="p-4 md:p-5 space-y-4">
            {isExecutiveMode && (
              <div className={clsx("rounded-[2rem] border shadow-sm overflow-hidden", T.card)}>
                <div className="p-5 bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.18),_transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.02),rgba(255,255,255,0.94))] dark:bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.14),_transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.75),rgba(15,23,42,0.92))]">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 shadow-sm">
                        <Sparkles size={22} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-black border border-amber-200 dark:border-amber-800/40">
                            فهرس تنفيذي
                          </span>
                          <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 text-[10px] font-black border border-slate-200 dark:border-slate-700">
                            وصول سريع للإدارة العليا
                          </span>
                        </div>
                        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">
                          التقارير الجاهزة الأكثر استخدامًا
                        </h2>
                        <p className="text-[11px] md:text-xs font-bold text-slate-500 dark:text-slate-400 mt-2 max-w-3xl">
                          هذه البطاقات تنقلك مباشرة إلى أهم التقارير التنفيذية قبل الدخول في الإعدادات التفصيلية أو التخصيص اليدوي.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setSearchParams((prev) => {
                          const next = new URLSearchParams(prev);
                          next.delete("mode");
                          return next;
                        })
                      }
                      className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black text-[11px]"
                    >
                      الانتقال للوضع المخصص
                    </button>
                  </div>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-3">
                  {EXECUTIVE_REPORTS.map((report) => {
                    const reportConfig = REPORT_MODULES[report.id];
                    const Icon = reportConfig.icon || TableProperties;
                    const isActiveExecutive = selectedModule === report.id;
                    return (
                      <button
                        key={report.id}
                        onClick={() => openModule(report.id, true)}
                        className={clsx(
                          "text-right rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5",
                          isActiveExecutive
                            ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20"
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        )}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className={clsx("p-2 rounded-xl", isActiveExecutive ? "bg-amber-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500")}>
                            <Icon size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[11px] font-black text-slate-800 dark:text-slate-100">
                              {report.title}
                            </div>
                            <div className="text-[9px] font-black text-amber-600 dark:text-amber-300 mt-1">
                              {reportConfig.orientation === "portrait" ? "A4 عمودي" : "A4 أفقي"}
                            </div>
                          </div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-5">
                          {report.description}
                        </p>
                        <div className="mt-3 text-[10px] font-black text-violet-700 dark:text-violet-300">
                          ترتيب الفرز: {reportConfig.sortLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-[2rem] border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="p-5 bg-[radial-gradient(circle_at_top_right,_rgba(109,40,217,0.14),_transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.02),rgba(255,255,255,0.92))] dark:bg-[radial-gradient(circle_at_top_right,_rgba(109,40,217,0.22),_transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.75),rgba(15,23,42,0.92))]">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/50 text-violet-700 dark:text-violet-300 shadow-sm">
                      <ModuleIcon size={24} />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="px-2.5 py-1 rounded-full bg-violet-700/10 text-violet-700 dark:text-violet-300 text-[10px] font-black border border-violet-200 dark:border-violet-800/50">
                          شاشة التقارير
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 text-[10px] font-black border border-slate-200 dark:border-slate-700">
                          A4 {activeConfig.orientation === "portrait" ? "عمودي" : "أفقي"}
                        </span>
                      </div>
                      <h1 className="text-xl md:text-2xl font-black text-slate-800 dark:text-slate-100">
                        {activeConfig.title}
                      </h1>
                      <p className="text-[11px] md:text-xs font-bold text-slate-500 dark:text-slate-400 mt-2 max-w-3xl">
                        {activeConfig.subtitle}
                      </p>
                      <p className="text-[10px] font-black text-violet-700 dark:text-violet-300 mt-3">
                        ترتيب الفرز المعتمد: {activeConfig.sortLabel}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      onChange={(e) => { const f = e.target.value; if (f) exportData(f); e.target.value = ""; }}
                      disabled={filteredRows.length === 0}
                      className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl font-black text-[11px] cursor-pointer appearance-none border border-emerald-200 disabled:opacity-50"
                      style={{ direction: "ltr" }}
                    >
                      <option value="">تصدير</option>
                      <option value="xlsx">Excel (XLSX)</option>
                      <option value="json">JSON</option>
                    </select>
                    <button
                      onClick={() =>
                        renderPrintReport({
                          config: activeConfig,
                          rows: filteredRows,
                          selectedFields,
                          period,
                          summary,
                        })
                      }
                      disabled={filteredRows.length === 0}
                      className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-black text-[11px] flex items-center gap-2 disabled:opacity-50"
                    >
                      <Printer size={14} />
                      طباعة التقرير
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <div className={clsx("rounded-2xl border p-4 shadow-sm", T.card)}>
                <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black mb-2">
                  <TableProperties size={14} />
                  السجلات المطابقة
                </div>
                <div className="text-3xl font-black text-teal-600">{summary.count}</div>
              </div>
              <div className={clsx("rounded-2xl border p-4 shadow-sm", T.card)}>
                <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black mb-2">
                  <Calendar size={14} />
                  الفترة الفعلية
                </div>
                <div className="text-sm font-black text-slate-800 dark:text-slate-100 leading-6">
                  {period.from || "—"}<br />{period.to || "—"}
                </div>
              </div>
              <div className={clsx("rounded-2xl border p-4 shadow-sm", T.card)}>
                <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black mb-2">
                  <Columns size={14} />
                  الأعمدة النشطة
                </div>
                <div className="text-3xl font-black text-sky-600">{activeFields.length}</div>
              </div>
              <div className={clsx("rounded-2xl border p-4 shadow-sm", T.card)}>
                <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black mb-2">
                  <Filter size={14} />
                  الترتيب المعتمد
                </div>
                <div className="text-[11px] font-black text-slate-700 dark:text-slate-200 leading-5">
                  {activeConfig.sortLabel}
                </div>
              </div>
            </div>

            {summary.currencyFields.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {summary.currencyFields.map((field) => (
                  <div key={field.key} className={clsx("rounded-2xl border p-4 shadow-sm", T.card)}>
                    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black mb-2">
                      <Wallet size={14} />
                      {field.label}
                    </div>
                    <div className="text-xl font-black text-emerald-600">
                      {formatDisplayValue(field, summary.totals[field.key] || 0)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {reportSpecificSummary && (
              <div className={clsx("rounded-2xl border shadow-sm p-4 space-y-4", T.card)}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Summary Box
                    </div>
                    <div className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1">
                      ملخص التقرير
                    </div>
                  </div>
                  <div className="text-[10px] font-black text-teal-600 dark:text-teal-300">
                    يتم تحديثه حسب الفلاتر الحالية
                  </div>
                </div>

                {Array.isArray(reportSpecificSummary.cards) && reportSpecificSummary.cards.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {reportSpecificSummary.cards.map((card, index) => (
                      <div key={`${card.label}-${index}`} className="rounded-2xl border border-teal-100 dark:border-teal-900/40 bg-teal-50/50 dark:bg-teal-900/10 p-4">
                        <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 mb-2">
                          {card.label}
                        </div>
                        <div className="text-2xl font-black text-teal-700 dark:text-teal-300">
                          {card.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {Array.isArray(reportSpecificSummary.sections) && reportSpecificSummary.sections.length > 0 && (
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                    {reportSpecificSummary.sections.map((section, index) => (
                      <div key={`${section.title}-${index}`} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/70 dark:bg-slate-900/20">
                        <div className="text-[11px] font-black text-slate-700 dark:text-slate-200 mb-3">
                          {section.title}
                        </div>
                        <div className="space-y-2">
                          {(section.items || []).map((item, itemIndex) => (
                            <div key={`${item.label}-${itemIndex}`} className="flex items-center justify-between gap-3 text-[11px] font-bold">
                              <span className="text-slate-500 dark:text-slate-400">{item.label}</span>
                              <span className="text-slate-800 dark:text-slate-100">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={clsx("rounded-2xl border shadow-sm p-4 space-y-3", T.card)}>
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">
                    البحث داخل التقرير
                  </label>
                  <div className="relative">
                    <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={searchQ}
                      onChange={(event) => setSearchQ(event.target.value)}
                      placeholder={activeConfig.searchPlaceholder}
                      className={clsx("w-full pr-10 pl-4 py-2.5 rounded-xl border text-[11px] font-bold outline-none focus:ring-2 focus:ring-teal-500", T.inp)}
                    />
                  </div>
                </div>

                {activeConfig.dateField ? (
                  <>
                    <div className="w-full xl:w-44">
                      <ArabicDatePicker
                        label="من تاريخ"
                        value={dateRange.from}
                        onChange={(value) => setDateRange((prev) => ({ ...prev, from: value }))}
                        maxVal={dateRange.to || undefined}
                      />
                    </div>
                    <div className="w-full xl:w-44">
                      <ArabicDatePicker
                        label="إلى تاريخ"
                        value={dateRange.to}
                        onChange={(value) => setDateRange((prev) => ({ ...prev, to: value }))}
                        minVal={dateRange.from || undefined}
                        maxVal={getTodayISO()}
                      />
                    </div>
                  </>
                ) : (
                  <div className="xl:col-span-2 flex items-end">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 text-[11px] font-black text-slate-500">
                      هذا التقرير لا يعتمد فترة زمنية مباشرة.
                    </div>
                  </div>
                )}
              </div>

              {(activeConfig.customFilters || []).length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 pt-1">
                  {activeConfig.customFilters.map((filter, filterIndex, filters) => {
                    const isLocked = Boolean(
                      filter.cascade &&
                      filterIndex > 0 &&
                      filters
                        .slice(0, filterIndex)
                        .some((previousFilter) => previousFilter.cascade && !String(moduleFilters[previousFilter.key] || "").trim())
                    );

                    return (
                      <div key={filter.key} className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase">
                          {filter.label}
                        </label>
                        {filter.type === "select" ? (
                          <select
                            value={moduleFilters[filter.key] || ""}
                            onChange={(event) => handleModuleFilterChange(filter, event.target.value)}
                            disabled={isLocked}
                            className={clsx(
                              "w-full px-3 py-2.5 rounded-xl border text-[11px] font-bold outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60 disabled:cursor-not-allowed",
                              T.sel
                            )}
                          >
                            <option value="">
                              {isLocked ? `اختر ${filters[filterIndex - 1]?.label || "القيمة السابقة"} أولًا` : "الكل"}
                            </option>
                            {(moduleFilterOptions[filter.key] || []).map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={moduleFilters[filter.key] || ""}
                            onChange={(event) => handleModuleFilterChange(filter, event.target.value)}
                            placeholder={filter.placeholder || filter.label}
                            className={clsx("w-full px-3 py-2.5 rounded-xl border text-[11px] font-bold outline-none focus:ring-2 focus:ring-teal-500", T.inp)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {(searchQ || dateRange.from || dateRange.to || hasActiveModuleFilters) && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSearchQ("");
                      setDateRange({ from: "", to: "" });
                      setModuleFilters(getInitialModuleFilters(activeConfig));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-black"
                  >
                    مسح الفلاتر
                  </button>
                  <span className="text-[10px] font-bold text-slate-400">
                    تم تطبيق فلاتر على بيانات التقرير الحالية.
                  </span>
                </div>
              )}
            </div>

            <div className={clsx("rounded-2xl border shadow-sm overflow-hidden", T.card)}>
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <FileText size={15} className="text-teal-600" />
                  <span className="text-[11px] font-black">
                    معاينة التقرير ({filteredRows.length})
                  </span>
                </div>
                {filteredRows.length > previewRows.length && (
                  <span className="text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                    المعاينة تعرض أول {previewRows.length} سجل فقط، والطباعة تشمل الكل
                  </span>
                )}
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center p-20 gap-3 text-slate-400">
                  <RefreshCw size={30} className="animate-spin text-teal-500" />
                  <p className="font-black text-sm">جاري تحميل بيانات التقرير...</p>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 gap-3 text-slate-400">
                  <FileText size={32} className="opacity-30" />
                  <p className="font-black text-sm">{activeConfig.emptyMessage}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-[10px] min-w-[820px]">
                    <thead className="bg-slate-900 text-white">
                      <tr>
                        <th className="p-2.5 w-12 text-center font-black">#</th>
                        {activeFields.map((field) => (
                          <th key={field.key} className="p-2.5 font-black whitespace-nowrap">
                            {field.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {previewRows.map((row, index) => (
                        <tr key={row.id || `${selectedModule}-${index}`} className={index % 2 === 0 ? "" : "bg-slate-50/60 dark:bg-slate-900/20"}>
                          <td className="p-2.5 text-center font-black text-slate-400">{index + 1}</td>
                          {activeFields.map((field) => (
                            <td
                              key={`${row.id || index}-${field.key}`}
                              className={clsx(
                                "p-2.5 font-bold align-top leading-5",
                                field.currency
                                  ? "text-emerald-600 font-black text-left whitespace-nowrap"
                                  : "text-slate-700 dark:text-slate-200 whitespace-normal break-words max-w-[360px]"
                              )}
                              title={getSafeDisplayValue(field, row[field.key])}
                            >
                              {getSafeDisplayValue(field, row[field.key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {activeConfig.showTotals !== false && summary.currencyFields.some((field) => selectedFields.includes(field.key)) && (
                      <tfoot>
                        <tr className="bg-slate-100 dark:bg-slate-800/80 border-t-2 border-slate-300 dark:border-slate-700">
                          <td className="p-2.5 text-center font-black text-slate-500">#</td>
                          {activeFields.map((field, index) => (
                            <td
                              key={`total-${field.key}`}
                              className={clsx(
                                "p-2.5 font-black",
                                field.currency ? "text-emerald-600 text-left" : "text-slate-500"
                              )}
                            >
                              {index === 0
                                ? "الإجمالي"
                                : field.currency
                                  ? formatDisplayValue(field, summary.totals[field.key] || 0)
                                  : "—"}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function ReportBuilder() {
  return (
    <ErrorBoundary>
      <ReportBuilderInner />
    </ErrorBoundary>
  );
}
