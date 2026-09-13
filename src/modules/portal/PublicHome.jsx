import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Bus, Gift, Megaphone, Menu, ShieldCheck, Users, X } from "lucide-react";
import { db } from "../../app/providers/FirebaseProvider";
import { UNION_ACTIVITY_TYPES } from "../activities/union/activityConfig";
import { formatMoney } from "../../utils/numberFormat";

const NAV = [
  { id: "home", label: "الرئيسية" },
  { id: "about", label: "من نحن" },
  { id: "services", label: "الخدمات" },
  { id: "trips", label: "الرحلات" },
  { id: "news", label: "الأخبار" },
  { id: "board", label: "مجلس الإدارة" },
  { id: "contact", label: "التواصل" },
];

export default function PublicHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [news, setNews] = useState([]);
  const [boardMembers, setBoardMembers] = useState([]);
  const [memberCount, setMemberCount] = useState(0);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const unsubs = [
      onSnapshot(query(collection(db, "events"), where("date", ">=", today)), (snap) => {
        setEvents(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
            .slice(0, 6)
        );
      }),
      onSnapshot(query(collection(db, "site_news"), where("active", "!=", false)), (snap) => {
        setNews(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
            .slice(0, 6)
        );
      }),
      onSnapshot(query(collection(db, "employees")), (snap) => {
        setMemberCount(snap.size);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    const unsubM = onSnapshot(query(collection(db, "board_memberships")), (snap) => {
      const memberships = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const unsubE = onSnapshot(query(collection(db, "employees")), (snapE) => {
        const empMap = new Map(snapE.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
        const order = { "رئيس المجلس": 1, "الأمين العام": 2, "أمين الصندوق": 3 };
        setBoardMembers(
          memberships
            .filter((m) => m.status === "active")
            .map((m) => ({ ...m, employee: empMap.get(m.memberId) || {} }))
            .sort((a, b) => (order[a.role] || 99) - (order[b.role] || 99))
            .slice(0, 11)
        );
      });
      return unsubE;
    });
    return unsubM;
  }, []);

  const stats = useMemo(
    () => [
      { label: "خدمة نقابية", value: UNION_ACTIVITY_TYPES.length, icon: Gift },
      { label: "رحلة وفعالية قادمة", value: events.length, icon: Bus },
      { label: "عضو مسجل بالمنظومة", value: memberCount, icon: Users },
      { label: "عضو مجلس إدارة", value: boardMembers.length, icon: ShieldCheck },
    ],
    [events.length, memberCount, boardMembers.length]
  );

  const scrollTo = (id) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900" dir="rtl">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <button onClick={() => scrollTo("home")} className="flex items-center gap-2">
            <img src="/brand-left.png" alt="شعار النقابة" className="w-10 h-10 object-contain" />
            <span className="font-black text-sm sm:text-base">النقابة العامة للعاملين بالاتصالات</span>
          </button>
          <nav className="hidden lg:flex items-center gap-5">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => scrollTo(n.id)} className="text-xs font-black text-slate-600 hover:text-teal-700 transition-colors">
                {n.label}
              </button>
            ))}
          </nav>
          <div className="hidden lg:flex items-center gap-2">
            <Link to="/login" className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-black hover:bg-slate-50 transition-colors">تسجيل الدخول</Link>
            <Link to="/register" className="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-black hover:bg-teal-700 transition-colors">إنشاء حساب</Link>
          </div>
          <button onClick={() => setMenuOpen((v) => !v)} className="lg:hidden p-2 rounded-xl border border-slate-200">
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        {menuOpen && (
          <div className="lg:hidden border-t border-slate-100 px-4 py-3 space-y-1 bg-white">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => scrollTo(n.id)} className="block w-full text-right py-2 text-sm font-black text-slate-700">
                {n.label}
              </button>
            ))}
            <div className="flex gap-2 pt-2">
              <Link to="/login" className="flex-1 text-center px-4 py-2.5 rounded-xl border text-xs font-black">تسجيل الدخول</Link>
              <Link to="/register" className="flex-1 text-center px-4 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-black">إنشاء حساب</Link>
            </div>
          </div>
        )}
      </header>

      <section id="home" className="bg-gradient-to-l from-teal-700 via-teal-600 to-emerald-600 text-white">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-24 text-center">
          <h1 className="text-3xl sm:text-5xl font-black leading-tight">مرحباً بك في المنظومة الإلكترونية للنقابة</h1>
          <p className="mt-4 text-sm sm:text-base font-bold text-teal-50 max-w-2xl mx-auto leading-8">
            خدمات الأعضاء والرحلات والمزايا والدعم والخدمات الاجتماعية والمالية — ومتابعة طلباتك من مكان واحد.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="px-6 py-3 rounded-2xl bg-white text-teal-700 text-sm font-black hover:bg-teal-50 transition-colors">أنشئ حسابك كعضو</Link>
            <button onClick={() => scrollTo("services")} className="px-6 py-3 rounded-2xl border border-white/40 text-sm font-black hover:bg-white/10 transition-colors">استكشف الخدمات</button>
          </div>
        </div>
      </section>

      <section id="about" className="max-w-6xl mx-auto px-4 py-14">
        <h2 className="text-xl font-black mb-2">من نحن</h2>
        <p className="text-sm font-bold text-slate-500 leading-8 max-w-3xl">
          النقابة العامة للعاملين بالاتصالات — تنظيم عمالي يخدم أعضاءه من العاملين بالشركة عبر الخدمات الاجتماعية والثقافية والمالية، ويديره مجلس إدارة منتخب من الجمعية العمومية.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
          {stats.map((s) => (
            <div key={s.label} className="p-5 rounded-2xl border border-slate-200 bg-slate-50 text-center">
              <s.icon size={20} className="mx-auto text-teal-600" />
              <p className="text-2xl font-black mt-2">{s.value}</p>
              <p className="text-[11px] font-black text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="services" className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-xl font-black mb-1">خدمات النقابة</h2>
          <p className="text-xs font-bold text-slate-500 mb-8">منظومة الخدمات النقابية — سجل الدخول للاستفادة والحجز.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {UNION_ACTIVITY_TYPES.filter((t) => !t.installmentsOnly).map((t) => (
              <div key={t.id} className="p-5 rounded-2xl bg-white border border-slate-200 text-center hover:shadow-md transition-shadow">
                <span className="text-3xl">{t.icon}</span>
                <p className="text-sm font-black mt-2">{t.title}</p>
                <p className="text-[10px] font-bold text-slate-400 mt-1">{t.subtitle}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="trips" className="max-w-6xl mx-auto px-4 py-14">
        <h2 className="text-xl font-black mb-1 flex items-center gap-2"><Bus size={20} className="text-teal-600" /> الرحلات المتاحة</h2>
        <p className="text-xs font-bold text-slate-500 mb-8">احجز بعد تسجيل الدخول بحساب العضو.</p>
        {events.length === 0 ? (
          <p className="text-sm font-bold text-slate-400">لا توجد رحلات معلنة حالياً.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map((e) => (
              <div key={e.id} className="rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-5">
                  <p className="text-sm font-black">{e.title}</p>
                  <p className="text-[11px] font-bold text-slate-400 mt-1">{e.date || ""} • {e.location || ""}</p>
                  <div className="flex justify-between items-center mt-3 text-xs font-black">
                    <span className="text-teal-700">{e.isFree ? "مجاني" : formatMoney(e.memberPrice)}</span>
                    <span className="text-slate-400">الأماكن: {e.capacity || "—"}</span>
                  </div>
                  <Link to="/login" className="block text-center mt-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-700 transition-colors">
                    سجل الدخول للحجز وعرض التفاصيل
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="news" className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-xl font-black mb-8 flex items-center gap-2"><Megaphone size={20} className="text-amber-600" /> آخر الأخبار والإعلانات</h2>
          {news.length === 0 ? (
            <p className="text-sm font-bold text-slate-400">لا توجد إعلانات حالياً.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {news.map((n) => (
                <div key={n.id} className="p-5 rounded-2xl bg-white border border-slate-200">
                  <p className="text-[10px] font-black text-amber-600">{n.date || ""}</p>
                  <p className="text-sm font-black mt-1">{n.title}</p>
                  <p className="text-xs font-bold text-slate-500 mt-2 leading-7">{n.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="board" className="max-w-6xl mx-auto px-4 py-14">
        <h2 className="text-xl font-black mb-8">مجلس إدارة النقابة</h2>
        {boardMembers.length === 0 ? (
          <p className="text-sm font-bold text-slate-400">سيتم إعلان التشكيل قريباً.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {boardMembers.map((m) => (
              <div key={m.id} className="p-4 rounded-2xl border border-slate-200 text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-black">
                  {(m.employee?.name || m.memberName || "?").trim().charAt(0)}
                </div>
                <p className="text-xs font-black mt-2">{m.employee?.name || m.memberName}</p>
                <p className="text-[10px] font-black text-amber-600 mt-0.5">{m.role}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="contact" className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-14 grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div>
            <p className="font-black mb-2">النقابة العامة للعاملين بالاتصالات</p>
            <p className="text-xs font-bold text-slate-400 leading-7">منظومة إلكترونية لخدمة الأعضاء — الخدمات والرحلات والمزايا والمتابعة.</p>
          </div>
          <div>
            <p className="font-black mb-3 text-sm">روابط مهمة</p>
            <div className="space-y-2 text-xs font-bold text-slate-300">
              {NAV.slice(1, 6).map((n) => (
                <button key={n.id} onClick={() => scrollTo(n.id)} className="block hover:text-white transition-colors">{n.label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="font-black mb-3 text-sm">حسابك</p>
            <div className="flex gap-2">
              <Link to="/login" className="px-4 py-2 rounded-xl bg-white text-slate-900 text-xs font-black">دخول</Link>
              <Link to="/register" className="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-black">حساب جديد</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800 py-4 text-center text-[10px] font-bold text-slate-500">
          جميع الحقوق محفوظة للنقابة العامة للعاملين بالاتصالات
        </div>
      </section>
    </div>
  );
}
