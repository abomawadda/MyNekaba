/**
 * EventsMaster — لوحة تحكم وإدارة الفعاليات والأنشطة (النسخة المدمجة النهائية)
 *
 * ✅ حل جذري لمشكلة Array.isArray للمشرفين (توافق مع البيانات القديمة).
 * ✅ قفل التواريخ غير المنطقية (لا يمكن الغلق بعد الفعالية، ولا البدء بعد الغلق).
 * ✅ طباعة تقارير مالية وتفصيلية احترافية.
 * ✅ تسعير مزدوج (سعر العضو / سعر المرافق).
 * ✅ تنبيهات ذكية للفعاليات القريبة والحجوزات المعلقة.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection, query, onSnapshot, doc, addDoc, updateDoc,
  deleteDoc, serverTimestamp, orderBy, where
} from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { useT } from "../../app/providers/ThemeProvider";
import ArabicDatePicker from "../../ui/inputs/ArabicDatePicker";
import { Button, EmptyState, FilterBar, LoadingState, PageHeader, SearchInput, StatCard as EnterpriseStatCard, StatusBadge, getModuleIcon } from "../../ui/enterprise";
import { getPrintBrandHeader, getPrintBrandStyles } from "../../utils/branding";
import { BOARD_MEMBERSHIP_ROLES } from "../../utils/memberBenefits";
import { formatMoney } from "../../utils/numberFormat";
import { openPrintWindow } from "../../utils/print";
import {
  CalendarDays, Plus, Users, Ticket, CheckCircle2, AlertCircle,
  Clock, X, Save, Tent, ShieldAlert, Edit, Trash2, CalendarClock,
  TrendingUp, DollarSign, BarChart3, FileText, Printer, Search,
  Info, AlertTriangle, MapPin
} from "lucide-react";
import clsx from "clsx";
import {
  canManageActivities,
  requireEventManagementPermission,
} from "./activityAuthorization";

const DEVICE_EVENT_TYPE = "عرض أجهزة وموبايل";
const EVENT_TYPES = [DEVICE_EVENT_TYPE, "رحلة ترفيهية", "رحلة تثقيفية", "حفل إفطار", "مسابقة ثقافية", "مؤتمر/ندوة", "نشاط رياضي", "احتفالية", "أخرى"];
const getTodayISO = () => new Date().toISOString().split("T")[0];

const INITIAL_FORM = {
  title: "", type: EVENT_TYPES[0], date: getTodayISO(),
  bookingStart: getTodayISO(), bookingEnd: getTodayISO(),
  location: "", description: "", capacity: "", isFree: false,
  memberPrice: "", companionPrice: "", memberSupportValue: "", supervisors: [], notes: "",
  deviceCategory: "", deviceBrand: "", deviceModel: "", deviceColor: "", deviceStorage: "",
  devicePrice: "", installmentMonths: "", installmentStart: "", downPayment: "0", interestFree: true
};

// ── أدوات مساعدة ──
const getEventStatus = (event) => {
  const today = getTodayISO();
  if (event.date < today) return { label: "منتهية", color: "slate", bg: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" };
  const booked = Number(event.bookedCount || 0);
  const cap = Number(event.capacity || 1);
  if (booked >= cap) return { label: "اكتملت", color: "rose", bg: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" };
  if (today >= event.bookingStart && today <= event.bookingEnd)
    return { label: "الحجز مفتوح", color: "emerald", bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
  if (today < event.bookingStart) return { label: "قريباً", color: "amber", bg: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
  return { label: "الحجز مغلق", color: "orange", bg: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" };
};

const getEventStatusTone = (status) => {
  if (status?.color === "emerald") return "success";
  if (status?.color === "rose") return "danger";
  if (status?.color === "amber" || status?.color === "orange") return "warning";
  return "neutral";
};

const calcDaysLeft = (dateStr) => {
  const ms = new Date(dateStr) - new Date(getTodayISO());
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

// ── طباعة التقرير المالي الشامل ──
const printFinancialReport = (events, bookingsMap) => {
  const win = openPrintWindow("events-financial-report", "width=1200,height=900");
  if (!win) return;
  const today = new Date().toLocaleDateString("ar-EG", { dateStyle: "full" });
  const eventDates = events.map((event) => event?.date).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const periodMeta = eventDates.length > 0
    ? `الفترة: ${eventDates[0]} إلى ${eventDates[eventDates.length - 1]}`
    : "";
  let totalRevenue = 0, totalBookings = 0, totalPax = 0;

  const rows = events.map((ev) => {
    const bks = (bookingsMap[ev.id] || []).filter(b => b.status === "confirmed");
    const rev = bks.reduce((s, b) => s + Number(b.totalCost || 0), 0);
    const pax = bks.reduce((s, b) => s + Number(b.totalPax || 1), 0);
    totalRevenue += rev; totalBookings += bks.length; totalPax += pax;
    const occ = Math.round((Number(ev.bookedCount || 0) / Number(ev.capacity || 1)) * 100);
    return `
      <tr>
        <td>${ev.title}</td><td style="text-align:center">${ev.type}</td>
        <td style="text-align:center">${ev.date}</td><td style="text-align:center">${ev.capacity}</td>
        <td style="text-align:center">${pax}</td><td style="text-align:center">${bks.length}</td>
        <td style="text-align:center">${occ}%</td>
        <td style="text-align:center; font-weight:900; color:${rev > 0 ? '#059669' : '#64748b'}">${formatMoney(rev)}</td>
        <td style="text-align:center">${ev.isFree ? "مجاني" : `${Number(ev.memberPrice || 0)} / ${Number(ev.companionPrice || 0)} / دعم ${Number(ev.memberSupportValue || 0)}`}</td>
      </tr>`;
  }).join("");

  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>التقرير المالي الشامل</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    @page{size:A4 landscape;margin:10mm}
    * { font-family:'Cairo',sans-serif; box-sizing:border-box; margin:0; padding:0; }
    html, body { width:100%; height:auto; }
    body { padding:16px; font-size:12px; background:#fff; color:#1e293b; }
    .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px; }
    .kpi { border:1px solid #e2e8f0; border-radius:8px; padding:15px; text-align:center; }
    .kpi .val { font-size:20px; font-weight:900; color:#4f46e5; }
    table { width:100%; border-collapse:collapse; margin-bottom:30px; page-break-inside:auto; break-inside:auto; }
    th { background:#f1f5f9; color:#1e293b; padding:10px; border:1px solid #cbd5e1; font-size:11px; }
    td { padding:8px; border:1px solid #cbd5e1; font-size:11px; }
    tfoot td { background:#f8fafc; font-weight:900; }
    @media print{
      body{padding:0}
      .kpis,.kpi,.brand-header{break-inside:avoid;page-break-inside:avoid}
      thead{display:table-header-group}
      tfoot{display:table-footer-group}
      tr,td,th{break-inside:avoid;page-break-inside:avoid}
    }
    ${getPrintBrandStyles()}
  </style></head><body>
  ${getPrintBrandHeader({ reportTitle: 'التقرير المالي الشامل للفعاليات', reportMeta: [periodMeta, `تاريخ الإصدار: ${today}`].filter(Boolean).join(' | ') })}
  <div class="kpis">
    <div class="kpi"><div class="val">${events.length}</div><div>إجمالي الفعاليات</div></div>
    <div class="kpi"><div class="val">${totalBookings.toLocaleString()}</div><div>حجوزات مؤكدة</div></div>
    <div class="kpi"><div class="val">${totalPax.toLocaleString()}</div><div>إجمالي الأفراد</div></div>
    <div class="kpi"><div class="val" style="color:#059669">${formatMoney(totalRevenue)}</div><div>إجمالي الإيرادات</div></div>
  </div>
  <table><thead><tr><th>الفعالية</th><th>النوع</th><th>التاريخ</th><th>السعة</th><th>الأفراد</th><th>الحجوزات</th><th>الإشغال</th><th>الإيراد</th><th>سعر العضو/المرافق/الدعم</th></tr></thead>
  <tbody>${rows}</tbody><tfoot><tr><td colspan="4" style="text-align:center">الإجماليات</td><td style="text-align:center">${totalPax.toLocaleString()}</td><td style="text-align:center">${totalBookings.toLocaleString()}</td><td style="text-align:center">—</td><td style="text-align:center; color:#059669">${formatMoney(totalRevenue)}</td><td>—</td></tr></tfoot></table>
  <div style="display:flex; justify-content:space-between; font-weight:bold;"><span>تقرير آلي</span><span>توقيع المسؤول: ................................</span></div>
  <script>window.onload=()=>setTimeout(()=>window.print(),500);</script></body></html>`);
  win.document.close();
};

// ── طباعة كشف تفصيلي لفعالية ──
const printEventDetail = (event, bookings) => {
  const win = openPrintWindow("event-detail-report", "width=1000,height=800");
  if (!win) return;
  const confirmed = bookings.filter(b => b.status === "confirmed")
    .sort((a, b) => String(a.memberId || "").localeCompare(String(b.memberId || ""), "ar", { numeric: true }));
  const pending = bookings.filter(b => b.status === "pending");
  const cancelled = bookings.filter(b => b.status === "cancelled");
  const totalRev = confirmed.reduce((s, b) => s + Number(b.totalCost || 0), 0);
  const totalPax = confirmed.reduce((s, b) => s + Number(b.totalPax || 1), 0);

  const rows = confirmed.map((b, i) => `<tr><td style="text-align:center">${i + 1}</td><td><strong>${b.memberName}</strong><br><small>كود: ${b.memberId} | ${b.memberPhone || "—"}</small>${b.companionsList?.length ? `<div style="font-size:10px;color:#6366f1;margin-top:3px">${b.companionsList.map(c => `· ${c.name} (${c.relation})`).join(" ")}</div>` : ""}</td><td style="text-align:center">${b.totalPax}</td><td style="text-align:center; color:#059669; font-weight:900">${formatMoney(b.totalCost)}</td><td style="text-align:center; font-size:10px">${b.paymentSummary || "مجاني"}</td><td style="text-align:center"></td></tr>`).join("");

  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كشف الفعالية: ${event.title}</title><style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');@page{size:A4 landscape;margin:10mm}*{font-family:'Cairo',sans-serif;box-sizing:border-box;margin:0;padding:0;}html,body{width:100%;height:auto;}body{padding:16px;font-size:12px;}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:15px 0;}.m{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center;}.m .v{font-size:18px;font-weight:900;color:#4f46e5;}.m .l{font-size:9px;color:#64748b;font-weight:700;}table{width:100%;border-collapse:collapse;page-break-inside:auto;break-inside:auto;}th{background:#1e293b;color:#fff;padding:9px;text-align:center;}td{padding:8px;border:1px solid #e2e8f0;vertical-align:top;}@media print{body{padding:0}.meta,.m,.brand-header{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}tfoot{display:table-footer-group}tr,td,th{break-inside:avoid;page-break-inside:avoid}}${getPrintBrandStyles()}</style></head><body>${getPrintBrandHeader({ reportTitle: `كشف فعالية: ${event.title}`, reportMeta: `${event.type} | التاريخ: ${event.date} | ${event.location || ""}` })}<div class="meta"><div class="m"><div class="v">${totalPax}</div><div class="l">إجمالي الأفراد</div></div><div class="m"><div class="v">${confirmed.length}</div><div class="l">حجوزات مؤكدة</div></div><div class="m"><div class="v">${pending.length}</div><div class="l">حجوزات معلقة</div></div><div class="m"><div class="v" style="color:#059669">${formatMoney(totalRev)}</div><div class="l">إجمالي الإيراد</div></div></div><table><thead><tr><th>#</th><th>المشترك والمرافقين</th><th>الأفراد</th><th>التكلفة</th><th>الدفع</th><th>توقيع حضور</th></tr></thead><tbody>${rows || `<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8">لا توجد حجوزات مؤكدة</td></tr>`}</tbody></table>${cancelled.length > 0 ? `<p style="margin-top:15px;font-size:10px;color:#ef4444;font-weight:700">⚠ الملغيون (${cancelled.length}): ${cancelled.map(b => b.memberName).join("، ")}</p>` : ""}<div style="margin-top:25px;display:flex;justify-content:space-between;font-size:11px;color:#64748b;"><span>مشرف الفعالية: ${Array.isArray(event.supervisors) ? event.supervisors.join("، ") : (event.supervisors || "—")}</span><span>توقيع المشرف: .........................</span></div><script>window.onload=()=>setTimeout(()=>window.print(),600);</script></body></html>`);
  win.document.close();
};

function StatCard({ label, value, icon, colorClass }) {
  const tone = colorClass?.includes("emerald")
    ? "success"
    : colorClass?.includes("sky")
      ? "info"
      : colorClass?.includes("indigo") || colorClass?.includes("violet")
        ? "brand"
        : "neutral";
  return <EnterpriseStatCard label={label} value={value} icon={icon} tone={tone} compact />;
}

function FormField({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function EventsMaster() {
  const T = useT();
  const { can } = useAuth();
  const [events, setEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [bookingsMap, setBookingsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [searchQ, setSearchQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const showToast = useCallback((msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); }, []);
  const canManageEvents = canManageActivities(can);
  const requireEventManagement = useCallback(() => requireEventManagementPermission(
    can,
    (message) => showToast(message, "error")
  ), [can, showToast]);

  useEffect(() => {
    const unsubEvents = onSnapshot(query(collection(db, "events"), orderBy("date", "asc")), snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const unsubEmps = onSnapshot(query(collection(db, "employees")), snap => setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubEvents(); unsubEmps(); };
  }, []);

  useEffect(() => {
    if (events.length === 0) return;
    const unsubs = events.map(ev => onSnapshot(query(collection(db, "event_bookings"), where("eventId", "==", ev.id)), snap => {
      setBookingsMap(prev => ({ ...prev, [ev.id]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
    }));
    return () => unsubs.forEach(u => u());
  }, [events]);

  const boardMembers = useMemo(() => employees.filter(e => BOARD_MEMBERSHIP_ROLES.includes(e.membershipStatus)), [employees]);

  const stats = useMemo(() => {
    const today = getTodayISO();
    let upcoming = 0, completed = 0, openCount = 0, totalPax = 0, totalRevenue = 0;
    events.forEach(ev => {
      const bks = (bookingsMap[ev.id] || []).filter(b => b.status === "confirmed");
      totalRevenue += bks.reduce((s, b) => s + Number(b.totalCost || 0), 0);
      totalPax += bks.reduce((s, b) => s + Number(b.totalPax || 1), 0);
      if (ev.date >= today) upcoming++; else completed++;
      if (today >= ev.bookingStart && today <= ev.bookingEnd && Number(ev.bookedCount || 0) < Number(ev.capacity || 1)) openCount++;
    });
    return { total: events.length, upcoming, completed, openCount, totalPax, totalRevenue };
  }, [events, bookingsMap]);

  const eventTypesInUse = useMemo(
    () => [...new Set(events.map((event) => event.type).filter(Boolean))],
    [events]
  );

  const upcomingEvents = useMemo(
    () => events.filter((event) => event.date >= getTodayISO()).slice(0, 3),
    [events]
  );

  const displayedEvents = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return events.filter(ev => {
      const status = getEventStatus(ev);
      const matchSearch = !q || [
        ev.title,
        ev.type,
        ev.location,
      ].some((value) => String(value || "").toLowerCase().includes(q));
      const matchStatus = statusFilter === "all" || status.color === statusFilter;
      const matchType = typeFilter === "all" || ev.type === typeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [events, searchQ, statusFilter, typeFilter]);

  const handleSaveEvent = async (e) => {
    if (!requireEventManagement()) return;
    e.preventDefault();
    if (!formData.title?.trim() || !formData.date || !formData.capacity) return showToast("برجاء إكمال البيانات الأساسية", "error");
    if (formData.bookingStart > formData.bookingEnd) return showToast("تاريخ بدء الحجز يجب أن يسبق أو يساوي تاريخ الإغلاق", "error");
    if (formData.bookingEnd > formData.date) return showToast("لا يمكن أن يكون غلق الحجز بعد تاريخ الفعالية نفسها!", "error");
    const isDeviceOffer = formData.type === DEVICE_EVENT_TYPE;
    if (isDeviceOffer && (!formData.deviceCategory?.trim() || !formData.deviceBrand?.trim() || !formData.deviceModel?.trim() || Number(formData.devicePrice) <= 0 || Number(formData.installmentMonths) < 1 || Number(formData.downPayment || 0) !== 0)) {
      return showToast("أكمل بيانات الجهاز والسعر وعدد الأشهر. العرض بلا فوائد أو مقدم.", "error");
    }
    if (!formData.isFree && (!formData.memberPrice || !formData.companionPrice)) return showToast("برجاء تحديد أسعار الاشتراك", "error");

    setSaving(true);
    try {
      const eventData = {
        title: formData.title.trim(), type: formData.type, date: formData.date,
        bookingStart: formData.bookingStart, bookingEnd: formData.bookingEnd,
        location: formData.location?.trim() || "", description: formData.description?.trim() || "", notes: formData.notes?.trim() || "",
        capacity: Number(formData.capacity), isFree: formData.isFree,
        memberPrice: formData.isFree ? 0 : Number(formData.memberPrice),
        companionPrice: formData.isFree ? 0 : Number(formData.companionPrice),
        memberSupportValue: formData.isFree ? 0 : Number(formData.memberSupportValue || 0),
        isDeviceOffer,
        deviceCategory: isDeviceOffer ? formData.deviceCategory.trim() : "",
        deviceBrand: isDeviceOffer ? formData.deviceBrand.trim() : "",
        deviceModel: isDeviceOffer ? formData.deviceModel.trim() : "",
        deviceColor: isDeviceOffer ? formData.deviceColor.trim() : "",
        deviceStorage: isDeviceOffer ? formData.deviceStorage.trim() : "",
        devicePrice: isDeviceOffer ? Number(formData.devicePrice) : 0,
        installmentMonths: isDeviceOffer ? Number(formData.installmentMonths) : 0,
        installmentAmount: isDeviceOffer ? Number((Number(formData.devicePrice) / Number(formData.installmentMonths)).toFixed(2)) : 0,
        installmentStart: isDeviceOffer ? formData.installmentStart : "",
        downPayment: isDeviceOffer ? 0 : Number(formData.downPayment || 0),
        interestFree: isDeviceOffer,
        supervisors: formData.supervisors || [], updatedAt: serverTimestamp()
      };

      if (editId) { await updateDoc(doc(db, "events", editId), eventData); showToast("تم تحديث الفعالية بنجاح"); }
      else { await addDoc(collection(db, "events"), { ...eventData, bookedCount: 0, status: "open", createdAt: serverTimestamp() }); showToast("تم تأسيس الفعالية بنجاح"); }
      closeModal();
    } catch { showToast("حدث خطأ أثناء الحفظ", "error"); } finally { setSaving(false); }
  };

  const handleDelete = async (ev) => {
    if (!requireEventManagement()) return;
    const bks = (bookingsMap[ev.id] || []).filter(b => b.status === "confirmed");
    if (bks.length > 0) return showToast(`لا يمكن حذف الفعالية — يوجد ${bks.length} حجز مؤكد`, "error");
    if (!window.confirm(`هل أنت متأكد من حذف فعالية "${ev.title}" نهائياً؟`)) return;
    try { await deleteDoc(doc(db, "events", ev.id)); showToast("تم حذف الفعالية بنجاح"); } catch { showToast("خطأ أثناء الحذف", "error"); }
  };

  const closeModal = () => { setIsModalOpen(false); setEditId(null); setFormData(INITIAL_FORM); };

  const openCreate = () => {
    if (!requireEventManagement()) return;
    closeModal();
    setIsModalOpen(true);
  };

  const openEdit = (event) => {
    if (!requireEventManagement()) return;
    setFormData({
      ...event,
      supervisors: Array.isArray(event.supervisors) ? event.supervisors : (event.supervisors ? [event.supervisors] : [])
    });
    setEditId(event.id);
    setIsModalOpen(true);
  };

  const setField = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));
  const isDeviceOffer = formData.type === DEVICE_EVENT_TYPE;
  const calculatedInstallment = isDeviceOffer && Number(formData.installmentMonths) > 0
    ? Number(formData.devicePrice || 0) / Number(formData.installmentMonths)
    : 0;

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl py-10" dir="rtl">
        <LoadingState title="جاري تحميل دليل الفعاليات..." rows={5} />
      </div>
    );
  }

  return (
    <div className={clsx("flex flex-col gap-5 max-w-7xl mx-auto pb-12", T.text)} dir="rtl">
      <PageHeader
        title="مساحة تشغيل الفعاليات والأنشطة"
        hint="إدارة الفعاليات والسعة والحجوزات والتقارير دون خلطها مع اجتماعات مجلس الإدارة"
        icon={getModuleIcon("/activities/master")}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" iconStart={BarChart3} onClick={() => printFinancialReport(events, bookingsMap)}>التقرير المالي</Button>
            {canManageEvents && <Button size="sm" iconStart={Plus} onClick={openCreate}>فعالية جديدة</Button>}
          </div>
        )}
      />
      {toast && (
        <div className={clsx("fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2.5 text-white font-bold text-xs animate-in fade-in slide-in-from-top-4", toast.type === "error" ? "bg-rose-600" : "bg-emerald-600")}>
          {toast.type === "error" ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />} {toast.msg}
        </div>
      )}

      {canManageEvents && isModalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4 animate-in fade-in">
          <div className={clsx("w-full max-w-2xl rounded-3xl shadow-2xl border animate-in zoom-in-95 overflow-hidden", T.card)}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-l from-indigo-50 to-transparent dark:from-indigo-900/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl"><Tent size={18} className="text-indigo-600" /></div>
                <div><h2 className="font-black text-sm text-indigo-700 dark:text-indigo-400">{editId ? "تعديل الفعالية" : "تأسيس فعالية جديدة"}</h2></div>
              </div>
              <button type="button" onClick={closeModal} className="p-2 hover:bg-rose-100 hover:text-rose-600 rounded-xl transition-colors"><X size={16} /></button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="اسم الفعالية" required><input type="text" value={formData.title} onChange={e => setField("title", e.target.value)} placeholder="مثال: رحلة شرم الشيخ" className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-bold outline-none focus:ring-2", T.inp)} /></FormField>
                <FormField label="نوع النشاط"><select value={formData.type} onChange={e => setField("type", e.target.value)} className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-bold outline-none focus:ring-2", T.sel)}>{EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></FormField>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <p className="text-[10px] font-black text-slate-500 uppercase">📅 التواريخ والجدول الزمني</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <FormField label="تاريخ الانطلاق" required><ArabicDatePicker label="" value={formData.date} minVal={getTodayISO()} onChange={v => setField("date", v)} /></FormField>
                  <FormField label="بدء الحجز"><ArabicDatePicker label="" value={formData.bookingStart} maxVal={formData.bookingEnd} onChange={v => setField("bookingStart", v)} /></FormField>
                  <FormField label="إغلاق الحجز"><ArabicDatePicker label="" value={formData.bookingEnd} minVal={formData.bookingStart} maxVal={formData.date} onChange={v => setField("bookingEnd", v)} /></FormField>
                </div>
              </div>

              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800 space-y-3">
                <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">💰 السعة والتسعير</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                  <FormField label="الحد الأقصى للأفراد" required><input type="number" min="1" value={formData.capacity} onChange={e => setField("capacity", e.target.value)} className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-bold outline-none focus:ring-2", T.inp)} /></FormField>
                  <div className="flex items-center gap-2 pb-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-black select-none">
                      <div onClick={() => setField("isFree", !formData.isFree)} className={clsx("w-10 h-5 rounded-full transition-colors relative cursor-pointer", formData.isFree ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")}><div className={clsx("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all", formData.isFree ? "left-5" : "left-0.5")} /></div> مجانية
                    </label>
                  </div>
                  {!formData.isFree && (
                    <><FormField label="سعر العضو" required><input type="number" min="0" value={formData.memberPrice} onChange={e => setField("memberPrice", e.target.value)} className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-black outline-none focus:ring-2 bg-white dark:bg-slate-900", T.inp)} /></FormField><FormField label="سعر المرافق" required><input type="number" min="0" value={formData.companionPrice} onChange={e => setField("companionPrice", e.target.value)} className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-black outline-none focus:ring-2 bg-white dark:bg-slate-900", T.inp)} /></FormField></>
                  )}
                </div>
                {!formData.isFree && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <FormField label="قيمة الدعم الخاص بالعضو">
                      <input
                        type="number"
                        min="0"
                        value={formData.memberSupportValue}
                        onChange={e => setField("memberSupportValue", e.target.value)}
                        className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-black outline-none focus:ring-2 bg-white dark:bg-slate-900", T.inp)}
                      />
                    </FormField>
                    <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-white/80 dark:bg-slate-900/50 px-4 py-3">
                      <p className="text-[10px] font-black text-slate-400">قيمة الدعم الخاص بالعضو</p>
                      <p className="text-lg font-black text-emerald-600">{formatMoney(formData.memberSupportValue || 0)}</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-1">تُسجل كمزية عضوية مستقلة عن بدلات المجلس.</p>
                    </div>
                  </div>
                )}
              </div>

              {isDeviceOffer && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase">بيانات الجهاز وخطة التقسيط</p>
                    <span className="text-[9px] font-black px-2 py-1 rounded-lg bg-white/70 text-emerald-700 border border-emerald-200">بدون فوائد وبدون مقدم</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <FormField label="فئة الجهاز" required><input value={formData.deviceCategory} onChange={e => setField("deviceCategory", e.target.value)} placeholder="هاتف / تابلت / لابتوب" className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-bold", T.inp)} /></FormField>
                    <FormField label="العلامة التجارية" required><input value={formData.deviceBrand} onChange={e => setField("deviceBrand", e.target.value)} placeholder="Samsung / Apple" className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-bold", T.inp)} /></FormField>
                    <FormField label="الموديل" required><input value={formData.deviceModel} onChange={e => setField("deviceModel", e.target.value)} className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-bold", T.inp)} /></FormField>
                    <FormField label="اللون"><input value={formData.deviceColor} onChange={e => setField("deviceColor", e.target.value)} className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-bold", T.inp)} /></FormField>
                    <FormField label="السعة / المواصفات"><input value={formData.deviceStorage} onChange={e => setField("deviceStorage", e.target.value)} placeholder="128 GB / RAM 8 GB" className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-bold", T.inp)} /></FormField>
                    <FormField label="السعر الإجمالي" required><input type="number" min="0" value={formData.devicePrice} onChange={e => setField("devicePrice", e.target.value)} className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-black", T.inp)} /></FormField>
                    <FormField label="عدد أشهر التقسيط" required><input type="number" min="1" value={formData.installmentMonths} onChange={e => setField("installmentMonths", e.target.value)} className={clsx("w-full px-3 py-2.5 rounded-xl border text-xs font-black", T.inp)} /></FormField>
                    <FormField label="بداية أول قسط"><ArabicDatePicker value={formData.installmentStart} onChange={v => setField("installmentStart", v)} minVal={formData.date} /></FormField>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-3 rounded-xl bg-white/80 border border-emerald-100"><p className="text-[9px] font-black text-slate-400">المقدم</p><p className="text-base font-black text-emerald-700">0 جنيه</p></div>
                    <div className="p-3 rounded-xl bg-white/80 border border-emerald-100"><p className="text-[9px] font-black text-slate-400">القسط الشهري التقديري</p><p className="text-base font-black text-emerald-700">{formatMoney(calculatedInstallment)}</p></div>
                  </div>
                </div>
              )}

              {boardMembers.length > 0 && (
                <div className="p-4 bg-sky-50 dark:bg-sky-900/20 rounded-2xl border border-sky-100 dark:border-sky-800">
                  <p className="text-[10px] font-black text-sky-700 uppercase mb-2 flex items-center gap-1"><Users size={12} /> هيئة الإشراف (مجلس الإدارة)</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {boardMembers.map(m => (
                      <label key={m.id} className="flex items-center gap-2 text-[10px] font-bold cursor-pointer select-none p-1.5 hover:bg-sky-100 dark:hover:bg-sky-900/20 rounded-lg transition-colors">
                        <input type="checkbox" checked={formData.supervisors.includes(m.name)} onChange={e => setField("supervisors", e.target.checked ? [...formData.supervisors, m.name] : formData.supervisors.filter(n => n !== m.name))} className="accent-sky-600 w-3.5 h-3.5" />
                        <span className="truncate">{m.name.split(" ").slice(0, 2).join(" ")}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-3">
              <button type="button" onClick={closeModal} className={clsx("flex-[1] py-2.5 rounded-xl font-black text-xs border transition-all", T.muted)}>إلغاء</button>
              <button type="button" onClick={handleSaveEvent} disabled={saving} className="flex-[3] py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <div className="animate-spin"><Clock size={14} /></div> : <Save size={14} />} {editId ? "تحديث الفعالية" : "اعتماد وحفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ رأس الصفحة ═══ */}
      <div className="hidden">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl text-indigo-600"><Tent size={26} /></div>
          <div><h1 className="text-xl font-black tracking-tight">لوحة تحكم الفعاليات والأنشطة</h1><p className={clsx("text-[10px] font-bold mt-0.5", T.muted)}>إدارة الوجهات • المواعيد • التقارير المالية</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => printFinancialReport(events, bookingsMap)} className="px-4 py-2.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all">
            <BarChart3 size={15} /> التقرير المالي
          </button>
          {canManageEvents && (
            <button onClick={openCreate} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs shadow-md active:scale-95 transition-all flex items-center gap-2">
              <Plus size={15} /> فعالية جديدة
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <StatCard label="إجمالي الفعاليات" value={stats.total} icon={CalendarDays} colorClass="text-slate-700 dark:text-slate-300" />
        <StatCard label="فعاليات قادمة" value={stats.upcoming} icon={Clock} colorClass="text-indigo-600" />
        <StatCard label="مفتوح الحجز" value={stats.openCount} icon={Ticket} colorClass="text-sky-600" />
        <StatCard label="إجمالي الأفراد" value={stats.totalPax} icon={Users} colorClass="text-violet-600" />
        <StatCard label="إجمالي الإيرادات" value={formatMoney(stats.totalRevenue)} icon={DollarSign} colorClass="text-emerald-600" />
      </div>

      {/* ═══ عرض الفعاليات ═══ */}
      <div className={clsx("rounded-2xl border shadow-sm overflow-hidden", T.card)}>
        <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="p-5 bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.16),_transparent_34%),linear-gradient(135deg,rgba(20,184,166,0.07),rgba(255,255,255,0.9))] dark:bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.12),_transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.82))]">
            <div className="mb-3 flex items-center gap-2">
              <Tent size={18} className="text-sky-600" />
              <h2 className="text-sm font-black text-slate-900 dark:text-white">الفعاليات القادمة</h2>
            </div>
            {upcomingEvents.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-4 text-center text-xs font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-900/40">لا توجد فعاليات قادمة مسجلة.</p>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map((event) => {
                  const status = getEventStatus(event);
                  const booked = Number(event.bookedCount || 0);
                  const capacity = Number(event.capacity || 0);
                  return (
                    <div key={event.id} className="rounded-xl border border-white/70 bg-white/75 p-3 dark:border-slate-700/60 dark:bg-slate-900/50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-slate-900 dark:text-slate-100">{event.title}</p>
                          <p className="mt-1 text-[10px] font-bold text-slate-500">{event.date || "â€”"}{event.location ? ` â€¢ ${event.location}` : ""}</p>
                        </div>
                        <StatusBadge tone={getEventStatusTone(status)}>{status.label}</StatusBadge>
                      </div>
                      {capacity > 0 && <p className="mt-2 text-[10px] font-black text-slate-500">السعة: {booked}/{capacity}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="border-t border-slate-100 p-5 dark:border-slate-800 xl:border-r xl:border-t-0">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <SearchInput value={searchQ} onChange={setSearchQ} placeholder="بحث باسم الفعالية أو النوع أو المكان..." className="lg:max-w-md" />
              <FilterBar className="flex-1 justify-end">
                <select className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">كل الحالات</option>
                  <option value="emerald">الحجز مفتوح</option>
                  <option value="amber">قريبًا</option>
                  <option value="orange">الحجز مغلق</option>
                  <option value="rose">اكتملت</option>
                  <option value="slate">منتهية</option>
                </select>
                <select className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">كل الأنواع</option>
                  {eventTypesInUse.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                {(searchQ || statusFilter !== "all" || typeFilter !== "all") && (
                  <Button variant="ghost" size="sm" onClick={() => { setSearchQ(""); setStatusFilter("all"); setTypeFilter("all"); }}>مسح</Button>
                )}
              </FilterBar>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <p className="text-[10px] font-black text-slate-400">نتائج العرض</p>
                <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{displayedEvents.length}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <p className="text-[10px] font-black text-slate-400">أنواع مستخدمة</p>
                <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{eventTypesInUse.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {displayedEvents.length === 0 ? (
        <div className={clsx("p-20 text-center rounded-3xl border-2 border-dashed", T.card)}>
          <Tent size={44} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-black text-slate-400">لا توجد فعاليات مسجلة</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayedEvents.map((event) => {
            const isCompleted = event.date < getTodayISO();
            const daysLeft = calcDaysLeft(event.date);
            const isNear = !isCompleted && daysLeft <= 3 && daysLeft >= 0;
            const booked = Number(event.bookedCount || 0);
            const capacity = Number(event.capacity || 1);
            const occupancyRate = Math.min(100, (booked / capacity) * 100);
            const status = getEventStatus(event);
            const bks = bookingsMap[event.id] || [];
            const confirmedCount = bks.filter(b => b.status === "confirmed").length;
            const pendingCount = bks.filter(b => b.status === "pending").length;

            return (
              <div key={event.id} className={clsx("rounded-3xl border shadow-sm flex flex-col transition-all hover:shadow-lg group relative overflow-hidden", T.card, isCompleted && "opacity-80")}>
                <div className={clsx("h-1.5 w-full", status.color === "emerald" ? "bg-emerald-400" : status.color === "rose" ? "bg-rose-400" : "bg-slate-300")} />
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className={clsx("text-[8px] px-2 py-0.5 rounded-full font-black border", status.bg)}>{status.label}</span>
                        <span className="text-[8px] px-2 py-0.5 rounded-full font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">{event.type}</span>
                        {event.isFree && <span className="text-[8px] px-2 py-0.5 rounded-full font-black bg-emerald-100 text-emerald-700 border border-emerald-200">مجاني</span>}
                      </div>
                      <h3 className="font-black text-sm truncate" title={event.title}>{event.title}</h3>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => printEventDetail(event, bks)} className="p-1.5 bg-slate-100 text-slate-500 hover:bg-indigo-500 hover:text-white rounded-lg transition-colors"><Printer size={13} /></button>
                      {canManageEvents && (
                        <>
                          <button onClick={() => openEdit(event)} className="p-1.5 bg-sky-100 text-sky-600 hover:bg-sky-500 hover:text-white rounded-lg transition-colors"><Edit size={13} /></button>
                          <button onClick={() => handleDelete(event)} className="p-1.5 bg-rose-100 text-rose-600 hover:bg-rose-500 hover:text-white rounded-lg transition-colors"><Trash2 size={13} /></button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    <div className={clsx("flex justify-between items-center text-[9px] font-bold px-2.5 py-1.5 rounded-lg border", T.muted, "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700")}>
                      <span className="flex items-center gap-1"><CalendarClock size={10} /> {event.date}</span>
                      {!isCompleted ? <span className={clsx("font-black", isNear ? "text-rose-500 animate-pulse" : "text-emerald-600")}>{daysLeft === 0 ? "🎉 اليوم" : `باقي ${daysLeft} يوم`}</span> : <span className="text-slate-400">انتهت</span>}
                    </div>
                    <div className={clsx("flex items-center justify-between text-[8px] font-bold px-2 py-1 rounded-lg", T.muted)}>
                      <span>الحجز: {event.bookingStart} ← {event.bookingEnd}</span>
                      <span className={clsx("w-1.5 h-1.5 rounded-full", status.color === "emerald" ? "bg-emerald-500 animate-pulse" : "bg-rose-400")} />
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="flex justify-between text-[9px] font-black mb-1"><span className={clsx(T.muted, "flex items-center gap-1")}><Users size={10} /> الإشغال</span><span className={booked >= capacity ? "text-rose-600" : "text-teal-600"}>{booked} / {capacity} فرد ({Math.round(occupancyRate)}%)</span></div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className={clsx("h-full rounded-full transition-all duration-700", booked >= capacity ? "bg-rose-500" : occupancyRate > 75 ? "bg-amber-500" : "bg-teal-500")} style={{ width: `${occupancyRate}%` }} /></div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-2 text-center border border-emerald-100 dark:border-emerald-900"><p className="text-base font-black text-emerald-600">{confirmedCount}</p><p className="text-[8px] font-bold text-emerald-500">مؤكد</p></div>
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-2 text-center border border-amber-100 dark:border-amber-900"><p className="text-base font-black text-amber-600">{pendingCount}</p><p className="text-[8px] font-bold text-amber-500">معلق</p></div>
                  </div>

                  {!event.isFree ? (
                    <div className="grid grid-cols-3 gap-2">
                      <div className={clsx("p-2 rounded-xl text-center border", "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700")}><p className="text-[8px] font-black text-slate-400 uppercase">قيمة الاشتراك على العضو</p><p className="text-xs font-black text-indigo-600">{formatMoney(event.memberPrice || 0)}</p></div>
                      <div className={clsx("p-2 rounded-xl text-center border", "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900")}><p className="text-[8px] font-black text-emerald-600 uppercase">قيمة الدعم الخاص بالعضو</p><p className="text-xs font-black text-emerald-700 dark:text-emerald-300">{formatMoney(event.memberSupportValue || 0)}</p></div>
                      <div className={clsx("p-2 rounded-xl text-center border", "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700")}><p className="text-[8px] font-black text-slate-400 uppercase">سعر المرافق</p><p className="text-xs font-black text-slate-700 dark:text-slate-300">{formatMoney(event.companionPrice || 0)}</p></div>
                    </div>
                  ) : <div className="bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded-xl text-center text-emerald-600 border border-emerald-100 dark:border-emerald-900"><p className="text-xs font-black">✓ فعالية مجانية</p></div>}

                  {event.supervisors?.length > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-[8px] font-bold text-sky-600 bg-sky-50 dark:bg-sky-900/20 px-2.5 py-1.5 rounded-xl border border-sky-100 dark:border-sky-800">
                      <ShieldAlert size={10} /><span className="truncate">إشراف: {Array.isArray(event.supervisors) ? event.supervisors.join(" - ") : event.supervisors}</span>
                    </div>
                  )}
                  {pendingCount > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-[8px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 rounded-xl border border-amber-100 dark:border-amber-800 animate-pulse">
                      <AlertTriangle size={10} /> {pendingCount} حجز في انتظار الدفع
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

