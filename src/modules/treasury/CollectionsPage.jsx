import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import clsx from "clsx";
import { AlertTriangle, CalendarClock, Hourglass, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { db } from "../../app/providers/FirebaseProvider";
import { useT } from "../../app/providers/ThemeProvider";
import BrandHeader from "../../ui/BrandHeader";
import { StatCard, StatusBadge } from "../../ui/enterprise";
import { formatMoney } from "../../utils/numberFormat";
import { normalizeRequiresSettlement } from "../treasury/helpers/issuedChecks";

const getTodayISO = () => new Date().toISOString().split("T")[0];

const daysBetween = (from, to = getTodayISO()) => {
  const a = new Date(from || "");
  const b = new Date(to);
  if (Number.isNaN(a.getTime())) return 0;
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
};

function Section({ title, icon, count, to, children, cardClass }) {
  return (
    <div className={clsx("rounded-2xl border shadow-sm overflow-hidden", cardClass)}>
      <div className="p-4 border-b flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-sm font-black flex items-center gap-2"><span className="text-amber-600 flex">{icon}</span> {title} ({count})</h3>
        {to && <Link to={to} className="text-[10px] font-black text-violet-700 hover:underline">فتح الشاشة</Link>}
      </div>
      {children}
    </div>
  );
}

export default function CollectionsPage() {
  const T = useT();
  const [bookings, setBookings] = useState([]);
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let bOk = false, cOk = false;
    const done = () => { if (bOk && cOk) setLoading(false); };
    const unsubB = onSnapshot(query(collection(db, "event_bookings")),
      (s) => { setBookings(s.docs.map((d) => ({ id: d.id, ...d.data() }))); bOk = true; done(); },
      () => { bOk = true; done(); });
    const unsubC = onSnapshot(query(collection(db, "issued_checks")),
      (s) => { setChecks(s.docs.map((d) => ({ id: d.id, ...d.data() }))); cOk = true; done(); },
      () => { cOk = true; done(); });
    return () => { unsubB(); unsubC(); };
  }, []);

  const installments = useMemo(() => {
    const rows = [];
    bookings.forEach((b) => {
      if (b.status === "cancelled") return;
      (Array.isArray(b.installmentPlan) ? b.installmentPlan : []).forEach((p, i) => {
        if (String(p.status || "pending") !== "pending") return;
        const due = p.dueDate || "";
        const age = due ? daysBetween(due) : 0;
        rows.push({
          id: `${b.id}:${i}`,
          memberName: b.memberName || "—",
          memberId: b.memberId || "—",
          eventTitle: b.eventTitle || "—",
          number: p.number ?? i + 1,
          dueDate: due || "—",
          amount: Number(p.amount || 0) - Number(p.paidAmount || 0),
          overdue: age > 0,
          age,
        });
      });
    });
    return rows.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  }, [bookings]);

  const pendingPayments = useMemo(
    () => bookings
      .filter((b) => b.status === "pending" || Number(b.remainingBalance || 0) > 0)
      .filter((b) => b.status !== "cancelled")
      .map((b) => ({
        id: b.id,
        memberName: b.memberName || "—",
        eventTitle: b.eventTitle || "—",
        total: Number(b.totalCost || 0),
        paid: Number(b.amountPaid || 0),
        remaining: Number(b.remainingBalance || 0),
        status: b.status,
      }))
      .sort((a, b) => b.remaining - a.remaining),
    [bookings]
  );

  const staleAdvances = useMemo(
    () => checks
      .filter((t) => normalizeRequiresSettlement(t) && !t.isSettled && (!t.state || ["posted", "approved"].includes(t.state)))
      .map((t) => ({
        id: t.id,
        party: t.employeeName || t.party || "—",
        checkNum: t.checkNum || "—",
        amount: Number(t.advanceAmountBase || t.amount || 0),
        date: t.date || "",
        age: daysBetween(t.date),
      }))
      .filter((t) => t.age >= 30)
      .sort((a, b) => b.age - a.age),
    [checks]
  );

  const totals = useMemo(() => ({
    installments: installments.reduce((s, r) => s + r.amount, 0),
    overdue: installments.filter((r) => r.overdue).reduce((s, r) => s + r.amount, 0),
    pending: pendingPayments.reduce((s, r) => s + r.remaining, 0),
    stale: staleAdvances.reduce((s, r) => s + r.amount, 0),
  }), [installments, pendingPayments, staleAdvances]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh] text-slate-400 font-black text-sm animate-pulse">جاري تحميل متابعة التحصيل...</div>;
  }

  return (
    <div className={clsx("max-w-[1600px] mx-auto space-y-5 pb-20 animate-in fade-in duration-500", T.text)} dir="rtl">
      <BrandHeader sectionTitle="متابعة التحصيل" sectionHint="أقساط مستحقة ومدفوعات معلقة وعهد متأخرة في مكان واحد" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="أقساط متأخرة" value={formatMoney(totals.overdue)} icon={AlertTriangle} tone="danger" />
        <StatCard label="إجمالي الأقساط القائمة" value={formatMoney(totals.installments)} icon={CalendarClock} tone="warning" />
        <StatCard label="مدفوعات حجوزات معلقة" value={formatMoney(totals.pending)} icon={Wallet} tone="info" />
        <StatCard label="عهد مفتوحة أكثر من 30 يوم" value={formatMoney(totals.stale)} icon={Hourglass} tone="brand" />
      </div>

      <Section title="أقساط مستحقة ومتأخرة" icon={<CalendarClock size={15} />} count={installments.length} to="/activities/bookings" cardClass={T.card}>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[11px]">
            <thead><tr className="bg-slate-50 dark:bg-slate-800/50 border-b">
              {["العضو", "الفعالية", "القسط", "الاستحقاق", "المبلغ", "الحالة"].map((h, i) => <th key={i} className="p-2.5 font-black text-slate-500 whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {installments.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold">لا توجد أقساط قائمة.</td></tr>
              ) : installments.map((r) => (
                <tr key={r.id} className={r.overdue ? "bg-rose-50/50 dark:bg-rose-900/10" : ""}>
                  <td className="p-2 font-black max-w-[180px] truncate">{r.memberName}</td>
                  <td className="p-2 max-w-[200px] truncate text-slate-500">{r.eventTitle}</td>
                  <td className="p-2 whitespace-nowrap">#{r.number}</td>
                  <td className="p-2 whitespace-nowrap font-bold">{r.dueDate}</td>
                  <td className="p-2 font-black whitespace-nowrap">{formatMoney(r.amount)}</td>
                  <td className="p-2 whitespace-nowrap">{r.overdue ? <StatusBadge tone="danger">متأخر {r.age} يوم</StatusBadge> : <StatusBadge tone="neutral">مستحق</StatusBadge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="مدفوعات حجوزات معلقة" icon={<Wallet size={15} />} count={pendingPayments.length} to="/activities/bookings" cardClass={T.card}>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[11px]">
            <thead><tr className="bg-slate-50 dark:bg-slate-800/50 border-b">
              {["العضو", "الفعالية", "الإجمالي", "المدفوع", "المتبقي", "الحالة"].map((h, i) => <th key={i} className="p-2.5 font-black text-slate-500 whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {pendingPayments.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold">لا توجد مدفوعات معلقة.</td></tr>
              ) : pendingPayments.map((r) => (
                <tr key={r.id}>
                  <td className="p-2 font-black max-w-[180px] truncate">{r.memberName}</td>
                  <td className="p-2 max-w-[200px] truncate text-slate-500">{r.eventTitle}</td>
                  <td className="p-2 whitespace-nowrap">{formatMoney(r.total)}</td>
                  <td className="p-2 whitespace-nowrap text-emerald-600 font-bold">{formatMoney(r.paid)}</td>
                  <td className="p-2 font-black text-rose-600 whitespace-nowrap">{formatMoney(r.remaining)}</td>
                  <td className="p-2 whitespace-nowrap"><StatusBadge tone={r.status === "pending" ? "warning" : "info"}>{r.status === "pending" ? "معلق" : "جزئي"}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="عهد مفتوحة أكثر من 30 يوماً" icon={<Hourglass size={15} />} count={staleAdvances.length} to="/treasury/settlements" cardClass={T.card}>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[11px]">
            <thead><tr className="bg-slate-50 dark:bg-slate-800/50 border-b">
              {["المسؤول", "الشيك", "المبلغ", "التاريخ", "العمر", ""].map((h, i) => <th key={i} className="p-2.5 font-black text-slate-500 whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {staleAdvances.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold">لا توجد عهد متأخرة.</td></tr>
              ) : staleAdvances.map((r) => (
                <tr key={r.id}>
                  <td className="p-2 font-black max-w-[180px] truncate">{r.party}</td>
                  <td className="p-2 whitespace-nowrap">{r.checkNum}</td>
                  <td className="p-2 font-black whitespace-nowrap">{formatMoney(r.amount)}</td>
                  <td className="p-2 whitespace-nowrap">{r.date || "—"}</td>
                  <td className="p-2 whitespace-nowrap"><StatusBadge tone="warning">{r.age} يوم</StatusBadge></td>
                  <td className="p-2"><Link to="/treasury/settlements" className="text-[10px] font-black text-violet-700 hover:underline whitespace-nowrap">تسوية</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
