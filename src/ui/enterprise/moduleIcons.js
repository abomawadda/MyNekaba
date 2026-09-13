import {
  LayoutDashboard, Users, ShieldCheck, Ticket, CalendarDays, Sparkles,
  Wallet, ReceiptText, HandCoins, BookCopy, FileSpreadsheet, ListChecks,
  BarChart3, Settings, Database, UserCircle, Landmark, Gift,
} from "lucide-react";

export const MODULE_ICONS = {
  "/dashboardpage": LayoutDashboard,
  "/portal": UserCircle,
  "/employees": Users,
  "/board": ShieldCheck,
  "/activities/master": CalendarDays,
  "/activities/bookings": Ticket,
  "/treasury/admin": ReceiptText,
  "/treasury/settlements": ListChecks,
  "/treasury/checkbooks": BookCopy,
  "/treasury/checks": HandCoins,
  "/treasury/check-reports": FileSpreadsheet,
  "/treasury/collections": Wallet,
  "/treasury/ledger": Landmark,
  "/reports": BarChart3,
  "/importer": Database,
  "/backup": Database,
  "/security": Settings,
  prizes: Gift,
  union: Sparkles,
};

export const getModuleIcon = (path = "") => {
  if (MODULE_ICONS[path]) return MODULE_ICONS[path];
  const hit = Object.entries(MODULE_ICONS).find(([key]) => key !== "/portal" && path.startsWith(key));
  return hit ? hit[1] : Sparkles;
};
