import React, { useMemo, useState } from "react";
import clsx from "clsx";
import {
  CalendarDays, CheckCircle2, Edit3, Layers3, MapPin, Plus, Printer, Ticket,
  Trash2, X,
} from "lucide-react";
import { useT } from "../../../app/providers/ThemeProvider";
import { useAuth } from "../../../app/providers/AuthProvider";
import { PERMISSIONS } from "../../../security/permissions";
import {
  Button,
  EmptyState,
  FilterBar,
  LoadingState,
  PageHeader,
  SearchInput,
  StatCard,
  StatusBadge,
  getModuleIcon,
} from "../../../ui/enterprise";
import BrandHeader from "../../../ui/BrandHeader";
import ArabicDatePicker from "../../../ui/inputs/ArabicDatePicker";
import DynamicSelect from "../../../ui/inputs/DynamicSelect";
import { openPrintWindow } from "../../../utils/print";
import { getPrintBrandHeader, getPrintBrandStyles } from "../../../utils/branding";
import { escapeHtml } from "../../../utils/escapeHtml";
import { formatMoney } from "../../../utils/numberFormat";
import useUnionActivity from "./useUnionActivity";
import {
  canExportSensitiveBookings,
  canManageBookings,
  requireSensitiveBookingExportPermission,
} from "../bookingAuthorization";

const inputCls = "w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-teal-500/20";

const emptyEventForm = (config) => ({
  title: "", date: "", bookingStart: "", bookingEnd: "", location: "",
  capacity: "", memberPrice: "", companionPrice: "", memberSupportValue: "",
  isFree: false, description: "",
  ...Object.fromEntries((config.extraFields || []).map((f) => [f.key, f.type === "number" ? "" : ""])),
});

const EVENT_STATUS_LABELS = {
  all: "الكل",
  open: "متاح للحجز",
  upcoming: "قادم",
  full: "مكتمل العدد",
  closed: "مغلق",
  completed: "منتهي",
};

const EVENT_STATUS_TONES = {
  open: "success",
  upcoming: "info",
  full: "warning",
  closed: "neutral",
  completed: "neutral",
};

const BOOKING_STATUS_LABELS = {
  all: "كل الحجوزات",
  confirmed: "مؤكد",
  pending: "معلق",
  cancelled: "ملغي",
};

const getTodayISO = () => new Date().toISOString().split("T")[0];

const getConfirmedPax = (items = []) =>
  items
    .filter((booking) => booking.status === "confirmed")
    .reduce((sum, booking) => sum + Number(booking.totalPax || 1), 0);

const getEventStatus = (event, eventBookings = [], today = getTodayISO()) => {
  const capacity = Number(event.capacity || 0);
  const confirmedPax = eventBookings.length > 0
    ? getConfirmedPax(eventBookings)
    : Number(event.bookedCount || 0);
  if (capacity > 0 && confirmedPax >= capacity) return "full";
  if (event.date && event.date < today) return "completed";
  if (event.bookingEnd && event.bookingEnd < today) return "closed";
  if (event.bookingStart && event.bookingStart > today) return "upcoming";
  return "open";
};

const getEventSearchText = (event, fields = []) =>
  [
    event.title,
    event.location,
    event.description,
    ...fields.map((field) => event[field.key]),
  ].filter(Boolean).join(" ");

const renderValue = (value, fallback = "—") =>
  value === undefined || value === null || value === "" ? fallback : value;

function ExtraFieldInput({ field, value, onChange }) {
  if (field.type === "dropdown") {
    return (
      <DynamicSelect
        label={field.label}
        listKey={field.listKey}
        value={value || ""}
        onChange={onChange}
        defaultOptions={field.defaultOptions || []}
      />
    );
  }
  if (field.type === "date") {
    return <ArabicDatePicker label={field.label} value={value || ""} onChange={onChange} />;
  }
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black text-slate-400 uppercase pr-1">{field.label}</label>
      <input
        type={field.type === "number" ? "number" : "text"}
        min={field.type === "number" ? "0" : undefined}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </div>
  );
}

