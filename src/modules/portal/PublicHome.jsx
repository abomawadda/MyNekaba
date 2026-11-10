import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import {
  ArrowLeft,
  BadgeCheck,
  Bus,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Gift,
  LogIn,
  MapPin,
  Megaphone,
  Menu,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { db } from "../../app/providers/FirebaseProvider";
import { USE_SUPABASE, supabase } from "../../lib/backend";
import { mapEvent } from "./data/mappers";
import { UNION_ACTIVITY_TYPES } from "../activities/union/activityConfig";
import { formatMoney } from "../../utils/numberFormat";

const NAV = [
  { id: "home", label: "الرئيسية" },
  { id: "services", label: "الخدمات" },
  { id: "trips", label: "الرحلات والفعاليات" },
  { id: "news", label: "الأخبار" },
  { id: "board", label: "مجلس الإدارة" },
  { id: "how", label: "كيف أبدأ" },
  { id: "contact", label: "تواصل معنا" },
];

const STEPS = [
  { icon: UserPlus, title: "أنشئ حسابك", text: "سجّل بكودك الوظيفي ورقمك القومي ليتم ربط الحساب بسجلك في النقابة." },
  { icon: ClipboardCheck, title: "اعتماد الحساب", text: "تراجع إدارة النقابة بياناتك وتفعّل الحساب كعضو معتمد." },
  { icon: Sparkles, title: "احجز واستفد", text: "اطلب حجز الرحلات والخدمات وتابع حجوزاتك ومزاياك من بوابة العضو." },
];

const BOARD_ORDER = { "رئيس المجلس": 1, "نائب الرئيس": 2, "الأمين العام": 3, "أمين الصندوق": 4 };

function formatArabicDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
}

/** Subscribe to a public collection, ignoring permission errors so the page always renders. */
function usePublicDataFirebase() {
  const [events, setEvents] = useState([]);
  const [news, setNews] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!db) return undefined;
    const today = new Date().toISOString().slice(0, 10);
    const ignore = () => {};
    const unsubs = [
      onSnapshot(
        query(collection(db, "events"), where("date", ">=", today)),
        (snap) =>
          setEvents(
            snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((e) => e.status !== "cancelled" && e.isPublic !== false)
              .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
              .slice(0, 6)
          ),
        ignore
      ),
      onSnapshot(
        query(collection(db, "site_news"), where("active", "==", true)),
        (snap) =>
          setNews(
            snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
              .slice(0, 6)
          ),
        ignore
      ),
      // Public, non-sensitive snapshot published by staff (member count + board roster).
      onSnapshot(doc(db, "public_site", "summary"), (snap) => setSummary(snap.exists() ? snap.data() : null), ignore),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  return { events, news, summary };
}

/** Supabase variant: anon RLS exposes only public events, active news and the two public RPCs. */
function usePublicDataSupabase() {
  const [data, setData] = useState({ events: [], news: [], summary: null });

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      supabase.from("events").select("id, title, type, event_date, location, capacity, is_free, member_price, status").gte("event_date", today).neq("status", "cancelled").order("event_date").limit(6),
      supabase.from("site_news").select("id, title, body, news_date").order("news_date", { ascending: false }).limit(6),
      supabase.rpc("public_stats"),
      supabase.rpc("public_board"),
    ]).then(([events, news, stats, board]) => {
      if (!active) return;
      setData({
        events: (events.data || []).map(mapEvent),
        news: (news.data || []).map((n) => ({ id: n.id, title: n.title, body: n.body, date: n.news_date })),
        summary: stats.data ? { memberCount: stats.data.member_count, board: board.data || [] } : null,
      });
    });
    return () => {
      active = false;
    };
  }, []);

  return data;
}

const usePublicData = USE_SUPABASE ? usePublicDataSupabase : usePublicDataFirebase;

function SectionTitle({ eyebrow, title, text }) {
  return (
    <div className="max-w-2xl mb-10">
      {eyebrow && <p className="text-[11px] font-black tracking-wider text-brand-600 mb-2">{eyebrow}</p>}
      <h2 className="text-2xl sm:text-3xl font-black text-slate-900">{title}</h2>
      {text && <p className="mt-3 text-sm font-semibold leading-7 text-slate-500">{text}</p>}
    </div>
  );
}

