import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { FileSpreadsheet } from "lucide-react";
import { db } from "../../../app/providers/FirebaseProvider";
import { useAuth } from "../../../app/providers/AuthProvider";
import { Button, Card, DataTable, PageHeader, StatusBadge } from "../../../ui/enterprise";
import { PERMISSIONS } from "../../../security/permissions";
import { CHECKBOOK_STATUS, getCheckLifecycle, getCheckStatusLabel } from "./checkbookConstants";
import { subscribeCheckbooks } from "./services/checkbookService";
import { formatMoney } from "../../../utils/numberFormat";
import { downloadAs } from "../../../utils/downloadData";
import { openPrintWindow } from "../../../utils/print";
import { escapeHtml } from "../../../utils/escapeHtml";
import { getPrintBrandHeader, getPrintBrandStyles } from "../../../utils/branding";
import { buildCheckbookPosition, getCheckAmount } from "./checkbookMetrics";

const TABS = [
  ["books", "دفاتر الشيكات"], ["checks", "الشيكات"], ["cancelled", "الملغاة"],
  ["uncashed", "غير المنصرفة"], ["cashed", "المنصرفة"], ["position", "موقف الدفاتر"],
];

export default function CheckbookReports() {
  const { can } = useAuth();
  const canExport = can(PERMISSIONS.reportsExport);
  const [books, setBooks] = useState([]);
  const [checks, setChecks] = useState([]);
  const [tab, setTab] = useState("books");

  useEffect(() => subscribeCheckbooks(setBooks), []);
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "issued_checks")), (s) =>
      setChecks(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, []);

  const rows = useMemo(() => {
    switch (tab) {
      case "cancelled": return checks.filter((c) => c.checkStatus === "cancelled");
      case "uncashed": return checks.filter((c) => getCheckLifecycle(c) === "uncashed" || getCheckLifecycle(c) === "delivered");
      case "cashed": return checks.filter((c) => getCheckLifecycle(c) === "cashed");
      case "checks": return checks;
      default: return [];
    }
  }, [tab, checks]);

  const total = useMemo(() => rows.reduce((s, c) => s + getCheckAmount(c), 0), [rows]);

  const position = useMemo(() => buildCheckbookPosition(books, checks), [books, checks]);

  const bookColumns = useMemo(() => [
    { key: "requestNo", header: "رقم الطلب" },
    { key: "requestDate", header: "التاريخ" },
    { key: "bank", header: "البنك" },
    { key: "status", header: "الحالة", render: (book) => CHECKBOOK_STATUS[book.status] || book.status || "—" },
    { key: "range", header: "النطاق", render: (book) => <span dir="ltr">{book.serialFrom || "—"} → {book.serialTo || "—"}</span> },
    { key: "checksCount", header: "العدد" },
  ], []);

  const positionColumns = useMemo(() => [
    { key: "book", header: "الدفتر", render: (item) => item.book.requestNo || "—" },
    { key: "range", header: "النطاق", render: (item) => <span dir="ltr">{item.book.serialFrom || "—"} → {item.book.serialTo || "—"}</span> },
    { key: "total", header: "الإجمالي" },
    { key: "used", header: "المستخدم" },
    { key: "cashed", header: "منصرف" },
    { key: "uncashed", header: "غير منصرف" },
    { key: "cancelled", header: "ملغى" },
    { key: "available", header: "متاح" },
  ], []);

  const checkColumns = useMemo(() => [
    { key: "checkNum", header: "الشيك", render: (check) => <span dir="ltr" className="font-black tabular-nums">{check.checkNum || "—"}</span> },
    { key: "date", header: "التاريخ" },
    { key: "party", header: "المستفيد", render: (check) => check.party || check.beneficiaryName || "—" },
    { key: "amount", header: "المبلغ", render: (check) => formatMoney(getCheckAmount(check)), numeric: true },
    { key: "status", header: "الحالة", render: (check) => <StatusBadge>{getCheckStatusLabel(check)}</StatusBadge> },
    { key: "linkedAdvanceRef", header: "السلفة", render: (check) => check.linkedAdvanceRef || "—" },
    { key: "linkedSettlementId", header: "التسوية", render: (check) => check.linkedSettlementId || "—" },
  ], []);

  const exportRows = async (format) => {
    if (!canExport) return;
    const data = tab === "books"
      ? books.map((b) => ({ الطلب: b.requestNo, التاريخ: b.requestDate, البنك: b.bank, الحالة: CHECKBOOK_STATUS[b.status], من: b.serialFrom, إلى: b.serialTo, العدد: b.checksCount, القرار: b.decisionNo || "", السبب: b.reason || "" }))
      : tab === "position"
        ? position.map((p) => ({ الدفتر: p.book.requestNo, النطاق: `${p.book.serialFrom}→${p.book.serialTo}`, الإجمالي: p.total, المستخدم: p.used, منصرف: p.cashed, "غير منصرف": p.uncashed, ملغى: p.cancelled, متاح: p.available }))
        : rows.map((c) => ({ الشيك: c.checkNum, التاريخ: c.date, المستفيد: c.party || c.beneficiaryName, المبلغ: Number(c.amount || 0), الحالة: getCheckStatusLabel(c), التسليم: c.deliverDate || "", الصرف: c.cashDate || "", الإلغاء: c.cancelDate || "", السبب: c.cancelReason || "", البديل: c.replacementCheckNum || "", السلفة: c.linkedAdvanceRef || "", التسوية: c.linkedSettlementId || "" }));
    await downloadAs(format, data, `تقرير_الشيكات_${tab}`);
  };

  const print = () => {
    if (!canExport) return;
    const win = openPrintWindow("check-report", "width=1100,height=800");
    if (!win) return;
    const tabLabel = TABS.find(([id]) => id === tab)?.[1] || tab;
    const body = tab === "books"
      ? books.map((b, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(b.requestNo || "")}</td><td>${escapeHtml(b.requestDate || "")}</td><td>${escapeHtml(b.bank || "")}</td><td>${escapeHtml(CHECKBOOK_STATUS[b.status] || "")}</td><td>${escapeHtml(b.serialFrom || "")}→${escapeHtml(b.serialTo || "")}</td><td>${escapeHtml(String(b.checksCount || ""))}</td></tr>`).join("")
      : tab === "position"
        ? position.map((p, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(p.book.requestNo || "")}</td><td>${escapeHtml(String(p.total))}</td><td>${escapeHtml(String(p.used))}</td><td>${escapeHtml(String(p.cashed))}</td><td>${escapeHtml(String(p.uncashed))}</td><td>${escapeHtml(String(p.cancelled))}</td><td>${escapeHtml(String(p.available))}</td></tr>`).join("")
        : rows.map((c, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(c.checkNum || "")}</td><td>${escapeHtml(c.party || "")}</td><td>${escapeHtml(formatMoney(Number(c.amount || 0)))}</td><td>${escapeHtml(getCheckStatusLabel(c))}</td></tr>`).join("");
    win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير الشيكات - ${escapeHtml(tabLabel)}</title><style>${getPrintBrandStyles()}body{font-family:Arial,Tahoma,sans-serif;padding:16px;color:#111827}table{position:relative;z-index:1;width:100%;border-collapse:collapse;background:#fff}th,td{border:1px solid #999;padding:6px;font-size:12px;text-align:center}th{background:#eee}.summary{position:relative;z-index:1;margin-top:12px;font-size:13px;font-weight:800}@media print{body{padding:0}thead{display:table-header-group}tr,td,th{break-inside:avoid;page-break-inside:avoid}}</style></head><body>${getPrintBrandHeader({ reportTitle: `تقرير الشيكات - ${tabLabel}`, reportMeta: `الإجمالي: ${formatMoney(total)}` })}<table><tbody>${body}</tbody></table><p class="summary">الإجمالي: ${escapeHtml(formatMoney(total))}</p><script>onload=()=>setTimeout(()=>print(),400)</script></body></html>`);
    win.document.close();
  };

  return (
    <div className="max-w-7xl mx-auto pb-10 flex flex-col gap-3" dir="rtl">
      <PageHeader
        title="تقارير الشيكات"
        hint="ملغاة / غير منصرفة / منصرفة / موقف الدفاتر"
        icon={FileSpreadsheet}
        crumbs={[{ label: "الماليات" }, { label: "تقارير الشيكات" }]}
      />
      <div className="bg-white border rounded-2xl p-3 flex flex-wrap gap-1 items-center">
        {TABS.map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${tab === id ? "bg-violet-700 text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 hover:bg-violet-700/10"}`}>{l}</button>
        ))}
        {canExport && (
          <div className="mr-auto flex gap-1">
            <Button onClick={print} variant="outline" size="sm">طباعة</Button>
            <Button onClick={() => exportRows("xlsx")} size="sm">Excel</Button>
          </div>
        )}
      </div>
      <Card compact>
          {tab === "books" && (
            <DataTable rows={books} columns={bookColumns} emptyTitle="لا توجد دفاتر" />
          )}
          {tab === "position" && (
            <DataTable rows={position} columns={positionColumns} rowKey="book.id" emptyTitle="لا توجد دفاتر مستلمة" />
          )}
          {!["books", "position"].includes(tab) && (
            <DataTable rows={rows} columns={checkColumns} emptyTitle="لا توجد بيانات" />
          )}
        {!["books", "position"].includes(tab) && (
          <div className="p-3 border-t font-black text-sm">الإجمالي: {formatMoney(total)} ({rows.length} شيك)</div>
        )}
      </Card>
    </div>
  );
}
