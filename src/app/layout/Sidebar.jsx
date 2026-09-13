import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import clsx from "clsx";
import { Badge, IconButton } from "../../ui/enterprise";
import { useAuth } from "../providers/AuthProvider";
import { buildNavigation, isGroupActive, isItemActive } from "./shellNavigation";

function BrandMark({ collapsed }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white shadow-sm">
        ن
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold leading-5 text-slate-950 dark:text-white">النقابة العامة</h1>
          <p className="truncate text-[10px] font-semibold text-slate-500">Enterprise Console</p>
        </div>
      )}
    </div>
  );
}

function SidebarItem({ item, active, collapsed, onClick }) {
  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={clsx(
        "group flex h-9 items-center rounded-lg border text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        collapsed ? "justify-center px-2" : "gap-2.5 px-3",
        active
          ? "border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-400/30 dark:bg-brand-500/10 dark:text-brand-200"
          : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white"
      )}
    >
      {Icon && <Icon size={16} className={clsx("shrink-0", active ? "text-brand-700 dark:text-brand-300" : "text-slate-400")} />}
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && active && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
    </Link>
  );
}

function SidebarGroup({ group, location, collapsed, onLinkClick }) {
  const groupActive = isGroupActive(group, location);
  const [open, setOpen] = useState(group.defaultOpen || groupActive);
  const Icon = group.icon;

  useEffect(() => {
    if (!groupActive) return undefined;

    const openTimer = window.setTimeout(() => {
      setOpen(true);
    }, 0);

    return () => window.clearTimeout(openTimer);
  }, [groupActive]);

  if (collapsed) {
    return (
      <div className="space-y-1">
        {group.items.map((item) => (
          <SidebarItem
            key={`${group.id}-${item.path}-${item.label}`}
            item={item}
            active={isItemActive(item, location)}
            collapsed
            onClick={onLinkClick}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={clsx(
          "flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
          groupActive ? "text-brand-800 dark:text-brand-200" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800/70"
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {Icon && <Icon size={14} className="shrink-0" />}
          <span className="truncate">{group.label}</span>
        </span>
        <ChevronDown size={14} className={clsx("transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-1">
          {group.items.map((item) => (
            <SidebarItem
              key={`${group.id}-${item.path}-${item.label}`}
              item={item}
              active={isItemActive(item, location)}
              collapsed={false}
              onClick={onLinkClick}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Sidebar({ isOpen, setIsOpen, collapsed = false, onToggleCollapsed }) {
  const location = useLocation();
  const { can, user } = useAuth();
  const groups = useMemo(() => buildNavigation(can), [can]);

  const handleLinkClick = () => {
    if (window.innerWidth < 1024) setIsOpen(false);
  };

  return (
    <aside
      className={clsx(
        "print:hidden fixed inset-y-0 right-0 z-50 flex h-screen flex-col border-l border-slate-200 bg-white/95 text-slate-900 shadow-2xl backdrop-blur-xl transition-[width,transform] duration-200 dark:border-slate-700/80 dark:bg-slate-950/95 dark:text-slate-100 lg:sticky lg:translate-x-0 lg:shadow-none",
        collapsed ? "lg:w-[4.75rem]" : "lg:w-[17rem]",
        "w-[18rem]",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-3 dark:border-slate-700/80">
        <BrandMark collapsed={collapsed} />
        <div className="flex items-center gap-1">
          <IconButton
            iconStart={collapsed ? PanelRightOpen : PanelRightClose}
            aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"}
            title={collapsed ? "توسيع القائمة" : "طي القائمة"}
            onClick={onToggleCollapsed}
            className="hidden lg:inline-flex"
          />
          <IconButton iconStart={X} aria-label="إغلاق القائمة" onClick={() => setIsOpen(false)} className="lg:hidden" />
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-label="التنقل الرئيسي">
        {groups.map((group) => (
          <SidebarGroup
            key={group.id}
            group={group}
            location={location}
            collapsed={collapsed}
            onLinkClick={handleLinkClick}
          />
        ))}
      </nav>

      <div className="shrink-0 border-t border-slate-200 p-3 dark:border-slate-700/80">
        {collapsed ? (
          <div className="flex justify-center">
            <Badge tone="brand">{user?.displayName?.slice(0, 1) || "م"}</Badge>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700/80 dark:bg-slate-900/60">
            <p className="truncate text-xs font-bold">{user?.displayName || "مستخدم النظام"}</p>
            <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">جلسة عمل نشطة</p>
          </div>
        )}
      </div>

      {!collapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="absolute -left-3 top-20 hidden h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 lg:flex"
          aria-label="طي القائمة الجانبية"
        >
          <ChevronRight size={14} />
        </button>
      )}
      {collapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="absolute -left-3 top-20 hidden h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 lg:flex"
          aria-label="توسيع القائمة الجانبية"
        >
          <ChevronLeft size={14} />
        </button>
      )}
    </aside>
  );
}