export default function PublicHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { events, news, summary } = usePublicData();

  const services = useMemo(() => UNION_ACTIVITY_TYPES.filter((t) => !t.installmentsOnly), []);
  const boardMembers = useMemo(
    () =>
      [...(summary?.board || [])]
        .sort((a, b) => (BOARD_ORDER[a.role] || 99) - (BOARD_ORDER[b.role] || 99))
        .slice(0, 12),
    [summary]
  );

  const stats = [
    { label: "خدمة نقابية", value: services.length, icon: Gift },
    { label: "فعالية قادمة", value: events.length, icon: Bus },
    { label: "عضو مسجل", value: summary?.memberCount ?? "—", icon: Users },
    { label: "عضو مجلس إدارة", value: boardMembers.length || "—", icon: ShieldCheck },
  ];

  const scrollTo = (id) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <button onClick={() => scrollTo("home")} className="flex items-center gap-2.5 text-right">
            <img src="/brand-left.png" alt="شعار النقابة" className="h-10 w-10 object-contain" />
            <span className="leading-tight">
              <span className="block text-sm font-black">النقابة العامة للعاملين بالاتصالات</span>
              <span className="block text-[10px] font-bold text-slate-400">بوابة الخدمات الإلكترونية</span>
            </span>
          </button>
          <nav className="hidden items-center gap-1 xl:flex">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => scrollTo(n.id)}
                className="rounded-lg px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
              >
                {n.label}
              </button>
            ))}
          </nav>
          <div className="hidden items-center gap-2 sm:flex">
            <Link to="/login" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-black transition-colors hover:bg-slate-50">
              <LogIn size={15} /> تسجيل الدخول
            </Link>
            <Link to="/register" className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-black text-white shadow-sm shadow-brand-600/20 transition-colors hover:bg-brand-700">
              <UserPlus size={15} /> إنشاء حساب
            </Link>
          </div>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-xl border border-slate-200 p-2 xl:hidden"
            aria-label="القائمة"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        {menuOpen && (
          <div className="space-y-1 border-t border-slate-100 bg-white px-4 py-3 xl:hidden">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => scrollTo(n.id)} className="block w-full rounded-lg px-2 py-2 text-right text-sm font-black text-slate-700 hover:bg-slate-50">
                {n.label}
              </button>
            ))}
            <div className="flex gap-2 pt-2 sm:hidden">
              <Link to="/login" className="flex-1 rounded-xl border px-4 py-2.5 text-center text-xs font-black">تسجيل الدخول</Link>
              <Link to="/register" className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-center text-xs font-black text-white">إنشاء حساب</Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section id="home" className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full bg-fuchsia-400/20 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-black">
              <BadgeCheck size={14} /> المنظومة الرقمية الرسمية للأعضاء
            </span>
            <h1 className="mt-5 text-3xl font-black leading-[1.35] sm:text-5xl sm:leading-[1.3]">
              خدماتك النقابية
              <br />
              <span className="text-fuchsia-200">في مكان واحد</span>
            </h1>
            <p className="mt-5 max-w-xl text-sm font-semibold leading-8 text-white/80 sm:text-base">
              احجز الرحلات والمصايف، واطلب الخدمات الاجتماعية والمالية، وتابع حجوزاتك ومزاياك كعضو في النقابة العامة للعاملين بالاتصالات.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-black text-brand-700 shadow-lg shadow-black/10 transition-colors hover:bg-brand-50">
                أنشئ حساب العضو <ArrowLeft size={16} />
              </Link>
              <Link to="/login" className="inline-flex items-center gap-2 rounded-2xl border border-white/30 px-6 py-3 text-sm font-black transition-colors hover:bg-white/10">
                <LogIn size={16} /> دخول الأعضاء
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                <s.icon size={22} className="text-fuchsia-200" />
                <p className="mt-4 text-3xl font-black">{s.value}</p>
                <p className="mt-1 text-xs font-bold text-white/70">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-7xl px-4 py-20">
        <SectionTitle
          eyebrow="خدمات الأعضاء"
          title="منظومة الخدمات النقابية"
          text="مجموعة متكاملة من الخدمات المتاحة لأعضاء الجمعية العمومية. سجّل الدخول بحساب العضو لتقديم الطلبات والحجز."
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {services.map((t) => (
            <Link
              to="/login"
              key={t.id}
              className="group rounded-3xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-900/5"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-2xl">{t.icon}</span>
              <p className="mt-4 text-sm font-black">{t.title}</p>
              <p className="mt-1 text-[11px] font-bold leading-5 text-slate-400">{t.subtitle}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[11px] font-black text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
                اطلب الخدمة <ArrowLeft size={12} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Trips */}
      <section id="trips" className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <SectionTitle eyebrow="احجز مكانك" title="الرحلات والفعاليات القادمة" text="الحجز متاح لأعضاء الجمعية العمومية بعد تسجيل الدخول." />
          {events.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <Bus size={28} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-400">لا توجد رحلات معلنة حالياً — تابعنا قريباً.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((e) => (
                <article key={e.id} className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white transition-shadow hover:shadow-xl hover:shadow-brand-900/5">
                  <div className="flex items-center justify-between bg-gradient-to-l from-brand-600 to-brand-500 px-5 py-4 text-white">
                    <span className="text-[11px] font-black text-white/80">{e.type || "فعالية"}</span>
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black">{e.isFree ? "مجاني" : formatMoney(e.memberPrice)}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-base font-black">{e.title}</h3>
                    <div className="mt-3 space-y-1.5 text-xs font-bold text-slate-500">
                      <p className="flex items-center gap-1.5"><CalendarDays size={14} className="text-brand-500" /> {formatArabicDate(e.date)}</p>
                      {e.location && <p className="flex items-center gap-1.5"><MapPin size={14} className="text-brand-500" /> {e.location}</p>}
                      {e.capacity && <p className="flex items-center gap-1.5"><Users size={14} className="text-brand-500" /> السعة: {e.capacity}</p>}
                    </div>
                    <Link to="/login" className="mt-5 block rounded-2xl bg-slate-900 py-3 text-center text-xs font-black text-white transition-colors hover:bg-brand-700">
                      سجّل الدخول لطلب الحجز
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* News */}
      <section id="news" className="mx-auto max-w-7xl px-4 py-20">
        <SectionTitle eyebrow="المركز الإعلامي" title="آخر الأخبار والإعلانات" />
        {news.length === 0 ? (
          <p className="text-sm font-bold text-slate-400">لا توجد إعلانات حالياً.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {news.map((n) => (
              <article key={n.id} className="rounded-3xl border border-slate-200 p-6 transition-shadow hover:shadow-lg">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black text-amber-700">
                  <Megaphone size={12} /> {formatArabicDate(n.date)}
                </span>
                <h3 className="mt-3 text-sm font-black leading-6">{n.title}</h3>
                <p className="mt-2 line-clamp-4 text-xs font-semibold leading-6 text-slate-500">{n.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Board */}
      <section id="board" className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <SectionTitle eyebrow="القيادة النقابية" title="مجلس إدارة النقابة" text="مجلس منتخب من الجمعية العمومية لخدمة الأعضاء ورعاية مصالحهم." />
          {boardMembers.length === 0 ? (
            <p className="text-sm font-bold text-slate-400">سيتم إعلان التشكيل قريباً.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {boardMembers.map((m, i) => (
                <div key={`${m.name}-${i}`} className="rounded-3xl border border-slate-200 bg-white p-5 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-black text-white">
                    {(m.name || "?").trim().charAt(0)}
                  </div>
                  <p className="mt-3 text-xs font-black">{m.name}</p>
                  <p className="mt-1 text-[10px] font-black text-brand-600">{m.role}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How to start */}
      <section id="how" className="mx-auto max-w-7xl px-4 py-20">
        <SectionTitle eyebrow="ثلاث خطوات" title="كيف تبدأ الاستفادة من خدماتك؟" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative rounded-3xl border border-slate-200 p-6">
              <span className="absolute left-6 top-6 text-4xl font-black text-slate-100">{i + 1}</span>
              <s.icon size={26} className="text-brand-600" />
              <h3 className="mt-4 text-sm font-black">{s.title}</h3>
              <p className="mt-2 text-xs font-semibold leading-6 text-slate-500">{s.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-4 rounded-3xl bg-brand-50 p-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={22} className="shrink-0 text-brand-600" />
            <p className="text-sm font-black text-brand-900">حسابك هو بوابتك للحجز وطلب الخدمات ومتابعة مزاياك.</p>
          </div>
          <Link to="/register" className="rounded-2xl bg-brand-600 px-6 py-3 text-xs font-black text-white hover:bg-brand-700">ابدأ الآن</Link>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="bg-slate-950 text-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-14 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <img src="/brand-left.png" alt="" className="h-10 w-10 rounded-xl bg-white object-contain p-1" />
              <p className="font-black">النقابة العامة للعاملين بالاتصالات</p>
            </div>
            <p className="mt-4 text-xs font-semibold leading-7 text-slate-400">منظومة إلكترونية لخدمة الأعضاء — الخدمات والرحلات والمزايا والمتابعة.</p>
          </div>
          <div>
            <p className="mb-4 text-sm font-black">روابط سريعة</p>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-400">
              {NAV.slice(1).map((n) => (
                <button key={n.id} onClick={() => scrollTo(n.id)} className="text-right transition-colors hover:text-white">{n.label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-4 text-sm font-black">حسابك</p>
            <div className="flex flex-wrap gap-2">
              <Link to="/login" className="rounded-xl bg-white px-4 py-2 text-xs font-black text-slate-900">تسجيل الدخول</Link>
              <Link to="/register" className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-black text-white">حساب جديد</Link>
              <Link to="/reset-password" className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-black text-slate-300">استعادة كلمة المرور</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800 py-5 text-center text-[11px] font-bold text-slate-500">
          © {new Date().getFullYear()} جميع الحقوق محفوظة للنقابة العامة للعاملين بالاتصالات
        </div>
      </footer>
    </div>
  );
}
