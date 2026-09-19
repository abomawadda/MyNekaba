/**
 * TreasuryLedger — كشف حساب الخزينة العام
 * يدعم السجلات القديمة والجديدة مع توحيد أنواع الشيكات إداريًا.
 */

import React, { useEffect, useState, useMemo } from "react";
import { collection, doc, query, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";
import { useT } from "../../app/providers/ThemeProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { PERMISSIONS } from "../../security/permissions";
import ArabicDatePicker from "../../ui/inputs/ArabicDatePicker";
import BrandHeader from "../../ui/BrandHeader";
import { getPrintBrandHeader, getPrintBrandStyles } from "../../utils/branding";
import { formatInteger, formatMoney } from "../../utils/numberFormat";
import { escapeHtml } from "../../utils/escapeHtml";
import { openPrintWindow } from "../../utils/print";
import {
  getIssuedCheckDisplayParty,
  getIssuedCheckTypeLabel,
  normalizeIssuedCheckType,
} from "./helpers/issuedChecks";
import {
  TREASURY_OPENING_BALANCE,
  POSTED_FINANCE_STATES,
  computeMonthlyCloses,
  getFinanceImpact,
  getCheckStatusLabel,
  getSharedFinanceLedgerRecords,
} from "./helpers/financeLedger";
import {
  Printer, Wallet, TrendingUp, TrendingDown, FileText,
  Search, FileSpreadsheet, Download, RefreshCw, AlertTriangle
} from "lucide-react";
import clsx from "clsx";
import { downloadAs } from "../../utils/downloadData";
import { StatCard as EnterpriseStatCard } from "../../ui/enterprise";

// ─────────────────────────────────────────────
const getTodayISO = () => new Date().toISOString().split("T")[0];
const normalizeArabicDigits = (value = "") =>
  String(value).replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit));

const getCheckSortValue = (checkNum) => {
  const normalized = normalizeArabicDigits(checkNum).trim();
  const numericValue = Number(normalized);
  return Number.isFinite(numericValue) && normalized !== "" ? numericValue : Number.MAX_SAFE_INTEGER;
};

const formatCheckReference = (checkNum) => {
  const normalized = normalizeArabicDigits(checkNum).trim();
  if (!normalized) return "—";
  const numericValue = Number(normalized);
  return Number.isFinite(numericValue) ? formatInteger(numericValue) : checkNum;
};
const getDateRangeLabel = (dates = [], fallbackFrom = "", fallbackTo = "") => {
  const sortedDates = dates.filter(Boolean).sort((a, b) => a.localeCompare(b));
  return {
    start: sortedDates[0] || fallbackFrom || "",
    end: sortedDates[sortedDates.length - 1] || fallbackTo || "",
  };
};

const getTypeLabel = (type, subType) => {
  switch (type) {
    case "deposit": return "إيداع نقدي";
    case "refund": return "رد سلفة";
    case "subs": return "اشتراكات نشاط";
    case "aid": return subType ? subType.split(":")[0] : "رعاية";
    case "advance": return "سلفة";
    case "activities": return "أنشطة";
    case "trip": return "رحلة";
    case "event": return "فاعلية";
    case "budget": return "ميزانية";
    case "other": return "شيك آخر";
    case "activity": return "فاعلية";
    case "bank_charge": return subType || "حركة بنكية";
    default: return "حركة مالية";
  }
};

const getBadgeColor = (type) => {
  switch (type) {
    case "deposit":
    case "subs": return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "refund": return "bg-sky-100    text-sky-700    border-sky-200    dark:bg-sky-900/30    dark:text-sky-400";
    case "aid": return "bg-rose-100   text-rose-700   border-rose-200   dark:bg-rose-900/30   dark:text-rose-400";
    case "advance": return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400";
    case "activities":
    case "activity":
    case "event": return "bg-amber-100  text-amber-700  border-amber-200  dark:bg-amber-900/30  dark:text-amber-400";
    case "trip": return "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400";
    case "budget": return "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400";
    case "other": return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300";
    case "bank_charge": return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300";
    default: return "bg-slate-100  text-slate-700  border-slate-200";
  }
};



// ─────────────────────────────────────────────
// StatCard — مكون مؤسسي موحد
// ─────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, isCount }) {
  const tone = color === "rose" ? "danger" : color === "emerald" ? "success" : color === "amber" ? "warning" : "brand";
  return (
    <EnterpriseStatCard
      label={label}
      value={isCount ? value : formatMoney(value || 0)}
      icon={Icon}
      tone={tone}
    />
  );
}

