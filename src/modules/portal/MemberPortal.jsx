import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  AlertTriangle,
  BadgeCheck,
  Bus,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Gift,
  Home,
  KeyRound,
  LoaderCircle,
  LogOut,
  MapPin,
  Send,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import { useT } from "../../app/providers/ThemeProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { maskNationalId } from "../../security/memberAccountService";
import { isAssemblyMember } from "../../utils/memberBenefits";
import { ChangePasswordCard } from "../auth/ResetPasswordPage";
import { formatMoney } from "../../utils/numberFormat";
import { UNION_ACTIVITY_TYPES } from "../activities/union/activityConfig";
import { useMemberPortalData } from "./data/useMemberPortalData";
import { resolveMemberAccess } from "./memberAccess";
import { MAX_COMPANIONS, REQUEST_STATUS } from "./bookingRequestService";

const TONES = {
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

const BOOKING_STATUS = {
  confirmed: { label: "مؤكد", tone: "emerald" },
  cancelled: { label: "ملغي", tone: "rose" },
  pending: { label: "بانتظار السداد", tone: "amber" },
};

const TABS = [
  { id: "overview", label: "الرئيسية", icon: Home },
  { id: "book", label: "الحجز والخدمات", icon: Bus },
  { id: "requests", label: "طلباتي وحجوزاتي", icon: ClipboardList },
  { id: "benefits", label: "مزاياي", icon: Gift },
  { id: "account", label: "حسابي", icon: UserRound },
];

function Pill({ tone = "slate", children }) {
  return <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black", TONES[tone])}>{children}</span>;
}

function Card({ title, icon, action, children, className }) {
  const T = useT();
  return (
    <section className={clsx("rounded-3xl border p-5 shadow-sm", T.card, className)}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <span className="flex text-brand-600">{icon}</span>
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
      <span className="text-slate-500">{label}</span>
      <span className="text-left">{children}</span>
    </div>
  );
}

function Empty(props) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-700">
      <props.icon size={24} className="mx-auto text-slate-300" />
      <p className="mt-2 text-xs font-bold text-slate-400">{props.text}</p>
    </div>
  );
}

function RequestDialog({ target, onClose, onSubmit, submitting, error }) {
  const [companions, setCompanions] = useState(0);
  const [notes, setNotes] = useState("");
  if (!target) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" dir="rtl" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 text-slate-900 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black text-brand-600">{target.kind === "service" ? "طلب خدمة" : "طلب حجز"}</p>
            <h3 className="mt-1 text-lg font-black">{target.title}</h3>
            {target.date && <p className="mt-1 text-xs font-bold text-slate-400">{target.date}</p>}
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="إغلاق"><X size={18} /></button>
        </div>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ companions, notes });
          }}
        >
          {target.kind !== "service" && (
            <label className="block space-y-1.5">
              <span className="text-xs font-black text-slate-600">عدد المرافقين (بخلافك)</span>
              <input
                type="number"
                min={0}
                max={MAX_COMPANIONS}
                value={companions}
                onChange={(e) => setCompanions(Math.max(0, Math.min(MAX_COMPANIONS, Number(e.target.value) || 0)))}
                className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10"
              />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-slate-600">ملاحظات (اختياري)</span>
            <textarea
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي تفاصيل تود إبلاغ الإدارة بها"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10"
            />
          </label>
          <p className="rounded-2xl bg-brand-50 px-4 py-3 text-[11px] font-bold leading-5 text-brand-800">
            يُرسل الطلب لإدارة النقابة للمراجعة وتأكيد الحجز والسداد، وتتابع حالته من تبويب «طلباتي وحجوزاتي».
          </p>
          {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-sm font-black text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={16} />}
            إرسال الطلب
          </button>
        </form>
      </div>
    </div>
  );
}

