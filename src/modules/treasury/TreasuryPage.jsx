import React, { useEffect, useState, useMemo, Suspense, startTransition } from "react";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";
import { useTreasuryService } from "./services/treasuryService";
import {
  getIssuedCheckTypeLabel,
  normalizeIssuedCheckType,
  normalizeRequiresSettlement,
} from "./helpers/issuedChecks";
import {
  computeMonthlyCloses,
  getFinanceImpact,
  getRecordStateLabel,
  getSharedFinanceLedgerRecords,
  getTreasuryFinancialMetrics,
  TREASURY_OPENING_BALANCE,
} from "./helpers/financeLedger";

const TreasuryForm = React.lazy(() => import("./TreasuryForm"));

import {
  Trash2,
  FileText,
  X,
  Plus,
  FilterX,
  Printer,
  TableProperties,
  ArrowUpRight,
  BarChart3,
  Banknote,
  CheckCircle2,
  Clock3,
  Download,
  ShieldCheck,
  Star,
  Building2,
  Wallet
} from "lucide-react";

import { useNavigate, useLocation } from "react-router-dom";
import { useT } from "../../app/providers/ThemeProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { useAlert } from "../../app/providers/AlertProvider";
import { filterDataByScope, PERMISSIONS } from "../../security/permissions";
import ErrorBoundary from "../../ui/ErrorBoundary";
import TreasuryStatsBar from "./TreasuryStatsBar";
import TreasuryFilters from "./TreasuryFilters";
import TreasuryTable from "./TreasuryTable";
import { openPrintWindow } from "../../utils/print";
import { Button, Card, ConfirmDialog, PageHeader, StatusBadge } from "../../ui/enterprise";
import { getPrintBrandHeader, getPrintBrandStyles } from "../../utils/branding";
import { formatMoney } from "../../utils/numberFormat";
import { escapeHtml } from "../../utils/escapeHtml";
import { downloadAs } from "../../utils/downloadData";

const PAGE_SIZE = 50;
const INCOME_LEDGER_TYPES = new Set(["deposit", "refund", "subs"]);
const POSTED_LEDGER_STATES = new Set(["posted", "approved", "paid"]);
const isPostedLedgerRecord = (record = {}) =>
  !record?.state || POSTED_LEDGER_STATES.has(record.state);
const getLedgerAmount = (record = {}) => Number(record.advanceAmountBase || record.amount || 0);
const normalizeCheckDigits = (value = "") =>
  String(value ?? "")
    .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit));
const getCheckSortValue = (value) => {
  const normalized = normalizeCheckDigits(value).trim();
  const numericValue = Number(normalized);
  return normalized !== "" && Number.isFinite(numericValue) ? numericValue : Number.MAX_SAFE_INTEGER;
};
const getTxReference = (tx = {}) => tx.checkNum || tx.bankReference || "";
const compareCheckReference = (a, b) => {
  const diff = getCheckSortValue(a) - getCheckSortValue(b);
  if (diff !== 0) return diff;
  return String(a ?? "").localeCompare(String(b ?? ""), "ar");
};

const getSettlementLabel = (tx = {}) => {
  if (!normalizeRequiresSettlement(tx)) return "لا يتطلب";
  return tx.isSettled ? "مسوى" : "معلق";
};

const getSettlementTone = (tx = {}) => {
  if (!normalizeRequiresSettlement(tx)) return "neutral";
  return tx.isSettled ? "success" : "warning";
};

