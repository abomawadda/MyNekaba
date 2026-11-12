import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  ArrowLeft,
  Award,
  BookOpen,
  Building2,
  Bus,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Gift,
  HeartHandshake,
  HelpCircle,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  MessageCircle,
  Phone,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { db } from "../../app/providers/FirebaseProvider";
import { UNION_ACTIVITY_TYPES } from "../activities/union/activityConfig";
import { formatMoney } from "../../utils/numberFormat";

const NAV_LINKS = [
  { id: "home", label: "الرئيسية" },
  { id: "about", label: "من نحن" },
  { id: "services", label: "الخدمات النقابية" },
  { id: "trips", label: "الرحلات والمصايف" },
  { id: "news", label: "الأخبار والإعلانات" },
  { id: "board", label: "مجلس الإدارة" },
  { id: "contact", label: "تواصل معنا" },
];

const DEFAULT_BOARD_ROLES = [
  { role: "رئيس المجلس", name: "رئيس مجلس الإدارة" },
  { role: "الأمين العام", name: "الأمين العام للنقابة" },
  { role: "أمين الصندوق", name: "أمين صندوق النقابة" },
  { role: "عضو مجلس إدارة", name: "عضو مجلس الإدارة" },
];

const CONTACT_INFO = {
  address: "القاهرة - رمسيس - شارع رمسيس - مجمع سنترال رمسيس",
  phone: "02-25777777",
  whatsapp: "201000000000",
  email: "info@nekaba-telecom.org.eg",
  workingHours: "الأحد إلى الخميس: 8:30 ص حتى 3:30 م",
};