// ─────────────────────────────────────────────
// Error Boundary
// ─────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div className="flex flex-col items-center justify-center p-20 gap-3 text-rose-500">
        <AlertTriangle size={36} />
        <p className="font-black text-sm">حدث خطأ في تحميل كشف الحساب</p>
        <p className="text-[10px] font-bold opacity-70">{this.state.error.message}</p>
        <button onClick={() => this.setState({ error: null })} className="px-4 py-2 bg-rose-100 text-rose-700 rounded-xl font-black text-xs">
          إعادة المحاولة
        </button>
      </div>
    );
    return this.props.children;
  }
}

// ─────────────────────────────────────────────
// المكوّن الرئيسي
// ─────────────────────────────────────────────
function TreasuryLedgerInner() {
  const T = useT();
  const { can } = useAuth();
  const canSaveMonthlyClose = can(PERMISSIONS.treasuryPost);
  const canExportReports = can(PERMISSIONS.reportsExport);
  const [issuedChecks, setIssuedChecks] = useState([]);
  const [legacyTransactions, setLegacyTransactions] = useState([]);
  const [monthlySnapshots, setMonthlySnapshots] = useState([]);
  const [savingClose, setSavingClose] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [ledgerVisibleCount, setLedgerVisibleCount] = useState(100);
  const [ledgerViewKey, setLedgerViewKey] = useState("");
  const currentLedgerKey = `${filterFrom}|${filterTo}|${filterType}|${searchQ}`;
  if (ledgerViewKey !== currentLedgerKey) {
    setLedgerViewKey(currentLedgerKey);
    setLedgerVisibleCount(100);
  }

  // Firestore listener
  useEffect(() => {
    let checksReady = false;
    let legacyReady = false;
    const finishLoading = () => {
      if (checksReady && legacyReady) {
        setLoading(false);
        setError(null);
      }
    };

    const qChecks = query(collection(db, "issued_checks"));
    const unsubChecks = onSnapshot(
      qChecks,
      snap => {
        setIssuedChecks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        checksReady = true;
        finishLoading();
      },
      err => {
        console.error(err);
        checksReady = true;
        setIssuedChecks([]);
        finishLoading();
      }
    );

    const qLegacy = query(collection(db, "transactions"));
    const unsubLegacy = onSnapshot(
      qLegacy,
      snap => {
        setLegacyTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        legacyReady = true;
        finishLoading();
      },
      err => {
        console.error(err);
        legacyReady = true;
        setLegacyTransactions([]);
        finishLoading();
      }
    );
    return () => {
      unsubChecks();
      unsubLegacy();
    };
  }, []);

  useEffect(() => {
    const unsubCloses = onSnapshot(
      query(collection(db, "monthly_closes")),
      (snap) => setMonthlySnapshots(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setMonthlySnapshots([])
    );
    return () => unsubCloses();
  }, []);

  const mergedTransactions = useMemo(() => {
    return getSharedFinanceLedgerRecords({
      issued_checks: issuedChecks,
      transactions: legacyTransactions,
    });
  }, [issuedChecks, legacyTransactions]);

  const monthlyCloses = useMemo(
    () => computeMonthlyCloses(mergedTransactions, TREASURY_OPENING_BALANCE),
    [mergedTransactions]
  );

  const savedCloseByPeriod = useMemo(() => {
    const map = new Map();
    monthlySnapshots.forEach((s) => {
      if (s.period) map.set(s.period, s);
    });
    return map;
  }, [monthlySnapshots]);

  const saveMonthlySnapshot = async (close) => {
    if (!canSaveMonthlyClose) return;
    if (!close?.period) return;
    setSavingClose(close.period);
    try {
      await setDoc(doc(db, "monthly_closes", close.period), {
        period: close.period,
        opening: close.opening,
        credit: close.credit,
        debit: close.debit,
        closing: close.closing,
        count: close.count,
        computedAt: new Date().toISOString(),
        serverTimestamp: serverTimestamp(),
        source: "live",
      }, { merge: true });
    } catch (e) {
      console.error("monthly close:", e);
      alert("تعذر حفظ اللقطة الشهرية.");
    } finally {
      setSavingClose("");
    }
  };

  // بناء بيانات دفتر الأستاذ
  const ledgerData = useMemo(() => {
    let allEvents = [];
    const posted = mergedTransactions.filter(t => !t.state || POSTED_FINANCE_STATES.has(t.state));

    posted.forEach(tx => {
      const impact = getFinanceImpact(tx);
      const normalizedType = normalizeIssuedCheckType(tx.type);
      const checkStatus = tx.checkStatus || "";
      if (impact.rawAmount !== 0) {
        allEvents.push({
          id: tx.id,
          date: tx.date || getTodayISO(),
          type: normalizedType,
          subType: tx.aidCategory || tx.activityType || tx.bankChargeCategory || tx.expenseItem || "",
          party: getIssuedCheckDisplayParty(tx) || "—",
          notes: tx.type === "bank_charge"
            ? [tx.notes, tx.bankReference ? `مرجع: ${tx.bankReference}` : ""].filter(Boolean).join(" - ") || tx.bankChargeCategory || "حركة بنكية"
            : tx.notes || tx.activityName || tx.expenseItem || (normalizedType === "advance" ? "صرف سلفة" : getIssuedCheckTypeLabel(normalizedType)),
          checkNum: tx.checkNum || tx.bankReference || (tx.type === "bank_charge" ? "حركة بنكية" : "—"),
          checkStatus,
          checkStatusLabel: getCheckStatusLabel(tx),
          zeroFinancialEffect: impact.amount === 0,
          rawAmount: impact.rawAmount,
          credit: impact.credit,
          debit: impact.debit,
        });
      }

      if ((normalizedType === "trip" || tx.type === "activity") && tx.isSettled && Number(tx.collectedSubscriptions || tx.memberSubscriptions || 0) > 0) {
        allEvents.push({
          id: `${tx.id}_subs`, date: tx.settlementDate || tx.date, type: "subs", subType: "",
          party: getIssuedCheckDisplayParty(tx) || "—",
          notes: `توريد اشتراكات ${normalizedType === "trip" ? "رحلة" : "نشاط"} (${tx.date})`,
          checkNum: "إيصال",
          credit: Number(tx.collectedSubscriptions || tx.memberSubscriptions), debit: 0,
        });
      }
    });

    allEvents.sort((a, b) => {
      const dateComparison = a.date.localeCompare(b.date);
      if (dateComparison !== 0) return dateComparison;

      const checkComparison = getCheckSortValue(a.checkNum) - getCheckSortValue(b.checkNum);
      if (checkComparison !== 0) return checkComparison;

      return String(a.checkNum || "").localeCompare(String(b.checkNum || ""), "ar");
    });

    let running = TREASURY_OPENING_BALANCE;
    let periodOpening = TREASURY_OPENING_BALANCE;
    let periodCredit = 0, periodDebit = 0;
    const events = [];

    allEvents.forEach(e => {
      if (filterFrom && e.date < filterFrom) {
        running += (e.credit - e.debit);
        periodOpening = running;
      } else if (filterTo && e.date > filterTo) {
        // خارج النطاق بعد النهاية
      } else {
        running += (e.credit - e.debit);
        e.balance = running;

        const matchType =
          filterType === "all" ||
          (filterType === "deposit" && ["deposit", "refund", "subs"].includes(e.type)) ||
          (filterType === "aid" && e.type === "aid") ||
          (filterType === "event" && ["event", "activities", "trip", "budget", "other"].includes(e.type)) ||
          (filterType === "advance" && e.type === "advance");

        const matchSearch =
          !searchQ ||
          e.party.toLowerCase().includes(searchQ.toLowerCase()) ||
          e.notes?.toLowerCase().includes(searchQ.toLowerCase()) ||
          e.subType?.toLowerCase().includes(searchQ.toLowerCase()) ||
          e.checkNum?.toString().includes(searchQ);

        if (matchType && matchSearch) {
          periodCredit += e.credit;
          periodDebit += e.debit;
          events.push(e);
        }
      }
    });

    const periodRange = getDateRangeLabel(
      events.map((event) => event.date),
      filterFrom || "",
      filterTo || getTodayISO()
    );

    return {
      events,
      finalBalance: running,
      periodOpeningBalance: periodOpening,
      periodCredit,
      periodDebit,
      periodStartDate: periodRange.start,
      periodEndDate: periodRange.end,
    };
  }, [mergedTransactions, filterFrom, filterTo, filterType, searchQ]);

  // طباعة كشف الحساب
  const handlePrint = () => {
    if (!canExportReports) return;
    const win = openPrintWindow("treasury-ledger", "width=1200,height=900");
    if (!win) return;

    // تجميع الصفوف حسب الارتفاع التقديري لكل صف (طول الجهة/البيان)
    // فيملأ كل جزء صفحته الفيزيائية تماماً: الأولى أصغر بسبب رأس التقرير
    const FIRST_PAGE_ROWS_MM = 158;
    const OTHER_PAGES_ROWS_MM = 230;
    const estimateRowHeightMm = (e) => {
      const textLen = String(e.party || "").length + String(e.notes || "").length * 1.2;
      const lines = Math.max(1, Math.ceil(textLen / 52));
      return 4.2 + lines * 4.4;
    };
    const pageChunks = [];
    {
      let current = [], usedMm = 0, budget = FIRST_PAGE_ROWS_MM;
      const flush = () => {
        if (current.length === 0) return;
        pageChunks.push(current);
        current = []; usedMm = 0; budget = OTHER_PAGES_ROWS_MM;
      };
      ledgerData.events.forEach((e) => {
        const h = estimateRowHeightMm(e);
        if (current.length > 0 && usedMm + h > budget) flush();
        current.push(e);
        usedMm += h;
      });
      flush();
    }
    if (pageChunks.length === 0) pageChunks.push([]);
    const pageStartSerial = [];
    {
      let serial = 0;
      pageChunks.forEach((chunk) => { pageStartSerial.push(serial); serial += chunk.length; });
    }

    const buildRowHtml = (e, serial) => `
      <tr>
        <td class="serial">${serial}</td>
        <td class="date">${escapeHtml(e.date) || "—"}</td>
        <td class="type">${escapeHtml(getTypeLabel(e.type, e.subType))}</td>
        <td class="reference">${escapeHtml(formatCheckReference(e.checkNum))}</td>
        <td class="statement">${e.notes && e.notes !== "—" ? `<strong>${escapeHtml(e.party) || "—"}</strong><span>${escapeHtml(e.notes)}</span>` : escapeHtml(e.party) || "—"}</td>
        <td class="credit">${e.credit > 0 ? escapeHtml(formatMoney(e.credit)) : e.zeroFinancialEffect ? escapeHtml(formatMoney(0)) : "—"}</td>
        <td class="debit">${e.debit > 0 ? escapeHtml(formatMoney(e.debit)) : e.zeroFinancialEffect ? escapeHtml(formatMoney(0)) : "—"}</td>
        <td class="balance">${escapeHtml(formatMoney(e.balance || 0))}</td>
      </tr>
    `;

    const tableHeadHtml = `
      <colgroup><col class="serial-col"><col class="date-col"><col class="type-col"><col class="reference-col"><col class="statement-col"><col class="money-col"><col class="money-col"><col class="money-col"></colgroup>
      <thead><tr>
        <th>م</th><th>التاريخ</th><th>النوع</th><th>رقم الشيك</th><th style="text-align:right;">الجهة / البيان</th><th>وارد (+)</th><th>منصرف (-)</th><th>الرصيد</th>
      </tr></thead>`;

    const pagesHtml = pageChunks.map((pageEvents, pageIdx) => {
      const isLast = pageIdx === pageChunks.length - 1;
      const startSerial = pageStartSerial[pageIdx];
      const bodyHtml = pageEvents.length > 0
        ? pageEvents.map((e, k) => buildRowHtml(e, startSerial + k + 1)).join("")
        : `<tr><td colspan="8" style="text-align:center;padding:20px;color:#64748b">لا توجد حركات مطابقة للفلاتر الحالية.</td></tr>`;
      const pageCredit = pageEvents.reduce((s, e) => s + (Number(e.credit) || 0), 0);
      const pageDebit = pageEvents.reduce((s, e) => s + (Number(e.debit) || 0), 0);
      const carriedBalance = pageIdx === 0
        ? ledgerData.periodOpeningBalance
        : (pageChunks[pageIdx - 1].length > 0
            ? pageChunks[pageIdx - 1][pageChunks[pageIdx - 1].length - 1].balance
            : ledgerData.periodOpeningBalance);
      const pageClosing = pageEvents.length > 0
        ? pageEvents[pageEvents.length - 1].balance
        : carriedBalance;
      return `
      <div class="ledger-page${isLast ? " last-page" : ""}">
        ${pageIdx > 0 ? `<div class="carry-box">رصيد ما قبله (مرحّل من الصفحة السابقة): ${escapeHtml(formatMoney(carriedBalance))}</div>` : ""}
        <table>
          ${tableHeadHtml}
          <tbody>${bodyHtml}</tbody>
          <tfoot>
            <tr class="page-total-row">
              <td colspan="5">إجمالي الصفحة الحالية</td>
              <td class="credit">${escapeHtml(formatMoney(pageCredit))}</td>
              <td class="debit">${escapeHtml(formatMoney(pageDebit))}</td>
              <td class="balance">${escapeHtml(formatMoney(pageClosing))}</td>
            </tr>
            ${isLast ? `
            <tr class="closing-row">
              <td colspan="5">الإجماليات والرصيد الختامي</td>
              <td class="credit">${formatMoney(ledgerData.periodCredit)}</td>
              <td class="debit">${formatMoney(ledgerData.periodDebit)}</td>
              <td class="balance">${formatMoney(ledgerData.finalBalance)}</td>
            </tr>` : ""}
          </tfoot>
        </table>
      </div>`;
    }).join("");

    win.document.write(`
      <!DOCTYPE html><html lang="ar" dir="rtl">
      <head><meta charset="UTF-8"><title>كشف حساب الخزينة</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        * { font-family: 'Cairo', sans-serif; margin:0; padding:0; box-sizing:border-box; }
        html, body { width:100%; height:auto; }
        body { padding:14px; font-size:10px; color:#172033; background:#fff; }
        .report-title { margin:2px 0 8px; padding:8px 12px; border-right:5px solid #0f766e; background:linear-gradient(135deg,#f0fdfa,#f8fafc); border-radius:8px; }
        .report-title h2 { margin:0 0 2px; color:#0f766e; font-size:15px; font-weight:900; }
        .report-title p { margin:0; color:#64748b; font-size:9px; font-weight:700; }
        .info-bar { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:8px; }
        .info-item { padding:8px 10px; border:1px solid #dbe5ea; border-radius:7px; background:#fff; font-size:9px; font-weight:800; color:#475569; }
        .info-item strong { display:block; margin-top:2px; color:#0f172a; font-size:11px; }
        table { width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; margin-bottom:12px; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; }
        col.serial-col { width:5%; } col.date-col { width:10%; } col.type-col { width:12%; } col.reference-col { width:12%; } col.statement-col { width:32%; } col.money-col { width:9.666%; }
        th { background:#0f2937; color:#fff; padding:8px 4px; text-align:center; font-weight:900; border-left:1px solid #35505c; font-size:9px; white-space:nowrap; }
        td { border-left:1px solid #dbe3e8; border-top:1px solid #dbe3e8; padding:6px 5px; vertical-align:middle; font-size:9px; line-height:1.45; word-break:normal; overflow-wrap:anywhere; }
        tbody tr:nth-child(even) td { background:#f8fafc; }
        tbody tr { break-inside:avoid; page-break-inside:avoid; }
        td.serial { text-align:center; color:#64748b; font-weight:900; }
        td.date, td.type, td.reference { text-align:center; white-space:nowrap; }
        td.reference { color:#b45309; font-weight:900; }
        td.statement { text-align:right; }
        td.statement strong, td.statement span { display:block; }
        td.statement strong { color:#0f172a; }
        td.statement span { color:#64748b; font-size:8px; }
        td.credit { text-align:left; color:#047857; font-weight:900; }
        td.debit { text-align:left; color:#be123c; font-weight:900; }
        td.balance { text-align:left; color:#0f766e; font-weight:900; background:#f0fdfa !important; }
        .opening-box { margin-bottom:10px; padding:8px 10px; border:1px solid #bbf7d0; border-right:4px solid #16a34a; border-radius:7px; background:#f0fdf4; color:#166534; font-weight:900; }
        .carry-box { margin-bottom:10px; padding:8px 10px; border:1px solid #fde68a; border-right:4px solid #d97706; border-radius:7px; background:#fffbeb; color:#92400e; font-weight:900; }
        .page-total-row td { background:#f0fdfa !important; color:#0f766e; font-weight:900; border-color:#99f6e4; }
        .page-total-row .credit { color:#047857; } .page-total-row .debit { color:#be123c; } .page-total-row .balance { color:#0f766e; background:#ccfbf1 !important; }
        .ledger-page { break-inside:auto; }
        .closing-row td { background:#172033 !important; color:#fff; font-weight:900; border-color:#334155; }
        .closing-row .credit { color:#6ee7b7; } .closing-row .debit { color:#fda4af; } .closing-row .balance { color:#5eead4; background:#172033 !important; }
        .signatures { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:30px; text-align:center; }
        .sig-box { font-size:10px; font-weight:700; color:#334155; }
        .sig-line { margin-top:35px; border-top:1px dashed #94a3b8; width:80%; margin-inline:auto; }
        @media print {
          @page { margin:9mm 8mm 14mm; size:A4 portrait; }
          body { padding:0; }
          .info-bar, .signatures, .sig-box, .brand-header, .opening-box, .carry-box { break-inside:avoid; page-break-inside:avoid; }
          thead { display:table-header-group; }
          tfoot { display:table-footer-group; }
          tfoot tr { break-inside:avoid; page-break-inside:avoid; }
          tr { break-inside:avoid; page-break-inside:avoid; }
          th, td { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
          .signatures { page-break-inside:avoid; }
          .no-break { break-inside:avoid; page-break-inside:avoid; }
          .ledger-page { page-break-after:always; break-after:page; }
          .ledger-page.last-page { page-break-after:auto; break-after:auto; }
        }
        ${getPrintBrandStyles()}
      </style></head>
      <body>
        ${getPrintBrandHeader({
      reportTitle: "كشف حساب الخزينة العام (دفتر الأستاذ)",
      reportMeta: `الفترة: ${ledgerData.periodStartDate || "—"} إلى ${ledgerData.periodEndDate || "—"} | الرصيد الختامي: ${formatMoney(ledgerData.finalBalance)}`
    })}
        <div class="report-title">
          <h2>كشف حساب الخزينة العام</h2>
          <p>دفتر الأستاذ المالي — تقرير تفصيلي للحركات الواردة والمنصرفة والرصيد المتراكم</p>
        </div>
        <div class="info-bar">
          <div class="info-item">الفترة<strong>${ledgerData.periodStartDate || "—"} — ${ledgerData.periodEndDate || "—"}</strong></div>
          <div class="info-item">تاريخ التقرير<strong>${getTodayISO()}</strong></div>
          <div class="info-item">عدد الحركات<strong>${ledgerData.events.length}</strong></div>
        </div>
        <div class="opening-box">الرصيد الافتتاحي للفترة: ${formatMoney(ledgerData.periodOpeningBalance)}</div>
        ${pagesHtml}
        <div class="signatures">
          ${["مُدخل البيانات", "المراجعة المالية", "أمين الصندوق", "رئيس النقابة"].map(s => `
            <div class="sig-box">${s}<div class="sig-line"></div></div>
          `).join("")}
        </div>
        <script>window.onload=()=>{setTimeout(()=>window.print(),500);}</script>
      </body></html>
    `);
    win.document.close();
  };

  // تصدير البيانات
  const handleExport = async (format) => {
    if (!canExportReports) return;
    const rows = ledgerData.events.map(e => ({
      "التاريخ": e.date,
      "النوع": getTypeLabel(e.type, e.subType),
      "رقم الشيك": formatCheckReference(e.checkNum),
      "الجهة": e.party,
      "البيان": e.notes,
      "حالة الشيك": e.checkStatusLabel || "",
      "وارد": e.credit > 0 ? e.credit : "",
      "منصرف": e.debit > 0 ? e.debit : "",
      "الرصيد": e.balance,
    }));
    const filename = `كشف_الخزينة_${ledgerData.periodStartDate || "كامل"}_${ledgerData.periodEndDate || getTodayISO()}`;
    await downloadAs(format, rows, filename);
  };

  // ─── Render states ───────────────────────────
  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-3 text-slate-400">
      <RefreshCw size={32} className="animate-spin text-teal-500" />
      <p className="font-black text-sm">جاري تحميل كشف الحساب...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center p-20 gap-3 text-rose-500">
      <AlertTriangle size={36} />
      <p className="font-black text-sm">خطأ في الاتصال بالخادم</p>
      <p className="text-[10px] font-bold opacity-70">{error}</p>
    </div>
  );

  // ─── Main Render ──────────────────────────────
  return (
    <div className={clsx("flex flex-col gap-3 max-w-7xl mx-auto pb-10", T.text)} dir="rtl">
      <BrandHeader sectionTitle="كشف حساب الخزينة" sectionHint="دفتر الأستاذ التفصيلي" />

      {/* ── 1. ملخص الخزينة ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard
          label="الرصيد الفعلي"
          value={ledgerData.finalBalance}
          icon={Wallet}
          color={ledgerData.finalBalance >= 0 ? "teal" : "rose"}
        />
        <StatCard label="وارد الفترة" value={ledgerData.periodCredit} icon={TrendingUp} color="emerald" />
        <StatCard label="منصرف الفترة" value={ledgerData.periodDebit} icon={TrendingDown} color="rose" />
        <StatCard label="حركات الكشف" value={ledgerData.events.length} icon={FileText} color="amber" isCount />
      </div>

      {/* ── 1ب. الإغلاق الشهري (قراءة فقط) ── */}
      {monthlyCloses.length > 0 && (
        <div className={clsx("p-3 rounded-2xl border shadow-sm", T.card)}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-black text-slate-600 dark:text-slate-300">الإغلاق الشهري التراكمي — للعرض فقط ولا يدخل الحسابات</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[10px]">
              <thead><tr className="bg-slate-50 dark:bg-slate-800/50 border-b">
                {["الشهر", "الافتتاحي", "وارد", "منصرف", "الختامي", "الحركات", "لقطة محفوظة", ...(canSaveMonthlyClose ? [""] : [])].map((h, i) => <th key={i} className="p-2 font-black text-slate-500 whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {monthlyCloses.map((m) => {
                  const saved = savedCloseByPeriod.get(m.period);
                  const matches = saved && Number(saved.closing) === Number(m.closing);
                  return (
                    <tr key={m.period}>
                      <td className="p-2 font-black whitespace-nowrap">{m.period}</td>
                      <td className="p-2 whitespace-nowrap">{formatMoney(m.opening)}</td>
                      <td className="p-2 whitespace-nowrap text-emerald-600 font-bold">{formatMoney(m.credit)}</td>
                      <td className="p-2 whitespace-nowrap text-rose-600 font-bold">{formatMoney(m.debit)}</td>
                      <td className="p-2 font-black whitespace-nowrap text-teal-700">{formatMoney(m.closing)}</td>
                      <td className="p-2 whitespace-nowrap">{m.count}</td>
                      <td className="p-2 whitespace-nowrap text-[9px] font-bold text-slate-400">{saved ? `محفوظة (${saved.computedAt ? String(saved.computedAt).slice(0, 10) : "—"})${matches ? "" : " — تختلف عن الحالية!"}` : "—"}</td>
                      {canSaveMonthlyClose && (
                        <td className="p-2 whitespace-nowrap">
                          <button
                            onClick={() => saveMonthlySnapshot(m)}
                            disabled={savingClose === m.period}
                            className="px-2.5 py-1 text-[9px] font-black bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-teal-100 hover:text-teal-700 disabled:opacity-50 transition-colors"
                          >
                            {savingClose === m.period ? "جارٍ الحفظ..." : "حفظ لقطة"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 2. لوحة التحكم ── */}
      <div className={clsx("p-3 rounded-2xl border shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between", T.card)}>
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-teal-50 dark:bg-teal-900/20 rounded-xl text-teal-600">
            <FileSpreadsheet size={18} />
          </div>
          <div>
            <h1 className="text-sm font-black">كشف حساب الخزينة</h1>
            <p className="text-[9px] font-bold text-slate-400">دفتر الأستاذ التفصيلي</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* نطاق التاريخ */}
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl border border-slate-100 dark:border-slate-700">
            <div className="w-28"><ArabicDatePicker label="" value={filterFrom} onChange={setFilterFrom} maxVal={filterTo || getTodayISO()} /></div>
            <span className="text-[9px] text-slate-400 font-bold">إلى</span>
            <div className="w-28"><ArabicDatePicker label="" value={filterTo} onChange={setFilterTo} minVal={filterFrom} maxVal={getTodayISO()} /></div>
          </div>
          {canExportReports && (
            <>
              <select
                onChange={(e) => { const f = e.target.value; if (f) handleExport(f); e.target.value = ""; }}
                disabled={ledgerData.events.length === 0}
                className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl font-black text-[10px] shadow-sm h-[38px] cursor-pointer appearance-none transition-all active:scale-95 disabled:opacity-50 border border-emerald-200"
                style={{ direction: "ltr" }}
              >
                <option value="">تصدير</option>
                <option value="xlsx">Excel (XLSX)</option>
                <option value="json">JSON</option>
              </select>
              <button onClick={handlePrint} disabled={ledgerData.events.length === 0}
                className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-black text-[10px] shadow-md flex items-center gap-1.5 h-[38px] transition-all active:scale-95 disabled:opacity-50">
                <Printer size={13} /> طباعة
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 3. شريط البحث والفلتر ── */}
      <div className={clsx("p-2.5 rounded-xl border shadow-sm flex flex-wrap justify-between items-center gap-2", T.card)}>
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={12} className="absolute right-3 top-2.5 text-slate-400" />
          <input
            type="text" value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="بحث: مستفيد، نوع شيك، بيان، رقم شيك..."
            className={clsx("w-full pr-8 pl-4 py-1.5 rounded-lg border text-[10px] font-bold outline-none focus:ring-2 focus:border-teal-500", T.inp)}
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex-wrap">
          {[
            { id: "all", label: "الكل" },
            { id: "deposit", label: "الوارد" },
            { id: "aid", label: "الإعانات" },
            { id: "event", label: "الشيكات" },
            { id: "advance", label: "السلف" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilterType(f.id)}
              className={clsx(
                "px-3 py-1 rounded-lg text-[9px] font-black transition-all whitespace-nowrap",
                filterType === f.id ? "bg-white dark:bg-slate-700 shadow-sm text-teal-600" : "text-slate-500"
              )}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4. الجدول ── */}
      <div className={clsx("rounded-2xl shadow-sm border overflow-hidden", T.card)}>
        {/* تلميح السحب للموبايل */}
        <div className="md:hidden flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/40">
          <span className="text-[9px] font-bold text-amber-600">← اسحب يساراً لرؤية كل الأعمدة</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-[11px]">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b">
              <tr>
                <th className="p-2.5 font-black text-slate-500 md:w-24 text-center">التاريخ</th>
                <th className="p-2.5 font-black text-slate-500 text-center md:w-28">النوع</th>
                <th className="p-2.5 font-black text-slate-500 text-center md:w-20">رقم الشيك</th>
                <th className="p-2.5 font-black text-slate-500">الجهة / البيان</th>
                <th className="p-2.5 font-black text-emerald-600 text-center md:w-24">وارد (+)</th>
                <th className="p-2.5 font-black text-rose-600   text-center md:w-24">منصرف (-)</th>
                <th className="p-2.5 font-black text-teal-600   text-left  md:w-28 bg-slate-100/50 dark:bg-slate-800">الرصيد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">

              {/* رصيد افتتاحي */}
              <tr className="bg-emerald-50/40 dark:bg-emerald-900/10">
                <td colSpan={6} className="p-2 text-emerald-700 font-bold text-[10px]">الرصيد الافتتاحي للفترة:</td>
                <td className="p-2 text-left text-emerald-700 font-black">{formatMoney(ledgerData.periodOpeningBalance)}</td>
              </tr>

              {ledgerData.events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <FileText size={32} className="opacity-20" />
                      <p className="font-black text-xs">لا توجد حركات مالية</p>
                      <p className="text-[10px] font-bold">جرّب تغيير النطاق الزمني أو الفلتر</p>
                    </div>
                  </td>
                </tr>
              ) : ledgerData.events.slice(0, ledgerVisibleCount).map((row, i) => (
                <tr key={`${row.id}-${i}`}
                  className={clsx(
                    "hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors",
                    i % 2 === 0 ? "" : "bg-slate-50/30 dark:bg-slate-900/10"
                  )}>
                  <td className="p-2 text-center text-slate-500 font-bold whitespace-nowrap">{row.date}</td>

                  <td className="p-2 text-center">
                    <span className={clsx("px-1.5 py-0.5 rounded border inline-block text-[9px] font-black whitespace-nowrap", getBadgeColor(row.type))}>
                      {getTypeLabel(row.type, row.subType)}
                    </span>
                  </td>

                  <td className="p-2 text-center font-black text-amber-600 text-[10px] whitespace-nowrap">{formatCheckReference(row.checkNum)}</td>

                  <td className="p-2">
                    <p className="font-black text-slate-800 dark:text-slate-100 truncate max-w-[180px] md:max-w-[260px]">{row.party}</p>
                    {(row.checkStatusLabel || row.zeroFinancialEffect) && (
                      <p className={clsx("text-[9px] font-bold", row.zeroFinancialEffect ? "text-amber-600" : "text-emerald-600")}>
                        حالة الشيك: {row.checkStatusLabel || "—"}{row.zeroFinancialEffect ? " — بدون أثر مالي" : ""}
                      </p>
                    )}
                  </td>

                  <td className="p-2 text-center font-black text-emerald-600 whitespace-nowrap">
                    {row.credit > 0 ? formatMoney(row.credit) : row.zeroFinancialEffect ? formatMoney(0) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-2 text-center font-black text-rose-600 whitespace-nowrap">
                    {row.debit > 0 ? formatMoney(row.debit) : row.zeroFinancialEffect ? formatMoney(0) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className={clsx(
                    "p-2 text-left font-black bg-slate-50/50 dark:bg-slate-800/50 whitespace-nowrap",
                    row.balance < 0 ? "text-rose-600" : "text-teal-700 dark:text-teal-300"
                  )}>
                    {formatMoney(row.balance || 0)}
                  </td>
                </tr>
              ))}

              {/* الإجماليات */}
              <tr className="bg-slate-900 dark:bg-slate-950 text-white font-black">
                <td colSpan={4} className="p-2.5 text-[11px]">الإجماليات والرصيد الختامي:</td>
                <td className="p-2.5 text-center text-emerald-400 whitespace-nowrap">{formatMoney(ledgerData.periodCredit)}</td>
                <td className="p-2.5 text-center text-rose-400   whitespace-nowrap">{formatMoney(ledgerData.periodDebit)}</td>
                <td className="p-2.5 text-left  text-teal-300   whitespace-nowrap">{formatMoney(ledgerData.finalBalance)}</td>
              </tr>
            </tbody>
          </table>
          {ledgerData.events.length > ledgerVisibleCount && (
            <button
              onClick={() => setLedgerVisibleCount((v) => v + 100)}
              className="w-full py-2.5 text-[11px] font-black text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors border-t border-slate-100 dark:border-slate-800"
            >
              عرض المزيد ({ledgerData.events.length - ledgerVisibleCount} متبقٍ من {ledgerData.events.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TreasuryLedger() {
  return (
    <ErrorBoundary>
      <TreasuryLedgerInner />
    </ErrorBoundary>
  );
}
