import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, LogOut, Menu, Moon, ShieldCheck, Sun, UserCircle } from "lucide-react";
import clsx from "clsx";
import { Badge, Breadcrumb, Button, IconButton } from "../../ui/enterprise";
import { ORG_LEFT_LOGO_URL, ORG_RIGHT_LOGO_FALLBACK_URL, ORG_RIGHT_LOGO_URL } from "../../utils/branding";
import { useT, useTh } from "../providers/ThemeProvider";
import { useAuth } from "../providers/AuthProvider";
import { ROLE_LABELS } from "../../security/permissions";
import { buildNavigation, getBreadcrumbItems, getCurrentNavigationItem } from "./shellNavigation";

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "م";
  return parts.slice(0, 2).map((part) => part[0]).join("");
}

function HeaderLogo({ src, fallbackSrc, alt, className = "" }) {
  return (
    <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:h-10 sm:w-10", className)}>
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-contain"
        onError={fallbackSrc ? (event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = fallbackSrc;
        } : undefined}
      />
    </span>
  );
}

export default function HeaderAuth({ toggleSidebar }) {
  const location = useLocation();
  const T = useT();
  const { dark, toggle } = useTh();
  const { user, sessionIntegrity, logout, permissions, can } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const groups = useMemo(() => buildNavigation(can), [can]);
  const crumbs = useMemo(() => getBreadcrumbItems(groups, location), [groups, location]);
  const { group, item } = useMemo(() => getCurrentNavigationItem(groups, location), [groups, location]);
  const roleLabel = ROLE_LABELS[user?.role] || user?.title || "مستخدم النظام";
  const displayName = user?.displayName || "مستخدم";

  return (
    <header className={clsx("print:hidden sticky top-0 z-40 h-16 border-b px-3 backdrop-blur-xl sm:px-5", T.hdr, T.div)}>
      <div className="grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
        <HeaderLogo src={ORG_RIGHT_LOGO_URL} fallbackSrc={ORG_RIGHT_LOGO_FALLBACK_URL} alt="شعار WE" />

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <IconButton iconStart={Menu} aria-label="فتح القائمة" onClick={toggleSidebar} className="lg:hidden" />
          <div className="min-w-0">
            <div className="hidden md:block">
              <Breadcrumb items={crumbs} />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-bold text-slate-950 dark:text-white md:text-base">
                {item?.label || "المنظومة"}
              </h2>
              {group && <Badge tone="brand" className="hidden sm:inline-flex">{group.label}</Badge>}
            </div>
            {sessionIntegrity.hasOtherActiveSessions && (
              <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                <AlertTriangle size={11} />
                توجد جلسات أخرى نشطة لهذا الحساب
              </p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5 sm:gap-2">
          <IconButton
            iconStart={dark ? Sun : Moon}
            aria-label={dark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}
            title={dark ? "وضع نهاري" : "وضع ليلي"}
            onClick={toggle}
          />

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 text-right transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-xs font-bold text-brand-700 dark:text-brand-300">
                {user?.profileImage ? (
                  <img src={user.profileImage} alt={displayName} className="h-8 w-8 rounded-lg object-cover" />
                ) : (
                  initials(displayName)
                )}
              </span>
              <span className="hidden min-w-0 md:block">
                <span className="block max-w-36 truncate text-xs font-bold text-slate-800 dark:text-slate-100">{displayName}</span>
                <span className="block max-w-36 truncate text-[10px] font-semibold text-slate-500">{roleLabel}</span>
              </span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute left-0 top-12 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <div className="border-b border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <UserCircle size={18} className={T.brand.text} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{displayName}</p>
                      <p className="truncate text-[10px] font-semibold text-slate-500">
                        {roleLabel} · {permissions?.length || 0} صلاحية
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1 p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconStart={ShieldCheck}
                    onClick={() => {
                      setMenuOpen(false);
                      logout({ allDevices: true });
                    }}
                    className="w-full justify-start text-amber-700 hover:bg-amber-50"
                  >
                    خروج من كل الأجهزة
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconStart={LogOut}
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                    className="w-full justify-start"
                  >
                    تسجيل الخروج
                  </Button>
                </div>
              </div>
            )}
          </div>
          <HeaderLogo src={ORG_LEFT_LOGO_URL} alt="شعار النقابة" />
        </div>
      </div>
    </header>
  );
}