export default function UnionActivityPage({ config }) {
  const T = useT();
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.activitiesManage);
  const canManageBookingOps = canManageBookings(can);
  const canExportBookings = canExportSensitiveBookings(can);
  const canViewActivityFinance = can(PERMISSIONS.reportsView) === true;
  const {
    events, bookings, bookingsByEvent, employees, loading, stats,
    saveEvent, deleteEventGuarded, addBooking, confirmBooking, cancelBooking, calcCost,
  } = useUnionActivity(config, { can });

  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState(emptyEventForm(config));
  const [saving, setSaving] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");
  const [memberQ, setMemberQ] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [companions, setCompanions] = useState([]);
  const [compName, setCompName] = useState("");
  const [compRelation, setCompRelation] = useState("");
  const [cashPaid, setCashPaid] = useState("");

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );
  const eventBookings = useMemo(
    () => selectedEvent ? [...(bookingsByEvent[selectedEvent.id] || [])].sort((a, b) =>
      String(a.memberId || "").localeCompare(String(b.memberId || ""), "ar", { numeric: true })
    ) : [],
    [bookingsByEvent, selectedEvent]
  );

  const memberResults = useMemo(() => {
    const q = memberQ.trim();
    if (q.length < 2) return [];
    return employees
      .filter((e) => `${e.name || ""} ${e.jobId || ""}`.includes(q))
      .slice(0, 8);
  }, [employees, memberQ]);

  const outstanding = useMemo(
    () => (bookings || []).filter((b) => Number(b.remainingBalance || 0) > 0 && b.status !== "cancelled")
      .sort((a, b) => String(a.memberId || "").localeCompare(String(b.memberId || ""), "ar", { numeric: true })),
    [bookings]
  );

  const eventRows = useMemo(() => events.map((event) => {
    const rowBookings = bookingsByEvent[event.id] || [];
    const confirmedPax = rowBookings.length > 0
      ? getConfirmedPax(rowBookings)
      : Number(event.bookedCount || 0);
    const capacity = Number(event.capacity || 0);
    const status = getEventStatus(event, rowBookings);
    return {
      ...event,
      confirmedPax,
      remainingSeats: capacity > 0 ? Math.max(0, capacity - confirmedPax) : 0,
      status,
      searchText: getEventSearchText(event, config.extraFields || []),
      bookingsCount: rowBookings.length,
    };
  }), [bookingsByEvent, config.extraFields, events]);

  const displayedEvents = useMemo(() => {
    const q = searchQ.trim();
    return eventRows.filter((event) => {
      const matchesSearch = !q || event.searchText.includes(q);
      const matchesStatus = statusFilter === "all" || event.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [eventRows, searchQ, statusFilter]);

  const filteredEventBookings = useMemo(() => {
    if (bookingStatusFilter === "all") return eventBookings;
    return eventBookings.filter((booking) => booking.status === bookingStatusFilter);
  }, [bookingStatusFilter, eventBookings]);

  const openEvents = useMemo(
    () => eventRows.filter((event) => event.status === "open").length,
    [eventRows]
  );

  const availableSeats = useMemo(
    () => eventRows.reduce((sum, event) => sum + event.remainingSeats, 0),
    [eventRows]
  );

  const selectedEventDetails = useMemo(
    () => (config.extraFields || [])
      .map((field) => ({ label: field.label, value: selectedEvent ? selectedEvent[field.key] : "" }))
      .filter((item) => item.value !== undefined && item.value !== null && item.value !== ""),
    [config.extraFields, selectedEvent]
  );

  const selectedEventStatus = selectedEvent
    ? getEventStatus(selectedEvent, eventBookings)
    : null;

  const openAddEvent = () => {
    setEditingEvent(null);
    setEventForm(emptyEventForm(config));
    setShowEventModal(true);
  };

  const openEditEvent = (event) => {
    setEditingEvent(event);
    setEventForm({ ...emptyEventForm(config), ...event });
    setShowEventModal(true);
  };

  const handleSaveEvent = async () => {
    if (!eventForm.title?.trim() || !eventForm.date) {
      alert("أدخل عنوان الفعالية وتاريخها.");
      return;
    }
    setSaving(true);
    try {
      await saveEvent({
        ...eventForm,
        title: eventForm.title.trim(),
        capacity: Number(eventForm.capacity || 0),
        memberPrice: Number(eventForm.memberPrice || 0),
        companionPrice: Number(eventForm.companionPrice || 0),
        memberSupportValue: Number(eventForm.memberSupportValue || 0),
      }, editingEvent?.id || null);
      setShowEventModal(false);
    } catch (e) {
      alert(e.message || "تعذر الحفظ.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (event) => {
    if (!window.confirm(`حذف "${event.title}"؟`)) return;
    try {
      await deleteEventGuarded(event);
    } catch (e) {
      alert(e.message || "تعذر الحذف.");
    }
  };

  const handleAddBooking = async () => {
    if (!selectedEvent || !selectedMember) {
      alert("اختر الفعالية والعضو أولاً.");
      return;
    }
    setSaving(true);
    try {
      await addBooking(selectedEvent, selectedMember, companions, { cash: Number(cashPaid || 0) });
      setSelectedMember(null);
      setMemberQ("");
      setCompanions([]);
      setCashPaid("");
    } catch (e) {
      alert(e.message || "تعذر الحجز.");
    } finally {
      setSaving(false);
    }
  };

  const handlePrintManifest = () => {
    if (!requireSensitiveBookingExportPermission(can, (message) => alert(message))) return false;
    if (!selectedEvent) return;
    const confirmed = eventBookings.filter((b) => b.status === "confirmed");
    const rowsHtml = confirmed.map((b, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td><strong>${escapeHtml(b.memberName)}</strong><div style="font-size:9px;color:#64748b">كود: ${escapeHtml(b.memberId)}</div></td>
        <td style="text-align:center">${escapeHtml(b.totalPax)}</td>
        <td style="text-align:center">${escapeHtml(b.paymentSummary) || "—"}</td>
        <td style="text-align:center">☐</td>
      </tr>`).join("");
    const win = openPrintWindow("manifest", "width=1000,height=800");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كشف — ${escapeHtml(selectedEvent.title)}</title>
      <style>@page{size:A4 landscape;margin:10mm}*{font-family:sans-serif;box-sizing:border-box;margin:0;padding:0}body{padding:16px;font-size:12px}
      table{width:100%;border-collapse:collapse}th{background:#1e293b;color:#fff;padding:9px}td{padding:8px;border:1px solid #e2e8f0}
      @media print{body{padding:0}thead{display:table-header-group}tr{break-inside:avoid}}${getPrintBrandStyles()}</style></head><body>
      ${getPrintBrandHeader({ reportTitle: `كشف ${config.title}: ${selectedEvent.title}`, reportMeta: `التاريخ: ${selectedEvent.date || "—"}` })}
      <table><thead><tr><th>#</th><th>العضو</th><th>الأفراد</th><th>الدفع</th><th>توقيع</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="5" style="text-align:center;padding:20px">لا توجد حجوزات مؤكدة</td></tr>`}</tbody></table>
      <script>window.onload=()=>setTimeout(()=>window.print(),500);</script></body></html>`);
    win.document.close();
    return true;
  };

  if (loading) {
    return <LoadingState title={`جاري تحميل ${config.title}...`} rows={4} className="min-h-[50vh]" />;
  }

  return (
    <div className={clsx("max-w-[1600px] mx-auto space-y-5 pb-20 animate-in fade-in duration-500", T.text)} dir="rtl">
      <BrandHeader sectionTitle={config.title} sectionHint={config.subtitle} />

      <PageHeader
        title={config.title}
        hint={`${config.subtitle} - مساحة مستقلة لإدارة هذا النوع دون خلطه بباقي الفعاليات.`}
        icon={getModuleIcon("union")}
        metadata={(
          <>
            <StatusBadge tone="brand">{config.eventType}</StatusBadge>
            <span>السجلات تعرض هذه الفئة فقط.</span>
          </>
        )}
        actions={!config.installmentsOnly && canManage ? (
          <Button iconStart={Plus} onClick={openAddEvent}>فعالية جديدة</Button>
        ) : null}
      />

      {!config.installmentsOnly && (
        <section className={clsx("rounded-xl border p-4 md:p-5", T.card)}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xl leading-none">{config.icon}</span>
                <h2 className="text-base font-black text-slate-950 dark:text-white">ملف مستقل: {config.title}</h2>
              </div>
              <p className="mt-2 max-w-3xl text-xs font-semibold leading-6 text-slate-500">
                كل سجل هنا يحتفظ بعنوانه وتاريخه وسعته وأسعاره وحقوله النوعية الخاصة، مع فصل العرض والفلترة عن باقي أنشطة الخدمات والرحلات.
              </p>
            </div>
            <div className="grid min-w-[260px] grid-cols-2 gap-2 text-[11px] font-bold">
              {(config.extraFields || []).slice(0, 4).map((field) => (
                <div key={field.key} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                  {field.label}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="الفعاليات" value={stats.events} sub={`${displayedEvents.length} ظاهرة الآن`} icon={Layers3} tone="brand" />
        {canManageBookingOps && <StatCard label="أفراد مؤكدون" value={stats.confirmedPax} sub={`${openEvents} فعالية متاحة`} icon={CheckCircle2} tone="success" />}
        {canManageBookingOps && canViewActivityFinance && <StatCard label="إيراد محصل" value={formatMoney(stats.revenue)} sub="حسب الحجوزات المؤكدة" icon={Ticket} tone="info" />}
        {canViewActivityFinance && <StatCard label="دعم الأعضاء" value={formatMoney(stats.support)} sub={`${availableSeats} مقعد متاح`} icon={CalendarDays} tone="warning" />}
      </div>

      {config.installmentsOnly ? (canManageBookingOps ? (
        <div className={clsx("rounded-2xl border shadow-sm overflow-hidden", T.card)}>
          <div className="p-4 border-b font-black text-sm">الأقساط المستحقة ({outstanding.length})</div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[11px]">
              <thead><tr className="bg-slate-50 dark:bg-slate-800/50 border-b">
                {["العضو", "الكود", "الفعالية", "الإجمالي", "المدفوع", "المتبقي", "الحالة"].map((h, i) => <th key={i} className="p-2.5 font-black text-slate-500 whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {outstanding.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold">لا توجد أقساط مستحقة.</td></tr>
                ) : outstanding.map((b) => (
                  <tr key={b.id}>
                    <td className="p-2 font-black">{b.memberName}</td>
                    <td className="p-2 whitespace-nowrap">{b.memberId}</td>
                    <td className="p-2 max-w-[200px] truncate">{b.eventTitle}</td>
                    <td className="p-2 font-black whitespace-nowrap">{formatMoney(b.totalCost)}</td>
                    <td className="p-2 whitespace-nowrap">{formatMoney(b.amountPaid)}</td>
                    <td className="p-2 font-black text-rose-600 whitespace-nowrap">{formatMoney(b.remainingBalance)}</td>
                    <td className="p-2 whitespace-nowrap">{b.status === "confirmed" ? "مؤكد" : "معلق"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <EmptyState title="لا تملك صلاحية عرض أقساط الحجوزات" hint="تتطلب هذه البيانات صلاحية إدارة الحجوزات." />) : (
        <>
          <div className={clsx("rounded-2xl border shadow-sm overflow-hidden", T.card)}>
            <div className="p-4 border-b flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h3 className="text-sm font-black">فعاليات {config.title} ({displayedEvents.length}/{events.length})</h3>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">البحث يشمل العنوان والمكان والحقول المميزة لهذا النوع.</p>
              </div>
              <FilterBar className="xl:justify-end">
                <SearchInput value={searchQ} onChange={setSearchQ} placeholder={`بحث في ${config.title}...`} className="min-w-[240px] flex-none" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={clsx("h-9 rounded-lg border px-3 text-xs font-bold", T.inp)}>
                  {Object.entries(EVENT_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </FilterBar>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[11px]">
                <thead><tr className="bg-slate-50 dark:bg-slate-800/50 border-b">
                  {["العنوان", "الحالة", "التاريخ", "المكان", "السعة", ...(canViewActivityFinance ? ["سعر العضو", "الدعم"] : []), "تفاصيل مميزة", "إجراءات"].map((h, i) => <th key={i} className="p-2.5 font-black text-slate-500 whitespace-nowrap">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {displayedEvents.length === 0 ? (
                    <tr><td colSpan={canViewActivityFinance ? 9 : 7} className="p-8"><EmptyState title="لا توجد فعاليات مطابقة" hint="غيّر البحث أو حالة الفلترة لعرض نتائج أخرى." /></td></tr>
                  ) : displayedEvents.map((e) => {
                    const bks = bookingsByEvent[e.id] || [];
                    const details = (config.extraFields || [])
                      .map((field) => ({ label: field.label, value: e[field.key] }))
                      .filter((item) => item.value !== undefined && item.value !== null && item.value !== "")
                      .slice(0, 2);
                    return (
                      <tr key={e.id} className={selectedEventId === e.id ? "bg-teal-50/60 dark:bg-teal-900/10" : ""}>
                        <td className="p-2 font-black max-w-[220px] truncate">{e.title}</td>
                        <td className="p-2 whitespace-nowrap"><StatusBadge tone={EVENT_STATUS_TONES[e.status]}>{EVENT_STATUS_LABELS[e.status]}</StatusBadge></td>
                        <td className="p-2 whitespace-nowrap">{e.date || "—"}</td>
                        <td className="p-2 max-w-[160px] truncate">{e.location || "—"}</td>
                        <td className="p-2 whitespace-nowrap">{e.confirmedPax}/{e.capacity || 0}</td>
                        {canViewActivityFinance && <td className="p-2 whitespace-nowrap">{e.isFree ? "مجاني" : formatMoney(e.memberPrice)}</td>}
                        {canViewActivityFinance && <td className="p-2 whitespace-nowrap">{formatMoney(e.memberSupportValue)}</td>}
                        <td className="p-2 min-w-[180px]">
                          <div className="flex flex-wrap gap-1">
                            {details.length === 0 ? <span className="text-slate-400">—</span> : details.map((item) => (
                              <span key={item.label} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {item.label}: {renderValue(item.value)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-2 whitespace-nowrap"><div className="flex gap-1">
                          {canManageBookingOps && <button onClick={() => setSelectedEventId(e.id)} className="px-2.5 py-1 text-[10px] font-black bg-teal-600 text-white rounded-lg">الحجوزات ({bks.length})</button>}
                          {canManage && <button onClick={() => openEditEvent(e)} className="p-1.5 text-slate-400 hover:text-amber-600"><Edit3 size={13} /></button>}
                          {canManage && <button onClick={() => handleDeleteEvent(e)} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 size={13} /></button>}
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {canManageBookingOps && selectedEvent && (
            <div className={clsx("rounded-2xl border shadow-sm overflow-hidden", T.card)}>
              <div className="p-4 border-b flex flex-wrap justify-between items-center gap-3">
                <div>
                  <h3 className="text-sm font-black">حجوزات: {selectedEvent.title} ({filteredEventBookings.length}/{eventBookings.length})</h3>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">تتم إدارة الحضور والمدفوعات لهذا السجل فقط.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={bookingStatusFilter} onChange={(event) => setBookingStatusFilter(event.target.value)} className={clsx("h-9 rounded-lg border px-3 text-xs font-bold", T.inp)}>
                    {Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  {canExportBookings && <Button variant="secondary" iconStart={Printer} onClick={handlePrintManifest}>طباعة الكشف</Button>}
                </div>
              </div>
              <div className="border-b bg-slate-50/60 p-4 dark:bg-slate-800/20">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="text-[10px] font-black text-slate-400">الحالة</div>
                    <div className="mt-1"><StatusBadge tone={EVENT_STATUS_TONES[selectedEventStatus]}>{EVENT_STATUS_LABELS[selectedEventStatus]}</StatusBadge></div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="text-[10px] font-black text-slate-400">السعة المؤكدة</div>
                    <div className="mt-1 text-sm font-black">{getConfirmedPax(eventBookings)}/{selectedEvent.capacity || 0}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="text-[10px] font-black text-slate-400">سعر العضو</div>
                    <div className="mt-1 text-sm font-black">{selectedEvent.isFree ? "مجاني" : formatMoney(selectedEvent.memberPrice)}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="text-[10px] font-black text-slate-400">دعم العضو</div>
                    <div className="mt-1 text-sm font-black">{formatMoney(selectedEvent.memberSupportValue)}</div>
                  </div>
                </div>
                {selectedEventDetails.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedEventDetails.map((item) => (
                      <span key={item.label} className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-[11px] font-bold text-teal-800 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-200">
                        {item.label}: {renderValue(item.value)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {canManageBookingOps && (
                <div className="p-4 border-b grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50/50 dark:bg-slate-800/20">
                  <div className="relative">
                    <label className="text-[10px] font-black text-slate-400">بحث عن عضو (اسم أو كود)</label>
                    <input value={memberQ} onChange={(e) => { setMemberQ(e.target.value); setSelectedMember(null); }} placeholder="اكتب حرفين على الأقل..." className={clsx("mt-1 w-full px-3 py-2 rounded-xl border text-xs font-bold", T.inp)} />
                    {memberQ.trim().length >= 2 && !selectedMember && (
                      <div className="absolute z-30 mt-1 w-full rounded-xl border bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
                        {memberResults.length === 0 ? (
                          <p className="p-3 text-[11px] font-bold text-slate-400 text-center">لا نتائج</p>
                        ) : memberResults.map((m) => (
                          <button key={m.id} type="button" onClick={() => { setSelectedMember(m); setMemberQ(m.name || ""); }} className="w-full text-right p-2.5 hover:bg-teal-50 dark:hover:bg-teal-900/20 border-b last:border-b-0">
                            <span className="block text-xs font-black">{m.name}</span>
                            <span className="block text-[10px] text-slate-400 font-bold">{m.jobId || ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-1">
                      <input value={compName} onChange={(e) => setCompName(e.target.value)} placeholder="اسم المرافق" className={clsx("flex-1 px-3 py-2 rounded-xl border text-xs font-bold", T.inp)} />
                      <input value={compRelation} onChange={(e) => setCompRelation(e.target.value)} placeholder="الصلة" className={clsx("w-24 px-3 py-2 rounded-xl border text-xs font-bold", T.inp)} />
                      <button type="button" onClick={() => { if (!compName.trim()) return; setCompanions((v) => [...v, { name: compName.trim(), relation: compRelation.trim() || "مرافق" }]); setCompName(""); setCompRelation(""); }} className="px-3 py-2 bg-slate-200 dark:bg-slate-700 rounded-xl text-xs font-black">+</button>
                    </div>
                    {companions.length > 0 && <p className="text-[10px] font-bold text-slate-500">المرافقون: {companions.map((c) => c.name).join("، ")}</p>}
                    <div className="flex gap-1">
                      <input type="number" min="0" value={cashPaid} onChange={(e) => setCashPaid(e.target.value)} placeholder="المدفوع نقداً" className={clsx("flex-1 px-3 py-2 rounded-xl border text-xs font-bold", T.inp)} />
                      <button onClick={handleAddBooking} disabled={saving || !selectedMember} className="px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-black disabled:opacity-50">تأكيد الحجز</button>
                    </div>
                    {selectedMember && selectedEvent && <p className="text-[10px] font-bold text-slate-500">التكلفة: {formatMoney(calcCost(selectedEvent, selectedMember, companions.length))}</p>}
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-right text-[11px]">
                  <thead><tr className="bg-slate-50 dark:bg-slate-800/50 border-b">
                    {["العضو", "الكود", "الأفراد", "التكلفة", "الدفع", "الحالة", "إجراءات"].map((h, i) => <th key={i} className="p-2.5 font-black text-slate-500 whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {filteredEventBookings.length === 0 ? (
                      <tr><td colSpan={7} className="p-8"><EmptyState title="لا توجد حجوزات مطابقة" hint="هذه الفعالية لا تحتوي حجوزات بهذه الحالة." /></td></tr>
                    ) : filteredEventBookings.map((b) => (
                      <tr key={b.id}>
                        <td className="p-2 font-black max-w-[180px] truncate">{b.memberName}</td>
                        <td className="p-2 whitespace-nowrap">{b.memberId}</td>
                        <td className="p-2 whitespace-nowrap">{b.totalPax}</td>
                        <td className="p-2 whitespace-nowrap">{formatMoney(b.totalCost)}</td>
                        <td className="p-2 max-w-[180px] truncate">{b.paymentSummary || "—"}</td>
                        <td className="p-2 whitespace-nowrap"><StatusBadge status={b.status}>{b.status === "confirmed" ? "مؤكد" : b.status === "pending" ? "معلق" : "ملغي"}</StatusBadge></td>
                        <td className="p-2 whitespace-nowrap">{canManageBookingOps && (
                          <div className="flex gap-1">
                            {b.status === "pending" && <button onClick={() => confirmBooking(b)} className="px-2.5 py-1 text-[10px] font-black bg-emerald-600 text-white rounded-lg">تأكيد</button>}
                            {b.status !== "cancelled" && <button onClick={() => { const r = window.prompt("سبب الإلغاء؟", ""); if (r !== null) cancelBooking(b, r); }} className="px-2.5 py-1 text-[10px] font-black bg-rose-50 text-rose-600 rounded-lg">إلغاء</button>}
                          </div>
                        )}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {showEventModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEventModal(false)} />
          <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 border shadow-2xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <h3 className="text-base font-black">{editingEvent ? "تعديل" : "فعالية جديدة"} — {config.title}</h3>
              <button onClick={() => setShowEventModal(false)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><X size={15} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">العنوان *</label>
                <input value={eventForm.title} onChange={(e) => setEventForm((v) => ({ ...v, title: e.target.value }))} className={inputCls} placeholder={`مثال: ${config.title} — صيف 2026`} />
              </div>
              <ArabicDatePicker label="تاريخ الفعالية *" value={eventForm.date} onChange={(value) => setEventForm((v) => ({ ...v, date: value }))} />
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">المكان</label>
                <input value={eventForm.location} onChange={(e) => setEventForm((v) => ({ ...v, location: e.target.value }))} className={inputCls} />
              </div>
              <ArabicDatePicker label="بداية الحجز" value={eventForm.bookingStart} onChange={(value) => setEventForm((v) => ({ ...v, bookingStart: value }))} />
              <ArabicDatePicker label="نهاية الحجز" value={eventForm.bookingEnd} onChange={(value) => setEventForm((v) => ({ ...v, bookingEnd: value }))} />
              {[
                { key: "capacity", label: "السعة" },
                { key: "memberPrice", label: "سعر العضو" },
                { key: "companionPrice", label: "سعر المرافق" },
                { key: "memberSupportValue", label: "دعم العضو" },
              ].map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">{f.label}</label>
                  <input type="number" min="0" value={eventForm[f.key]} onChange={(e) => setEventForm((v) => ({ ...v, [f.key]: e.target.value }))} className={inputCls} />
                </div>
              ))}
              <label className="flex items-center gap-2 text-xs font-black md:col-span-2">
                <input type="checkbox" checked={Boolean(eventForm.isFree)} onChange={(e) => setEventForm((v) => ({ ...v, isFree: e.target.checked }))} className="w-4 h-4" />
                فعالية مجانية
              </label>
              {(config.extraFields || []).map((f) => (
                <div key={f.key} className={f.type === "text" ? "md:col-span-2" : ""}>
                  <ExtraFieldInput field={f} value={eventForm[f.key]} onChange={(value) => setEventForm((v) => ({ ...v, [f.key]: value }))} />
                </div>
              ))}
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">ملاحظات</label>
                <textarea value={eventForm.description} onChange={(e) => setEventForm((v) => ({ ...v, description: e.target.value }))} rows={2} className={clsx(inputCls, "resize-none")} />
              </div>
            </div>
            <div className="px-5 py-4 border-t flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowEventModal(false)} className="px-4 py-2 rounded-xl text-xs font-black border">إلغاء</button>
              <button onClick={handleSaveEvent} disabled={saving} className="px-4 py-2 rounded-xl text-xs font-black bg-teal-600 text-white disabled:opacity-60">حفظ</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
        <MapPin size={12} />
        <span>مرتبط بالمنظومة: الحجوزات في <bdi dir="ltr">event_bookings</bdi> — الدعم في مزايا الأعضاء — التحصيل عبر الخزينة والتسويات برقم الشيك.</span>
      </div>
    </div>
  );
}