export default function PublicHome() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [news, setNews] = useState([]);
  const [boardMembers, setBoardMembers] = useState([]);
  const [selectedNews, setSelectedNews] = useState(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);

    // 1. استعلام الفعاليات القادمة مع معالجة الأخطاء
    const unsubEvents = onSnapshot(
      query(collection(db, "events"), where("date", ">=", today)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
          .slice(0, 6);
        setEvents(list);
      },
      (err) => {
        console.warn("PublicHome events subscription:", err?.message);
        setEvents([]);
      }
    );

    // 2. استعلام الأخبار النشطة
    const unsubNews = onSnapshot(
      query(collection(db, "site_news"), where("active", "!=", false)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
          .slice(0, 6);
        setNews(list);
      },
      (err) => {
        console.warn("PublicHome news subscription:", err?.message);
        setNews([]);
      }
    );

    // 3. استعلام أعضاء المجلس بدون كشف جدول الموظفين للعامة
    const unsubBoard = onSnapshot(
      query(collection(db, "board_memberships")),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((m) => m.status === "active" || !m.status);

        const order = { "رئيس المجلس": 1, "الأمين العام": 2, "أمين الصندوق": 3, "عضو مجلس إدارة": 4 };
        list.sort((a, b) => (order[a.role] || 99) - (order[b.role] || 99));

        if (list.length > 0) {
          setBoardMembers(list.slice(0, 11));
        } else {
          setBoardMembers(DEFAULT_BOARD_ROLES);
        }
      },
      () => {
        // في حالة الرفض الصارم للصلاحيات، نعرض التشكيل الافتراضي بأمان
        setBoardMembers(DEFAULT_BOARD_ROLES);
      }
    );

    return () => {
      unsubEvents();
      unsubNews();
      unsubBoard();
    };
  }, []);

  const stats = useMemo(
    () => [
      { label: "خدمة وميزة نقابية", value: `${UNION_ACTIVITY_TYPES.length}+`, icon: Gift, sub: "رعاية ومصايف وقروض" },
      { label: "رحلة وفعالية قادمة", value: events.length > 0 ? String(events.length) : "متاحة دورياً", icon: Bus, sub: "حجز إلكتروني فوري" },
      { label: "أعضاء الجمعية العمومية", value: "الآلاف", icon: Users, sub: "من الزملاء في كافة المحافظات" },
      { label: "مجلس الإدارة واللجان", value: String(boardMembers.length || 11), icon: ShieldCheck, sub: "تمثيل منتخب ومباشر" },
    ],
    [events.length, boardMembers.length]
  );

  const scrollTo = (id) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-teal-600 selection:text-white" dir="rtl">
      {/* ─── الترويسة العلوية ─── */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-md transition-all">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() => scrollTo("home")}
            className="flex items-center gap-3 text-right group cursor-pointer"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-700 text-white font-black shadow-sm">
              <Building2 size={20} />
            </div>
            <div>
              <span className="block text-sm font-black tracking-tight text-slate-900 group-hover:text-teal-700 transition">
                النقابة العامة للعاملين بالاتصالات
              </span>
              <span className="block text-[10px] font-bold text-slate-500">
                بوابة الخدمات الإلكترونية للجمعية العمومية
              </span>
            </div>
          </button>

          {/* روابط سطح المكتب */}
          <nav className="hidden items-center gap-6 lg:flex">
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => scrollTo(link.id)}
                className="text-xs font-bold text-slate-600 transition hover:text-teal-700 cursor-pointer"
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* أزرار الدخول */}
          <div className="hidden items-center gap-2.5 sm:flex">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:border-slate-300"
            >
              تسجيل الدخول
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700 active:scale-98"
            >
              إنشاء حساب عضو
            </Link>
          </div>

          {/* زر قائمة الموبايل */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
            aria-label="القائمة الرئيسية"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* قائمة الموبايل المنسدلة */}
        {mobileMenuOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 shadow-xl lg:hidden">
            <nav className="space-y-1">
              {NAV_LINKS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => scrollTo(link.id)}
                  className="block w-full rounded-lg px-3 py-2.5 text-right text-xs font-bold text-slate-700 hover:bg-teal-50 hover:text-teal-800"
                >
                  {link.label}
                </button>
              ))}
            </nav>
            <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
              <Link
                to="/login"
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-center text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                تسجيل الدخول
              </Link>
              <Link
                to="/register"
                className="flex-1 rounded-xl bg-teal-600 py-2.5 text-center text-xs font-bold text-white hover:bg-teal-700"
              >
                إنشاء حساب
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ─── القسم الرئيسي (Hero Section) ─── */}
      <section
        id="home"
        className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-teal-950 to-slate-900 py-20 text-white sm:py-28"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-teal-500/15 via-transparent to-transparent pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300">
            <Sparkles size={14} className="text-teal-400" />
            <span>المنظومة الرقمية الموحدة لخدمة الأعضاء</span>
          </div>

          <h1 className="mt-6 text-3xl font-black tracking-tight sm:text-5xl lg:text-6xl sm:leading-tight">
            معاً لخدمة ورعاية العاملين بالاتصالات
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-sm font-semibold leading-7 text-slate-300 sm:text-base sm:leading-8">
            بوابتك المباشرة للتقديم على الخدمات الاجتماعية والمالية، حجز الرحلات والمصايف، متابعة اشتراكاتك، والاستفادة من عروض ومزايا النقابة بكل شفافية وسهولة.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-2xl bg-teal-500 px-6 py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-teal-500/25 transition hover:bg-teal-400 active:scale-98"
            >
              <span>سجل كعضو بالنقابة</span>
              <ArrowLeft size={16} />
            </Link>
            <button
              type="button"
              onClick={() => scrollTo("services")}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/10"
            >
              استكشف الخدمات المتاحة
            </button>
          </div>

          {/* ميزات سريعة */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-slate-300">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 border border-white/10">
              <CheckCircle2 size={14} className="text-emerald-400" /> دعم الرعاية الصحية والاجتماعية
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 border border-white/10">
              <CheckCircle2 size={14} className="text-emerald-400" /> مصايف ورحلات بأسعار مدعمة
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 border border-white/10">
              <CheckCircle2 size={14} className="text-emerald-400" /> تقسيط الأجهزة بدون فوائد
            </span>
          </div>
        </div>
      </section>

      {/* ─── شريط الإحصائيات (Stats Bar) ─── */}
      <section className="-mt-8 relative z-20 mx-auto max-w-6xl px-4">
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:grid-cols-4 sm:p-6 dark:border-slate-800">
          {stats.map((s) => (
            <div key={s.label} className="text-center p-2">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <s.icon size={20} />
              </div>
              <p className="mt-2 text-2xl font-black text-slate-900 num">{s.value}</p>
              <p className="mt-1 text-xs font-bold text-slate-700">{s.label}</p>
              <p className="text-[10px] font-semibold text-slate-600">{s.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── قسم من نحن (About Section) ─── */}
      <section id="about" className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700">
              <Shield size={16} />
              <span>نبذة عن التنظيم النقابي</span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl leading-snug">
              النقابة العامة للعاملين بالاتصالات
            </h2>
            <p className="mt-4 text-xs sm:text-sm font-semibold leading-7 text-slate-600">
              تنظيم نقابي عمالي يمثل العاملين في قطاع الاتصالات، يهدف إلى حماية حقوق الأعضاء ورعاية مصالحهم الاقتصادية والاجتماعية والصحية، والارتقاء بالمستوى المهني والمعيشي عبر مظلة تكافلية متكاملة.
            </p>
            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                  <CheckCircle2 size={14} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">إدارة منتخبة من الجمعية العمومية</h3>
                  <p className="text-[11px] font-semibold text-slate-500">مجلس إدارة منتخب يعمل وفق لائحة النظام الأساسي المنظمة للعمل النقابي.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                  <CheckCircle2 size={14} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">رقابة مالية وإدارية شفافة</h3>
                  <p className="text-[11px] font-semibold text-slate-500">حسابات وسجلات تدقيق إلكترونية معتمدة تضمن سلامة أموال صندوق النقابة.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-teal-50 to-slate-100 p-8 text-slate-800">
            <h3 className="text-base font-black mb-4 flex items-center gap-2 text-teal-900">
              <Award size={18} className="text-teal-700" />
              أهدافنا ورسالتنا للأعضاء
            </h3>
            <ul className="space-y-3 text-xs font-bold text-slate-700 leading-6">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                تقديم الرعاية الصحية التكميلية والمساعدات العاجلة للحالات الطارئة.
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                تنظيم مصايف ورحلات عمرة وأنشطة ترفيهية سنوية لجميع الزملاء.
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                توفير برامج التقسيط الميسر والسلع المعمرة والأجهزة بأسعار تنافسية.
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                الربط الإلكتروني لتسهيل تقديم ومتابعة الطلبات دون عناء السفر.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ─── قسم الخدمات النقابية (Services Section) ─── */}
      <section id="services" className="border-y border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-bold text-teal-700">الخدمات والمزايا</span>
            <h2 className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">
              منظومة المزايا والخدمات الشاملة
            </h2>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              كافة الخدمات متاحة لجميع أعضاء الجمعية العمومية بعد تسجيل الدخول بحساب العضو.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {UNION_ACTIVITY_TYPES.map((service) => (
              <div
                key={service.id}
                className="group relative rounded-2xl border border-slate-200 bg-slate-50/50 p-5 transition-all hover:bg-white hover:border-teal-300 hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{service.icon}</span>
                  {service.installmentMode && (
                    <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[9px] font-bold text-purple-700 border border-purple-200">
                      تقسيط
                    </span>
                  )}
                  {service.stockMode && (
                    <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[9px] font-bold text-sky-700 border border-sky-200">
                      مخزون مدعم
                    </span>
                  )}
                </div>
                <h3 className="mt-3 text-sm font-black text-slate-900 group-hover:text-teal-700 transition">
                  {service.title}
                </h3>
                <p className="mt-1 text-xs font-semibold text-slate-500 leading-5">
                  {service.subtitle}
                </p>
                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-bold text-teal-700">
                  <span>طلب الخدمة</span>
                  <ChevronRight size={14} className="rotate-180 group-hover:-translate-x-1 transition" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── قسم الرحلات والمصايف (Trips Section) ─── */}
      <section id="trips" className="mx-auto max-w-6xl px-4 py-20">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <span className="text-xs font-bold text-teal-700 flex items-center gap-1.5">
              <Bus size={15} />
              <span>الأنشطة المفتوحة</span>
            </span>
            <h2 className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">
              الرحلات والمصايف المتاحة للحجز
            </h2>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-800"
          >
            <span>سجل الدخول لعرض كافة الرحلات</span>
            <ChevronRight size={14} className="rotate-180" />
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center bg-white">
            <Bus size={32} className="mx-auto text-slate-300" />
            <h3 className="mt-3 text-sm font-bold text-slate-700">لا توجد رحلات معلنة حالياً</h3>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              تابع هذه الصفحة دورياً، أو اشترك لتصلك الإعلانات فور فتح باب الحجز لمواسم المصايف والعمرة.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <div
                key={e.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition hover:shadow-md"
              >
                <div className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-lg bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-700 border border-teal-200/60">
                      {e.type || "رحلة نقابية"}
                    </span>
                    <span className="text-xs font-black text-teal-800">
                      {e.isFree ? "مجاني" : formatMoney(Number(e.memberPrice || e.price || 0))}
                    </span>
                  </div>

                  <h3 className="mt-3 text-sm font-black text-slate-900">{e.title}</h3>

                  <div className="mt-3 space-y-1.5 text-xs font-semibold text-slate-500">
                    <div className="flex items-center gap-2">
                      <Calendar size={13} className="text-slate-400 shrink-0" />
                      <span>{e.date || "الموعد معلن في التفاصيل"}</span>
                    </div>
                    {e.location && (
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-slate-400 shrink-0" />
                        <span className="truncate">{e.location}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-slate-400">
                      المقاعد: {e.capacity ? `${e.capacity} مقعد` : "حسب الأسبقية"}
                    </span>
                    <Link
                      to="/login"
                      className="rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition"
                    >
                      حجز تذكرة
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── قسم الأخبار والإعلانات (News Section) ─── */}
      <section id="news" className="border-y border-slate-200 bg-slate-100/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold text-amber-700 flex items-center justify-center gap-1.5">
              <Megaphone size={15} />
              <span>البيانات الرسمية</span>
            </span>
            <h2 className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">
              آخر الأخبار والقرارات النقابية
            </h2>
          </div>

          {news.length === 0 ? (
            <p className="text-center text-xs font-bold text-slate-400">لا توجد إعلانات منشورة حالياً.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {news.map((item) => (
                <article
                  key={item.id}
                  onClick={() => setSelectedNews(item)}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-md cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 inline-block mb-2">
                      {item.date || "إعلان رسمي"}
                    </span>
                    <h3 className="text-sm font-black text-slate-900 group-hover:text-teal-700 transition">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-xs font-semibold text-slate-500 line-clamp-3 leading-6">
                      {item.body}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-teal-700">
                    <span>قراءة الخبر كاملاً</span>
                    <ChevronRight size={14} className="rotate-180" />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── نافذة قراءة الخبر (Modal) ─── */}
      {selectedNews && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-amber-700">{selectedNews.date}</span>
                <h3 className="text-base font-black text-slate-900 mt-1">{selectedNews.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNews(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 max-h-96 overflow-y-auto text-xs font-semibold leading-7 text-slate-700 whitespace-pre-wrap">
              {selectedNews.body}
            </div>
            <div className="mt-6 text-left">
              <button
                type="button"
                onClick={() => setSelectedNews(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── قسم مجلس الإدارة (Board Section) ─── */}
      <section id="board" className="mx-auto max-w-6xl px-4 py-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold text-teal-700">التشكيل القيادي</span>
          <h2 className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">
            مجلس إدارة النقابة العامة
          </h2>
          <p className="mt-2 text-xs font-semibold text-slate-500">
            أعضاء مجلس الإدارة الممثلون للجمعية العمومية للدورة النقابية الحالية.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {boardMembers.map((member, index) => {
            const displayName = member.name || member.memberName || member.employeeName || `عضو مجلس إدارة ${index + 1}`;
            const role = member.role || "عضو مجلس إدارة";
            const initial = displayName.trim().charAt(0);

            return (
              <div
                key={member.id || index}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-xs transition hover:border-teal-300"
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-lg font-black text-white shadow-sm">
                  {initial}
                </div>
                <h3 className="mt-3 text-xs font-black text-slate-900 truncate" title={displayName}>
                  {displayName}
                </h3>
                <span className="mt-1 inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200/60">
                  {role}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── قسم التواصل والدعم (Contact Section) ─── */}
      <section id="contact" className="border-t border-slate-800 bg-slate-950 text-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
            {/* عن النقابة */}
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500 text-slate-950 font-black">
                  <Building2 size={16} />
                </div>
                <span className="text-sm font-black">النقابة العامة للعاملين بالاتصالات</span>
              </div>
              <p className="mt-3 text-xs font-semibold leading-6 text-slate-400">
                منظومة إلكترونية متكاملة تهدف لخدمة الزملاء وتقديم كافة أوجه الرعاية النقابية والاجتماعية والمالية.
              </p>
              <div className="mt-5 flex items-center gap-2">
                <Link
                  to="/login"
                  className="rounded-xl bg-teal-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-teal-400 transition"
                >
                  دخول الأعضاء
                </Link>
                <a
                  href={`https://wa.me/${CONTACT_INFO.whatsapp}?text=${encodeURIComponent("السلام عليكم، استفسار بخصوص خدمات النقابة")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition"
                >
                  <MessageCircle size={14} />
                  <span>تواصل واتساب</span>
                </a>
              </div>
            </div>

            {/* بيانات الاتصال الرسمية */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-teal-400">
                بيانات المقر والتواصل
              </h3>
              <div className="space-y-2.5 text-xs font-semibold text-slate-300">
                <div className="flex items-start gap-2.5">
                  <MapPin size={16} className="text-teal-400 shrink-0 mt-0.5" />
                  <span>{CONTACT_INFO.address}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Phone size={16} className="text-teal-400 shrink-0" />
                  <span dir="ltr">{CONTACT_INFO.phone}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Mail size={16} className="text-teal-400 shrink-0" />
                  <span>{CONTACT_INFO.email}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Clock size={16} className="text-teal-400 shrink-0" />
                  <span>{CONTACT_INFO.workingHours}</span>
                </div>
              </div>
            </div>

            {/* روابط سريعة ومعلومات الأمان */}
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-teal-400">
                روابط هامة
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-300">
                {NAV_LINKS.map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => scrollTo(link.id)}
                    className="text-right hover:text-teal-400 transition cursor-pointer"
                  >
                    {link.label}
                  </button>
                ))}
              </div>
              <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-3 text-[11px] font-semibold text-slate-400">
                <p className="flex items-center gap-1.5 text-teal-300 font-bold mb-1">
                  <ShieldCheck size={14} />
                  جلسة آمنة ومحمية
                </p>
                كافة البيانات والطلبات تعامل وفق سرية تامة وسجلات تدقيق موثقة.
              </div>
            </div>
          </div>

          <div className="mt-12 border-t border-slate-800 pt-6 text-center text-xs font-semibold text-slate-500">
            جميع الحقوق محفوظة © {new Date().getFullYear()} النقابة العامة للعاملين بالاتصالات
          </div>
        </div>
      </section>
    </div>
  );
}