export default function TreasuryPage() {
  const T = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, can } = useAuth();
  const { showToast } = useAlert();

  const [issuedChecks, setIssuedChecks] = useState([]);
  const [legacyTransactions, setLegacyTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);

  const [filterType, setFilterType] = useState("all");
  const [filterState, setFilterState] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get("filter") === "draft" ? "draft" : "all";
  });
  const [searchQ, setSearchQ] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [_viewAttachments, setViewAttachments] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const { deleteTransaction, saveTransaction } = useTreasuryService();

  const canCreateFinancial = can(PERMISSIONS.treasuryCreate);
  const canEditFinancial = can(PERMISSIONS.treasuryEdit);
  const canDeleteFinancial = can(PERMISSIONS.treasuryDelete);
  const canPost = can(PERMISSIONS.treasuryPost);
  const canViewAttachments = can(PERMISSIONS.attachmentsView);

  // فتح النموذج عند وجود type في الرابط (sidebar, dashboard links)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const typeParam = params.get("type");

    if (typeParam && canCreateFinancial) {
      const normalized = normalizeIssuedCheckType(typeParam);
      if (normalized) {
        startTransition(() => {
          setSelectedTx(null);
          setShowForm(true);
        });
      }
    }
  }, [location.search, canCreateFinancial]);

  useEffect(() => {
    let checksReady = false;
    let legacyReady = false;
    const finishLoading = () => { if (checksReady && legacyReady) setLoading(false); };

    const unsubChecks = onSnapshot(query(collection(db, "issued_checks"), orderBy("date", "desc")), (snap) => {
      setIssuedChecks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      checksReady = true; finishLoading();
    });

    const unsubLegacy = onSnapshot(query(collection(db, "transactions"), orderBy("date", "desc")), (snap) => {
      setLegacyTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      legacyReady = true; finishLoading();
    });

    return () => { unsubChecks(); unsubLegacy(); };
  }, []);

  const allTransactions = useMemo(() => {
    return getSharedFinanceLedgerRecords({
      issued_checks: issuedChecks,
      transactions: legacyTransactions,
    });
  }, [issuedChecks, legacyTransactions]);

  const visible = useMemo(() => {
    const queryText = searchQ.trim().toLowerCase();
    const scoped = filterDataByScope(allTransactions, "treasury", user);

    return scoped
      .filter(t => filterType === "all" || t.type === filterType)
      .filter(t => filterState === "all" || (t.state || "posted") === filterState)
      .filter(t => {
        if (!queryText) return true;
        const searchContent = [
          t.party, t.beneficiaryName, t.checkNum, t.notes, getIssuedCheckTypeLabel(t.type) || (t.type === "deposit" ? "إيداع" : "")
        ].join(" ").toLowerCase();
        return searchContent.includes(queryText);
      })
      .sort((a, b) => {
        const dateA = a.date || "";
        const dateB = b.date || "";
        if (dateA !== dateB) return dateA > dateB ? -1 : 1;
        return compareCheckReference(getTxReference(b), getTxReference(a));
      });
  }, [allTransactions, filterType, filterState, searchQ, user]);

  const paginatedVisible = useMemo(() => showAll ? visible : visible.slice(0, PAGE_SIZE), [visible, showAll]);

  const monthlyCloses = useMemo(
    () => computeMonthlyCloses(allTransactions, TREASURY_OPENING_BALANCE),
    [allTransactions]
  );

  const treasuryMetrics = useMemo(
    () => getTreasuryFinancialMetrics(allTransactions, { monthlyCloses }),
    [allTransactions, monthlyCloses]
  );

  const visibleMetrics = useMemo(
    () => getTreasuryFinancialMetrics(visible, { monthlyCloses }),
    [visible, monthlyCloses]
  );

  const pendingOperations = useMemo(
    () => visible.filter((tx) => !isPostedLedgerRecord(tx) || (normalizeRequiresSettlement(tx) && !tx.isSettled)).slice(0, 6),
    [visible]
  );

  const recentOperations = useMemo(() => visible.slice(0, 6), [visible]);

  const nextCheque = useMemo(() => {
    const nums = allTransactions.map((t) => Number(t.checkNum)).filter((n) => Number.isFinite(n) && n > 0);
    return (nums.length ? Math.max(...nums) : 10250) + 1;
  }, [allTransactions]);

  const resetFilters = () => {
    setFilterType("all");
    setFilterState("all");
    setSearchQ("");
  };

  const openFormForType = (type) => {
    navigate(`/treasury/admin?type=${type}`, { replace: true });
    setSelectedTx(null);
    setShowForm(true);
  };

  const handleExportExcel = async (format) => {
    showToast("جاري التجهيز...", "success");
    try {
      const rows = visible.map(tx => ({
        التاريخ: tx.date || "—",
        "رقم المستند": tx.checkNum || tx.bankReference || "—",
        المستفيد: tx.party || tx.beneficiaryName || "—",
        النوع: tx.type === "deposit" ? "إيداع بنكي" : getIssuedCheckTypeLabel(tx.type) || tx.type,
        البيان: tx.notes || "",
        المبلغ: Number(tx.amount || 0),
        "حالة التسوية": tx.type === "deposit" ? "مكتمل" : (tx.requires_settlement || tx.requiresSettlement ? (tx.isSettled ? "مسوى" : "معلق") : "لا يتطلب"),
      }));
      await downloadAs(format, rows, `سجلات_الخزينة_${new Date().toISOString().split('T')[0]}`);
    } catch {
      showToast("حدث خطأ أثناء التصدير", "error");
    }
  };

  // 🔴 تقرير محاسبي حقيقي (مدين/دائن/رصيد)
  const handlePrintReport = () => {
    const win = openPrintWindow("treasury-report", "width=1100,height=800");
    if (!win) return;

    // ترتيب تصاعدي لكشف الحساب: تاريخ الشيك أولاً ثم رقم الشيك ثانياً (من الأقل للأعلى)
    const chronologicalTx = [...visible]
      .filter(isPostedLedgerRecord)
      .sort((a, b) => {
        const dateA = a.date || "";
        const dateB = b.date || "";
        if (dateA !== dateB) return dateA < dateB ? -1 : 1;
        const refDiff = compareCheckReference(getTxReference(a), getTxReference(b));
        if (refDiff !== 0) return refDiff;
        return String(a.party || a.beneficiaryName || "").localeCompare(String(b.party || b.beneficiaryName || ""), "ar");
      });

    let runningBalance = TREASURY_OPENING_BALANCE;
    let totalDebit = 0;
    let totalCredit = 0;

    const rowsHtml = chronologicalTx.map((tx, i) => {
      const isIncome = INCOME_LEDGER_TYPES.has(tx.type);
      const amount = getLedgerAmount(tx);
      const debit = isIncome ? 0 : amount; // منصرف (مدين)
      const credit = isIncome ? amount : 0; // وارد (دائن)

      totalDebit += debit;
      totalCredit += credit;
      runningBalance += (credit - debit); // الرصيد المتراكم

      return `
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td style="text-align:center; white-space:nowrap;">${escapeHtml(tx.date) || "—"}</td>
          <td style="text-align:center;">${escapeHtml(tx.checkNum || tx.bankReference) || "—"}</td>
          <td>${escapeHtml(tx.party || tx.beneficiaryName) || "—"}</td>
          <td>${escapeHtml(tx.notes) || "—"}</td>
          <td style="text-align:left; color:#be123c;">${debit > 0 ? escapeHtml(formatMoney(debit)) : "-"}</td>
          <td style="text-align:left; color:#15803d;">${credit > 0 ? escapeHtml(formatMoney(credit)) : "-"}</td>
          <td style="text-align:left; font-weight:bold; background:#f8fafc;">${escapeHtml(formatMoney(runningBalance))}</td>
        </tr>
      `;
    }).join("");

    win.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>كشف حركة الخزينة</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
          @page { size:A4 landscape; margin:10mm 8mm 14mm; }
          * { font-family: 'Cairo', sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
          body { padding: 20px; color: #1e293b; font-size: 11px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; line-height: 1.5; }
          th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: center; }
          tbody tr:nth-child(even) { background: #f8fafc; }
          tfoot td { background: #f1f5f9; font-size: 12px; font-weight: 700; border-top: 2px solid #94a3b8; }
          .summary-box { display: flex; justify-content: space-between; background: #f8fafc; padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; margin-top: 20px; font-weight: 700; font-size: 13px; }
          @media print {
            body { padding: 0 0 4mm; }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            tr { break-inside: avoid; page-break-inside: avoid; }
            th, td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .summary-box { break-inside: avoid; page-break-inside: avoid; }
          }
          ${getPrintBrandStyles()}
        </style>
      </head>
      <body>
        ${getPrintBrandHeader({ reportTitle: "كشف حركة الخزينة (مدين / دائن)", reportMeta: `تاريخ الاستخراج: ${new Date().toLocaleDateString('en-GB')} | عدد الحركات المرحلة: ${chronologicalTx.length}` })}
        
        <table style="margin-bottom: 10px; width: 30%; border:none;">
           <tr><td style="border:none; font-weight:700; padding:4px 0;">الرصيد الافتتاحي: ${formatMoney(TREASURY_OPENING_BALANCE)}</td></tr>
        </table>

        <table>
          <thead>
            <tr>
              <th style="width: 4%;">م</th>
              <th style="width: 9%;">التاريخ</th>
              <th style="width: 9%;">المرجع</th>
              <th style="width: 24%;">الجهة / المستفيد</th>
              <th style="width: 20%;">البيان</th>
              <th style="width: 11%; text-align:left;">منصرف (مدين)</th>
              <th style="width: 11%; text-align:left;">وارد (دائن)</th>
              <th style="width: 12%; text-align:left;">الرصيد</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="5" style="text-align:left;">إجمالي الحركة</td>
              <td style="text-align:left; color:#be123c;">${formatMoney(totalDebit)}</td>
              <td style="text-align:left; color:#15803d;">${formatMoney(totalCredit)}</td>
              <td style="text-align:left;">${formatMoney(runningBalance)}</td>
            </tr>
          </tfoot>
        </table>

        <div class="summary-box">
           <div>إجمالي الوارد: <span style="color:#15803d">${formatMoney(totalCredit)}</span></div>
           <div>إجمالي المنصرف: <span style="color:#be123c">${formatMoney(totalDebit)}</span></div>
           <div>صافي الرصيد النهائي: <span>${formatMoney(runningBalance)}</span></div>
        </div>

        <div style="margin-top:40px; display:flex; justify-content:space-between; font-weight:600; color:#475569;">
           <div>توقيع المراجع: .......................</div>
           <div>توقيع أمين الصندوق: .......................</div>
           <div>اعتماد المدير المالي: .......................</div>
        </div>
        <script>window.onload = () => { setTimeout(() => window.print(), 500); }</script>
      </body>
      </html>
    `);
    win.document.close();
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-500 font-medium text-lg animate-pulse">جاري بناء السجلات المالية...</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <ErrorBoundary fallback="حدث خطأ في صفحة الماليات">
        <div className="max-w-[1500px] mx-auto px-6 mt-8 space-y-6">
          <PageHeader
            title="مساحة عمليات الخزينة"
            hint="متابعة السيولة، السندات، الشيكات، التسويات، وكشف الحساب من مصدر مالي واحد."
            icon={Building2}
            tone="success"
            metadata={(
              <>
                <span>الرصيد الحالي: {formatMoney(treasuryMetrics.currentBalance)}</span>
                <span>الحركات: {treasuryMetrics.totalTransactions}</span>
                <span>الإقفالات: {treasuryMetrics.monthlyCloseCount}</span>
              </>
            )}
            primaryAction={canCreateFinancial ? (
              <Button onClick={() => openFormForType("advance")} iconStart={Plus}>
                إصدار سلفة
              </Button>
            ) : null}
            secondaryActions={(
              <>
                {canCreateFinancial && (
                  <>
                    <Button variant="outline" onClick={() => openFormForType("aid")} iconStart={ShieldCheck}>رعاية</Button>
                    <Button variant="outline" onClick={() => openFormForType("event")} iconStart={Star}>فاعلية</Button>
                    <Button variant="outline" onClick={() => openFormForType("bank_charge")} iconStart={ArrowUpRight}>خصم مباشر</Button>
                  </>
                )}
                <Button variant="outline" onClick={() => navigate("/treasury/ledger")} iconStart={TableProperties}>كشف الحساب</Button>
                <Button variant="outline" onClick={() => navigate("/treasury/collections")} iconStart={Banknote}>التحصيل</Button>
              </>
            )}
          />

          <TreasuryStatsBar
            currentBalance={treasuryMetrics.currentBalance}
            totalIncome={visibleMetrics.totalIncome}
            totalExpenses={visibleMetrics.totalExpenses}
            unpostedCount={visibleMetrics.unpostedCount}
            requiresSettlementCount={visibleMetrics.requiresSettlementCount}
            openSettlements={visibleMetrics.requiresSettlementRecords.filter((tx) => !tx.isSettled).length}
            settledChecks={visibleMetrics.requiresSettlementRecords.filter((tx) => tx.isSettled).length}
          />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="p-4 xl:col-span-2">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">عمليات معلقة ومطلوبة المتابعة</h2>
                  <p className="text-[11px] font-semibold text-slate-500 mt-0.5">مسودات أو حركات تحتاج تسوية حسب البيانات الحالية.</p>
                </div>
                <StatusBadge tone={pendingOperations.length ? "warning" : "success"}>{pendingOperations.length ? `${pendingOperations.length} متابعة` : "مستقر"}</StatusBadge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {pendingOperations.length === 0 ? (
                  <div className="md:col-span-2 rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs font-semibold text-slate-500">لا توجد عمليات معلقة ضمن الفلاتر الحالية.</div>
                ) : pendingOperations.map((tx) => (
                  <div key={tx.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-900">{tx.party || tx.beneficiaryName || "—"}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">{tx.date || "—"} · {tx.checkNum || tx.bankReference || "—"}</p>
                      </div>
                      <StatusBadge tone={tx.state === "draft" ? "warning" : getSettlementTone(tx)}>{tx.state === "draft" ? "مسودة" : getSettlementLabel(tx)}</StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">أحدث الحركات</h2>
                  <p className="text-[11px] font-semibold text-slate-500 mt-0.5">آخر سجلات حسب ترتيب العرض الحالي.</p>
                </div>
                <Clock3 size={18} className="text-slate-400" />
              </div>
              <div className="space-y-2">
                {recentOperations.map((tx) => {
                  const impact = getFinanceImpact(tx);
                  return (
                    <div key={tx.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold text-slate-800">{tx.notes || tx.party || tx.beneficiaryName || "—"}</p>
                        <p className="text-[10px] font-semibold text-slate-500">{getIssuedCheckTypeLabel(tx.type)} · {getRecordStateLabel(tx.state)}</p>
                      </div>
                      <span className={impact.credit > 0 ? "text-emerald-700" : "text-rose-700"}>
                        {formatMoney(impact.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <TreasuryFilters
                searchQ={searchQ} setSearchQ={setSearchQ}
                filterType={filterType} setFilterType={setFilterType}
                filterState={filterState} setFilterState={setFilterState}
              />

              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" onClick={resetFilters} iconStart={FilterX}>تفريغ الفلاتر</Button>
                <Button variant="outline" onClick={handlePrintReport} iconStart={Printer}>طباعة كشف</Button>
                <select
                  onChange={(e) => { const f = e.target.value; if (f) handleExportExcel(f); e.target.value = ""; }}
                  className="h-9 px-4 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer appearance-none transition-all shadow-sm"
                  style={{ direction: "ltr" }}
                  aria-label="تصدير سجلات الخزينة"
                >
                  <option value="">تصدير</option>
                  <option value="xlsx">Excel (XLSX)</option>
                  <option value="json">JSON</option>
                </select>
              </div>
            </div>

            <TreasuryTable
              visible={visible}
              paginatedVisible={paginatedVisible}
              showAll={showAll}
              setShowAll={setShowAll}
              canEditFinancial={canEditFinancial}
              canDeleteFinancial={canDeleteFinancial}
              canViewAttachments={canViewAttachments}
              onEdit={(tx) => { setSelectedTx(tx); setShowForm(true); }}
              onDelete={setDeleteTarget}
              onViewAttachments={setViewAttachments}
            />
          </div>
        </div>

        {/* 🔴 الشاشة المنبثقة بحجم الشاشة الكاملة 🔴 */}
        {showForm && (
          <div className="fixed inset-0 z-[9999] bg-slate-50 flex flex-col animate-in fade-in duration-200">
            <div className="bg-white px-4 md:px-8 py-4 md:py-5 border-b border-slate-200 shadow-sm flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-slate-100 text-slate-700 rounded-lg border border-slate-200 shrink-0"><Wallet size={20} /></div>
                <div className="min-w-0">
                  <h2 className="text-base md:text-xl font-semibold text-slate-900 tracking-tight truncate">
                    {selectedTx ? "تعديل المستند المالي" : "إصدار مستند مالي جديد"}
                  </h2>
                  <p className="text-[11px] md:text-xs font-medium text-slate-500 mt-1">يُرجى التأكد من البيانات المدخلة قبل الحفظ أو الطباعة.</p>
                </div>
              </div>
              <button
                onClick={() => { setShowForm(false); navigate("/treasury/admin", { replace: true }); }}
                className="px-3 md:px-4 py-2 text-xs md:text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-100 rounded-lg transition-all flex items-center gap-2 shrink-0"
              >
                إغلاق الشاشة <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <Suspense fallback={<div className="flex justify-center items-center h-96 text-slate-500 font-medium animate-pulse">جاري تهيئة النموذج...</div>}>
                  <TreasuryForm
                    userRole={user}
                    canPost={canPost}
                    nextCheque={nextCheque}
                    showToast={showToast}
                    onSubmit={async (data) => {
                      if (selectedTx && isPostedLedgerRecord(selectedTx) && !canPost) {
                        throw new Error("لا تملك صلاحية تعديل قيد مرحّل");
                      }
                      await saveTransaction(data);
                      setShowForm(false);
                      navigate("/treasury/admin", { replace: true });
                    }}
                    initialData={selectedTx}
                    onCancel={() => { setShowForm(false); navigate("/treasury/admin", { replace: true }); }}
                  />
                </Suspense>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <ConfirmDialog
            title="تأكيد الحذف"
            message={`هل أنت متأكد من حذف المستند المالي الخاص بـ ${deleteTarget.party || deleteTarget.beneficiaryName || ""}؟`}
            confirmLabel="تأكيد الحذف"
            onCancel={() => setDeleteTarget(null)}
            onConfirm={async () => {
              try {
                await deleteTransaction(deleteTarget);
                setDeleteTarget(null);
                showToast("تم الحذف بنجاح", "success");
              } catch (error) {
                showToast(error.message || "تعذر حذف المستند", "error");
              }
            }}
          />
        )}

      </ErrorBoundary>
    </div>
  );
}
