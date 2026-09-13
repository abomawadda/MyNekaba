import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query } from "firebase/firestore";
import clsx from "clsx";
import { BadgeCheck, Bus, CalendarDays, Gift, KeyRound, LogOut, Ticket, UserRound } from "lucide-react";
import { db } from "../../app/providers/FirebaseProvider";
import { useT } from "../../app/providers/ThemeProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { maskNationalId } from "../../security/memberAccountService";
import { isAssemblyMember } from "../../utils/memberBenefits";
import { ChangePasswordCard } from "../auth/ResetPasswordPage";
import { formatMoney } from "../../utils/numberFormat";

function Card({ title, icon, children }) {
  const T = useT();
  return (
    <section className={clsx("rounded-3xl border shadow-sm p-5", T.card)}>
      <h2 className="text-sm font-black flex items-center gap-2 mb-4">
        <span className="text-teal-600 flex">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function MemberPortal() {
  const T = useT();
  const { user, logout } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [benefits, setBenefits] = useState([]);
  const [events, setEvents] = useState([]);

  const keys = useMemo(
    () => [user?.employeeId, user?.id, user?.phone].filter(Boolean).map(String),
    [user]
  );

  useEffect(() => {
    if (!keys.length) return;
    const unsub = onSnapshot(query(collection(db, "employees")), (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const mine = all.find((e) =>
        [e.jobId, e.employeeCode, e.id, e.phone, e.mobile].filter(Boolean).map(String).some((v) => keys.includes(v))
      ) || null;
      setEmployee(mine);
    });
    return unsub;
  }, [keys]);

  useEffect(() => {
    const unsubB = onSnapshot(query(collection(db, "event_bookings")), (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBookings(all.filter((b) =>
        [b.memberId, b.memberName].filter(Boolean).map(String).some((v) =>
          keys.includes(v) || (employee && [employee.jobId, employee.id, employee.phone].filter(Boolean).map(String).includes(v))
        )
      ));
    });
    const unsubM = onSnapshot(query(collection(db, "member_benefits")), (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBenefits(all.filter((b) =>
        [b.memberId, b.memberName].filter(Boolean).map(String).some((v) =>
          keys.includes(v) || (employee && [employee.jobId, employee.id].filter(Boolean).map(String).includes(v))
        )
      ));
    });
    const unsubE = onSnapshot(query(collection(db, "events")), (snap) => {
      const today = new Date().toISOString().slice(0, 10);
      setEvents(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((e) => (e.date || "") >= today)
          .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
          .slice(0, 6)
      );
    });
    return () => { unsubB(); unsubM(); unsubE(); };
  }, [keys, employee]);

  const totalBenefits = useMemo(
    () => benefits.filter((b) => b.status !== "cancelled").reduce((s, b) => s + Number(b.amount || 0), 0),
    [benefits]
  );

  return (
    <div className={clsx("min-h-screen pb-20", T.text)} dir="rtl">
      <div className="bg-gradient-to-l from-teal-600 to-emerald-600 text-white">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-teal-100">بوابة العضو</p>
            <h1 className="text-2xl font-black mt-1">مرحباً بك {user?.displayName || employee?.name || ""}</h1>
            <p className="text-[11px] font-bold text-teal-100 mt-1">
              {employee ? `كود الموظف: ${employee.jobId || "—"} • ${isAssemblyMember(employee) ? "عضو جمعية عمومية" : employee.membershipStatus || "موظف"}` : "جارٍ تحميل بياناتك..."}
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/" className="px-4 py-2 rounded-xl bg-white/15 text-xs font-black hover:bg-white/25 transition-colors">الموقع العام</Link>
            <button onClick={() => logout()} className="px-4 py-2 rounded-xl bg-white text-teal-700 text-xs font-black flex items-center gap-1.5">
              <LogOut size={14} /> خروج
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="بياناتي" icon={<UserRound size={16} />}>
          {!employee ? (
            <p className="text-xs font-bold text-slate-400">تعذر العثور على سجل الموظف المرتبط.</p>
          ) : (
            <div className="space-y-2 text-xs font-bold">
              <div className="flex justify-between"><span className="text-slate-500">الاسم</span><span>{employee.name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">الكود الوظيفي</span><span>{employee.jobId || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">الرقم القومي</span><span dir="ltr">{maskNationalId(employee.nationalId || employee.nationalID)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">الهاتف</span><span dir="ltr">{employee.phone || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">جهة العمل</span><span>{employee.workplace || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">العضوية</span><span>{employee.membershipStatus || "—"}</span></div>
            </div>
          )}
        </Card>

        <Card title="رحلات وفعاليات قادمة" icon={<Bus size={16} />}>
          {events.length === 0 ? (
            <p className="text-xs font-bold text-slate-400">لا توجد فعاليات قادمة حالياً.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="flex justify-between items-center rounded-xl border border-slate-100 p-3">
                  <div>
                    <p className="text-xs font-black">{e.title}</p>
                    <p className="text-[10px] font-bold text-slate-400">{e.date || ""} • {e.location || ""}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-[11px] font-black text-teal-700">{e.isFree ? "مجاني" : formatMoney(e.memberPrice)}</p>
                    <Link to="/activities/bookings" className="text-[10px] font-black text-slate-400 hover:text-teal-700">احجز الآن</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={`حجوزاتي (${bookings.length})`} icon={<Ticket size={16} />}>
          {bookings.length === 0 ? (
            <p className="text-xs font-bold text-slate-400">لا توجد حجوزات مسجلة.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {bookings.map((b) => (
                <div key={b.id} className="rounded-xl border border-slate-100 p-3 text-xs">
                  <div className="flex justify-between font-black"><span>{b.eventTitle}</span><span className={b.status === "confirmed" ? "text-emerald-600" : b.status === "cancelled" ? "text-rose-500" : "text-amber-600"}>{b.status === "confirmed" ? "مؤكد" : b.status === "cancelled" ? "ملغي" : "معلق"}</span></div>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">الأفراد: {b.totalPax} • {b.paymentSummary || ""}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="مزاياي" icon={<Gift size={16} />}>
          <p className="text-xs font-black text-emerald-600 mb-3">إجمالي المستحق: {formatMoney(totalBenefits)}</p>
          {benefits.length === 0 ? (
            <p className="text-xs font-bold text-slate-400">لا توجد مزايا مسجلة.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {benefits.map((b) => (
                <div key={b.id} className="rounded-xl border border-slate-100 p-3 text-xs">
                  <div className="flex justify-between font-black"><span>{b.benefitType}</span><span className="text-emerald-600">{formatMoney(b.amount)}</span></div>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">{b.date || ""} • {b.eventTitle || b.notes || ""}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="عضويتي" icon={<BadgeCheck size={16} />}>
          <div className="space-y-2 text-xs font-bold">
            <div className="flex justify-between"><span className="text-slate-500">الحالة</span><span>{employee?.memberState || "نشط"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">عضو جمعية عمومية</span><span>{employee ? (isAssemblyMember(employee) ? "نعم" : "لا") : "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">حالة الحساب</span><span>{user?.accountStatus === "active" ? "نشط" : user?.accountStatus || "—"}</span></div>
          </div>
        </Card>

        <Card title="تغيير كلمة المرور" icon={<KeyRound size={16} />}>
          <ChangePasswordCard />
        </Card>

        <Card title="الإعلانات" icon={<CalendarDays size={16} />}>
          <p className="text-xs font-bold text-slate-400">تابع <Link to="/" className="text-teal-700 font-black">الصفحة الرئيسية</Link> لآخر أخبار النقابة وإعلاناتها.</p>
        </Card>
      </div>
    </div>
  );
}