export default function MemberPortal() {
  const [tab, setTab] = useState("overview");
  const [dialogTarget, setDialogTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [toast, setToast] = useState("");
  const T = useT();
  const { user, logout } = useAuth();
  const { employee, employeeLoaded, bookings, benefits, events, requests, submitRequest, cancelRequest } = useMemberPortalData(user);
  const totalBenefits = useMemo(
    () => benefits.filter((b) => b.status !== "cancelled").reduce((s, b) => s + Number(b.amount || 0), 0),
    [benefits]
  );

  const access = useMemo(() => resolveMemberAccess({ user, employee, employeeLoaded }), [user, employee, employeeLoaded]);

  const requestedTargets = useMemo(
    () => new Set(requests.filter((r) => r.status === "pending" || r.status === "approved").map((r) => r.targetId)),
    [requests]
  );
  const bookedEvents = useMemo(
    () => new Set(bookings.filter((b) => b.status !== "cancelled").map((b) => b.eventId)),
    [bookings]
  );
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const services = useMemo(() => UNION_ACTIVITY_TYPES.filter((t) => !t.installmentsOnly && !t.stockMode), []);

  const openRequest = (target) => {
    setRequestError("");
    setDialogTarget(target);
  };

  const handleSubmit = async ({ companions, notes }) => {
    if (!access.canBook) {
      setRequestError(access.reason);
      return;
    }
    setSubmitting(true);
    setRequestError("");
    try {
      await submitRequest({ target: dialogTarget, companions, notes });
      setDialogTarget(null);
      setToast("تم إرسال طلبك بنجاح، وسيتم إشعارك بعد المراجعة.");
      setTab("requests");
      window.setTimeout(() => setToast(""), 4000);
    } catch (e) {
      setRequestError(e?.message || "تعذر إرسال الطلب. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm("إلغاء هذا الطلب؟")) return;
    try {
      await cancelRequest(id);
    } catch (e) {
      setToast(e?.message || "تعذر إلغاء الطلب.");
    }
  };

  const displayName = employee?.name || user?.displayName || "";

  const summaryCards = [
    { label: "طلبات قيد المراجعة", value: pendingCount, icon: ClipboardList, go: "requests" },
    { label: "حجوزاتي", value: bookings.filter((b) => b.status !== "cancelled").length, icon: Ticket, go: "requests" },
    { label: "فعاليات متاحة", value: events.length, icon: Bus, go: "book" },
    { label: "إجمالي المزايا", value: formatMoney(totalBenefits), icon: Gift, go: "benefits" },
  ];

  const renderEventCard = (e) => {
    const requested = requestedTargets.has(e.id);
    const booked = bookedEvents.has(e.id);
    return (
      <article key={e.id} className="flex flex-col rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-black">{e.title}</h3>
          <span className="shrink-0 text-xs font-black text-brand-700">{e.isFree ? "مجاني" : formatMoney(e.memberPrice)}</span>
        </div>
        <div className="mt-2 space-y-1 text-[11px] font-bold text-slate-400">
          <p className="flex items-center gap-1"><CalendarDays size={12} /> {e.date || "—"}</p>
          {e.location && <p className="flex items-center gap-1"><MapPin size={12} /> {e.location}</p>}
        </div>
        <div className="mt-4">
          {booked ? (
            <Pill tone="emerald">محجوز لك</Pill>
          ) : requested ? (
            <Pill tone="amber">تم إرسال الطلب</Pill>
          ) : (
            <button
              onClick={() => openRequest({ kind: "event", id: e.id, title: e.title, date: e.date })}
              disabled={!access.canBook}
              title={access.canBook ? "" : access.reason}
              className="w-full rounded-xl bg-brand-600 py-2.5 text-xs font-black text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              طلب حجز
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className={clsx("min-h-screen pb-24", T.text)} dir="rtl">
      {/* Hero */}
      <div className="bg-gradient-to-br from-brand-800 via-brand-700 to-brand-500 text-white">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-xl font-black">
                {(displayName || "؟").trim().charAt(0)}
              </div>
              <div>
                <p className="text-[11px] font-bold text-white/70">بوابة العضو</p>
                <h1 className="text-xl font-black sm:text-2xl">مرحباً {displayName}</h1>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {employee?.jobId && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-black">كود: {employee.jobId}</span>}
                  <span className={clsx("rounded-full px-2.5 py-0.5 text-[10px] font-black", access.canBook ? "bg-emerald-400/25" : "bg-amber-400/25")}>
                    {access.badge}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Link to="/" className="rounded-xl bg-white/15 px-4 py-2 text-xs font-black hover:bg-white/25">الموقع العام</Link>
              <button onClick={() => logout()} className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-black text-brand-700">
                <LogOut size={14} /> خروج
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-10 max-w-6xl px-4">
        {/* Tabs */}
        <nav className={clsx("flex gap-1 overflow-x-auto rounded-2xl border p-1.5 shadow-sm", T.card)}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black transition-colors",
                tab === t.id ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              <t.icon size={15} /> {t.label}
              {t.id === "requests" && pendingCount > 0 && (
                <span className={clsx("rounded-full px-1.5 text-[10px]", tab === t.id ? "bg-white/25" : "bg-amber-100 text-amber-700")}>{pendingCount}</span>
              )}
            </button>
          ))}
        </nav>

        {toast && (
          <div role="status" className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-700">
            <CheckCircle2 size={16} /> {toast}
          </div>
        )}

        {!access.canBook && employeeLoaded && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-6 text-amber-800">
            <AlertTriangle size={16} className="mt-1 shrink-0" /> {access.reason}
          </div>
        )}

        <div className="mt-5 space-y-5">
          {tab === "overview" && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {summaryCards.map((c) => (
                  <button key={c.label} onClick={() => setTab(c.go)} className={clsx("rounded-3xl border p-5 text-right shadow-sm transition hover:-translate-y-0.5", T.card)}>
                    <c.icon size={20} className="text-brand-600" />
                    <p className="mt-3 text-2xl font-black">{c.value}</p>
                    <p className="mt-1 text-[11px] font-bold text-slate-500">{c.label}</p>
                  </button>
                ))}
              </div>
              <Card title="أقرب الفعاليات" icon={<Bus size={16} />} action={<button onClick={() => setTab("book")} className="text-[11px] font-black text-brand-600">عرض الكل</button>}>
                {events.length === 0 ? <Empty icon={Bus} text="لا توجد فعاليات قادمة حالياً." /> : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{events.slice(0, 3).map(renderEventCard)}</div>
                )}
              </Card>
            </>
          )}

          {tab === "book" && (
            <>
              <Card title="الرحلات والفعاليات المتاحة" icon={<Bus size={16} />}>
                {events.length === 0 ? <Empty icon={Bus} text="لا توجد فعاليات قادمة حالياً." /> : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{events.map(renderEventCard)}</div>
                )}
              </Card>
              <Card title="الخدمات النقابية" icon={<Gift size={16} />}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {services.map((s) => {
                    const requested = requestedTargets.has(`service:${s.id}`);
                    return (
                      <div key={s.id} className="flex flex-col rounded-2xl border border-slate-200 p-4 text-center dark:border-slate-700">
                        <span className="text-2xl">{s.icon}</span>
                        <p className="mt-2 text-xs font-black">{s.title}</p>
                        <p className="mt-1 flex-1 text-[10px] font-bold text-slate-400">{s.subtitle}</p>
                        {requested ? (
                          <div className="mt-3"><Pill tone="amber">طلب قائم</Pill></div>
                        ) : (
                          <button
                            onClick={() => openRequest({ kind: "service", id: `service:${s.id}`, title: s.title })}
                            disabled={!access.canBook}
                            title={access.canBook ? "" : access.reason}
                            className="mt-3 rounded-xl border border-brand-200 py-2 text-[11px] font-black text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                          >
                            تقديم طلب
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          )}

          {tab === "requests" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card title={`طلباتي (${requests.length})`} icon={<ClipboardList size={16} />}>
                {requests.length === 0 ? <Empty icon={ClipboardList} text="لم تقدّم أي طلبات بعد." /> : (
                  <div className="space-y-2">
                    {requests.map((r) => {
                      const st = REQUEST_STATUS[r.status] || REQUEST_STATUS.pending;
                      return (
                        <div key={r.id} className="rounded-2xl border border-slate-100 p-3 text-xs dark:border-slate-800">
                          <div className="flex items-center justify-between gap-2 font-black">
                            <span>{r.targetTitle}</span>
                            <Pill tone={st.tone}>{st.label}</Pill>
                          </div>
                          <p className="mt-1 text-[10px] font-bold text-slate-400">
                            {r.kind === "service" ? "خدمة" : `الأفراد: ${r.totalPax}`} • {String(r.createdAtIso || "").slice(0, 10)}
                          </p>
                          {r.reviewNote && <p className="mt-2 rounded-xl bg-slate-50 p-2 text-[11px] font-bold text-slate-600 dark:bg-slate-800">رد الإدارة: {r.reviewNote}</p>}
                          {r.status === "pending" && (
                            <button onClick={() => handleCancel(r.id)} className="mt-2 text-[11px] font-black text-rose-600 hover:underline">إلغاء الطلب</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
              <Card title={`حجوزاتي المؤكدة (${bookings.length})`} icon={<Ticket size={16} />}>
                {bookings.length === 0 ? <Empty icon={Ticket} text="لا توجد حجوزات مسجلة." /> : (
                  <div className="space-y-2">
                    {bookings.map((b) => {
                      const st = BOOKING_STATUS[b.status] || BOOKING_STATUS.pending;
                      return (
                        <div key={b.id} className="rounded-2xl border border-slate-100 p-3 text-xs dark:border-slate-800">
                          <div className="flex items-center justify-between gap-2 font-black"><span>{b.eventTitle}</span><Pill tone={st.tone}>{st.label}</Pill></div>
                          <p className="mt-1 text-[10px] font-bold text-slate-400">الأفراد: {b.totalPax} {b.totalCost ? `• التكلفة: ${formatMoney(b.totalCost)}` : ""}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}

          {tab === "benefits" && (
            <Card title="مزاياي" icon={<Gift size={16} />} action={<span className="text-xs font-black text-emerald-600">الإجمالي: {formatMoney(totalBenefits)}</span>}>
              {benefits.length === 0 ? <Empty icon={Gift} text="لا توجد مزايا مسجلة." /> : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {benefits.map((b) => (
                    <div key={b.id} className="rounded-2xl border border-slate-100 p-3 text-xs dark:border-slate-800">
                      <div className="flex justify-between font-black"><span>{b.benefitType}</span><span className="text-emerald-600">{formatMoney(b.amount)}</span></div>
                      <p className="mt-1 text-[10px] font-bold text-slate-400">{b.date || ""} • {b.eventTitle || b.notes || ""}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {tab === "account" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card title="بياناتي" icon={<UserRound size={16} />}>
                {!employee ? (
                  <p className="text-xs font-bold text-slate-400">{employeeLoaded ? "تعذر العثور على سجل العضو المرتبط بحسابك." : "جارٍ التحميل..."}</p>
                ) : (
                  <div className="text-xs font-bold">
                    <Row label="الاسم">{employee.name}</Row>
                    <Row label="الكود الوظيفي">{employee.jobId || "—"}</Row>
                    <Row label="الرقم القومي"><span dir="ltr">{maskNationalId(employee.nationalId || employee.nationalID)}</span></Row>
                    <Row label="الهاتف"><span dir="ltr">{employee.phone || "—"}</span></Row>
                    <Row label="جهة العمل">{employee.workplace || "—"}</Row>
                  </div>
                )}
              </Card>
              <Card title="عضويتي وصلاحياتي" icon={<BadgeCheck size={16} />}>
                <div className="text-xs font-bold">
                  <Row label="حالة الحساب">{user?.accountStatus === "active" ? <Pill tone="emerald">مفعّل</Pill> : <Pill tone="amber">{user?.accountStatus || "—"}</Pill>}</Row>
                  <Row label="عضو جمعية عمومية">{employee ? (isAssemblyMember(employee) ? "نعم" : "لا") : "—"}</Row>
                  <Row label="حالة العضوية">{employee?.membershipStatus || "—"}</Row>
                  <Row label="الحجز وطلب الخدمات">{access.canBook ? <Pill tone="emerald">متاح</Pill> : <Pill tone="rose">غير متاح</Pill>}</Row>
                </div>
              </Card>
              <Card title="تغيير كلمة المرور" icon={<KeyRound size={16} />} className="lg:col-span-2">
                <ChangePasswordCard />
              </Card>
            </div>
          )}
        </div>
      </div>

      <RequestDialog
        key={dialogTarget?.id || "none"}
        target={dialogTarget}
        onClose={() => setDialogTarget(null)}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={requestError}
      />
    </div>
  );
}
