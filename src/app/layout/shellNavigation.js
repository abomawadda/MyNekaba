import { getModuleIcon } from "../../ui/enterprise";
import { UNION_ACTIVITY_TYPES } from "../../modules/activities/union/activityConfig";

function allowed(can, path, label, options = {}) {
  return can(path) ? { label, path, icon: getModuleIcon(path), ...options } : null;
}

export function buildNavigation(can) {
  const overview = [
    allowed(can, "/dashboardpage", "الرئيسية"),
    allowed(can, "/portal", "بوابة العضو"),
    allowed(can, "/employees", "إدارة الأعضاء"),
    allowed(can, "/board", "مجلس الإدارة"),
  ].filter(Boolean);

  const activities = [
    allowed(can, "/activities/master", "الفعاليات"),
    allowed(can, "/activities/bookings", "الحجز والتذاكر"),
    ...UNION_ACTIVITY_TYPES.map((type) =>
      allowed(can, `/activities/union/${type.id}`, type.title, { path: `/activities/union/${type.id}` })
    ),
  ].filter(Boolean);

  const treasury = [
    allowed(can, "/treasury/admin", "إصدار السندات"),
    allowed(can, "/treasury/admin", "شيك رعاية", { path: "/treasury/admin?type=aid" }),
    allowed(can, "/treasury/admin", "شيك سلفة", { path: "/treasury/admin?type=advance" }),
    allowed(can, "/treasury/admin", "شيك رحلة", { path: "/treasury/admin?type=trip" }),
    allowed(can, "/treasury/admin", "خصم مباشر", { path: "/treasury/admin?type=bank_charge" }),
    allowed(can, "/treasury/settlements", "التسويات"),
    allowed(can, "/treasury/checkbooks", "دفاتر الشيكات"),
    allowed(can, "/treasury/checks", "إدارة الشيكات"),
    allowed(can, "/treasury/check-reports", "تقارير الشيكات"),
    allowed(can, "/treasury/collections", "متابعة التحصيل"),
    allowed(can, "/treasury/ledger", "كشف الحساب"),
  ].filter(Boolean);

  const reports = [
    allowed(can, "/reports", "التقارير التنفيذية", { path: "/reports?mode=executive" }),
    allowed(can, "/reports", "تقارير مخصصة"),
  ].filter(Boolean);

  const administration = [
    allowed(can, "/importer", "استيراد البيانات"),
    allowed(can, "/backup", "النسخ الاحتياطي"),
    allowed(can, "/security", "مركز الأمان"),
  ].filter(Boolean);

  return [
    { id: "overview", label: "المساحة الرئيسية", items: overview, defaultOpen: true, icon: getModuleIcon("/dashboardpage") },
    { id: "activities", label: "الخدمات والفعاليات", items: activities, match: "/activities", icon: getModuleIcon("/activities/master") },
    { id: "treasury", label: "الماليات والخزينة", items: treasury, match: "/treasury", icon: getModuleIcon("/treasury/admin") },
    { id: "reports", label: "التقارير", items: reports, match: "/reports", icon: getModuleIcon("/reports") },
    { id: "administration", label: "إدارة النظام", items: administration, match: ["/importer", "/backup", "/security"], icon: getModuleIcon("/security") },
  ].filter((group) => group.items.length > 0);
}

export function isItemActive(item, location) {
  const current = `${location.pathname}${location.search}`;
  return current === item.path || (location.search === "" && location.pathname === item.path);
}

export function isGroupActive(group, location) {
  if (group.items.some((item) => isItemActive(item, location))) return true;
  if (!group.match) return false;
  const matches = Array.isArray(group.match) ? group.match : [group.match];
  return matches.some((path) => location.pathname.startsWith(path));
}

export function getCurrentNavigationItem(groups, location) {
  for (const group of groups) {
    const item = group.items.find((entry) => isItemActive(entry, location));
    if (item) return { group, item };
  }

  for (const group of groups) {
    if (isGroupActive(group, location)) {
      return { group, item: group.items[0] };
    }
  }

  return { group: null, item: null };
}

export function getBreadcrumbItems(groups, location) {
  const { group, item } = getCurrentNavigationItem(groups, location);
  const crumbs = [{ label: "الرئيسية", to: "/dashboardpage" }];

  if (group && group.id !== "overview") crumbs.push({ label: group.label });
  if (item && item.path !== "/dashboardpage") crumbs.push({ label: item.label, to: item.path });

  return crumbs;
}
