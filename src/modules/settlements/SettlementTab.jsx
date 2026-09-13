/**
 * SettlementTab — شاشة تسوية السلف والفاعليات
 *
 * ✅ ميزة تسوية الفاعليات: (قيمة الشيك + اشتراكات محصلة = ميزانية الفاعلية).
 * ✅ حفظ مؤقت للفواتير.
 * ✅ بدون شاشة بيضاء بفضل الـ Local Print & Snapshot Modal.
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { collection, query, onSnapshot, doc, setDoc, orderBy, writeBatch, where, getDocs, updateDoc, arrayUnion, getDoc } from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";
import { useT } from "../../app/providers/ThemeProvider";
import FileUpload from "../treasury/FileUpload";
import ArabicDatePicker from "../../ui/inputs/ArabicDatePicker";
import { getPrintBrandHeader, getPrintBrandStyles } from "../../utils/branding";
import { logAuditEvent } from "../../utils/auditLog";
import { Alert, LoadingState, PageHeader, getModuleIcon } from "../../ui/enterprise";
import {
  getDeathDate,
  getEffectiveMemberState,
  getMembershipEndDate,
  isBoardMember,
  parseEmployeeDate,
} from "../../utils/memberBenefits";
import { repairArabicMojibake } from "../../utils/arabicMojibake";
import { useAlert } from "../../app/providers/AlertProvider";
import { PERMISSIONS } from "../../security/permissions";
import { useAuth } from "../../app/providers/AuthProvider";
import { formatInteger, formatMoney } from "../../utils/numberFormat";
import { escapeHtml } from "../../utils/escapeHtml";
import { tafqeet } from "../../utils/tafqeet";
import { openPrintWindow } from "../../utils/print";
import {
  buildLegacyIssuedCheckId,
  getDefaultRequiresSettlement,
  getIssuedCheckDisplayParty,
  getIssuedCheckSourceKey,
  getIssuedCheckTypeLabel,
  getSettlementMode,
  isDirectFinanceType,
  isGroupedSettlementFollower as isGroupedSettlementFollowerRecord,
  isLegacyCheckType,
  isLegacyCheckMigrated,
  mergeIssuedChecksSourcesNormalized,
  normalizeIssuedCheckType,
  normalizeRequiresSettlement,
  normalizeSettlementOpenState,
} from "../treasury/helpers/issuedChecks";
import {
  BOARD_MEMBERSHIPS_COLLECTION,
  BOARD_TERMS_COLLECTION,
  buildBoardMemberViewsFromMemberships,
  buildLegacyBoardMemberships,
  getActiveBoardTerm,
  getEligibleBoardMemberViews,
  getMeetingAttendanceRecords,
} from "../board/boardLifecycle";
import {
  sortBoardMembersUnified,
} from "../board/boardMembershipRules";
import { ReceiptText, Plus, Trash2, CheckCircle2, FileText, Tag, DollarSign, Wallet, History, Search, AlertCircle, Info, ShieldCheck, ArrowDownRight, X, Check, Users, Save, AlertTriangle, Loader2, Edit3, RotateCcw, Gift, Download } from "lucide-react";
import clsx from "clsx";
import { recoverSingleSettlement, discardDraft, deletePrizeBenefitsForSettlements } from "./settlementRecovery";
import {
  PRIZE_BENEFIT_SOURCE,
  PRIZE_CATEGORY,
  buildPrizeBenefitPayload,
  isPrizeCategory,
  normalizePrizeRecipients,
  prizeBenefitDocId,
  prizeTotal,
  summarizePrizeRecipients,
  validatePrizeRecipients,
} from "./prizeHelpers";
import {
  buildSettlementResetPayload,
  commitInChunks,
  newExpenseId,
  parseArabicNumber,
} from "./settlementUtils";
import {
  collectDataUrlAttachments,
  isDataUrl,
  uploadDataUrlToStorage,
} from "../treasury/attachmentMigration";
import { buildSettlementBaseline } from "./settlementAudit";
import SettlementArchiveFilters from "./components/SettlementArchiveFilters";
import SettlementArchiveTable from "./components/SettlementArchiveTable";
import SettlementDraftSection from "./components/SettlementDraftSection";
import SettlementKpiStrip from "./components/SettlementKpiStrip";
import SettlementWorkspaceTabs from "./components/SettlementWorkspaceTabs";

const INITIAL_CATS = ["بدل ضيافة", "أدوات مكتبية", "بدل انتقال", "صيانة", "مشتريات أخرى", "بدل جلسات", PRIZE_CATEGORY];
const EXPENSE_CATS_LIST_KEY = "settlement_expense_cats";
const TRAVEL_ALLOWANCE_CATEGORIES = ["بدل انتقال"];
const SESSION_ALLOWANCE_CATEGORIES = ["بدل جلسات"];
const HOSPITALITY_ALLOWANCE_CATEGORIES = ["بدل ضيافة", "ضيافة وبوفيه"];
const BOARD_ALLOWANCE_CATEGORIES = [
  ...TRAVEL_ALLOWANCE_CATEGORIES,
  ...SESSION_ALLOWANCE_CATEGORIES,
  ...HOSPITALITY_ALLOWANCE_CATEGORIES,
];
const ALLOWANCE_TYPE_LABELS = {
  travel: "بدل الانتقال",
  sessions: "بدل الجلسات",
  hospitality: "بدل الضيافة",
};
const BOARD_TERM_START = "2022/06/01";
const BOARD_TERM_END = "2027/05/31";
const getTodayISO = () => new Date().toISOString().split("T")[0];
const POSTED_SETTLEMENT_STATES = new Set(["posted", "approved", "paid"]);
const ARABIC_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const getMonthValue = (dateString = "") => (dateString || "").slice(5, 7);
const getYearValue = (dateString = "") => (dateString || "").slice(0, 4);
const parseFlexibleDate = (value) => {
  const parsed = parseEmployeeDate(value);
  if (parsed) return parsed;
  if (!value) return null;
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};
const getDateTimestamp = (value) => {
  const parsed = parseFlexibleDate(value);
  return parsed ? parsed.getTime() : 0;
};
const toEntityId = (value) => String(value ?? "").trim();
const toEntityIdList = (values = []) =>
  Array.from(new Set((Array.isArray(values) ? values : []).map(toEntityId).filter(Boolean)));
const formatCheckNumber = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const raw = String(value).trim();
  const normalized = raw.replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
  const numeric = Number(normalized.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return raw;
  return formatInteger(numeric);
};
const getMeetingAllowanceType = (category = "") => {
  if (SESSION_ALLOWANCE_CATEGORIES.includes(category)) return "sessions";
  if (HOSPITALITY_ALLOWANCE_CATEGORIES.includes(category)) return "hospitality";
  return "";
};
const isTravelAllowanceCategory = (category = "") => TRAVEL_ALLOWANCE_CATEGORIES.includes(category);
const isMeetingAllowanceCategory = (category = "") => Boolean(getMeetingAllowanceType(category));
const isBoardAllowanceCategory = (category = "") => BOARD_ALLOWANCE_CATEGORIES.includes(category);
const getLatestSettlementExpenseDate = (expenses = [], fallback = "") => {
  const datedExpenses = (Array.isArray(expenses) ? expenses : [])
    .map((expense) => ({
      raw: expense?.date || "",
      timestamp: getDateTimestamp(expense?.date),
    }))
    .filter((entry) => entry.raw);
  if (datedExpenses.length === 0) return fallback || "";
  datedExpenses.sort((a, b) => (b.timestamp - a.timestamp) || String(b.raw).localeCompare(String(a.raw)));
  return datedExpenses[0]?.raw || fallback || "";
};
const getSettlementApprovalDate = (settlement = {}) =>
  getLatestSettlementExpenseDate(
    settlement?.settlementExpenses,
    settlement?.settlementDate || settlement?.date || ""
  );
const getSettlementChequeDate = (settlement = {}) => settlement?.date || settlement?.checkDate || settlement?.issueDate || "";
const getSettlementChequeNumber = (settlement = {}) => {
  const numeric = Number(settlement?.checkNum || settlement?.checkNo || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};
const getSettlementPersonKey = (settlement = {}) =>
  toEntityId(settlement?.employeeId || getIssuedCheckDisplayParty(settlement) || settlement?.party || settlement?.employeeName);
const getSettlementReturnMode = (settlement = {}) => {
  const explicitMode = String(settlement?.returnMode || "").trim();
  if (explicitMode) return explicitMode;
  if (settlement?.returnedActually) return "cash_return";
  return Number(settlement?.settlementReturned || 0) > 0 ? "carry_forward" : "settled";
};
const getSettlementReturnedLabel = (settlement = {}) => {
  const returnMode = getSettlementReturnMode(settlement);
  if (returnMode === "bank_deposit") return "تم إيداعه بالبنك";
  if (returnMode === "cash_return") return "تم الرد نقدًا";
  if (returnMode === "carry_forward") return "مرحّل للقادم";
  return "تمت التسوية";
};
const getSettlementEffectiveRemaining = (settlement = {}) => {
  const returnMode = getSettlementReturnMode(settlement);
  if (returnMode === "carry_forward") return Number(settlement?.settlementReturned || 0);
  if (returnMode === "bank_deposit") {
    return Number(settlement?.bankDepositedAmount || settlement?.settlementReturned || 0);
  }
  if (returnMode === "cash_return") {
    return Number(settlement?.returnedCashAmount || settlement?.settlementReturned || 0);
  }
  return Number(settlement?.settlementReturned || 0);
};
const getSettlementSortTimestamp = (settlement = {}) =>
  getDateTimestamp(getSettlementApprovalDate(settlement)) ||
  getDateTimestamp(settlement?.updatedAt) ||
  getDateTimestamp(settlement?.settlementDate) ||
  getDateTimestamp(settlement?.date) ||
  getDateTimestamp(settlement?.createdAt);
const compareSettlementSequenceDesc = (a = {}, b = {}) => {
  const dateDiff = getDateTimestamp(getSettlementChequeDate(b)) - getDateTimestamp(getSettlementChequeDate(a));
  if (dateDiff !== 0) return dateDiff;

  const chequeDiff = getSettlementChequeNumber(b) - getSettlementChequeNumber(a);
  if (chequeDiff !== 0) return chequeDiff;

  const approvalDiff = getSettlementSortTimestamp(b) - getSettlementSortTimestamp(a);
  if (approvalDiff !== 0) return approvalDiff;

  return String(b.id || "").localeCompare(String(a.id || ""));
};
const compareSettlementSequenceAsc = (a = {}, b = {}) => compareSettlementSequenceDesc(b, a);

const normalizeDateOnly = (value) => {
  const parsed = parseEmployeeDate(value);
  return parsed ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) : null;
};

const getBoardSettlementEndDate = (member) => {
  const membershipEndDate = getMembershipEndDate(member);
  const deathDate = getDeathDate(member);

  if (membershipEndDate && deathDate) {
    return membershipEndDate.getTime() <= deathDate.getTime() ? membershipEndDate : deathDate;
  }

  return membershipEndDate || deathDate || null;
};

const isBoardMemberEligibleForSettlementDate = (member, onDate) => {
  if (!isBoardMember(member)) return false;

  const referenceDate = normalizeDateOnly(onDate) || normalizeDateOnly(new Date());
  const boardEndDate = normalizeDateOnly(getBoardSettlementEndDate(member));

  if (!boardEndDate) return true;
  return referenceDate.getTime() <= boardEndDate.getTime();
};

// ── دالة الطباعة المدمجة لمنع خطأ المتصفح ──
const printSettlementLocal = ({
  advanceTxn,
  expenses,
  spent,
  remaining,
  groupedChecks = [],
  prevBalance = 0,
  collectedSubs = 0,
  returnMode = "settled",
  bankDepositDate = "",
  bankDepositReference = "",
}) => {
  const win = openPrintWindow("settlement-local", "width=950,height=750");
  if (!win) return;

  const ADV_AMT = Number(advanceTxn?.advanceAmountBase || advanceTxn?.amount || 0);
  const hasGroupedChecks = Array.isArray(groupedChecks) && groupedChecks.length > 1;
  const GROUPED_CHECKS_TOTAL = (Array.isArray(groupedChecks) ? groupedChecks : []).reduce(
    (sum, check) => sum + Number(check?.amount || 0),
    0
  );
  const DISPLAY_CHECK_AMOUNT = hasGroupedChecks && GROUPED_CHECKS_TOTAL > 0 ? GROUPED_CHECKS_TOTAL : ADV_AMT;
  const checkAmountLabel = hasGroupedChecks ? "إجمالي الشيكات المجمعة" : "قيمة الشيك المُنصرف";
  const tableColGroup = `
    <colgroup>
      <col style="width:8%" />
      <col style="width:18%" />
      <col style="width:20%" />
      <col style="width:36%" />
      <col style="width:18%" />
    </colgroup>
  `;
  const SUBS_AMT = Number(collectedSubs || 0);
  const TOTAL_AVAILABLE = DISPLAY_CHECK_AMOUNT + Number(prevBalance) + Number(collectedSubs);
  const INVOICES_TOTAL = (expenses || []).reduce(
    (sum, expense) => sum + Number(expense?.amount || 0),
    0
  );
  const invoicesTotalInWords = tafqeet(INVOICES_TOTAL);
  const totalBudgetInWords = tafqeet(TOTAL_AVAILABLE);

  const rowsHtml = expenses?.length > 0
    ? [...expenses].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.category || "").localeCompare(String(b.category || ""), "ar")).map((e, i) => `<tr><td style="text-align:center">${i + 1}</td><td style="text-align:center">${escapeHtml(e.date)}</td><td style="color:#0f766e">${escapeHtml(e.category)}</td><td>${escapeHtml(e.notes) || "—"}</td><td style="text-align:left; font-weight:900">${escapeHtml(formatMoney(e.amount))}</td></tr>`).join("")
    : `<tr><td colspan="5" style="text-align:center; padding:30px; color:#94a3b8;">لم يتم إدراج فواتير</td></tr>`;

  const groupedChecksHtml =
    groupedChecks.length > 1
      ? `
        <div style="margin-bottom:10px; border:1px solid #cbd5e1; border-radius:12px; background:#fff; overflow:hidden;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 10px; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
            <h3 style="font-size:13px; color:#0f172a; font-weight:900; margin:0;">تفاصيل الشيكات المجمعة</h3>
            <span class="badge">عدد الشيكات: ${groupedChecks.length}</span>
          </div>
          <table style="margin-top:0;">
            ${tableColGroup}
            <thead>
              <tr>
                <th style="text-align:center;">م</th>
                <th style="text-align:center;">التاريخ</th>
                <th style="text-align:center;">رقم الشيك</th>
                <th>البيان</th>
                <th>القيمة</th>
              </tr>
            </thead>
            <tbody>
              ${groupedChecks
        .map(
          (check, index) => `
                    <tr>
                      <td style="text-align:center">${index + 1}</td>
                      <td style="text-align:center">${check.date || "-"}</td>
                      <td style="text-align:center">${formatCheckNumber(check.checkNum)}</td>
                      <td>${check.party || "-"}</td>
                      <td style="text-align:left; font-weight:900">${formatMoney(check.amount || 0)}</td>
                    </tr>`
        )
        .join("")}
            </tbody>
          </table>
        </div>
      `
      : "";

  const settlementFooter =
    remaining > 0
      ? `يوجد مبلغ متبقٍ قدره (${formatMoney(remaining)}) — ${returnMode === "bank_deposit"
        ? `تم إيداعه بالبنك${bankDepositDate ? ` بتاريخ ${bankDepositDate}` : ""}${bankDepositReference ? ` بموجب المرجع ${bankDepositReference}` : ""}.`
        : returnMode === "cash_return"
          ? "تم توريده نقداً لخزينة النقابة بموجب إيصال."
          : "تم ترحيله كـ 'رصيد دائن' ليُخصم من السلفة القادمة."
      }`
      : remaining < 0
        ? `يوجد تجاوز في الصرف قدره (${formatMoney(Math.abs(remaining))}) — يُصرف للموظف.`
        : `تم تسوية العهدة بالكامل (صفر).`;

  win.document.write(`
    <!DOCTYPE html><html lang="ar">
    <head><meta charset="UTF-8"><title>تسوية ${advanceTxn?.settlement_mode === 'carry_forward' ? 'عهدة' : 'شيك'} - ${advanceTxn?.employeeName || advanceTxn?.party}</title>
    <style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');*{font-family:'Cairo',sans-serif;margin:0;padding:0;box-sizing:border-box;direction:rtl;}body{padding:18px;color:#1e293b;background:#fff;font-size:11px;line-height:1.45;}.badge{display:inline-block;padding:4px 12px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:20px;font-size:11px;font-weight:700;color:#0f766e;}.info-row{margin-bottom:12px;padding:10px 12px;background:#f8fafc;border-right:4px solid #0d9488;border-radius:8px;font-size:14px;font-weight:900;line-height:1.5;}.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;}.stat-box{border:1px solid #e2e8f0;padding:10px;border-radius:10px;text-align:center;}.stat-label{font-size:10px;color:#64748b;font-weight:800;margin-bottom:3px;text-transform:uppercase;line-height:1.3;}.stat-value{font-size:16px;font-weight:900;line-height:1.25;}h3{margin-bottom:6px;color:#334155;font-size:13px;line-height:1.4;}table{width:100%;border-collapse:collapse;margin-top:6px;font-size:11px}th{background:#f1f5f9;color:#0f766e;border:1px solid #cbd5e1;padding:6px 5px;text-align:right;font-weight:900;line-height:1.4;white-space:nowrap}td{border:1px solid #cbd5e1;padding:5px 4px;text-align:right;font-weight:700;line-height:1.45;vertical-align:middle;word-break:normal;overflow-wrap:break-word}tbody tr:nth-child(even){background:#f8fafc;}.footer-note{margin-top:8px;padding:8px;background:#fefce8;border:1px solid #fef08a;border-radius:8px;font-size:11px;font-weight:800;color:#854d0e;line-height:1.6;}.sigs{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:28px;text-align:center;}.sig-box{border-top:2px dashed #cbd5e1;padding-top:8px;font-size:12px;font-weight:900;color:#475569;}.sig-space{height:38px;}@media print{@page{size:A4 portrait;margin:10mm;}body{padding:0;}.info-row,.stats-grid,.stat-box,.footer-note,.sigs,.sig-box{break-inside:avoid;page-break-inside:avoid;}table{page-break-inside:auto;break-inside:auto;}thead{display:table-header-group;}tfoot{display:table-footer-group;}tr{break-inside:avoid;page-break-inside:avoid;}}${getPrintBrandStyles()}</style>
    </head><body>
      ${getPrintBrandHeader({ reportTitle: `كشف تسوية ${advanceTxn?.settlement_mode === 'carry_forward' ? 'عهدة مالية' : 'شيك مصروف'}`, reportMeta: `تاريخ الاعتماد: ${getLatestSettlementExpenseDate(expenses, advanceTxn?.settlementDate || advanceTxn?.date || '—') || '—'}` })}
      <div class="info-row">اسم مسؤول التسوية: <span style="font-size:16px; color:#0d9488; margin-right: 8px;">${advanceTxn?.employeeName || advanceTxn?.party || '—'}</span></div>
      <div class="stats-grid">
        <div class="stat-box"> <div class="stat-label">${checkAmountLabel}</div> <div class="stat-value" style="color:#334155">${formatMoney(DISPLAY_CHECK_AMOUNT)}</div> </div>
        <div class="stat-box"> <div class="stat-label">${advanceTxn?.settlement_mode === 'check_plus_subscriptions' ? 'اشتراكات الأعضاء' : 'رصيد مرحل من قبل'}</div> <div class="stat-value" style="color:#d97706">${advanceTxn?.settlement_mode === 'check_plus_subscriptions' ? formatMoney(SUBS_AMT) : formatMoney(prevBalance)}</div> </div>
        <div class="stat-box" style="background:#f0fdf4; border-color:#86efac"> <div class="stat-label" style="color:#15803d">إجمالي ميزانية التسوية</div> <div class="stat-value" style="color:#166534">${formatMoney(TOTAL_AVAILABLE)}</div> </div>
        <div class="stat-box" style="background:#fff1f2; border-color:#fda4af"> <div class="stat-label" style="color:#e11d48">المنصرف الفعلي بالفواتير</div> <div class="stat-value" style="color:#be123c">${formatMoney(spent)}</div> </div>
      </div>
      <h3 style="margin-bottom:10px; color:#334155; font-size: 14px;">بيان الفواتير والمصروفات المدرجة:</h3>
      ${groupedChecksHtml}
      <div style="margin-bottom:10px; border:1px solid #cbd5e1; border-radius:12px; background:#fff; overflow:hidden;">
        <table style="margin-top:0;">
          ${tableColGroup}
          <thead>
            <tr>
              <th style="text-align:center;">م</th>
              <th style="text-align:center;">التاريخ</th>
              <th>التصنيف المحاسبي</th>
              <th>البيان والملاحظات</th>
              <th>المبلغ</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="font-weight:900; background:#ecfeff;">إجمالي مبلغ الفواتير</td>
              <td style="text-align:left; font-weight:900; background:#ecfeff;">${formatMoney(INVOICES_TOTAL)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      ${invoicesTotalInWords ? `<div class="footer-note" style="margin-top:10px;background:#f0f9ff;border-color:#bae6fd;color:#075985;">تفقيط إجمالي الفواتير: ${invoicesTotalInWords}</div>` : ""}
      ${totalBudgetInWords ? `<div class="footer-note" style="margin-top:10px;background:#ecfdf5;border-color:#86efac;color:#166534;">تفقيط إجمالي ميزانية التسوية: ${totalBudgetInWords}</div>` : ""}
      <div class="footer-note">الحالة النهائية للتسوية: ${settlementFooter}</div>
      <div class="sigs"><div class="sig-box">توقيع المسؤول<div class="sig-space"></div></div><div class="sig-box">المراجعة والرقابة<div class="sig-space"></div></div><div class="sig-box">يعتمد، أمين الصندوق<div class="sig-space"></div></div></div>
      <script>window.onload=()=>{setTimeout(()=>window.print(), 500);}</script>
    </body></html>
  `);
  win.document.close();
};

function FinanceCard({ label, value, color, icon: Icon, isTotal }) {
  const safeValue = formatMoney(value || 0);
  return (
    <div className={clsx("p-3 rounded-xl border flex flex-col justify-center transition-all", isTotal ? `bg-${color}-600 text-white border-${color}-700 shadow-md` : `bg-${color}-50 dark:bg-${color}-900/10 border-${color}-100 dark:border-${color}-800`)}>
      <div className="flex items-center gap-1.5 mb-1 opacity-90">{Icon && <Icon size={12} />}<p className="text-[9px] font-black uppercase tracking-widest">{label}</p></div>
      <p className={clsx("text-lg font-black", !isTotal && `text-${color}-700 dark:text-${color}-400`)}>{safeValue}</p>
    </div>
  );
}

function InlineDynamicSelect({ label, value, onChange, icon: Icon, defaultOptions = [], listKey = EXPENSE_CATS_LIST_KEY }) {
  const T = useT();
  const [storedOptions, setStoredOptions] = useState([]);
  useEffect(() => {
    const docRef = doc(db, "settings", "dropdowns");
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data[listKey])) setStoredOptions(data[listKey]);
      }
    }, () => {});
    return unsub;
  }, [listKey]);
  const baseOptions = useMemo(() => {
    const merged = [...defaultOptions, ...storedOptions];
    if (value && !merged.includes(value)) merged.push(value);
    return Array.from(new Set(merged));
  }, [value, defaultOptions, storedOptions]);
  const [dynamicOptions, setDynamicOptions] = useState([]);
  const options = useMemo(() => {
    const merged = new Set([...baseOptions, ...dynamicOptions]);
    return [...merged];
  }, [baseOptions, dynamicOptions]);
  const [isAdding, setIsAdding] = useState(false);
  const [newVal, setNewVal] = useState("");
  const handleAdd = async () => {
    const trimmed = newVal.trim();
    if (trimmed && !options.includes(trimmed)) {
      setDynamicOptions(prev => [...prev, trimmed]);
      onChange(trimmed);
      try {
        const docRef = doc(db, "settings", "dropdowns");
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          await setDoc(docRef, { [listKey]: [trimmed] }, { merge: true });
        } else {
          await updateDoc(docRef, { [listKey]: arrayUnion(trimmed) });
        }
      } catch (e) {
        console.error("expense_cats persist:", e);
      }
    }
    setIsAdding(false);
    setNewVal("");
  };
  return (
    <div className="space-y-1 relative w-full" dir="rtl">
      {label && <label className="text-[10px] font-black text-slate-500 uppercase pr-1">{label}</label>}
      <div className="flex items-center gap-2">
        <div className="relative group flex-1">
          {Icon && <Icon size={14} className="absolute right-3 top-2.5 text-slate-400 z-10 pointer-events-none" />}
          <select value={value} onChange={e => onChange(e.target.value)} className={clsx("w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:border-teal-500 transition-all h-[38px] appearance-none", Icon ? "pr-9" : "pr-3", T.sel)}>
            <option value="">-- اختر التصنيف --</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => setIsAdding(!isAdding)} className="w-10 h-[38px] flex items-center justify-center bg-teal-50 text-teal-600 dark:bg-teal-900/30 rounded-xl hover:bg-teal-500 hover:text-white transition-colors shadow-sm shrink-0"><Plus size={16} /></button>
      </div>
      {isAdding && (
        <div className={clsx("absolute top-full right-0 w-full mt-1 p-2 rounded-xl shadow-xl border flex items-center gap-2 z-[200] animate-in fade-in zoom-in-95", T.card)}>
          <input autoFocus type="text" value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="اسم البند الجديد..." className={clsx("flex-1 px-3 py-1.5 text-xs font-bold rounded-lg border outline-none", T.inp)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          <button type="button" onClick={handleAdd} className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 shadow-sm"><Check size={14} /></button>
          <button type="button" onClick={() => setIsAdding(false)} className="p-2 bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded-lg hover:bg-rose-500 hover:text-white"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🩺 DiagnosticPanel — تحليل جميع الشيكات وتصنيفها حسب ظهورها
// ═══════════════════════════════════════════════════════════════
function DiagnosticPanel({ issuedChecks, legacyTransactions, normalizedSourceTransactions, openAdvances, T, formatMoney: fmtMoney, formatInteger: fmtInt }) {
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [actionLoading, setActionLoading] = useState({});
  const [confirmReset, setConfirmReset] = useState(null);
  const [dToast, setDToast] = useState(null);
  const [diagVisibleCount, setDiagVisibleCount] = useState(100);
  const [diagViewKey, setDiagViewKey] = useState("");
  const currentDiagKey = `${filterType}|${filterCategory}|${searchQ}`;
  if (diagViewKey !== currentDiagKey) {
    setDiagViewKey(currentDiagKey);
    setDiagVisibleCount(100);
  }

  const showDToast = (msg, type = "success") => {
    setDToast({ msg, type });
    setTimeout(() => setDToast(null), 3500);
  };

  // 🛠️ إعادة تعيين شامل — يحذف كل أثر للتسوية ويعيد الشيك مفتوحاً
  const handleResetCheck = async (record) => {
    if (record.isGrouped) {
      showDToast("لا يمكن إعادة تعيين شيك تابع لتسوية مجمعة من شاشة التشخيص", "error");
      return;
    }
    setActionLoading(prev => ({ ...prev, [record.id]: true }));
    try {
      const now = new Date().toISOString();
      const targetId = record.targetDocId || record.id;
      const batch = writeBatch(db);

      const nukePayload = buildSettlementResetPayload(record.type, now);

      if (!POSTED_SETTLEMENT_STATES.has(record.state)) {
        nukePayload.state = "posted";
      }

      batch.set(doc(db, "issued_checks", targetId), nukePayload, { merge: true });

      if (record.source.includes("transactions") && record.key && record.key !== targetId) {
        batch.set(doc(db, "transactions", record.key), {
          isSettled: false,
          hasDraftSettlement: false,
          settlementExpenses: [],
          state: "posted",
          updatedAt: now,
        }, { merge: true });
      }

      await batch.commit();

      try {
        await logAuditEvent("diagnostic_nuke_reset", {
          checkId: targetId,
          sourceId: record.id,
          source: record.source,
          party: record.party,
          type: record.type,
          reason: record.reason,
        });
      } catch { /* ignore audit log errors */ }

      showDToast(`تم حذف كل التسويات وإعادة ${record.party || targetId} مفتوحاً`, "success");
    } catch (err) {
      console.error("Nuke reset failed:", err);
      showDToast("فشلت إعادة التعيين الشامل: " + err.message, "error");
    } finally {
      setActionLoading(prev => ({ ...prev, [record.id]: false }));
      setConfirmReset(null);
    }
  };

  const handleFixState = async (record) => {
    setActionLoading(prev => ({ ...prev, [record.id]: true }));
    try {
      const targetId = record.targetDocId || record.id;
      await setDoc(doc(db, "issued_checks", targetId), {
        state: "posted",
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      await logAuditEvent("diagnostic_fix_state", {
        checkId: targetId, party: record.party,
        oldState: record.state, newState: "posted",
      });
      showDToast(`تم تعديل حالة الشيك إلى posted`, "success");
    } catch (err) {
      showDToast("فشل تعديل الحالة: " + err.message, "error");
    } finally {
      setActionLoading(prev => ({ ...prev, [record.id]: false }));
    }
  };

  const handleEnableSettlement = async (record) => {
    setActionLoading(prev => ({ ...prev, [record.id]: true }));
    try {
      const targetId = record.targetDocId || record.id;
      await setDoc(doc(db, "issued_checks", targetId), {
        requires_settlement: true,
        requiresSettlement: true,
        settlement_mode: record.type === "advance" ? "carry_forward" :
          record.type === "trip" ? "check_plus_subscriptions" : "check_only",
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      await logAuditEvent("diagnostic_enable_settlement", {
        checkId: targetId, party: record.party,
      });
      showDToast(`تم تفعيل التسوية للشيك`, "success");
    } catch (err) {
      showDToast("فشل تفعيل التسوية: " + err.message, "error");
    } finally {
      setActionLoading(prev => ({ ...prev, [record.id]: false }));
    }
  };

  const analysis = useMemo(() => {
    const settledKeys = new Set();
    const draftKeys = new Set();
    const openKeys = new Set();
    const settledGroupIds = new Set();
    const draftGroupIds = new Set();

    normalizedSourceTransactions.forEach(tx => {
      const key = getIssuedCheckSourceKey(tx);
      const req = normalizeRequiresSettlement(tx);
      if (!req) return;
      const groupId = String(tx.settlementGroupId || tx.settlement_group_id || "").trim();
      if (tx.isSettled) {
        settledKeys.add(key);
        if (groupId) settledGroupIds.add(groupId);
      }
      if (tx.hasDraftSettlement && !tx.isSettled) {
        draftKeys.add(key);
        if (groupId) draftGroupIds.add(groupId);
      }
    });

    openAdvances.forEach(tx => {
      openKeys.add(getIssuedCheckSourceKey(tx));
    });

    const allRecords = [];
    const keyRegistry = new Map();

    const classify = (tx) => {
      const normalizedType = normalizeIssuedCheckType(tx.type);
      const key = getIssuedCheckSourceKey(tx);
      const req = normalizeRequiresSettlement(tx);
      const stateVal = tx.state || "posted";
      const isDirect = isDirectFinanceType(normalizedType);
      const isFollower = isGroupedSettlementFollowerRecord(tx);
      const groupId = String(tx.settlementGroupId || tx.settlement_group_id || "").trim();
      const isGrouped = Boolean(
        groupId ||
        tx.settlementGroupLeaderId ||
        tx.settlementGroupCount > 1 ||
        tx.settlementGroupFollower
      );
      const settledState = normalizeSettlementOpenState({ ...tx, type: normalizedType });

      const inSettled = settledKeys.has(key);
      const inDraft = draftKeys.has(key);
      const inOpen = openKeys.has(key);
      const groupSettled = isFollower && groupId && settledGroupIds.has(groupId);
      const groupDraft = isFollower && groupId && draftGroupIds.has(groupId);
      const inAny = inSettled || inDraft || inOpen;

      let category = "";
      let reason = "";

      if (isDirect) {
        category = "مستبعد"; reason = "خصم مباشر بنكي — لا يتطلب تسوية";
      } else if (!req) {
        category = "مستبعد";
        reason = normalizedType === "aid" ? "رعاية — لا تتطلب تسوية" : `type: ${normalizedType} — لا يتطلب تسوية`;
        if (normalizedType === "advance" && tx.requires_settlement === false) reason = "سلفة مع requires_settlement: false (تم إلغاء التسوية يدوي)";
      } else if (groupSettled) {
        category = "مسوى"; reason = "تابع لتسوية مجمعة معتمدة";
      } else if (groupDraft) {
        category = "مسودة"; reason = "تابع لمسودة تسوية مجمعة";
      } else if (isFollower && !inAny) {
        category = "مستبعد"; reason = "شيك تابع لتسوية مجموعة غير مكتملة";
      } else if (inSettled) {
        category = "مسوى";
      } else if (inDraft) {
        category = "مسودة";
      } else if (inOpen) {
        category = "مفتوح";
      } else if (!!settledState.isSettled && !inSettled) {
        category = "مفقود"; reason = "isSettled=true لكنه ليس في أرشيف التسويات (قد يكون تابعاً لمجموعة)";
      } else if (!POSTED_SETTLEMENT_STATES.has(stateVal)) {
        category = "مفقود"; reason = `حالة الشيك: "${stateVal}" — ليس posted أو approved`;
      } else if (tx.requires_settlement === false) {
        category = "مفقود"; reason = "requires_settlement: false يمنع ظهوره";
      } else {
        category = "مفقود"; reason = "سبب غير معروف — يحتاج مراجعة";
      }

      if (keyRegistry.has(key)) {
        const prev = keyRegistry.get(key);
        if (prev.category === category) reason = reason ? `${reason} | مكرر (نفس key)` : "مكرر (نفس key)";
        keyRegistry.set(key, { category, reason });
      } else {
        keyRegistry.set(key, { category, reason });
      }

      return { category, reason, inSettled, inDraft, inOpen, inAny, key, isGrouped };
    };

    issuedChecks.forEach(tx => {
      const c = classify(tx, "issued_checks");
      allRecords.push({
        id: tx.id, targetDocId: tx.id, key: c.key, source: "issued_checks",
        party: getIssuedCheckDisplayParty(tx),
        type: normalizeIssuedCheckType(tx.type),
        typeLabel: getIssuedCheckTypeLabel(normalizeIssuedCheckType(tx.type)),
        amount: Number(tx.advanceAmountBase || tx.amount || 0),
        date: tx.date || "", checkNum: tx.checkNum || "",
        state: tx.state || "posted",
        category: c.category, reason: c.reason,
        inSettled: c.inSettled, inDraft: c.inDraft, inOpen: c.inOpen, inAny: c.inAny,
        isGrouped: c.isGrouped,
      });
    });

    legacyTransactions.forEach(tx => {
      if (!isLegacyCheckType(tx.type)) return;
      const alreadyMigrated = isLegacyCheckMigrated(tx, issuedChecks);
      const source = alreadyMigrated ? "transactions (مُهاجر)" : "transactions";
      const c = classify(tx, source);
      allRecords.push({
        id: tx.id, targetDocId: buildLegacyIssuedCheckId(tx.id), key: c.key, source,
        party: getIssuedCheckDisplayParty(tx),
        type: normalizeIssuedCheckType(tx.type),
        typeLabel: getIssuedCheckTypeLabel(normalizeIssuedCheckType(tx.type)),
        amount: Number(tx.amount || tx.advanceAmountBase || 0),
        date: tx.date || "", checkNum: tx.checkNum || "",
        state: tx.state || "posted",
        category: c.category, reason: c.reason,
        inSettled: c.inSettled, inDraft: c.inDraft, inOpen: c.inOpen, inAny: c.inAny,
        isGrouped: c.isGrouped,
      });
    });

    return {
      records: allRecords,
      settled: allRecords.filter(r => r.category === "مسوى"),
      draft: allRecords.filter(r => r.category === "مسودة"),
      open: allRecords.filter(r => r.category === "مفتوح"),
      missing: allRecords.filter(r => r.category === "مفقود"),
      excluded: allRecords.filter(r => r.category === "مستبعد"),
    };
  }, [issuedChecks, legacyTransactions, normalizedSourceTransactions, openAdvances]);

  const visible = useMemo(() => {
    return analysis.records.filter(r => {
      if (filterType !== "all" && r.type !== filterType) return false;
      if (filterCategory !== "all" && r.category !== filterCategory) return false;
      if (searchQ) {
        const q = searchQ.toLowerCase();
        const match = (r.party + r.id + r.checkNum + (r.key || "")).toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [analysis.records, filterType, filterCategory, searchQ]);

  const TY = T;

  return (
    <div className={clsx("rounded-2xl border shadow-sm overflow-hidden animate-in fade-in duration-500", TY.card)}>
      {/* header */}
      <div className="p-4 border-b bg-rose-50/50 dark:bg-rose-900/10">
        <h3 className="font-black text-[11px] uppercase tracking-widest flex items-center gap-2 mb-3">
          <AlertCircle size={14} className="text-rose-600" />
          تشخيص الشيكات — تحليل الظهور والتصنيف
        </h3>
        <div className="flex flex-wrap gap-4 text-[10px] font-black">
          <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800">الإجمالي: {analysis.records.length}</span>
          <span className="px-3 py-1.5 rounded-xl bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">مسوى: {analysis.settled.length}</span>
          <span className="px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">مسودة: {analysis.draft.length}</span>
          <span className="px-3 py-1.5 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">مفتوح: {analysis.open.length}</span>
          {analysis.missing.length > 0 && (
            <span className="px-3 py-1.5 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 animate-pulse">مفقود: {analysis.missing.length}</span>
          )}
          <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800">مستبعد: {analysis.excluded.length}</span>
        </div>
      </div>

      {/* filters */}
      <div className="p-3 border-b flex flex-wrap gap-2 items-center bg-slate-50/50 dark:bg-slate-900/20">
        <div className="relative">
          <Search size={13} className="absolute right-3 top-2.5 text-slate-400" />
          <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="بحث..." className={clsx("pr-9 pl-4 py-2 rounded-xl border text-[11px] font-bold outline-none focus:ring-2 w-48", TY.inp)} />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className={clsx("px-3 py-2 rounded-xl border text-[11px] font-bold outline-none", TY.sel)}>
          <option value="all">كل الأنواع</option>
          {[...new Set(analysis.records.map(r => r.type))].sort().map(t => (
            <option key={t} value={t}>{analysis.records.find(r => r.type === t)?.typeLabel || t}</option>
          ))}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className={clsx("px-3 py-2 rounded-xl border text-[11px] font-bold outline-none", TY.sel)}>
          <option value="all">كل التصنيفات</option>
          <option value="مسوى">مسوى</option>
          <option value="مسودة">مسودة</option>
          <option value="مفتوح">مفتوح</option>
          <option value="مفقود">مفقود ⚠️</option>
          <option value="مستبعد">مستبعد</option>
        </select>
        <div className="text-[10px] font-bold text-slate-400">النتائج: {visible.length}</div>
      </div>

      {/* table */}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-right text-[10px]">
          <thead className="bg-slate-100/80 dark:bg-slate-800/50 border-b-2 border-slate-200 dark:border-slate-700 sticky top-0 z-10">
            <tr>
              {["المسؤول", "النوع", "رقم الشيك", "التاريخ", "المبلغ", "المصدر", "الحالة", "التصنيف", "سبب التصنيف", "الإجراءات"].map((h, i) => (
                <th key={i} className="p-2 font-black text-slate-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {visible.length === 0 ? (
              <tr><td colSpan={9} className="p-8 text-center text-slate-400 font-bold text-[11px]">لا توجد نتائج</td></tr>
            ) : visible.slice(0, diagVisibleCount).map((r, idx) => {
              const catBg = r.category === "مسوى" ? "bg-teal-50 dark:bg-teal-900/10" :
                r.category === "مسودة" ? "bg-amber-50 dark:bg-amber-900/10" :
                  r.category === "مفتوح" ? "bg-blue-50 dark:bg-blue-900/10" :
                    r.category === "مفقود" ? "bg-red-50 dark:bg-red-900/10" : "";
              const catColor = r.category === "مسوى" ? "text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/30" :
                r.category === "مسودة" ? "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30" :
                  r.category === "مفتوح" ? "text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30" :
                    r.category === "مفقود" ? "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 animate-pulse" :
                      "text-slate-500 bg-slate-100 dark:bg-slate-800";
              return (
                <tr key={`${r.id}-${r.source}-${idx}`} className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors ${catBg}`}>
                  <td className="p-2 font-black text-slate-800 dark:text-slate-100 whitespace-nowrap">{r.party || "—"}</td>
                  <td className="p-2 font-bold text-slate-500">{r.typeLabel}</td>
                  <td className="p-2 font-bold text-slate-500">{r.checkNum ? fmtInt(r.checkNum) : "—"}</td>
                  <td className="p-2 font-bold text-slate-400">{r.date || "—"}</td>
                  <td className="p-2 font-black text-slate-600">{fmtMoney(r.amount)}</td>
                  <td className="p-2 text-[9px] font-bold text-slate-400">{r.source}</td>
                  <td className="p-2 font-bold">
                    <span className={clsx("px-2 py-0.5 rounded-lg text-[9px] font-black", r.state === "posted" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                      {r.state}
                    </span>
                  </td>
                  <td className="p-2">
                    <span className={clsx("px-2 py-0.5 rounded-lg text-[9px] font-black whitespace-nowrap", catColor)}>
                      {r.category === "مفقود" ? "⚠️ " : ""}{r.category}
                    </span>
                  </td>
                  <td className="p-2 text-[9px] font-bold text-slate-500 max-w-[200px] leading-tight" title={r.reason}>
                    {r.reason || "—"}
                  </td>
                  <td className="p-2 text-left whitespace-nowrap">
                    {actionLoading[r.id] ? (
                      <span className="text-[9px] text-slate-400">جاري...</span>
                    ) : r.source === "issued_checks" && !r.isGrouped && ["مسوى", "مسودة", "مفقود", "مستبعد"].includes(r.category) ? (
                      <button
                        onClick={() => setConfirmReset(r)}
                        className={clsx("px-2 py-1 text-white rounded-lg text-[9px] font-black transition-all active:scale-95", r.category === "مسوى" ? "bg-red-500 hover:bg-red-600" : "bg-red-500 hover:bg-red-600")}
                        title="حذف كل التسويات وإعادة الشيك مفتوحاً">
                        حذف التسويات
                      </button>
                    ) : r.category === "مفقود" && r.state !== "posted" && r.state !== "approved" ? (
                      <button
                        onClick={() => handleFixState(r)}
                        className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[9px] font-black transition-all active:scale-95"
                        title="تعديل الحالة إلى posted">
                        إصلاح الحالة
                      </button>
                    ) : r.category === "مستبعد" && r.type === "advance" && !r.isGrouped ? (
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => setConfirmReset(r)}
                          className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[9px] font-black transition-all active:scale-95"
                          title="حذف كل التسويات وإعادة الشيك مفتوحاً">
                          حذف التسويات
                        </button>
                        <button
                          onClick={() => handleEnableSettlement(r)}
                          className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[9px] font-black transition-all active:scale-95"
                          title="تفعيل التسوية فقط">
                          تفعيل التسوية
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length > diagVisibleCount && (
          <button
            onClick={() => setDiagVisibleCount((v) => v + 100)}
            className="w-full py-2.5 text-[11px] font-black text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors border-t border-slate-100 dark:border-slate-800"
          >
            عرض المزيد ({visible.length - diagVisibleCount} متبقٍ)
          </button>
        )}
      </div>

      {/* تأكيد إعادة التعيين */}
      {confirmReset && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmReset(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border p-4 sm:p-6 max-w-md w-full mx-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={20} className="text-red-500 shrink-0" />
              <h3 className="font-black text-[13px]">تأكيد إعادة تعيين الشيك</h3>
            </div>
            <div className="space-y-2 text-[11px] font-bold mb-5">
              <p>هل أنت متأكد من إعادة تعيين الشيك التالي؟</p>
              <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-3 space-y-1">
                <p><span className="text-slate-400">المسؤول:</span> {confirmReset.party || "—"}</p>
                <p><span className="text-slate-400">النوع:</span> {confirmReset.typeLabel} ({confirmReset.type})</p>
                <p><span className="text-slate-400">المبلغ:</span> {fmtMoney(confirmReset.amount)}</p>
                <p><span className="text-slate-400">السبب:</span> {confirmReset.reason}</p>
              </div>
              <p className="text-[10px] text-red-500">سيتم حذف كل أثر للتسوية (isSettled, hasDraftSettlement, settlementExpenses, settlementSpent, settlementReturned, settlementGroup*) وإعادة الشيك إلى قائمة الغير مسواة للعمل عليها من جديد.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmReset(null)} className="px-4 py-2 rounded-xl border text-[11px] font-black text-slate-600 hover:bg-slate-50 transition-colors">إلغاء</button>
              <button onClick={() => handleResetCheck(confirmReset)} className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[11px] font-black transition-all active:scale-95 flex items-center gap-2">
                <RotateCcw size={14} /> تأكيد إعادة التعيين
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast محلي */}
      {dToast && (
        <div className={clsx("fixed bottom-6 left-6 max-w-[calc(100vw-3rem)] z-[9999] px-5 py-3 rounded-2xl text-[11px] font-black shadow-2xl transition-all animate-in slide-in-from-bottom-4 duration-300", dToast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white")}>
          {dToast.msg}
        </div>
      )}
    </div>
  );
}

export default function SettlementTab() {
  const T = useT();
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState("current");
  const [issuedChecks, setIssuedChecks] = useState([]);
  const [legacyTransactions, setLegacyTransactions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [boardTerms, setBoardTerms] = useState([]);
  const [boardMemberships, setBoardMemberships] = useState([]);
  const [boardMeetings, setBoardMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [editingExpense, setEditingExpense] = useState(null);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [settlementToDelete, setSettlementToDelete] = useState(null);
  const [expCat, setExpCat] = useState(INITIAL_CATS[0]);
  const [expDate, setExpDate] = useState(getTodayISO());
  const [expAmt, setExpAmt] = useState("");
  const [expNotes, setExpNotes] = useState("");
  const [expMeetingId, setExpMeetingId] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [prizeRecipients, setPrizeRecipients] = useState([]);
  const [prizeSearch, setPrizeSearch] = useState("");
  const [prizeMeta, setPrizeMeta] = useState({ contestName: "", decisionNo: "", minutesNo: "" });
  const prizeTotalAmount = useMemo(() => prizeTotal(prizeRecipients), [prizeRecipients]);
  const [collectedSubs, setCollectedSubs] = useState("");
  const [settlementDate, setSettlementDate] = useState(getTodayISO());
  const [settlementSelectionMode, setSettlementSelectionMode] = useState("single");
  const [selAdvId, setSelAdvId] = useState("");
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [editingSettlementId, setEditingSettlementId] = useState("");
  const [confirmModalData, setConfirmModalData] = useState(null);
  const [returnMode, setReturnMode] = useState("carry_forward");
  const [_returnedActually, setReturnedActually] = useState(false);
  const [returnDepositDate, setReturnDepositDate] = useState(getTodayISO());
  const [returnDepositReference, setReturnDepositReference] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveMonth, setArchiveMonth] = useState("all");
  const [archiveYear, setArchiveYear] = useState("all");
  const [archiveVisibleCount, setArchiveVisibleCount] = useState(50);
  const [showMigration, setShowMigration] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationReport, setMigrationReport] = useState(null);

  const dataUrlHits = useMemo(
    () => collectDataUrlAttachments({ issuedChecks, legacyTransactions }),
    [issuedChecks, legacyTransactions]
  );

  const runAttachmentMigration = async () => {
    if (dataUrlHits.length === 0) return;
    if (!window.confirm(`سيتم رفع ${dataUrlHits.length} مرفقاً للسحابة أولاً، ولا تُمس المستندات إلا بعد نجاح الرفع كاملاً. متابعة؟`)) return;
    setMigrating(true);
    setMigrationReport(null);
    try {
      const uploaded = [];
      for (const hit of dataUrlHits) {
        const sourceList = hit.collection === "issued_checks" ? issuedChecks : legacyTransactions;
        const sourceDoc = sourceList.find((d) => d.id === hit.docId);
        const currentUrl = hit.field.startsWith("settlementExpenses:")
          ? sourceDoc?.settlementExpenses?.find((e) => e.id === hit.expenseId)?.files?.[hit.fileIndex]?.url
          : sourceDoc?.attachments?.[hit.fileIndex]?.url;
        if (!isDataUrl(currentUrl)) continue;
        const fileName = `${hit.label || "attachment"}`;
        const url = await uploadDataUrlToStorage(currentUrl, fileName);
        uploaded.push({ hit, url, legacyUrl: currentUrl });
      }
      if (uploaded.length === 0) {
        setMigrationReport({ ok: false, msg: "لا توجد مرفقات صالحة للترحيل (ربما رُحّلت مسبقاً)." });
        return;
      }
      const byDoc = new Map();
      uploaded.forEach(({ hit, url, legacyUrl }) => {
        const key = `${hit.collection}:${hit.docId}`;
        if (!byDoc.has(key)) byDoc.set(key, { collection: hit.collection, docId: hit.docId, files: [] });
        byDoc.get(key).files.push({ hit, url, legacyUrl });
      });
      const writeOps = [];
      byDoc.forEach(({ collection: colName, docId, files }) => {
        const sourceList = colName === "issued_checks" ? issuedChecks : legacyTransactions;
        const sourceDoc = sourceList.find((d) => d.id === docId);
        if (!sourceDoc) return;
        const next = JSON.parse(JSON.stringify(sourceDoc));
        delete next.id;
        files.forEach(({ hit, url, legacyUrl }) => {
          if (hit.field.startsWith("settlementExpenses:")) {
            const expense = (next.settlementExpenses || []).find((e) => e.id === hit.expenseId);
            const file = expense?.files?.[hit.fileIndex];
            if (file && isDataUrl(file.url)) {
              file.url = url;
              file.legacyUrl = legacyUrl;
              file.storagePending = false;
            }
          } else {
            const file = next.attachments?.[hit.fileIndex];
            if (file && isDataUrl(file.url)) {
              file.url = url;
              file.legacyUrl = legacyUrl;
              file.storagePending = false;
            }
          }
        });
        writeOps.push({ type: "set", ref: doc(db, colName, docId), data: next, merge: true });
      });
      await commitInChunks(db, writeOps);
      let verified = 0;
      for (const { collection: colName, docId, files } of byDoc.values()) {
        const snap = await getDoc(doc(db, colName, docId));
        const data = snap.data() || {};
        const ok = files.every(({ hit, url }) => {
          const current = hit.field.startsWith("settlementExpenses:")
            ? data.settlementExpenses?.find((e) => e.id === hit.expenseId)?.files?.[hit.fileIndex]?.url
            : data.attachments?.[hit.fileIndex]?.url;
          return current === url;
        });
        if (ok) verified += 1;
      }
      await logAuditEvent("attachments.migrated_to_storage", {
        uploaded: uploaded.length,
        docs: byDoc.size,
        verified,
        riskLevel: "medium",
      });
      setMigrationReport({
        ok: verified === byDoc.size,
        msg: `رُفع ${uploaded.length} مرفق في ${byDoc.size} مستند — تم التحقق من ${verified}. الأصل محفوظ بحقل legacyUrl للتراجع.`,
      });
    } catch (e) {
      console.error(e);
      setMigrationReport({ ok: false, msg: `توقف الترحيل قبل أي كتابة: ${e.message || ""} — لم تُمس المستندات.` });
    } finally {
      setMigrating(false);
    }
  };
  const [archiveViewKey, setArchiveViewKey] = useState("");
  const currentArchiveKey = `${archiveSearch}|${archiveMonth}|${archiveYear}`;
  if (archiveViewKey !== currentArchiveKey) {
    setArchiveViewKey(currentArchiveKey);
    setArchiveVisibleCount(50);
  }
  const [recoveryModalData, setRecoveryModalData] = useState(null);
  const { showToast: globalToast } = useAlert();

  // ========================================================
  // 🟢 المتغيرات المفقودة التي تمت إضافتها لمنع الانهيار
  // ========================================================
  const [expFiles, setExpFiles] = useState([]);
  const [recoveryReason, setRecoveryReason] = useState("");
  const [showRecoveryConfirm, setShowRecoveryConfirm] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const lastLoadedSelectionKeyRef = useRef(null);

  // الدالة المفقودة للتحكم في حالة إعادة المتبقي
  const resetSettlementReturnState = useCallback((mode = "carry_forward") => {
    setReturnMode(mode);
    setReturnedActually(mode === "cash_return");
    setReturnDepositDate(getTodayISO());
    setReturnDepositReference("");
  }, []);
  // ========================================================

  const showToast = useCallback(
    (msg, type = "success") => globalToast(repairArabicMojibake(msg), type, 4000),
    [globalToast]
  );

  const requireSettlementPermission = useCallback((permission, message) => {
    if (can(permission)) return true;
    showToast(message, "error");
    return false;
  }, [can, showToast]);

  useEffect(() => {
    let checksReady = false;
    let legacyReady = false;
    let empsReady = false;
    let termsReady = false;
    let membershipsReady = false;
    let meetingsReady = false;
    const finishLoading = () => {
      if (checksReady && legacyReady && empsReady && termsReady && membershipsReady && meetingsReady) setLoading(false);
    };

    const qChecks = query(collection(db, "issued_checks"), orderBy("date", "desc"));
    const unsubChecks = onSnapshot(qChecks, snap => {
      setIssuedChecks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      checksReady = true;
      finishLoading();
    }, err => {
      console.error("issued_checks:", err);
      setIssuedChecks([]);
      checksReady = true;
      finishLoading();
    });

    const qLegacy = query(collection(db, "transactions"), orderBy("date", "desc"));
    const unsubLegacy = onSnapshot(qLegacy, snap => {
      setLegacyTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      legacyReady = true;
      finishLoading();
    }, err => {
      console.error("transactions:", err);
      setLegacyTransactions([]);
      legacyReady = true;
      finishLoading();
    });

    const qEmps = query(collection(db, "employees"));
    const unsubEmps = onSnapshot(qEmps, snap => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      empsReady = true;
      finishLoading();
    }, err => {
      console.error("employees:", err);
      setEmployees([]);
      empsReady = true;
      finishLoading();
    });

    const qTerms = query(collection(db, BOARD_TERMS_COLLECTION));
    const unsubTerms = onSnapshot(qTerms, snap => {
      setBoardTerms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      termsReady = true;
      finishLoading();
    }, err => {
      console.error("board_terms:", err);
      setBoardTerms([]);
      termsReady = true;
      finishLoading();
    });

    const qMemberships = query(collection(db, BOARD_MEMBERSHIPS_COLLECTION));
    const unsubMemberships = onSnapshot(qMemberships, snap => {
      setBoardMemberships(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      membershipsReady = true;
      finishLoading();
    }, err => {
      console.error("board_memberships:", err);
      setBoardMemberships([]);
      membershipsReady = true;
      finishLoading();
    });

    const qMeetings = query(collection(db, "board_meetings"), where("status", "==", "held"));
    const unsubMeetings = onSnapshot(qMeetings, snap => {
      setBoardMeetings(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      );
      meetingsReady = true;
      finishLoading();
    }, err => {
      console.error("board_meetings:", err);
      setBoardMeetings([]);
      meetingsReady = true;
      finishLoading();
    });

    return () => { unsubChecks(); unsubLegacy(); unsubEmps(); unsubTerms(); unsubMemberships(); unsubMeetings(); };
  }, []);

  const sourceTransactions = useMemo(
    () => mergeIssuedChecksSourcesNormalized(issuedChecks, legacyTransactions),
    [issuedChecks, legacyTransactions]
  );

  const normalizedSourceTransactions = sourceTransactions;
  const settlementBaseline = useMemo(
    () => buildSettlementBaseline(normalizedSourceTransactions),
    [normalizedSourceTransactions]
  );

  const getIssuedCheckDocId = (tx) => {
    if (!tx) return "";
    if (tx.legacySourceId) return tx.id;
    if (tx.sourceCollection === "issued_checks") return tx.id;
    return isLegacyCheckType(tx.type) ? buildLegacyIssuedCheckId(tx.id) : tx.id;
  };

  const buildIssuedCheckRecord = (tx, overrides = {}) => {
    const now = new Date().toISOString();
    const normalizedType = normalizeIssuedCheckType(tx?.type);
    const requiresSettlement = normalizeRequiresSettlement(tx);
    const targetId = getIssuedCheckDocId(tx);
    const isLegacySource = isLegacyCheckType(tx?.type) && !tx?.legacySourceId && tx?.sourceCollection !== "issued_checks";

    const rawRecord = {
      ...tx,
      id: targetId || "",
      type: normalizedType || "",
      party: getIssuedCheckDisplayParty(tx) || "",
      requires_settlement: requiresSettlement ?? true,
      requiresSettlement: requiresSettlement ?? true,
      settlement_mode:
        tx?.settlement_mode ||
        tx?.settlementMode ||
        getSettlementMode(
          normalizedType,
          requiresSettlement ?? getDefaultRequiresSettlement(normalizedType)
        ) || "",
      updatedAt: now,
      createdAt: tx?.createdAt || now,
      state: tx?.state || "posted",
      legacySourceId: tx?.legacySourceId || (isLegacySource ? tx.id : ""),
      sourceTransactionId:
        tx?.sourceTransactionId || (isLegacySource ? tx.id : ""),
      legacySourceCollection:
        tx?.legacySourceCollection || (isLegacySource ? "transactions" : ""),
      migratedFromLegacy: Boolean(tx?.migratedFromLegacy || isLegacySource),
      originalLegacyType:
        tx?.originalLegacyType || (isLegacySource ? tx.type : ""),
      ...overrides,
    };

    // إزالة أي قيمة undefined لتفادي توقف Firebase
    Object.keys(rawRecord).forEach(key => {
      if (rawRecord[key] === undefined) {
        delete rawRecord[key];
      }
    });

    return rawRecord;
  };

  const selectedMeeting = useMemo(() => {
    const targetMeetingId = toEntityId(expMeetingId);
    if (!targetMeetingId) return null;
    return boardMeetings.find((meeting) => toEntityId(meeting?.id) === targetMeetingId) || null;
  }, [boardMeetings, expMeetingId]);

  const activeBoardTerm = useMemo(
    () =>
      getActiveBoardTerm(boardTerms, {
        startDate: BOARD_TERM_START,
        endDate: BOARD_TERM_END,
        title: "الدورة الحالية",
        targetSeats: 11,
      }),
    [boardTerms]
  );

  const effectiveBoardMemberships = useMemo(() => {
    if (boardMemberships.length > 0) return boardMemberships;
    return buildLegacyBoardMemberships(employees, activeBoardTerm);
  }, [activeBoardTerm, boardMemberships, employees]);

  const allowanceReferenceDate = useMemo(() => {
    if (isMeetingAllowanceCategory(expCat) && selectedMeeting?.date) return selectedMeeting.date;
    if (isTravelAllowanceCategory(expCat)) return expDate || getTodayISO();
    return getTodayISO();
  }, [expCat, expDate, selectedMeeting]);

  const historicalMeetingMembers = useMemo(() => {
    if (!selectedMeeting) return [];
    const employeesMap = new Map(employees.map((employee) => [toEntityId(employee.id), employee]));
    const attendanceRecords = getMeetingAttendanceRecords(selectedMeeting);

    if (attendanceRecords.length > 0) {
      return attendanceRecords.map((record) => {
        const memberId = toEntityId(record.memberId);
        const employee = employeesMap.get(memberId) || {};
        return {
          ...employee,
          id: memberId,
          name: record.memberName || employee.name || "—",
          boardRoleTitle: record.role || employee.boardRoleTitle || employee.membershipStatus || "—",
          membershipStatus: record.role || employee.membershipStatus || "—",
          memberState: record.memberStateAtMeeting || employee.memberState || "",
          workplace: record.workplace || employee.workplace || "",
          jobTitle: record.jobTitle || employee.jobTitle || "",
          boardMembership: {
            id: record.membershipId || "",
            termId: selectedMeeting.termId || activeBoardTerm?.id || "",
            role: record.role || "",
          },
        };
      });
    }

    return (selectedMeeting.attendees || [])
      .map((memberId) => employeesMap.get(toEntityId(memberId)))
      .filter(Boolean);
  }, [activeBoardTerm?.id, employees, selectedMeeting]);

  const activeBoardMembers = useMemo(() => {
    const membershipMembers = getEligibleBoardMemberViews({
      memberships: effectiveBoardMemberships,
      employees,
      termId: selectedMeeting?.termId || activeBoardTerm?.id || "",
      onDate: allowanceReferenceDate,
    });
    if (membershipMembers.length > 0) return membershipMembers;
    return employees.filter((employee) => isBoardMemberEligibleForSettlementDate(employee, allowanceReferenceDate));
  }, [activeBoardTerm?.id, allowanceReferenceDate, effectiveBoardMemberships, employees, selectedMeeting?.termId]);

  const selectableBoardMembers = useMemo(() => {
    if (!isBoardAllowanceCategory(expCat)) return activeBoardMembers;
    if (historicalMeetingMembers.length > 0) return historicalMeetingMembers;

    const termId = selectedMeeting?.termId || activeBoardTerm?.id || "";
    const termViews = buildBoardMemberViewsFromMemberships(
      effectiveBoardMemberships || [],
      employees,
      termId ? { termId } : {}
    );

    const merged = [...termViews];
    const uniqueMembers = new Map();
    merged.forEach((member) => {
      const memberId = toEntityId(member?.id);
      if (memberId && !uniqueMembers.has(memberId)) uniqueMembers.set(memberId, { ...member, id: memberId });
    });
    return sortBoardMembersUnified(Array.from(uniqueMembers.values()));
  }, [activeBoardMembers, effectiveBoardMemberships, employees, expCat, historicalMeetingMembers, selectedMeeting?.termId, activeBoardTerm?.id]);

  const selectableBoardMembersMap = useMemo(
    () => new Map(selectableBoardMembers.map((member) => [toEntityId(member.id), member])),
    [selectableBoardMembers]
  );

  const prizeSearchPool = useMemo(() => {
    const pool = new Map();
    (employees || []).forEach((e) => {
      const key = String(e.jobId || e.id || "").trim();
      if (key && !pool.has(key)) pool.set(key, e);
    });
    (activeBoardMembers || []).forEach((m) => {
      const key = String(m.jobId || m.id || "").trim();
      if (key && !pool.has(key)) {
        pool.set(key, {
          id: m.id || key,
          jobId: m.jobId || "",
          name: m.name || "—",
          nationalId: m.nationalId || "",
          membershipStatus: m.membershipStatus || "عضو مجلس إدارة",
          memberState: m.memberState || "",
        });
      }
    });
    return Array.from(pool.values());
  }, [employees, activeBoardMembers]);

  const prizeEmployeesResults = useMemo(() => {
    const q = prizeSearch.trim();
    if (q.length < 2) return [];
    return prizeSearchPool
      .filter((e) => `${e.name || ""} ${e.jobId || ""} ${e.nationalId || ""}`.includes(q))
      .slice(0, 8);
  }, [prizeSearchPool, prizeSearch]);

  const buildExpenseBoardMemberSnapshots = useCallback((memberIds = []) => {
    const employeesMap = new Map(employees.map((employee) => [toEntityId(employee.id), employee]));
    return (memberIds || [])
      .map((memberId) => {
        const normalizedMemberId = toEntityId(memberId);
        if (!normalizedMemberId) return null;
        const scopedMember =
          selectableBoardMembersMap.get(normalizedMemberId) ||
          historicalMeetingMembers.find((member) => toEntityId(member.id) === normalizedMemberId) ||
          activeBoardMembers.find((member) => toEntityId(member.id) === normalizedMemberId) ||
          employeesMap.get(normalizedMemberId) ||
          null;
        if (!scopedMember) return null;

        return {
          memberId: normalizedMemberId,
          name: scopedMember.name || "—",
          role:
            scopedMember.boardMembership?.role ||
            scopedMember.boardRoleTitle ||
            scopedMember.membershipStatus ||
            "—",
          membershipId: scopedMember.boardMembership?.id || "",
          termId: scopedMember.boardMembership?.termId || activeBoardTerm?.id || "",
          memberState: scopedMember.memberState || "",
          jobId: scopedMember.jobId || "",
          workplace: scopedMember.workplace || "",
          jobTitle: scopedMember.jobTitle || "",
        };
      })
      .filter(Boolean);
  }, [activeBoardMembers, activeBoardTerm?.id, employees, historicalMeetingMembers, selectableBoardMembersMap]);

  useEffect(() => {
    if (isMeetingAllowanceCategory(expCat)) {
      if (selectedMeeting) {
        const allowedIds = new Set(selectableBoardMembers.map((member) => toEntityId(member.id)));
        const memberIdsFromMeeting = historicalMeetingMembers.length > 0
          ? historicalMeetingMembers.map((member) => toEntityId(member.id))
          : (selectedMeeting.attendees || []).map((memberId) => toEntityId(memberId));
        setSelectedMembers(memberIdsFromMeeting.filter((memberId) => allowedIds.has(memberId)));
      } else {
        setSelectedMembers([]);
      }
      return;
    }

    if (isBoardAllowanceCategory(expCat)) {
      setExpMeetingId("");
      setSelectedMembers((prev) =>
        prev.filter((memberId) =>
          selectableBoardMembers.some((member) => toEntityId(member.id) === toEntityId(memberId))
        )
      );
      return;
    }

    setSelectedMembers([]);
    setExpMeetingId("");
  }, [expCat, historicalMeetingMembers, selectableBoardMembers, selectedMeeting]);

  useEffect(() => {
    if (
      isMeetingAllowanceCategory(expCat) &&
      selectedMeeting?.date &&
      !editingExpense?.id &&
      (!expDate || expDate === getTodayISO())
    ) {
      setExpDate(selectedMeeting.date);
    }
  }, [editingExpense?.id, expCat, expDate, selectedMeeting]);

  const archivedSettlements = useMemo(
    () =>
      normalizedSourceTransactions.filter(
        (tx) => normalizeRequiresSettlement(tx) && !!tx.isSettled && !isGroupedSettlementFollowerRecord(tx)
      ),
    [normalizedSourceTransactions]
  );

  const draftSettlements = useMemo(
    () =>
      normalizedSourceTransactions.filter(
        (tx) => normalizeRequiresSettlement(tx) && !tx.isSettled && tx.hasDraftSettlement && !isGroupedSettlementFollowerRecord(tx)
      ),
    [normalizedSourceTransactions]
  );

  const editingSettlement = useMemo(
    () => archivedSettlements.find((t) => toEntityId(t.id) === toEntityId(editingSettlementId)) || null,
    [archivedSettlements, editingSettlementId]
  );

  const archiveYears = useMemo(
    () => [...new Set(archivedSettlements.map(s => getYearValue(getSettlementApprovalDate(s))).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [archivedSettlements]
  );

  const filteredArchivedSettlements = useMemo(() => {
    return archivedSettlements
      .filter((s) => {
        const person = s.employeeName || s.party || "";
        const checkNo = String(s.checkNo || "");
        const refDate = getSettlementApprovalDate(s);
        const searchOk = !archiveSearch || person.includes(archiveSearch) || checkNo.includes(archiveSearch);
        const monthOk = archiveMonth === "all" || getMonthValue(refDate) === archiveMonth;
        const yearOk = archiveYear === "all" || getYearValue(refDate) === archiveYear;
        return searchOk && monthOk && yearOk;
      })
      .sort((a, b) => {
        const timeDiff = getSettlementSortTimestamp(b) - getSettlementSortTimestamp(a);
        if (timeDiff !== 0) return timeDiff;
        return String(getSettlementApprovalDate(b)).localeCompare(String(getSettlementApprovalDate(a)));
      });
  }, [archivedSettlements, archiveMonth, archiveSearch, archiveYear]);

  const archiveTableRows = useMemo(
    () =>
      filteredArchivedSettlements.slice(0, archiveVisibleCount).map((settlement) => {
        const advanceAmount = Number(settlement.settlementGroupAdvanceAmountBase || settlement.advanceAmountBase || settlement.amount || 0);
        const previousBalance = Number(settlement.settlementGroupPrevBalanceUsed || settlement.prevBalanceUsed || 0);
        const subscriptionAmount = Number(settlement.settlementGroupCollectedSubscriptions || settlement.collectedSubscriptions || 0);
        const settlementMode = settlement.settlement_mode || settlement.settlementMode || "";
        return {
          id: settlement.id,
          record: settlement,
          approvalDate: getSettlementApprovalDate(settlement),
          partyName: settlement.employeeName || settlement.party || "—",
          typeLabel:
            settlementMode === "check_plus_subscriptions"
              ? "رحلة"
              : settlementMode === "carry_forward"
                ? "سلفة عادية"
                : "شيك تسوية / فاعلية",
          advanceAmount,
          previousBalance,
          subscriptionAmount,
          availableAmount: advanceAmount + previousBalance + subscriptionAmount,
          spentAmount: Number(settlement.settlementSpent || 0),
          remainingAmount: getSettlementEffectiveRemaining(settlement),
          returnLabel: getSettlementReturnedLabel(settlement),
          returnMode: getSettlementReturnMode(settlement),
          checkNumber: formatCheckNumber(settlement.checkNum || settlement.checkNo),
          groupCount: Number(settlement.settlementGroupMemberIds?.length || settlement.settlementGroupCount || 1),
        };
      }),
    [archiveVisibleCount, filteredArchivedSettlements]
  );

  const hiddenSettledSettlements = useMemo(() => {
    const archivedKeys = new Set(archivedSettlements.map((t) => getIssuedCheckSourceKey(t)));
    const out = [];
    const collect = (tx, source) => {
      if (!normalizeRequiresSettlement(tx) || !tx.isSettled) return;
      const key = getIssuedCheckSourceKey(tx);
      if (archivedKeys.has(key)) return;
      const groupId = String(tx.settlementGroupId || tx.settlement_group_id || "").trim();
      const leaderId = String(tx.settlementGroupLeaderId || "").trim();
      const isGrouped = Boolean(groupId || leaderId || tx.settlementGroupCount > 1 || tx.settlementGroupFollower);
      const isFollower = isGroupedSettlementFollowerRecord(tx);
      const party = getIssuedCheckDisplayParty(tx) || "—";
      const type = normalizeIssuedCheckType(tx.type);
      const amount = Number(tx.advanceAmountBase || tx.amount || 0);
      out.push({
        uid: `${source}:${tx.id}`,
        party,
        typeLabel: getIssuedCheckTypeLabel(type),
        amount,
        date: tx.date || "",
        checkNum: tx.checkNum || "",
        isGrouped,
        groupId,
        leaderId,
        reason: isFollower
          ? "تابع لتسوية مجمعة — معتمد ضمن قائد المجموعة ولا يظهر منفرداً في الأرشيف"
          : "مسوى (isSettled) لكن مفتاحه غائب عن الأرشيف — سجل مكرر أو من مصدر مختلف",
        record: {
          id: tx.id,
          targetDocId: source === "issued_checks" ? tx.id : buildLegacyIssuedCheckId(tx.id),
          key,
          source,
          party,
          type,
          typeLabel: getIssuedCheckTypeLabel(type),
          amount,
          date: tx.date || "",
          checkNum: tx.checkNum || "",
          state: tx.state || "posted",
          isGrouped,
          reason: "تسوية مسواة مخفية عن الأرشيف",
        },
      });
    };
    (issuedChecks || []).forEach((tx) => collect(tx, "issued_checks"));
    (legacyTransactions || []).forEach((tx) => { if (isLegacyCheckType(tx.type)) collect(tx, "transactions"); });
    return out.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [archivedSettlements, issuedChecks, legacyTransactions]);

  const prevBalanceIndex = useMemo(() => {
    const map = new Map();
    archivedSettlements.forEach((settlement) => {
      const key = getSettlementPersonKey(settlement);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(settlement);
    });
    map.forEach((list) => list.sort(compareSettlementSequenceDesc));
    return map;
  }, [archivedSettlements]);

  const getPrevBalance = useCallback((empId, currentTxnId, currentTxn = null) => {
    const personKey = toEntityId(empId || getSettlementPersonKey(currentTxn || {}));
    if (!personKey) return 0;
    const currentChequeDateTimestamp = getDateTimestamp(getSettlementChequeDate(currentTxn || {}));
    const currentChequeNumber = getSettlementChequeNumber(currentTxn || {});

    const history = prevBalanceIndex.get(personKey) || [];
    const latestSettlement = history.find((settlement) => {
      if (settlement.id === currentTxnId) return false;
      const settlementChequeDateTimestamp = getDateTimestamp(getSettlementChequeDate(settlement));
      const settlementChequeNumber = getSettlementChequeNumber(settlement);

      if (!currentChequeDateTimestamp || !settlementChequeDateTimestamp) return true;
      if (settlementChequeDateTimestamp < currentChequeDateTimestamp) return true;
      if (settlementChequeDateTimestamp > currentChequeDateTimestamp) return false;

      if (!currentChequeNumber || !settlementChequeNumber) return true;
      return settlementChequeNumber < currentChequeNumber;
    });

    return latestSettlement && getSettlementReturnMode(latestSettlement) === "carry_forward"
      ? parseArabicNumber(latestSettlement.settlementReturned ?? 0)
      : 0;
  }, [prevBalanceIndex]);

  const openAdvances = useMemo(
    () =>
      normalizedSourceTransactions
        .filter((t) => normalizeRequiresSettlement(t) && !t.isSettled && (!t.state || POSTED_SETTLEMENT_STATES.has(t.state)))
        .map((adv) => ({ ...adv, prevBalance: getPrevBalance(adv.employeeId, adv.id, adv) })),
    [getPrevBalance, normalizedSourceTransactions]
  );

  const txByDocId = useMemo(() => {
    const map = new Map();
    normalizedSourceTransactions.forEach((tx) => {
      const key = toEntityId(getIssuedCheckDocId(tx) || tx.id);
      if (key && !map.has(key)) map.set(key, tx);
    });
    return map;
  }, [normalizedSourceTransactions]);

  const settlementGroupIndex = useMemo(() => {
    const map = new Map();
    const add = (prefix, value, tx) => {
      const key = String(value || "").trim();
      if (!key) return;
      const mapKey = `${prefix}:${key}`;
      if (!map.has(mapKey)) map.set(mapKey, []);
      map.get(mapKey).push(tx);
    };
    (issuedChecks || []).forEach((tx) => {
      add("g", tx.settlementGroupId || tx.settlement_group_id, tx);
      add("l", tx.settlementGroupLeaderId, tx);
      add("i", tx.id, tx);
    });
    return map;
  }, [issuedChecks]);

  const currentTxnOptions = useMemo(() => {
    const txMap = new Map();
    const attachOption = (tx) => {
      if (!tx) return;
      const optionKey = toEntityId(getIssuedCheckDocId(tx) || tx.id);
      if (!optionKey || txMap.has(optionKey)) return;
      txMap.set(optionKey, {
        ...tx,
        prevBalance: getPrevBalance(tx.employeeId, tx.id, tx),
      });
    };

    if (editingSettlement) {
      attachOption(editingSettlement);
      (editingSettlement.settlementGroupMemberIds || []).forEach((groupedId) => {
        attachOption(txByDocId.get(toEntityId(groupedId)));
      });
    }

    openAdvances.forEach(adv => {
      attachOption(adv);
    });

    return Array.from(txMap.values());
  }, [editingSettlement, getPrevBalance, openAdvances, txByDocId]);

  const buildGroupedSettlementChecks = useCallback((settlement) => {
    const groupedIds =
      Array.isArray(settlement?.settlementGroupMemberIds) && settlement.settlementGroupMemberIds.length > 1
        ? settlement.settlementGroupMemberIds
        : [getIssuedCheckDocId(settlement)].filter(Boolean);

    return groupedIds
      .map((groupedId) => {
        const matched =
          txByDocId.get(toEntityId(groupedId)) ||
          (groupedId === getIssuedCheckDocId(settlement) ? settlement : null);
        if (!matched) return null;
        return {
          id: groupedId,
          date: getSettlementChequeDate(matched),
          checkNum: matched?.checkNum || matched?.checkNo || "",
          amount: Number(matched?.advanceAmountBase || matched?.amount || 0),
          party: getIssuedCheckDisplayParty(matched),
        };
      })
      .filter(Boolean)
      .sort(compareSettlementSequenceAsc);
  }, [txByDocId]);

  const printArchivedSettlementRow = useCallback((row) => {
    const settlement = row.record;
    printSettlementLocal({
      advanceTxn: settlement,
      expenses: settlement.settlementExpenses,
      spent: settlement.settlementSpent,
      remaining: row.remainingAmount,
      groupedChecks: buildGroupedSettlementChecks(settlement),
      prevBalance: row.previousBalance,
      collectedSubs: row.subscriptionAmount,
      returnMode: row.returnMode,
      bankDepositDate: settlement.bankDepositDate || "",
      bankDepositReference: settlement.bankDepositReference || "",
    });
  }, [buildGroupedSettlementChecks]);

  const selectedTxn = useMemo(
    () => currentTxnOptions.find((a) => toEntityId(a.id) === toEntityId(selAdvId)) || null,
    [currentTxnOptions, selAdvId]
  );

  const selectedBatchTransactions = useMemo(
    () => {
      const lookup = new Map();
      currentTxnOptions.forEach((tx) => {
        lookup.set(toEntityId(getIssuedCheckDocId(tx) || tx.id), tx);
      });
      normalizedSourceTransactions.forEach((tx) => {
        const optionKey = toEntityId(getIssuedCheckDocId(tx) || tx.id);
        if (!lookup.has(optionKey)) {
          lookup.set(optionKey, {
            ...tx,
            prevBalance: getPrevBalance(tx.employeeId, tx.id, tx),
          });
        }
      });

      return selectedBatchIds
        .map((groupedId) => lookup.get(toEntityId(groupedId)))
        .filter(Boolean);
    },
    [currentTxnOptions, getPrevBalance, normalizedSourceTransactions, selectedBatchIds]
  );

  const batchAnchorTxn = selectedBatchTransactions[0] || null;
  const batchSelectionConstraint = useMemo(() => {
    if (!batchAnchorTxn) return { employeeId: "", settlementMode: "" };
    return {
      employeeId: String(batchAnchorTxn.employeeId || batchAnchorTxn.party || ""),
      settlementMode: String(batchAnchorTxn.settlement_mode || batchAnchorTxn.settlementMode || ""),
    };
  }, [batchAnchorTxn]);

  const activeSelectionTransactions = settlementSelectionMode === "batch"
    ? selectedBatchTransactions
    : (selectedTxn ? [selectedTxn] : []);
  const activeSettlementTxn = activeSelectionTransactions[0] || null;
  const currentSettlementTxnId = activeSettlementTxn?.id || editingSettlementId || "";
  const editingExpenseAmount = parseArabicNumber(editingExpense?.amount ?? 0);
  const getSelectionPrevBalance = useCallback((transactions = []) => {
    const carryForwardItems = transactions
      .filter((tx) => (tx?.settlement_mode || tx?.settlementMode) === "carry_forward")
      .sort(compareSettlementSequenceAsc);

    return parseArabicNumber(carryForwardItems[0]?.prevBalance ?? 0);
  }, []);

  const toggleBatchTransaction = useCallback((tx) => {
    const nextId = toEntityId(getIssuedCheckDocId(tx) || tx?.id);
    if (!nextId) return;
    setSelectedBatchIds((prev) => {
      const normalizedPrev = prev.map((id) => toEntityId(id)).filter(Boolean);
      if (normalizedPrev.includes(nextId)) return normalizedPrev.filter((id) => id !== nextId);
      if (normalizedPrev.length === 0) return [...normalizedPrev, nextId];

      const anchor = currentTxnOptions.find((item) => toEntityId(getIssuedCheckDocId(item) || item.id) === normalizedPrev[0]) || null;
      const sameEmployee = String(anchor?.employeeId || anchor?.party || "") === String(tx.employeeId || tx.party || "");
      const sameMode = String(anchor?.settlement_mode || anchor?.settlementMode || "") === String(tx?.settlement_mode || tx?.settlementMode || "");
      if (!sameEmployee || !sameMode) return normalizedPrev;
      return [...normalizedPrev, nextId];
    });
  }, [currentTxnOptions]);

  const archivedReservedMeetingIds = useMemo(() => {
    const result = { sessions: new Set(), hospitality: new Set() };
    archivedSettlements.forEach((tx) => {
      if (!normalizeRequiresSettlement(tx) || tx.id === currentSettlementTxnId) return;
      (tx.settlementExpenses || []).forEach((expense) => {
        const allowanceType = getMeetingAllowanceType(expense.category);
        const meetingId = String(expense.meetingId || "").trim();
        if (!allowanceType || !meetingId) return;
        result[allowanceType].add(meetingId);
      });
    });
    return result;
  }, [archivedSettlements, currentSettlementTxnId]);

  const blockedMeetingIdsByType = useMemo(() => {
    const result = {
      sessions: new Set(archivedReservedMeetingIds.sessions),
      hospitality: new Set(archivedReservedMeetingIds.hospitality),
    };

    expenses.forEach((expense) => {
      if (editingExpense?.id && expense.id === editingExpense.id) return;
      const allowanceType = getMeetingAllowanceType(expense.category);
      const meetingId = String(expense.meetingId || "").trim();
      if (!allowanceType || !meetingId) return;
      result[allowanceType].add(meetingId);
    });

    return result;
  }, [archivedReservedMeetingIds, editingExpense, expenses]);

  const availableMeetings = useMemo(() => {
    const allowanceType = getMeetingAllowanceType(expCat);
    if (!allowanceType) return boardMeetings;

    return boardMeetings.filter((meeting) => !blockedMeetingIdsByType[allowanceType].has(String(meeting.id || "").trim()));
  }, [boardMeetings, blockedMeetingIdsByType, expCat]);

  const validateMeetingAllowanceExpenses = () => {
    const seenMeetingIdsByType = {
      sessions: new Set(),
      hospitality: new Set(),
    };

    const reservedElsewhereByType = {
      sessions: new Set(archivedReservedMeetingIds.sessions),
      hospitality: new Set(archivedReservedMeetingIds.hospitality),
    };

    for (const expense of expenses) {
      if (isPrizeCategory(expense.category)) {
        const prizeError = validatePrizeRecipients(expense.prizeRecipients);
        if (prizeError) return `فاتورة الجوائز غير صالحة: ${prizeError}`;
        if (Math.abs(prizeTotal(expense.prizeRecipients) - parseArabicNumber(expense.amount ?? 0)) > 0.01) {
          return "إجمالي فاتورة الجوائز لا يطابق مجموع مبالغ المستفيدين.";
        }
        continue;
      }
      const allowanceType = getMeetingAllowanceType(expense.category);
      if (!allowanceType) continue;

      const meetingId = String(expense.meetingId || "").trim();
      const meetingTitle =
        expense.meetingTitle ||
        boardMeetings.find((meeting) => toEntityId(meeting.id) === meetingId)?.title ||
        "الاجتماع المحدد";

      if (!meetingId) continue;

      if (reservedElsewhereByType[allowanceType].has(meetingId)) {
        return `تم صرف ${ALLOWANCE_TYPE_LABELS[allowanceType]} لهذا الاجتماع من قبل: ${meetingTitle}.`;
      }

      if (seenMeetingIdsByType[allowanceType].has(meetingId)) {
        return `تم إدراج ${ALLOWANCE_TYPE_LABELS[allowanceType]} لنفس الاجتماع أكثر من مرة داخل هذه التسوية: ${meetingTitle}.`;
      }

      seenMeetingIdsByType[allowanceType].add(meetingId);
    }

    return "";
  };

  useEffect(() => {
    if (!isMeetingAllowanceCategory(expCat) || !expMeetingId) return;
    const selectedMeetingId = toEntityId(expMeetingId);
    if (availableMeetings.some((meeting) => toEntityId(meeting.id) === selectedMeetingId)) return;
    setExpMeetingId("");
  }, [availableMeetings, expCat, expMeetingId]);

  const settlementMode = settlementSelectionMode === "batch"
    ? (activeSettlementTxn?.settlement_mode || "none")
    : (selectedTxn?.settlement_mode || "none");
  const ADVANCE_AMT = activeSelectionTransactions.reduce((sum, tx) => sum + parseArabicNumber(tx?.advanceAmountBase ?? tx?.amount ?? 0), 0);
  const PREV_BALANCE = getSelectionPrevBalance(activeSelectionTransactions);
  const SUBS_AMT = settlementMode === "check_plus_subscriptions" ? parseArabicNumber(collectedSubs ?? 0) : 0;
  const TOTAL_AVAILABLE = ADVANCE_AMT + PREV_BALANCE + SUBS_AMT;

  const spent = expenses.reduce((s, e) => s + parseArabicNumber(e.amount ?? 0), 0);
  const remaining = TOTAL_AVAILABLE - spent;
  const availableForExpense = remaining + editingExpenseAmount;

  const activeSelectionKey = useMemo(() => {
    const activeTxnId = toEntityId(getIssuedCheckDocId(activeSettlementTxn) || activeSettlementTxn?.id);
    const normalizedBatchIds =
      settlementSelectionMode === "batch"
        ? selectedBatchIds.map((id) => toEntityId(id)).filter(Boolean).sort().join("|")
        : "";
    return `${settlementSelectionMode}::${activeTxnId}::${normalizedBatchIds}`;
  }, [activeSettlementTxn, selectedBatchIds, settlementSelectionMode]);

  const resetExpenseForm = () => {
    setEditingExpense(null);
    setExpAmt("");
    setExpCat(INITIAL_CATS[0]);
    setExpNotes("");
    setExpDate(getTodayISO());
    setExpFiles([]);
    setSelectedMembers([]);
    setExpMeetingId("");
    setPrizeRecipients([]);
    setPrizeSearch("");
    setPrizeMeta({ contestName: "", decisionNo: "", minutesNo: "" });
  };

  useEffect(() => {
    if (lastLoadedSelectionKeyRef.current === activeSelectionKey) return;
    lastLoadedSelectionKeyRef.current = activeSelectionKey;

    if (activeSettlementTxn) {
      setExpenses(activeSettlementTxn.settlementExpenses || []);
      setCollectedSubs(activeSettlementTxn.collectedSubscriptions || activeSettlementTxn.memberSubscriptions || "");
      setSettlementDate(getSettlementApprovalDate(activeSettlementTxn) || getTodayISO());
      const nextReturnMode = getSettlementReturnMode(activeSettlementTxn);
      setReturnedActually(nextReturnMode === "cash_return");
      setReturnMode(nextReturnMode === "settled" ? "carry_forward" : nextReturnMode);
      setReturnDepositDate(activeSettlementTxn.bankDepositDate || getTodayISO());
      setReturnDepositReference(activeSettlementTxn.bankDepositReference || "");
      resetExpenseForm();
    } else {
      setExpenses([]);
      setCollectedSubs("");
      setSettlementDate(getTodayISO());
      resetSettlementReturnState("carry_forward");
      resetExpenseForm();
    }
  }, [activeSelectionKey, activeSettlementTxn, resetSettlementReturnState]);

  useEffect(() => {
    if (settlementSelectionMode !== "batch") return;
    if (selectedBatchIds.length === 0) return;
    const validIds = new Set(currentTxnOptions.map((tx) => toEntityId(getIssuedCheckDocId(tx) || tx.id)));
    const normalizedSelected = selectedBatchIds.map((id) => toEntityId(id)).filter(Boolean);
    const filtered = normalizedSelected.filter((id) => validIds.has(id));
    if (filtered.join("|") !== normalizedSelected.join("|")) {
      setSelectedBatchIds(filtered);
    }
  }, [currentTxnOptions, selectedBatchIds, settlementSelectionMode]);

  const startEditExpense = (expense) => {
    setEditingExpense(expense);
    setExpCat(expense.category || INITIAL_CATS[0]);
    setExpAmt(String(expense.amount || ""));
    setExpNotes(expense.notes || "");
    setExpDate(expense.date || getTodayISO());
    setExpFiles(Array.isArray(expense.files) ? expense.files : []);
    setSelectedMembers(toEntityIdList(expense.boardMembers));
    setExpMeetingId(toEntityId(expense.meetingId));
    setPrizeRecipients(normalizePrizeRecipients(expense.prizeRecipients));
    setPrizeSearch("");
    setPrizeMeta({
      contestName: expense.prizeMeta?.contestName || "",
      decisionNo: expense.prizeMeta?.decisionNo || "",
      minutesNo: expense.prizeMeta?.minutesNo || "",
    });
  };

  const addPrizeRecipient = (employee) => {
    const memberId = String(employee.jobId || employee.id || "").trim();
    if (!memberId) return;
    setPrizeRecipients((prev) => {
      if (prev.some((r) => r.memberId === memberId)) return prev;
      return [...prev, {
        memberId,
        name: employee.name || "—",
        jobId: employee.jobId || "",
        membershipStatus: employee.membershipStatus || "",
        memberState: employee.memberState || "",
        amount: 0,
      }];
    });
    setPrizeSearch("");
  };

  const updatePrizeAmount = (memberId, value) => {
    setPrizeRecipients((prev) => prev.map((r) =>
      r.memberId === memberId ? { ...r, amount: Math.max(0, parseArabicNumber(value)) } : r
    ));
  };

  const removePrizeRecipient = (memberId) => {
    setPrizeRecipients((prev) => prev.filter((r) => r.memberId !== memberId));
  };

  const addExpense = () => {
    const isPrize = isPrizeCategory(expCat);
    const effectivePrize = isPrize ? normalizePrizeRecipients(prizeRecipients) : [];
    const effectiveTotal = isPrize ? prizeTotal(effectivePrize) : null;
    const prizeError = isPrize ? validatePrizeRecipients(effectivePrize) : "";
    if (prizeError) return showToast(prizeError, "error");
    if (editingExpense) {
      const normalizedMemberIds = toEntityIdList(selectedMembers);
      if (!isPrize && (parseArabicNumber(expAmt) <= 0)) return showToast("أدخل مبلغاً صحيحاً", "error");
      if (isPrize && effectiveTotal <= 0) return showToast("أدخل مبلغاً صحيحاً", "error");
      if (!isPrize && parseArabicNumber(expAmt) > availableForExpense) return showToast(`تجاوزت المتاح! (${formatMoney(availableForExpense || 0)})`, "error");
      if (isPrize && effectiveTotal > availableForExpense) return showToast(`تجاوزت المتاح! (${formatMoney(availableForExpense || 0)})`, "error");
      if (isMeetingAllowanceCategory(expCat) && !selectedMeeting) return showToast("اختر الاجتماع أولاً", "error");
      if (isBoardAllowanceCategory(expCat) && selectedMembers.length === 0) return showToast("اختر عضو مجلس واحد على الأقل", "error");
      if (isMeetingAllowanceCategory(expCat) && blockedMeetingIdsByType[getMeetingAllowanceType(expCat)].has(String(selectedMeeting?.id || "").trim())) {
        return showToast(`تم صرف ${ALLOWANCE_TYPE_LABELS[getMeetingAllowanceType(expCat)] || expCat} لهذا الاجتماع بالفعل`, "error");
      }

      setExpenses(prev => prev.map(expense => (
        expense.id === editingExpense.id
          ? {
            ...expense,
            date: isMeetingAllowanceCategory(expCat) ? (expDate || selectedMeeting?.date || getTodayISO()) : expDate,
            amount: isPrize ? effectiveTotal : expAmt,
            category: expCat,
            notes: isPrize && !expNotes.trim() ? summarizePrizeRecipients(effectivePrize) : expNotes,
            prizeRecipients: isPrize ? effectivePrize : [],
            prizeMeta: isPrize ? { contestName: prizeMeta.contestName.trim(), decisionNo: prizeMeta.decisionNo.trim(), minutesNo: prizeMeta.minutesNo.trim() } : {},
            meetingId: isMeetingAllowanceCategory(expCat) ? toEntityId(selectedMeeting?.id) : "",
            meetingTitle: isMeetingAllowanceCategory(expCat) ? selectedMeeting?.title || "" : "",
            boardMembers: isBoardAllowanceCategory(expCat) ? normalizedMemberIds : [],
            boardMemberSnapshots: isBoardAllowanceCategory(expCat)
              ? buildExpenseBoardMemberSnapshots(normalizedMemberIds)
              : [],
            allowancePerMember: isBoardAllowanceCategory(expCat) && normalizedMemberIds.length > 0
              ? Number(expAmt) / normalizedMemberIds.length
              : 0,
            files: expFiles
          }
          : expense
      )));
      resetExpenseForm();
      showToast("تم حفظ تعديل بند المصروف", "success");
      return;
    }
    if (!isPrize && (parseArabicNumber(expAmt) <= 0)) return showToast("أدخل مبلغاً صحيحاً", "error");
    if (isPrize && effectiveTotal <= 0) return showToast("أدخل مبلغاً صحيحاً", "error");
    if (!isPrize && parseArabicNumber(expAmt) > remaining) return showToast(`تجاوزت المتاح! (${formatMoney(remaining || 0)})`, "error");
    if (isPrize && effectiveTotal > remaining) return showToast(`تجاوزت المتاح! (${formatMoney(remaining || 0)})`, "error");
    if (isMeetingAllowanceCategory(expCat) && !selectedMeeting) return showToast("اختر الاجتماع أولاً", "error");
    if (isBoardAllowanceCategory(expCat) && selectedMembers.length === 0) return showToast("اختر عضو مجلس واحد على الأقل", "error");
    if (isMeetingAllowanceCategory(expCat) && blockedMeetingIdsByType[getMeetingAllowanceType(expCat)].has(String(selectedMeeting?.id || "").trim())) {
      return showToast(`تم صرف ${ALLOWANCE_TYPE_LABELS[getMeetingAllowanceType(expCat)] || expCat} لهذا الاجتماع بالفعل`, "error");
    }

    const normalizedMemberIds = toEntityIdList(selectedMembers);
    setExpenses(prev => [...prev, {
      id: newExpenseId(),
      date: isMeetingAllowanceCategory(expCat) ? (expDate || selectedMeeting?.date || getTodayISO()) : expDate,
      amount: isPrize ? effectiveTotal : expAmt,
      category: expCat,
      notes: isPrize && !expNotes.trim() ? summarizePrizeRecipients(effectivePrize) : expNotes,
      prizeRecipients: isPrize ? effectivePrize : [],
      meetingId: isMeetingAllowanceCategory(expCat) ? toEntityId(selectedMeeting?.id) : "",
      meetingTitle: isMeetingAllowanceCategory(expCat) ? selectedMeeting?.title || "" : "",
      boardMembers: isBoardAllowanceCategory(expCat) ? normalizedMemberIds : [],
      boardMemberSnapshots: isBoardAllowanceCategory(expCat)
        ? buildExpenseBoardMemberSnapshots(normalizedMemberIds)
        : [],
      allowancePerMember: isBoardAllowanceCategory(expCat) && normalizedMemberIds.length > 0
        ? Number(expAmt) / normalizedMemberIds.length
        : 0,
      files: expFiles
    }]);
    setExpAmt(""); setExpNotes(""); setExpFiles([]); setSelectedMembers([]); setExpMeetingId(""); setPrizeRecipients([]); setPrizeSearch("");
    showToast("تم إدراج الفاتورة في الكشف", "success");
  };

  const executeRemoveExpense = () => {
    if (!expenseToDelete) return;
    if (editingExpense?.id === expenseToDelete.id) {
      resetExpenseForm();
    }
    setExpenses(prev => prev.filter(e => e.id !== expenseToDelete.id));
    setExpenseToDelete(null);
    showToast("تم حذف الفاتورة", "success");
  };

  const startEditSettlement = (settlement) => {
    const groupedIdsRaw =
      Array.isArray(settlement?.settlementGroupMemberIds) && settlement.settlementGroupMemberIds.length > 1
        ? settlement.settlementGroupMemberIds
        : [];
    const groupedIds = toEntityIdList(groupedIdsRaw);
    setSettlementSelectionMode(groupedIds.length > 1 ? "batch" : "single");
    setSelectedBatchIds(groupedIds);
    setEditingSettlementId(toEntityId(settlement.id));
    setSelAdvId(toEntityId(settlement.id));
    setActiveTab("current");
    showToast("تم فتح التسوية في وضع التعديل", "success");
  };

  const executeDeleteSettlement = async () => {
    if (!settlementToDelete) return;
    if (!requireSettlementPermission(PERMISSIONS.treasuryDelete, "لا تملك صلاحية حذف التسويات")) return;
    setSaving(true);
    try {
      const targetId = getIssuedCheckDocId(settlementToDelete);
      const groupedTxnIds =
        Array.isArray(settlementToDelete.settlementGroupMemberIds) && settlementToDelete.settlementGroupMemberIds.length > 0
          ? settlementToDelete.settlementGroupMemberIds
          : [targetId];
      const deleteOps = [];
      const batch = {
        set: (ref, data, opts) => deleteOps.push({ type: "set", ref, data, merge: opts?.merge !== false }),
        delete: (ref) => deleteOps.push({ type: "delete", ref }),
      };
      groupedTxnIds.forEach((groupedTxnId) => {
        const sourceTx =
          txByDocId.get(toEntityId(groupedTxnId)) ||
          (groupedTxnId === targetId ? settlementToDelete : null);
        if (!sourceTx) return;
        batch.set(
          doc(db, "issued_checks", groupedTxnId),
          buildIssuedCheckRecord(sourceTx, buildSettlementResetPayload(sourceTx.type)),
          { merge: true }
        );
      });
      if (settlementToDelete.bankDepositTransactionId) {
        batch.delete(doc(db, "transactions", settlementToDelete.bankDepositTransactionId));
      }
      await commitInChunks(db, deleteOps);
      await deletePrizeBenefitsForSettlements(groupedTxnIds);
      await logAuditEvent("settlement_deleted", {
        transactionId: targetId,
        party: settlementToDelete.employeeName || settlementToDelete.party || "",
        settlementDate: settlementToDelete.settlementDate || "",
        type: settlementToDelete.type || "",
        deletedDepositTransactionId: settlementToDelete.bankDepositTransactionId || "",
      });
      if (editingSettlementId === settlementToDelete.id || editingSettlementId === targetId) {
        setEditingSettlementId("");
        setSettlementSelectionMode("single");
        setSelAdvId("");
        setSelectedBatchIds([]);
        setExpenses([]);
        setCollectedSubs("");
        resetSettlementReturnState("carry_forward");
        resetExpenseForm();
      }
      setSettlementToDelete(null);
      setActiveTab("current");
      showToast("تم حذف التسوية وإعادة العهدة إلى القائمة المفتوحة", "success");
    } catch (e) {
      console.error(e);
      showToast("حدث خطأ أثناء حذف التسوية", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRecoverFromArchive = (settlement) => {
    setRecoveryModalData(settlement);
    setRecoveryReason("");
    setShowRecoveryConfirm(true);
  };

  const executeRecovery = async () => {
    if (!recoveryModalData) return;
    if (!requireSettlementPermission(PERMISSIONS.treasurySettle, "لا تملك صلاحية استرجاع التسويات")) return;
    setRecoveryLoading(true);
    try {
      const result = await recoverSingleSettlement(recoveryModalData.id, {
        reason: recoveryReason || "استرجاع يدوي من الأرشيف",
        userId: "current_user",
        userName: "مستخدم الواجهة"
      });

      if (result.success) {
        showToast("تم استرجاع التسوية بنجاح - الشيك الآن في قائمة التسويات المفتوحة", "success");
        setActiveTab("current");
        setShowRecoveryConfirm(false);
        setRecoveryModalData(null);
      } else {
        showToast(result.message, "error");
      }
    } catch (e) {
      console.error(e);
      showToast("حدث خطأ أثناء الاسترجاع", "error");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleDiscardDraftSettlement = async (draftId) => {
    if (!requireSettlementPermission(PERMISSIONS.treasurySettle, "لا تملك صلاحية حذف مسودات التسويات")) return;
    setSaving(true);
    try {
      const result = await discardDraft(draftId, {
        userId: "current_user",
        userName: "مستخدم الواجهة"
      });

      if (result.success) {
        showToast("تم حذف المسودة بنجاح", "success");
        setEditingSettlementId("");
        setSettlementSelectionMode("single");
        setSelAdvId("");
        setSelectedBatchIds([]);
        setExpenses([]);
        setCollectedSubs("");
        resetSettlementReturnState("carry_forward");
        resetExpenseForm();
      } else {
        showToast(result.message, "error");
      }
    } catch (e) {
      console.error(e);
      showToast("حدث خطأ أثناء حذف المسودة", "error");
    } finally {
      setSaving(false);
    }
  };

  const buildOpenAdvancePayload = (record, now) => {
    const nukePayload = buildSettlementResetPayload(record.type, now);
    if (!POSTED_SETTLEMENT_STATES.has(record.state)) {
      nukePayload.state = "posted";
    }
    return nukePayload;
  };

  const handleUngroupAll = async () => {
    const grouped = hiddenSettledSettlements.filter((h) => h.isGrouped);
    if (grouped.length === 0) {
      showToast("لا توجد تسويات مجمعة مخفية لفكها", "error");
      return;
    }
    if (!requireSettlementPermission(PERMISSIONS.treasurySettle, "لا تملك صلاحية إعادة تعيين التسويات")) return;
    if (!window.confirm(`سيتم فك ${grouped.length} شيك من تسوياتها المجمعة ومسح كل آثار التسوية وإرجاعها سلفاً مفتوحة بدون أي ارتباط. متابعة؟`)) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const ungroupOps = [];
      const batch = {
        set: (ref, data, opts) => ungroupOps.push({ type: "set", ref, data, merge: opts?.merge !== false }),
        delete: (ref) => ungroupOps.push({ type: "delete", ref }),
      };
      const touched = new Set();
      const queueDoc = (collectionName, id, payload) => {
        const cleanId = String(id || "").trim();
        if (!cleanId) return;
        const k = `${collectionName}/${cleanId}`;
        if (touched.has(k)) return;
        touched.add(k);
        batch.set(doc(db, collectionName, cleanId), payload, { merge: true });
      };
      grouped.forEach((h) => {
        const seen = new Set();
        const members = [];
        const collect = (list) => (list || []).forEach((tx) => {
          if (!seen.has(tx.id)) {
            seen.add(tx.id);
            members.push(tx);
          }
        });
        if (h.leaderId) collect(settlementGroupIndex.get(`l:${h.leaderId}`));
        if (h.leaderId) collect(settlementGroupIndex.get(`i:${h.leaderId}`));
        if (h.groupId) collect(settlementGroupIndex.get(`g:${h.groupId}`));
        collect(settlementGroupIndex.get(`i:${h.record.id}`));
        if (members.length === 0) {
          queueDoc("issued_checks", h.record.id, buildOpenAdvancePayload({ state: "posted", type: h.record.type }, now));
          return;
        }
        members.forEach((m) => {
          queueDoc("issued_checks", m.id, buildOpenAdvancePayload(m, now));
          const legacyKey = m.legacySourceId || m.sourceTransactionId || "";
          if (legacyKey && legacyKey !== m.id) {
            queueDoc("transactions", legacyKey, {
              isSettled: false,
              hasDraftSettlement: false,
              settlementExpenses: [],
              state: "posted",
              updatedAt: now,
            });
          }
        });
      });
      await commitInChunks(db, ungroupOps);
      try {
        await logAuditEvent("hidden_grouped_settlements_dissolved", { count: touched.size });
      } catch { /* ignore audit log errors */ }
      showToast(`تم فك التسويات المجمعة وإرجاع ${touched.size} مستند مفتوحاً بدون تسويات`, "success");
    } catch (e) {
      console.error(e);
      showToast("فشل فك التسويات المجمعة: " + (e.message || ""), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleHiddenResetAll = async () => {    const targets = hiddenSettledSettlements.filter((h) => !h.isGrouped);
    if (targets.length === 0) {
      showToast("لا توجد تسويات مخفية قابلة لإعادة التعيين", "error");
      return;
    }
    if (!requireSettlementPermission(PERMISSIONS.treasurySettle, "لا تملك صلاحية إعادة تعيين التسويات")) return;
    if (!window.confirm(`سيتم حذف ${targets.length} تسوية مخفية وإرجاع شيكاتها كعهد مفتوحة لم تُسوَّ بعد. متابعة؟`)) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const resetAllOps = [];
      const batch = {
        set: (ref, data, opts) => resetAllOps.push({ type: "set", ref, data, merge: opts?.merge !== false }),
        delete: (ref) => resetAllOps.push({ type: "delete", ref }),
      };
      targets.forEach(({ record }) => {
        const targetId = record.targetDocId || record.id;
        batch.set(doc(db, "issued_checks", targetId), buildOpenAdvancePayload(record, now), { merge: true });
        if (record.source.includes("transactions") && record.key && record.key !== targetId) {
          batch.set(doc(db, "transactions", record.key), {
            isSettled: false,
            hasDraftSettlement: false,
            settlementExpenses: [],
            state: "posted",
            updatedAt: now,
          }, { merge: true });
        }
      });
      await commitInChunks(db, resetAllOps);
      try {
        await logAuditEvent("hidden_settlements_bulk_reset", {
          count: targets.length,
          checkIds: targets.map((t) => t.record.targetDocId || t.record.id),
        });
      } catch { /* ignore audit log errors */ }
      showToast(`تم حذف ${targets.length} تسوية مخفية وإرجاع شيكاتها مفتوحة`, "success");
    } catch (e) {
      console.error(e);
      showToast("فشلت إعادة التعيين الجماعي: " + (e.message || ""), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleHiddenReset = async (record) => {
    if (!requireSettlementPermission(PERMISSIONS.treasurySettle, "لا تملك صلاحية إعادة تعيين التسويات")) return;
    if (!window.confirm(`إعادة تعيين تسوية ${record.party || record.id} وإعادتها مفتوحة للتسوية من جديد؟`)) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const targetId = record.targetDocId || record.id;
      const batch = writeBatch(db);
      batch.set(doc(db, "issued_checks", targetId), buildOpenAdvancePayload(record, now), { merge: true });
      if (record.source.includes("transactions") && record.key && record.key !== targetId) {
        batch.set(doc(db, "transactions", record.key), {
          isSettled: false,
          hasDraftSettlement: false,
          settlementExpenses: [],
          state: "posted",
          updatedAt: now,
        }, { merge: true });
      }
      await batch.commit();
      try {
        await logAuditEvent("hidden_settlement_reset", {
          checkId: targetId,
          sourceId: record.id,
          source: record.source,
          party: record.party,
          type: record.type,
        });
      } catch { /* ignore audit log errors */ }
      showToast(`تمت إعادة تعيين تسوية ${record.party || targetId} — عادت مفتوحة للتسوية من جديد`, "success");
    } catch (e) {
      console.error(e);
      showToast("فشلت إعادة التعيين: " + (e.message || ""), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!activeSettlementTxn) return;
    if (savingRef.current) return;
    if (!requireSettlementPermission(PERMISSIONS.treasurySettle, "لا تملك صلاحية حفظ التسويات")) return;
    const validationError = validateMeetingAllowanceExpenses();
    if (validationError) return showToast(validationError, "error");
    savingRef.current = true;
    setSaving(true);
    try {
      const isBatchMode = settlementSelectionMode === "batch";
      if (isBatchMode) {
        const draftOps = [];
        const batch = {
          set: (ref, data, opts) => draftOps.push({ type: "set", ref, data, merge: opts?.merge !== false }),
          delete: (ref) => draftOps.push({ type: "delete", ref }),
        };
        const groupedTxnIds = activeSelectionTransactions
          .map((tx) => getIssuedCheckDocId(tx))
          .filter(Boolean);
        activeSelectionTransactions.forEach((tx, index) => {
          const txId = getIssuedCheckDocId(tx);
          if (!txId) return;
          const isLeader = index === 0;
          batch.set(
            doc(db, "issued_checks", txId),
            buildIssuedCheckRecord(tx, {
              isSettled: false,
              state: "posted",
              settlementExpenses: isLeader ? expenses : [],
              collectedSubscriptions: isLeader ? SUBS_AMT : Number(tx?.collectedSubscriptions || tx?.memberSubscriptions || 0),
              advanceAmountBase: Number(tx?.advanceAmountBase || tx?.amount || 0),
              settlementGroupId: `group_${groupedTxnIds[0]}`,
              settlementGroupLeaderId: groupedTxnIds[0],
              settlementGroupMemberIds: groupedTxnIds,
              settlementGroupCount: groupedTxnIds.length,
              settlementGroupFollower: !isLeader,
              settlementGroupAdvanceAmountBase: activeSelectionTransactions.reduce(
                (sum, t) => sum + Number(t?.advanceAmountBase || t?.amount || 0), 0
              ),
              settlementGroupPrevBalanceUsed: PREV_BALANCE,
              settlementGroupCollectedSubscriptions: isLeader ? SUBS_AMT : Number(tx?.collectedSubscriptions || tx?.memberSubscriptions || 0),
            }),
            { merge: true }
          );
        });
        await commitInChunks(db, draftOps);
        setSelAdvId(getIssuedCheckDocId(activeSettlementTxn));
        await deletePrizeBenefitsForSettlements(groupedTxnIds);
        await logAuditEvent("settlement_draft_saved", {
          transactionId: groupedTxnIds[0],
          party: activeSettlementTxn.employeeName || activeSettlementTxn.party || "",
          expensesCount: expenses.length,
          type: activeSettlementTxn.type || "",
          batchGroup: groupedTxnIds.join(","),
        });
      } else {
        const targetId = getIssuedCheckDocId(activeSettlementTxn);
        if (!targetId) throw new Error("Missing target ID");
        await setDoc(
          doc(db, "issued_checks", targetId),
          buildIssuedCheckRecord(activeSettlementTxn, {
            isSettled: false,
            state: "posted",
            settlementExpenses: expenses,
            collectedSubscriptions: SUBS_AMT,
          }),
          { merge: true }
        );
        setSelAdvId(targetId);
        await deletePrizeBenefitsForSettlements([targetId]);
        await logAuditEvent("settlement_draft_saved", {
          transactionId: targetId,
          party: activeSettlementTxn.employeeName || activeSettlementTxn.party || "",
          expensesCount: expenses.length,
          type: activeSettlementTxn.type || "",
        });
      }
      showToast("تم حفظ الفواتير في العهدة بنجاح (يمكنك إغلاقها لاحقاً) ✓", "success");
    } catch (e) {
      console.error(e);
      showToast("حدث خطأ أثناء الحفظ المؤقت", "error");
    } finally { savingRef.current = false; setSaving(false); }
  };

  const continueDraft = (draft) => {
    const isBatchDraft = Array.isArray(draft?.settlementGroupMemberIds) && draft.settlementGroupMemberIds.length > 1;
    if (isBatchDraft) {
      const groupedIds = toEntityIdList(draft.settlementGroupMemberIds);
      setSettlementSelectionMode("batch");
      setSelectedBatchIds(groupedIds);
    } else {
      setSettlementSelectionMode("single");
      setSelectedBatchIds([]);
    }
    setSelAdvId(toEntityId(draft.id));
    setActiveTab("current");
  };

  const openConfirmModal = () => {
    const groupedTxnIdsForModal = settlementSelectionMode === "batch"
      ? Array.from(
        new Set(
          [
            ...activeSelectionTransactions.map((tx) => getIssuedCheckDocId(tx)),
            ...(Array.isArray(activeSettlementTxn?.settlementGroupMemberIds)
              ? activeSettlementTxn.settlementGroupMemberIds
              : []),
          ]
            .map((id) => String(id || "").trim())
            .filter(Boolean)
        )
      )
      : activeSelectionTransactions
        .map((tx) => getIssuedCheckDocId(tx))
        .map((id) => String(id || "").trim())
        .filter(Boolean);

    if (settlementSelectionMode === "batch" && groupedTxnIdsForModal.length < 2) {
      return showToast("اختر شيكين أو أكثر من نفس المسؤول ونفس نمط التسوية لاستخدام التسوية المجمعة.", "error");
    }
    const validationError = validateMeetingAllowanceExpenses();
    if (validationError) return showToast(validationError, "error");

    if (remaining > 0) {
      const selectedReturnMode = getSettlementReturnMode(activeSettlementTxn || {});
      setReturnedActually(selectedReturnMode === "cash_return");
      setReturnMode(selectedReturnMode === "settled" ? "carry_forward" : selectedReturnMode);
      setReturnDepositDate(activeSettlementTxn?.bankDepositDate || settlementDate || getTodayISO());
      setReturnDepositReference(activeSettlementTxn?.bankDepositReference || "");
    }

    setConfirmModalData({
      txnId: getIssuedCheckDocId(activeSettlementTxn),
      party: getIssuedCheckDisplayParty(activeSettlementTxn),
      totalAvailable: TOTAL_AVAILABLE,
      spent: spent,
      remaining: remaining,
      prevBalance: PREV_BALANCE,
      advanceAmountBase: ADVANCE_AMT,
      collectedSubs: SUBS_AMT,
      type: activeSettlementTxn?.type || "",
      groupedTxnIds: groupedTxnIdsForModal,
      selectionMode: settlementSelectionMode,
    });
  };

  const handleFinalSettle = async () => {
    if (!confirmModalData) return;
    if (savingRef.current) return;
    if (!requireSettlementPermission(PERMISSIONS.treasurySettle, "لا تملك صلاحية اعتماد التسويات")) return;
    const validationError = validateMeetingAllowanceExpenses();
    if (validationError) {
      setConfirmModalData(null);
      return showToast(validationError, "error");
    }
    if (confirmModalData.remaining > 0 && returnMode === "bank_deposit" && !returnDepositDate) {
      return showToast("حدد تاريخ الإيداع البنكي قبل اعتماد التسوية", "error");
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const settlementOps = [];
      const batch = {
        set: (ref, data, opts) => settlementOps.push({ type: "set", ref, data, merge: opts?.merge !== false }),
        delete: (ref) => settlementOps.push({ type: "delete", ref }),
      };
      const leaderTxn = activeSettlementTxn;
      const groupedTxnIds = Array.from(
        new Set((confirmModalData.groupedTxnIds || [confirmModalData.txnId]).filter(Boolean))
      );
      const isBatchSettlement = (confirmModalData.selectionMode || settlementSelectionMode) === "batch" && groupedTxnIds.length > 1;
      const normalizedReturnMode =
        confirmModalData.remaining > 0 ? returnMode : "settled";
      const carryForwardAmount =
        normalizedReturnMode === "carry_forward" ? Number(confirmModalData.remaining || 0) : 0;
      const returnedCashAmount =
        normalizedReturnMode === "cash_return" ? Number(confirmModalData.remaining || 0) : 0;
      const bankDepositedAmount =
        normalizedReturnMode === "bank_deposit" ? Number(confirmModalData.remaining || 0) : 0;
      const depositTransactionId =
        normalizedReturnMode === "bank_deposit"
          ? (leaderTxn?.bankDepositTransactionId || confirmModalData.bankDepositTransactionId || doc(collection(db, "transactions")).id)
          : "";
      const cashReturnTransactionId =
        normalizedReturnMode === "cash_return"
          ? (leaderTxn?.cashReturnTransactionId || confirmModalData.cashReturnTransactionId || doc(collection(db, "transactions")).id)
          : "";

      if (leaderTxn?.bankDepositTransactionId && normalizedReturnMode !== "bank_deposit") {
        batch.delete(doc(db, "transactions", leaderTxn.bankDepositTransactionId));
      }
      if (leaderTxn?.cashReturnTransactionId && normalizedReturnMode !== "cash_return") {
        batch.delete(doc(db, "transactions", leaderTxn.cashReturnTransactionId));
      }

      if (normalizedReturnMode === "bank_deposit" && bankDepositedAmount > 0) {
        batch.set(
          doc(db, "transactions", depositTransactionId),
          {
            id: depositTransactionId,
            type: "deposit",
            amount: bankDepositedAmount,
            date: returnDepositDate || settlementDate || getTodayISO(),
            bankReference: returnDepositReference.trim(),
            receiptNo: returnDepositReference.trim(),
            party: confirmModalData.party || "رد متبقي تسوية",
            employeeId: leaderTxn?.employeeId || "",
            employeeName: confirmModalData.party || "",
            state: "posted",
            sourceCollection: "transactions",
            settlementId: confirmModalData.txnId,
            sourceAdvanceId: confirmModalData.txnId,
            depositSource: "settlement_return",
            linkedCheckId: confirmModalData.txnId,
            settlementGroupId: isBatchSettlement ? `group_${confirmModalData.txnId}` : "",
            settlementGroupMemberIds: isBatchSettlement ? groupedTxnIds : [],
            notes: `إيداع متبقي تسوية ${confirmModalData.party || "عهدة"}${returnDepositReference.trim() ? ` - مرجع ${returnDepositReference.trim()}` : ""}`,
            createdAt: leaderTxn?.bankDepositTransactionId ? (leaderTxn?.bankDepositCreatedAt || leaderTxn?.createdAt || new Date().toISOString()) : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      if (normalizedReturnMode === "cash_return" && returnedCashAmount > 0) {
        batch.set(
          doc(db, "transactions", cashReturnTransactionId),
          {
            id: cashReturnTransactionId,
            type: "refund",
            amount: returnedCashAmount,
            date: settlementDate || getTodayISO(),
            receiptNo: returnDepositReference.trim(),
            bankReference: returnDepositReference.trim(),
            party: confirmModalData.party || "رد متبقي تسوية",
            employeeId: leaderTxn?.employeeId || "",
            employeeName: confirmModalData.party || "",
            state: "posted",
            sourceCollection: "transactions",
            settlementId: confirmModalData.txnId,
            sourceAdvanceId: confirmModalData.txnId,
            depositSource: "settlement_cash_return",
            linkedCheckId: confirmModalData.txnId,
            settlementGroupId: isBatchSettlement ? `group_${confirmModalData.txnId}` : "",
            settlementGroupMemberIds: isBatchSettlement ? groupedTxnIds : [],
            notes: `رد نقدي لمتبقي تسوية ${confirmModalData.party || "عهدة"}${returnDepositReference.trim() ? ` - مرجع ${returnDepositReference.trim()}` : ""}`,
            createdAt: leaderTxn?.cashReturnTransactionId ? (leaderTxn?.cashReturnCreatedAt || leaderTxn?.createdAt || new Date().toISOString()) : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      activeSelectionTransactions.forEach((tx, index) => {
        const txId = getIssuedCheckDocId(tx);
        if (!txId) return;

        const isLeader = index === 0;
        batch.set(
          doc(db, "issued_checks", txId),
          buildIssuedCheckRecord(tx, {
            isSettled: true,
            hasDraftSettlement: false,
            settlement_state: "settled",
            settlementStatus: "settled",
            state: "posted",
            settlementDate: getLatestSettlementExpenseDate(expenses, settlementDate) || "",
            settlementExpenses: isLeader ? expenses : [],
            settlementSpent: isLeader ? confirmModalData.spent : 0,
            settlementReturned: isLeader ? carryForwardAmount : 0,
            returnedActually: isLeader ? normalizedReturnMode === "cash_return" : false,
            returnMode: isLeader ? normalizedReturnMode : "settled",
            returnedCashAmount: isLeader ? returnedCashAmount : 0,
            bankDepositedAmount: isLeader ? bankDepositedAmount : 0,
            bankDepositDate: isLeader && normalizedReturnMode === "bank_deposit" ? (returnDepositDate || settlementDate || getTodayISO()) : "",
            bankDepositReference: isLeader && normalizedReturnMode === "bank_deposit" ? returnDepositReference.trim() : "",
            bankDepositTransactionId: isLeader && normalizedReturnMode === "bank_deposit" ? depositTransactionId : "",
            bankDepositCreatedAt: isLeader && normalizedReturnMode === "bank_deposit"
              ? (leaderTxn?.bankDepositCreatedAt || new Date().toISOString())
              : "",
            cashReturnTransactionId: isLeader && normalizedReturnMode === "cash_return" ? cashReturnTransactionId : "",
            cashReturnCreatedAt: isLeader && normalizedReturnMode === "cash_return"
              ? (leaderTxn?.cashReturnCreatedAt || new Date().toISOString())
              : "",
            prevBalanceUsed: isLeader ? confirmModalData.prevBalance : 0,
            advanceAmountBase: Number(tx?.advanceAmountBase || tx?.amount || 0),
            collectedSubscriptions: isLeader ? confirmModalData.collectedSubs : Number(tx?.collectedSubscriptions || tx?.memberSubscriptions || 0),
            employeeName: confirmModalData.party || "",
            settlementGroupId: isBatchSettlement ? `group_${confirmModalData.txnId}` : "",
            settlementGroupLeaderId: isBatchSettlement ? confirmModalData.txnId : "",
            settlementGroupMemberIds: isBatchSettlement ? groupedTxnIds : [],
            settlementGroupCount: isBatchSettlement ? groupedTxnIds.length : 1,
            settlementGroupFollower: isBatchSettlement ? !isLeader : false,
            settlementGroupAdvanceAmountBase: isBatchSettlement ? confirmModalData.advanceAmountBase : Number(tx?.advanceAmountBase || tx?.amount || 0),
            settlementGroupPrevBalanceUsed: isBatchSettlement ? confirmModalData.prevBalance : (isLeader ? confirmModalData.prevBalance : 0),
            settlementGroupCollectedSubscriptions: isBatchSettlement ? confirmModalData.collectedSubs : Number(tx?.collectedSubscriptions || tx?.memberSubscriptions || 0),
          }),
          { merge: true }
        );
      });

      const leaderId = confirmModalData.txnId;
      const employeesMap = new Map(prizeSearchPool.map((e) => [String(e.jobId || e.id || "").trim(), e]));
      const desiredPrizeIds = new Set();
      expenses.forEach((expense) => {
        if (!isPrizeCategory(expense.category)) return;
        normalizePrizeRecipients(expense.prizeRecipients).forEach((r) => {
          if (!(Number(r.amount) > 0)) return;
          const benefitId = prizeBenefitDocId(leaderId, expense.id, r.memberId);
          desiredPrizeIds.add(benefitId);
          const emp = employeesMap.get(String(r.memberId).trim()) || {};
          batch.set(doc(db, "member_benefits", benefitId), {
            ...buildPrizeBenefitPayload({
              recipient: { ...r, membershipStatus: emp.membershipStatus || "", memberState: emp.memberState || "" },
              expense,
              settlement: { settlementId: leaderId, checkNum: leaderTxn?.checkNum || "" },
            }),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        });
      });
      try {
        const existingPrizes = await getDocs(query(
          collection(db, "member_benefits"),
          where("source", "==", PRIZE_BENEFIT_SOURCE),
          where("settlementId", "==", leaderId)
        ));
        existingPrizes.docs.forEach((d) => {
          if (!desiredPrizeIds.has(d.id)) batch.delete(doc(db, "member_benefits", d.id));
        });
      } catch (prizeSyncError) {
        console.error("prize sync:", prizeSyncError);
      }

      await commitInChunks(db, settlementOps);
      await logAuditEvent(editingSettlementId ? "settlement_updated" : "settlement_finalized", {
        transactionId: confirmModalData.txnId,
        party: confirmModalData.party || "",
        settlementDate: getLatestSettlementExpenseDate(expenses, settlementDate),
        spent: confirmModalData.spent,
        returned: carryForwardAmount,
        returnedActually: normalizedReturnMode === "cash_return",
        returnMode: normalizedReturnMode,
        returnedCashAmount,
        bankDepositedAmount,
        bankDepositDate: normalizedReturnMode === "bank_deposit" ? (returnDepositDate || settlementDate || getTodayISO()) : "",
        bankDepositReference: normalizedReturnMode === "bank_deposit" ? returnDepositReference.trim() : "",
        bankDepositTransactionId: normalizedReturnMode === "bank_deposit" ? depositTransactionId : "",
        expensesCount: expenses.length,
        prizeBenefitsCount: desiredPrizeIds.size,
        type: confirmModalData.type || "",
      });

      showToast("تم إغلاق العهدة واعتماد البدلات داخل التسوية بنجاح ✓", "success");

      setConfirmModalData(null);
      setEditingSettlementId("");
      setSettlementSelectionMode("single");
      setSelAdvId("");
      setSelectedBatchIds([]);
      setExpenses([]);
      setCollectedSubs("");
      resetSettlementReturnState("carry_forward");
      setActiveTab("archive");

    } catch (e) {
      console.error("=== خطأ في اعتماد التسوية ===");
      console.error(e);
      showToast("حدث خطأ أثناء الاعتماد", "error");
    } finally { savingRef.current = false; setSaving(false); }
  };

  if (loading) return <LoadingState title="جاري تحميل بيانات التسويات..." rows={5} className="mx-auto max-w-7xl" />;

  return (
    <div className={clsx("flex flex-col gap-4 max-w-7xl mx-auto pb-10", T.text)} dir="rtl">
      <PageHeader
        title="تسوية الشيكات"
        hint="اعتماد التسويات ومتابعة الأرشيف للشيكات التي تتطلب تسوية"
        icon={getModuleIcon("/treasury/settlements")}
        crumbs={[{ label: "الماليات" }, { label: "التسويات" }]}
        metadata={
          <>
            <span>مفتوحة: {formatInteger(settlementBaseline.openSettlements || 0)}</span>
            <span>جزئية: {formatInteger(settlementBaseline.partialSettlements || 0)}</span>
            <span>مكتملة: {formatInteger(settlementBaseline.completedSettlements || 0)}</span>
          </>
        }
      />
      <SettlementKpiStrip baseline={settlementBaseline} formatMoney={formatMoney} />
      {/* مودال تأكيد استرجاع الأرشيف المفقود */}
      {showRecoveryConfirm && recoveryModalData && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className={clsx("w-full max-w-md max-h-[92vh] overflow-y-auto p-6 rounded-3xl shadow-2xl border space-y-5 animate-in zoom-in-95", T.card)}>
            <div className="flex items-center gap-3 text-blue-600 border-b border-blue-100 pb-3">
              <div className="p-2.5 bg-blue-100 rounded-xl"><RotateCcw size={20} /></div>
              <div><h2 className="font-black text-sm">استرجاع تسوية من الأرشيف</h2></div>
            </div>
            <p className="text-xs font-bold leading-relaxed">
              هل أنت متأكد من رغبتك في استرجاع التسوية الخاصة بـ <span className="font-black text-teal-600">{recoveryModalData.employeeName || recoveryModalData.party}</span> وفتحها للتعديل مرة أخرى؟
            </p>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500">سبب الاسترجاع (اختياري)</label>
              <input type="text" value={recoveryReason} onChange={e => setRecoveryReason(e.target.value)} placeholder="مثال: وجود خطأ في الفواتير..." className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:border-blue-500", T.inp)} />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => { setShowRecoveryConfirm(false); setRecoveryModalData(null); }} className={clsx("flex-1 py-2.5 rounded-xl font-bold text-xs border shadow-sm", T.btn)}>إلغاء</button>
              <button onClick={executeRecovery} disabled={recoveryLoading} className="flex-1 py-2.5 rounded-xl font-black text-xs bg-blue-600 text-white hover:bg-blue-700 shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50">
                {recoveryLoading ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} تأكيد الاسترجاع
              </button>
            </div>
          </div>
        </div>
      )}

      {settlementToDelete && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className={clsx("w-full max-w-md max-h-[92vh] overflow-y-auto p-6 rounded-3xl shadow-2xl border space-y-5 animate-in zoom-in-95", T.card)}>
            <div className="flex items-center gap-3 text-rose-600 border-b border-rose-100 pb-3">
              <div className="p-2.5 bg-rose-100 rounded-xl"><AlertTriangle size={20} /></div>
              <div><h2 className="font-black text-sm">حذف تسوية معتمدة</h2><p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">سيتم إعادة العهدة إلى القائمة المفتوحة</p></div>
            </div>
            <p className="text-xs font-bold leading-relaxed">
              سيتم حذف التسوية الخاصة بـ <span className="font-black text-teal-600">{settlementToDelete.employeeName || settlementToDelete.party}</span> وإعادة الشيك إلى قائمة التسويات المفتوحة من جديد.
            </p>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setSettlementToDelete(null)} className={clsx("flex-1 py-2.5 rounded-xl font-bold text-xs border shadow-sm", T.btn)}>إلغاء</button>
              <button onClick={executeDeleteSettlement} disabled={saving} className="flex-1 py-2.5 rounded-xl font-black text-xs bg-rose-600 text-white hover:bg-rose-700 shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} حذف التسوية
              </button>
            </div>
          </div>
        </div>
      )}

      {expenseToDelete && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className={clsx("w-full max-w-sm max-h-[92vh] overflow-y-auto p-6 rounded-3xl shadow-2xl border space-y-5 animate-in zoom-in-95", T.card)}>
            <div className="flex items-center gap-3 text-rose-600 border-b border-rose-100 pb-3">
              <div className="p-2.5 bg-rose-100 rounded-xl"><AlertTriangle size={20} /></div>
              <div><h2 className="font-black text-sm">حذف بند مصروف</h2><p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">إجراء غير قابل للتراجع</p></div>
            </div>
            <p className="text-xs font-bold leading-relaxed">
              هل أنت متأكد من حذف فاتورة <span className="font-black text-teal-600">({expenseToDelete.category})</span> بقيمة <span className="font-black text-rose-600">{formatMoney(expenseToDelete.amount || 0)}</span> من كشف التسوية؟
            </p>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setExpenseToDelete(null)} className={clsx("flex-1 py-2.5 rounded-xl font-bold text-xs border shadow-sm", T.btn)}>إلغاء</button>
              <button onClick={executeRemoveExpense} className="flex-1 py-2.5 rounded-xl font-black text-xs bg-rose-600 text-white hover:bg-rose-700 shadow-md active:scale-95 flex items-center justify-center gap-2">
                <Trash2 size={14} /> تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModalData && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className={clsx("w-full max-w-md max-h-[92vh] overflow-y-auto p-5 rounded-2xl shadow-2xl border space-y-5 animate-in zoom-in-95", T.card)}>
            <div className="flex items-center gap-3 text-teal-600 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="p-2.5 bg-teal-100 dark:bg-teal-900/30 rounded-xl"><ShieldCheck size={20} /></div>
              <div><h2 className="font-black text-sm">{editingSettlementId ? "تأكيد حفظ تعديلات التسوية" : "تأكيد إغلاق العهدة نهائياً"}</h2><p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">التاريخ: {settlementDate}</p></div>
            </div>

            <div className="rounded-xl border border-teal-100 bg-teal-50/50 dark:border-teal-900/40 dark:bg-teal-900/10 p-3">
              <p className="text-[10px] font-black text-teal-700 dark:text-teal-300 mb-2">مراجعة أثر التسوية قبل الاعتماد</p>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-800 border border-slate-100 dark:border-slate-700"><p className="text-[9px] font-black text-slate-400 mb-1">أصل السلفة</p><p className="text-xs font-black text-slate-700 dark:text-slate-300">{formatMoney(confirmModalData.advanceAmountBase || 0)}</p></div>
                <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800"><p className="text-[9px] font-black text-amber-500 mb-1">الرصيد المرحل المستخدم</p><p className="text-xs font-black text-amber-700 dark:text-amber-300">{formatMoney(confirmModalData.prevBalance || 0)}</p></div>
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800"><p className="text-[9px] font-black text-rose-400 mb-1">المصروف</p><p className="text-xs font-black text-rose-600">{formatMoney(confirmModalData.spent || 0)}</p></div>
                <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800"><p className="text-[9px] font-black text-teal-500 mb-1">المتبقي</p><p className="text-xs font-black text-teal-600">{formatMoney(confirmModalData.remaining || 0)}</p></div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] font-black">
                <span className="text-slate-500">إجمالي المتاح: {formatMoney(confirmModalData.totalAvailable || 0)}</span>
                <span className="text-teal-700 dark:text-teal-300">المعالجة: {confirmModalData.remaining > 0 ? (returnMode === "carry_forward" ? "ترحيل للسلفة التالية" : returnMode === "cash_return" ? "رد نقدي للخزينة" : "إيداع بالبنك") : "لا يوجد متبقي"}</span>
              </div>
            </div>

            {confirmModalData.remaining > 0 && (
              <div className="space-y-3 p-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20">
                <div>
                  <span className="text-amber-900 dark:text-amber-400 text-xs font-black block">
                    معالجة المتبقي ({formatMoney(confirmModalData.remaining || 0)})
                  </span>
                  <span className="block text-[9px] font-bold text-amber-600 mt-1 leading-relaxed">
                    اختر كيف سيتم إغلاق المتبقي داخل التسوية والمستندات المالية.
                  </span>
                </div>

                <div className="grid gap-2">
                  {[
                    {
                      id: "carry_forward",
                      label: "ترحيل للسلفة التالية",
                      hint: "يبقى المبلغ رصيدًا مرحلًا ويظهر في السلفة التالية.",
                    },
                    {
                      id: "cash_return",
                      label: "رد نقدي للخزينة",
                      hint: "يغلق المتبقي كمبلغ مردود نقدًا بدون حركة إيداع بنكية.",
                    },
                    {
                      id: "bank_deposit",
                      label: "إيداع بالبنك",
                      hint: "ينشئ حركة إيداع فعلية في كشف الحساب ويرتبط بمستند التسوية.",
                    },
                  ].map((option) => (
                    <label
                      key={option.id}
                      className={clsx(
                        "flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors",
                        returnMode === option.id
                          ? "border-teal-300 bg-white dark:bg-slate-900/40"
                          : "border-amber-100 bg-white/70 dark:bg-slate-900/20"
                      )}
                    >
                      <input
                        type="radio"
                        name="settlement-return-mode"
                        checked={returnMode === option.id}
                        onChange={() => {
                          setReturnMode(option.id);
                          setReturnedActually(option.id === "cash_return");
                          if (option.id !== "bank_deposit") {
                            setReturnDepositReference("");
                            setReturnDepositDate(settlementDate || getTodayISO());
                          }
                        }}
                        className="w-4 h-4 mt-0.5 accent-teal-600"
                      />
                      <div>
                        <span className="text-slate-800 dark:text-slate-100 text-xs font-black block">{option.label}</span>
                        <span className="block text-[9px] font-bold text-slate-500 mt-1 leading-relaxed">{option.hint}</span>
                      </div>
                    </label>
                  ))}
                </div>

                {returnMode === "bank_deposit" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 pr-1">تاريخ الإيداع</label>
                      <ArabicDatePicker
                        value={returnDepositDate}
                        onChange={setReturnDepositDate}
                        placeholder="تاريخ الإيداع البنكي"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 pr-1">مرجع البنك / رقم الإيصال</label>
                      <input
                        type="text"
                        value={returnDepositReference}
                        onChange={(e) => setReturnDepositReference(e.target.value)}
                        placeholder="مثال: 5412/بنك"
                        className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:border-teal-500 h-[38px]", T.inp)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setConfirmModalData(null)} className={clsx("flex-1 py-2.5 rounded-xl font-bold text-xs border shadow-sm", T.btn)}>رجوع</button>
              <button onClick={handleFinalSettle} disabled={saving} className="flex-[2] py-2.5 rounded-xl font-black text-xs bg-teal-600 text-white hover:bg-teal-700 flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} {editingSettlementId ? "حفظ التعديلات" : "اعتماد نهائي وإغلاق"}
              </button>
            </div>
          </div>
        </div>
      )}

      <SettlementWorkspaceTabs activeTab={activeTab} onChange={setActiveTab} openCount={openAdvances.length} />

      {activeTab === "current" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-in fade-in duration-500">

          <div className="lg:col-span-12">
            <div className={clsx("p-4 rounded-2xl border shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white dark:bg-slate-900", T.card)}>
              <div className="w-full md:w-2/5 space-y-1.5 relative z-[100]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSettlementSelectionMode("single");
                      setSelectedBatchIds([]);
                    }}
                    className={clsx("px-3 py-2 rounded-xl text-[10px] font-black border transition-all", settlementSelectionMode === "single" ? "bg-teal-600 text-white border-teal-700" : "bg-white text-slate-600 border-slate-200")}
                  >
                    تسوية شيك بشيك
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettlementSelectionMode("batch");
                      setSelAdvId("");
                    }}
                    className={clsx("px-3 py-2 rounded-xl text-[10px] font-black border transition-all", settlementSelectionMode === "batch" ? "bg-indigo-600 text-white border-indigo-700" : "bg-white text-slate-600 border-slate-200")}
                  >
                    تسوية مجمعة
                  </button>
                </div>

                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {settlementSelectionMode === "batch" ? "اختر أكثر من شيك من نفس المسؤول" : "اختر السلفة أو الفاعلية"}
                </label>

                {settlementSelectionMode === "single" ? (
                  <select value={selAdvId} onChange={e => setSelAdvId(e.target.value)} className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:border-teal-500 h-[42px]", T.sel)}>
                    <option value="">— الشيكات التي تتطلب تسوية —</option>
                    {currentTxnOptions.map(a => (
                      <option key={toEntityId(a.id) || a.id} value={toEntityId(a.id)}>
                        {getIssuedCheckDisplayParty(a)} {a.settlement_mode === "check_plus_subscriptions" ? "(رحلة)" : a.settlement_mode === "carry_forward" ? "(سلفة)" : "(شيك تسوية)"} — {a.date || "—"} — شيك: {formatCheckNumber(a.checkNum)} — {formatMoney(a.amount)} {a.isSettled ? "— [تعديل تسوية]" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-200 p-2 bg-slate-50/80">
                    {currentTxnOptions.map((tx) => {
                      const txId = toEntityId(getIssuedCheckDocId(tx) || tx.id);
                      const sameEmployee =
                        !batchAnchorTxn ||
                        String(batchSelectionConstraint.employeeId) === String(tx.employeeId || tx.party || "");
                      const sameMode =
                        !batchAnchorTxn ||
                        String(batchSelectionConstraint.settlementMode) === String(tx.settlement_mode || tx.settlementMode || "");
                      const disabled = !!batchAnchorTxn && (!sameEmployee || !sameMode);
                      return (
                        <label key={txId || tx.id} className={clsx("flex items-start gap-2 rounded-xl p-2 text-[10px] font-bold border transition-colors", disabled ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-white border-slate-200 hover:border-indigo-300")}>
                          <input
                            type="checkbox"
                            checked={selectedBatchIds.includes(txId)}
                            disabled={disabled}
                            onChange={() => toggleBatchTransaction(tx)}
                            className="mt-0.5 accent-indigo-600"
                          />
                          <span className="leading-relaxed">
                            {getIssuedCheckDisplayParty(tx)} {tx.settlement_mode === "check_plus_subscriptions" ? "(رحلة)" : tx.settlement_mode === "carry_forward" ? "(سلفة)" : "(شيك تسوية)"} — {tx.date || "—"} — شيك: {formatCheckNumber(tx.checkNum)} — {formatMoney(tx.amount)}
                          </span>
                        </label>
                      );
                    })}
                    {currentTxnOptions.length === 0 && <p className="text-[10px] font-bold text-slate-400 p-2">لا توجد شيكات مفتوحة للتجميع حاليًا.</p>}
                  </div>
                )}

                {settlementSelectionMode === "batch" && selectedBatchTransactions.length > 0 && (
                  <div className="text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 space-y-1">
                    <p>تم اختيار {selectedBatchTransactions.length} شيك بإجمالي {formatMoney(ADVANCE_AMT)} لنفس المسؤول وبنفس نمط التسوية.</p>
                    <p className="text-amber-700">إجمالي المتاح للتسوية = قيمة الشيكات {formatMoney(ADVANCE_AMT)} + آخر رصيد مرحل {formatMoney(PREV_BALANCE)} = {formatMoney(TOTAL_AVAILABLE)}</p>
                    <p className="text-slate-500">يُحتسب الرصيد المرحل مرة واحدة فقط ولا يتكرر مع كل شيك داخل المجموعة.</p>
                  </div>
                )}

                {editingSettlementId && (
                  <Alert
                    tone="warning"
                    title="وضع تعديل تسوية معتمدة"
                    description="سيتم استخدام نفس مسار الحفظ الحالي عند الاعتماد، بدون تغيير طريقة احتساب المبالغ."
                    action={
                      <button onClick={() => { setEditingSettlementId(""); setSelAdvId(""); }} className="text-[10px] font-black text-amber-700 hover:text-rose-600 transition-colors">
                        إلغاء التعديل
                      </button>
                    }
                    className="mt-2"
                  />
                )}

                {activeSettlementTxn && settlementMode === "check_plus_subscriptions" && (
                  <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/30 rounded-xl space-y-1.5 animate-in fade-in">
                    <label className="text-[9px] font-black text-indigo-700 uppercase">اشتراكات الأعضاء</label>
                    <div className="relative">
                      <DollarSign size={14} className="absolute right-3 top-2.5 text-indigo-400" />
                      <input type="number" value={collectedSubs} onChange={e => setCollectedSubs(e.target.value)} placeholder="مثال: 5000" className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:ring-2 focus:border-indigo-400 h-[38px] bg-white", T.inp)} />
                    </div>
                  </div>
                )}
              </div>

              {activeSettlementTxn && (
                <div className={clsx("flex-1 w-full grid gap-2", settlementMode === "check_plus_subscriptions" ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3")}>
                  <FinanceCard label={settlementMode === "carry_forward" ? "أصل السلفة" : "قيمة الشيك"} value={ADVANCE_AMT} color="slate" icon={ArrowDownRight} />

                  {settlementMode === "check_plus_subscriptions" ? (
                    <FinanceCard label="اشتراكات الأعضاء" value={SUBS_AMT} color="indigo" icon={Plus} />
                  ) : (
                    <FinanceCard label="رصيد مرحل" value={PREV_BALANCE} color="amber" icon={History} />
                  )}

                  <FinanceCard label="إجمالي الميزانية" value={TOTAL_AVAILABLE} color="teal" icon={Wallet} isTotal />
                  <FinanceCard label="المتبقي للرد" value={remaining} color={remaining >= 0 ? "emerald" : "rose"} icon={ReceiptText} />
                </div>
              )}
            </div>
          </div>

          <div className={clsx("lg:col-span-4 p-4 rounded-2xl border shadow-sm space-y-4 h-fit", T.card, !activeSettlementTxn && "opacity-50 pointer-events-none")}>
            <h3 className="font-black text-xs flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2 text-amber-600">
              <Plus size={14} /> إدراج فاتورة جديدة
            </h3>

            <div className="space-y-3">
              <InlineDynamicSelect label="تصنيف المصروف (+ جديد)" defaultOptions={INITIAL_CATS} value={expCat} onChange={setExpCat} icon={Tag} />

              {isMeetingAllowanceCategory(expCat) && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/30 rounded-xl space-y-2 animate-in fade-in">
                  <label className="text-[10px] font-black text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                    <FileText size={14} /> اختر الاجتماع المنعقد
                  </label>
                  <select value={expMeetingId} onChange={e => setExpMeetingId(e.target.value)} className={clsx("w-full px-2 py-2 rounded-lg border text-[10px] font-bold outline-none", T.sel)}>
                    <option value="">
                      {availableMeetings.length > 0 ? "-- اختر الاجتماع --" : "-- لا توجد اجتماعات متاحة لهذا البدل --"}
                    </option>
                    {availableMeetings.map(m => (
                      <option key={toEntityId(m.id) || m.id} value={toEntityId(m.id)}>
                        {m.title} — {m.date || "—"} — الحضور: {m.attendees?.length || 0}
                      </option>
                    ))}
                  </select>
                  {selectedMeeting && (
                    <p className="text-[9px] font-black text-indigo-600 mt-1 flex gap-1 bg-indigo-100/50 dark:bg-indigo-900/50 p-1.5 rounded">
                      <Info size={10} className="shrink-0" />
                      {expCat === "بدل جلسات"
                        ? `سيتم توزيع ${formatMoney(expAmt || 0)} على ${selectableBoardMembers.length || selectedMeeting.attendees?.length || 0} من الحاضرين`
                        : `سيتم ربط ${ALLOWANCE_TYPE_LABELS[getMeetingAllowanceType(expCat)] || expCat} بالاجتماع: ${selectedMeeting.title || "—"}`}
                    </p>
                  )}
                </div>
              )}

              {isBoardAllowanceCategory(expCat) && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/30 rounded-xl space-y-2 animate-in fade-in">
                  <label className="text-[10px] font-black text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                    <Users size={14} /> {selectedMeeting ? "أعضاء الاجتماع المستحقون" : `تحديد أعضاء المجلس المستحقين لـ ${expCat}`}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-white dark:bg-slate-800 rounded-lg border border-indigo-100 dark:border-indigo-800">
                    {selectableBoardMembers.map(m => {
                      const memberId = toEntityId(m.id);
                      const endedState = getEffectiveMemberState(m);
                      const showState = endedState && endedState !== "نشط";
                      return (
                        <label key={memberId || m.id} className="flex items-center gap-2 text-[10px] font-bold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 p-1 rounded transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedMembers.includes(memberId)}
                            disabled={false}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedMembers(p => toEntityIdList([...p, memberId]));
                              else setSelectedMembers(p => p.filter(id => id !== memberId));
                            }}
                            className="accent-indigo-600"
                          />
                          <span>{String(m?.name || "—").split(" ").slice(0, 2).join(" ")}</span>
                          {m.jobId && <span className="text-slate-400 font-bold">({m.jobId})</span>}
                          {showState && <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">{endedState}</span>}
                        </label>
                      )
                    })}
                    {selectableBoardMembers.length === 0 && <p className="text-[9px] text-slate-400 p-1">لا يوجد أعضاء مجلس مستحقون لهذا التاريخ</p>}
                  </div>
                  {expAmt && selectedMembers.length > 0 && (
                    <p className="text-[9px] font-black text-indigo-600 mt-1 flex gap-1 bg-indigo-100/50 dark:bg-indigo-900/50 p-1.5 rounded">
                      <Info size={10} className="shrink-0" /> {expCat}: نصيب العضو {formatMoney(Number(expAmt) / selectedMembers.length)}
                    </p>
                  )}
                </div>
              )}

              {isPrizeCategory(expCat) && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl space-y-2 animate-in fade-in">
                  <label className="text-[10px] font-black text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <Gift size={14} /> المستفيدون من الجوائز النقدية ({prizeRecipients.length})
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={prizeSearch}
                      onChange={(e) => setPrizeSearch(e.target.value)}
                      placeholder="ابحث بالاسم أو الكود أو الرقم القومي..."
                      className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:ring-2 focus:border-amber-500", T.inp)}
                    />
                    {prizeSearch.trim().length >= 2 && (
                      <div className="absolute z-[120] mt-1 w-full rounded-xl border bg-white dark:bg-slate-900 shadow-xl overflow-hidden max-h-44 overflow-y-auto">
                        {prizeEmployeesResults.length === 0 ? (
                          <p className="p-3 text-[11px] font-bold text-slate-400 text-center">لا توجد نتائج مطابقة</p>
                        ) : prizeEmployeesResults.map((emp) => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => addPrizeRecipient(emp)}
                            className="w-full text-right p-2.5 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-b last:border-b-0 border-slate-100 dark:border-slate-800 transition-colors"
                          >
                            <span className="block text-xs font-black text-slate-800 dark:text-slate-100">{emp.name}</span>
                            <span className="block text-[10px] font-bold text-slate-400 mt-0.5">
                              {emp.jobId ? `كود: ${emp.jobId}` : ""}{emp.membershipStatus ? ` • ${emp.membershipStatus}` : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {prizeRecipients.map((r) => (
                    <div key={r.memberId} className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-2 border border-amber-100 dark:border-amber-800/40">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black truncate">{r.name}</p>
                        <p className="text-[9px] font-bold text-slate-400">كود: {r.jobId || r.memberId}</p>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={r.amount}
                        onChange={(e) => updatePrizeAmount(r.memberId, e.target.value)}
                        placeholder="المبلغ"
                        className={clsx("w-28 px-2 py-1.5 rounded-lg border text-xs font-black outline-none focus:ring-2 focus:border-amber-500", T.inp)}
                      />
                      <button type="button" onClick={() => removePrizeRecipient(r.memberId)} className="p-1.5 text-rose-400 hover:text-rose-600 shrink-0" title="إزالة المستفيد">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      type="text"
                      value={prizeMeta.contestName}
                      onChange={(e) => setPrizeMeta((p) => ({ ...p, contestName: e.target.value }))}
                      placeholder="اسم المسابقة / المناسبة (اختياري)"
                      className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:ring-2 focus:border-amber-500", T.inp)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={prizeMeta.decisionNo}
                        onChange={(e) => setPrizeMeta((p) => ({ ...p, decisionNo: e.target.value }))}
                        placeholder="رقم القرار (اختياري)"
                        className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:ring-2 focus:border-amber-500", T.inp)}
                      />
                      <input
                        type="text"
                        value={prizeMeta.minutesNo}
                        onChange={(e) => setPrizeMeta((p) => ({ ...p, minutesNo: e.target.value }))}
                        placeholder="رقم المحضر (اختياري)"
                        className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none focus:ring-2 focus:border-amber-500", T.inp)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-amber-100/60 dark:bg-amber-900/30 rounded-lg px-3 py-2">
                    <span className="text-[10px] font-black text-amber-800 dark:text-amber-300">إجمالي الفاتورة تلقائياً</span>
                    <span className="text-sm font-black text-amber-800 dark:text-amber-300">{formatMoney(prizeTotalAmount)} ج.م</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase pr-1">المبلغ</label>
                  {isPrizeCategory(expCat) ? (
                    <div className="w-full px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 text-xs font-black h-[38px] flex items-center">
                      {formatMoney(prizeTotalAmount)} ج.م (تلقائي)
                    </div>
                  ) : (
                  <input type="number" value={expAmt} onChange={e => setExpAmt(e.target.value)} placeholder={`المتاح: ${remaining}`} className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-black outline-none focus:ring-2 focus:border-amber-500 h-[38px]", T.inp, Number(expAmt) > remaining && "!border-rose-500 bg-rose-50/10")} />
                  )}
                </div>
                <div className="space-y-1 relative z-[90]">
                  <ArabicDatePicker label="تاريخ الفاتورة" value={expDate} onChange={setExpDate} maxVal={getTodayISO()} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase pr-1">بيان وملاحظات</label>
                <input type="text" value={expNotes} onChange={e => setExpNotes(e.target.value)} placeholder="مثال: فاتورة صيانة..." className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:border-amber-500 h-[38px]", T.inp)} />
              </div>

              <FileUpload txId={`tmp_${selAdvId}`} existingFiles={expFiles} onChange={setExpFiles} />

              {editingExpense && (
                <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40">
                  <p className="text-[10px] font-black text-amber-700 dark:text-amber-400">جاري تعديل بند من كشف التسوية</p>
                  <button onClick={resetExpenseForm} className="text-[10px] font-black text-amber-700 hover:text-rose-600 transition-colors">
                    إلغاء التعديل
                  </button>
                </div>
              )}

              <button onClick={addExpense} disabled={isPrizeCategory(expCat) ? (prizeTotalAmount <= 0 || prizeTotalAmount > (editingExpense ? availableForExpense : remaining)) : (!expAmt || Number(expAmt) <= 0 || Number(expAmt) > (editingExpense ? availableForExpense : remaining))} className="w-full py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-black text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40">
                <Plus size={14} /> إدراج للكشف
              </button>
            </div>
          </div>

          <div className={clsx("lg:col-span-8 p-4 rounded-2xl border shadow-sm flex flex-col", T.card, !activeSettlementTxn && "opacity-50 pointer-events-none")}>
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <h3 className="font-black text-[11px] uppercase tracking-widest flex items-center gap-2"><ReceiptText size={16} className="text-teal-600" /> الفواتير المدرجة ({expenses.length})</h3>
              <div className="flex items-center gap-3">
                <div className="z-[100] w-32"><ArabicDatePicker value={settlementDate} onChange={setSettlementDate} maxVal={getTodayISO()} /></div>
                <div className="text-left bg-rose-50 dark:bg-rose-900/20 px-3 py-1.5 rounded-xl border border-rose-100 dark:border-rose-800 text-rose-600">
                  <p className="text-[8px] font-black uppercase tracking-widest">إجمالي المنصرف</p>
                  <p className="text-lg font-black leading-none mt-0.5">{formatMoney(spent || 0)}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto min-h-[250px]">
              <table className="w-full text-right text-[11px]">
                <thead className="bg-slate-50/80 dark:bg-slate-800/50 border-b">
                  <tr>{["التصنيف", "البيان والتاريخ", "المبلغ", "إجراء"].map((h, i) => <th key={i} className="p-2.5 text-slate-400 font-black">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                  {expenses.length === 0 ? (
                    <tr><td colSpan={4} className="p-16 text-center text-slate-400 font-bold text-xs border-2 border-dashed rounded-xl mt-4">الكشف فارغ — قم بإضافة فواتير</td></tr>
                  ) : expenses.map((e) => (
                    <tr key={e.id} onClick={() => startEditExpense(e)} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group cursor-pointer">
                      <td className="p-2.5 font-black text-teal-600">
                        {e.category}
                        {isBoardAllowanceCategory(e.category) && <span className="block text-[8px] text-indigo-500 mt-0.5 font-bold">بدل مستقل داخل كشف التسوية</span>}
                        {e.meetingTitle && <span className="block text-[8px] text-sky-600 mt-0.5 font-bold">الاجتماع: {e.meetingTitle}</span>}
                        {isPrizeCategory(e.category) && Array.isArray(e.prizeRecipients) && e.prizeRecipients.length > 0 && <span className="block text-[8px] text-amber-600 mt-0.5 font-bold">جوائز نقدية{e.prizeMeta?.contestName ? ` — ${e.prizeMeta.contestName}` : ""} لعدد {e.prizeRecipients.length} مستفيد: {e.prizeRecipients.slice(0, 3).map((r) => r.name).join("، ")}{e.prizeRecipients.length > 3 ? "…" : ""}</span>}
                        {e.boardMembers?.length > 0 && <span className="block text-[8px] text-indigo-500 mt-0.5 font-bold">لعدد {e.boardMembers.length} أعضاء</span>}
                        {Number(e.allowancePerMember || 0) > 0 && <span className="block text-[8px] text-amber-600 mt-0.5 font-bold">نصيب العضو: {formatMoney(e.allowancePerMember)}</span>}
                      </td>
                      <td className="p-2.5">
                        <p className="font-bold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">{e.notes || "—"}</p>
                        <p className="text-[9px] font-black text-slate-400 mt-0.5">{e.date}</p>
                      </td>
                      <td className="p-2.5 font-black text-rose-600 text-sm">{formatMoney(e.amount || 0)}</td>
                      <td className="p-2.5 text-left">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(event) => { event.stopPropagation(); startEditExpense(e); }}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="تعديل الفاتورة"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={(event) => { event.stopPropagation(); setExpenseToDelete(e); }}
                            className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="حذف الفاتورة"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/20 p-3 rounded-xl">
              <div className="space-y-0.5">
                <p className="text-[9px] font-black text-slate-400 uppercase">موقف الميزانية:</p>
                <p className={clsx("text-base font-black", remaining >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {remaining >= 0 ? `متبقي للرد: ${formatMoney(remaining)}` : `تجاوز للصرف: ${formatMoney(Math.abs(remaining))}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleSaveDraft} disabled={saving || expenses.length === 0} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl font-black text-xs transition-all flex items-center gap-1.5 border shadow-sm active:scale-95 disabled:opacity-40">
                  <Save size={14} /> حفظ مؤقت
                </button>
                <button onClick={openConfirmModal} disabled={expenses.length === 0} className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-black text-xs shadow-md active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5">
                  <CheckCircle2 size={16} /> {editingSettlementId ? "حفظ التعديلات" : "اعتماد نهائي"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "diagnostic" && <DiagnosticPanel
        issuedChecks={issuedChecks}
        legacyTransactions={legacyTransactions}
        normalizedSourceTransactions={normalizedSourceTransactions}
        openAdvances={openAdvances}
        T={T}
        formatMoney={formatMoney}
        formatInteger={formatInteger}
      />}

      {activeTab === "archive" && (
        <div className={clsx("rounded-2xl border shadow-sm overflow-hidden animate-in fade-in duration-500", T.card)}>
          <div className="p-4 border-b flex flex-wrap justify-between items-center gap-3 bg-slate-50/50 dark:bg-slate-900/20">
            <h3 className="font-black text-[11px] uppercase tracking-widest flex items-center gap-2"><History size={14} className="text-teal-600" /> أرشيف وتسويات العهد والأنشطة</h3>
            <SettlementArchiveFilters
              search={archiveSearch}
              onSearchChange={setArchiveSearch}
              month={archiveMonth}
              onMonthChange={setArchiveMonth}
              year={archiveYear}
              onYearChange={setArchiveYear}
              months={ARABIC_MONTHS}
              years={archiveYears}
              resultCount={filteredArchivedSettlements.length}
              attachmentCount={dataUrlHits.length}
              onOpenMigration={() => { setMigrationReport(null); setShowMigration(true); }}
            />
          </div>

          {hiddenSettledSettlements.length > 0 && (
            <div className="border-b border-rose-200 dark:border-rose-800/40 bg-rose-50/40 dark:bg-rose-900/10">
              <div className="px-4 py-3 flex items-center gap-2 border-b border-rose-100 dark:border-rose-800/30">
                <AlertTriangle size={14} className="text-rose-600" />
                <h4 className="font-black text-[10px] uppercase tracking-widest text-rose-700 dark:text-rose-400">
                  تسويات مسواة لا تظهر في الأرشيف ({hiddenSettledSettlements.length}) — احذفها أو أعد تعيينها ثم سوّها من جديد
                </h4>
                <button onClick={handleHiddenResetAll} disabled={saving} className="mr-auto px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-[10px] transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1 shrink-0">
                  <RotateCcw size={12} /> إعادة تعيين الكل
                </button>
                {hiddenSettledSettlements.some((h) => h.isGrouped) && (
                  <button onClick={handleUngroupAll} disabled={saving} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-[10px] transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1 shrink-0">
                    <RotateCcw size={12} /> فك المجمعة وإرجاع الشيكات مفتوحة
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-[11px]">
                  <thead>
                    <tr className="bg-rose-100/50 dark:bg-rose-900/20">
                      {["المسؤول", "النوع", "المبلغ", "التاريخ", "الشيك", "السبب", ""].map((h, i) => <th key={i} className="p-3 font-black text-rose-700 dark:text-rose-400 text-[9px] uppercase whitespace-nowrap">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100 dark:divide-rose-800/30">
                    {hiddenSettledSettlements.map((h) => (
                      <tr key={h.uid} className="hover:bg-rose-50/80 dark:hover:bg-rose-900/20 transition-colors">
                        <td className="p-3 font-black text-slate-800 dark:text-slate-100 max-w-[150px] break-words">{h.party}</td>
                        <td className="p-3 font-bold text-slate-500 whitespace-nowrap">{h.typeLabel}</td>
                        <td className="p-3 font-black text-slate-600 whitespace-nowrap">{formatMoney(h.amount)}</td>
                        <td className="p-3 font-bold text-slate-500 whitespace-nowrap">{h.date || "—"}</td>
                        <td className="p-3 font-bold text-slate-500 whitespace-nowrap">{h.checkNum || "—"}</td>
                        <td className="p-3 text-[10px] font-bold text-rose-600 dark:text-rose-400 max-w-[230px] break-words">{h.reason}</td>
                        <td className="p-3 text-left whitespace-nowrap">
                          {!h.isGrouped ? (
                            <button onClick={() => handleHiddenReset(h.record)} disabled={saving} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-[10px] transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1">
                              <RotateCcw size={12} /> إعادة تعيين
                            </button>
                          ) : (
                            <span className="text-[9px] font-bold text-slate-400">يُعاد تعيينه من قائد المجموعة في الأرشيف</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <SettlementDraftSection
            drafts={draftSettlements}
            formatMoney={formatMoney}
            onContinue={continueDraft}
            onDiscard={handleDiscardDraftSettlement}
          />

          <SettlementArchiveTable
            rows={archiveTableRows}
            totalCount={filteredArchivedSettlements.length}
            visibleCount={archiveVisibleCount}
            onLoadMore={() => setArchiveVisibleCount((v) => v + 50)}
            formatMoney={formatMoney}
            onEdit={startEditSettlement}
            onRecover={handleRecoverFromArchive}
            onDelete={setSettlementToDelete}
            onPrint={printArchivedSettlementRow}
          />
        </div>
      )}

      {showMigration && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className={clsx("w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 rounded-3xl shadow-2xl border space-y-4 animate-in zoom-in-95", T.card)}>
            <div className="flex items-center gap-3 text-sky-600 border-b border-sky-100 pb-3">
              <div className="p-2.5 bg-sky-100 rounded-xl"><Download size={20} /></div>
              <div><h2 className="font-black text-sm">ترحيل المرفقات إلى التخزين السحابي</h2></div>
            </div>
            <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
              المرحلة 1: رفع نسخ سحابية. المرحلة 2: الاستبدال مع الاحتفاظ بالأصل بحقل legacyUrl. المرحلة 3: تحقق بالقراءة. لا تُمس المستندات إذا فشل أي رفع.
            </p>
            <div className="max-h-56 overflow-y-auto rounded-xl border divide-y divide-slate-100 dark:divide-slate-800">
              {dataUrlHits.length === 0 ? (
                <p className="p-4 text-[11px] font-bold text-emerald-600 text-center">لا توجد مرفقات نصية — كل المرفقات سحابية بالفعل.</p>
              ) : dataUrlHits.slice(0, 100).map((h, i) => (
                <div key={i} className="px-4 py-2 text-[11px] font-bold flex justify-between gap-2">
                  <span className="truncate">{h.label} — {h.name}</span>
                  <span className="text-slate-400 shrink-0">{h.fileIndex + 1}</span>
                </div>
              ))}
            </div>
            {migrationReport && (
              <div className={clsx("p-3 rounded-xl text-[11px] font-black", migrationReport.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-600 border border-rose-200")}>
                {migrationReport.msg}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowMigration(false)} disabled={migrating} className="flex-1 py-2.5 rounded-xl border text-xs font-black disabled:opacity-50">إغلاق</button>
              <button onClick={runAttachmentMigration} disabled={migrating || dataUrlHits.length === 0} className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-xs font-black disabled:opacity-50">
                {migrating ? "جارٍ الترحيل..." : `بدء الترحيل (${dataUrlHits.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
