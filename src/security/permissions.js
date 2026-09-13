export const ROLE_LABELS = {
  treasurer: "أمين الصندوق",
  dataEntry: "مدخل بيانات",
  auditor: "مراجع مالي",
  admin: "مدير النظام",
  viewer: "مشاهد فقط",
  member: "عضو",
};

export const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const PERMISSIONS = {
  dashboardView: "dashboard.view",
  employeesView: "employees.view",
  employeesCreate: "employees.create",
  employeesEdit: "employees.edit",
  employeesDelete: "employees.delete",
  employeesMovementApprove: "employees.movement.approve",
  boardView: "board.view",
  boardManage: "board.manage",
  activitiesView: "activities.view",
  activitiesManage: "activities.manage",
  bookingsManage: "bookings.manage",
  reportsView: "reports.view",
  reportsExport: "reports.export",
  treasuryView: "treasury.view",
  treasuryCreate: "treasury.create",
  treasuryEdit: "treasury.edit",
  treasuryDelete: "treasury.delete",
  treasuryApprove: "treasury.approve",
  treasuryPost: "treasury.post",
  treasurySettle: "treasury.settle",
  treasuryMigrate: "treasury.migrate",
  settingsImport: "settings.import",
  securityView: "security.view",
  securityManageAccounts: "security.accounts.manage",
  securityManageRoles: "security.roles.manage",
  auditView: "audit.view",
  attachmentsView: "attachments.view",
  attachmentsUpload: "attachments.upload",
  attachmentsDelete: "attachments.delete",
  sessionManageOwn: "session.manage.own",
  sessionManageAll: "session.manage.all",
  portalView: "portal.view",
};

export const ROLE_PERMISSION_MATRIX = {
  treasurer: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.employeesView,
    PERMISSIONS.employeesMovementApprove,
    PERMISSIONS.boardView,
    PERMISSIONS.activitiesView,
    PERMISSIONS.reportsView,
    PERMISSIONS.reportsExport,
    PERMISSIONS.treasuryView,
    PERMISSIONS.treasuryCreate,
    PERMISSIONS.treasuryEdit,
    PERMISSIONS.treasuryDelete,
    PERMISSIONS.treasuryApprove,
    PERMISSIONS.treasuryPost,
    PERMISSIONS.treasurySettle,
    PERMISSIONS.treasuryMigrate,
    PERMISSIONS.attachmentsView,
    PERMISSIONS.attachmentsUpload,
    PERMISSIONS.attachmentsDelete,
    PERMISSIONS.auditView,
    PERMISSIONS.sessionManageOwn,
  ],
  dataEntry: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.employeesView,
    PERMISSIONS.activitiesView,
    PERMISSIONS.bookingsManage,
    PERMISSIONS.reportsView,
    PERMISSIONS.treasuryView,
    PERMISSIONS.treasuryCreate,
    PERMISSIONS.treasuryEdit,
    PERMISSIONS.attachmentsView,
    PERMISSIONS.attachmentsUpload,
    PERMISSIONS.sessionManageOwn,
  ],
  auditor: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.employeesView,
    PERMISSIONS.boardView,
    PERMISSIONS.activitiesView,
    PERMISSIONS.reportsView,
    PERMISSIONS.reportsExport,
    PERMISSIONS.treasuryView,
    PERMISSIONS.attachmentsView,
    PERMISSIONS.auditView,
    PERMISSIONS.sessionManageOwn,
  ],
  admin: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.employeesView,
    PERMISSIONS.employeesCreate,
    PERMISSIONS.employeesEdit,
    PERMISSIONS.employeesDelete,
    PERMISSIONS.employeesMovementApprove,
    PERMISSIONS.boardView,
    PERMISSIONS.boardManage,
    PERMISSIONS.activitiesView,
    PERMISSIONS.activitiesManage,
    PERMISSIONS.bookingsManage,
    PERMISSIONS.reportsView,
    PERMISSIONS.reportsExport,
    PERMISSIONS.treasuryView,
    PERMISSIONS.treasuryCreate,
    PERMISSIONS.treasuryEdit,
    PERMISSIONS.treasuryDelete,
    PERMISSIONS.treasuryApprove,
    PERMISSIONS.treasuryPost,
    PERMISSIONS.treasurySettle,
    PERMISSIONS.treasuryMigrate,
    PERMISSIONS.settingsImport,
    PERMISSIONS.securityView,
    PERMISSIONS.securityManageAccounts,
    PERMISSIONS.securityManageRoles,
    PERMISSIONS.attachmentsView,
    PERMISSIONS.attachmentsUpload,
    PERMISSIONS.attachmentsDelete,
    PERMISSIONS.auditView,
    PERMISSIONS.sessionManageOwn,
    PERMISSIONS.sessionManageAll,
  ],
  viewer: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.employeesView,
    PERMISSIONS.activitiesView,
    PERMISSIONS.reportsView,
    PERMISSIONS.attachmentsView,
    PERMISSIONS.sessionManageOwn,
  ],
  member: [
    PERMISSIONS.portalView,
    PERMISSIONS.activitiesView,
    PERMISSIONS.sessionManageOwn,
  ],
};

export const ROUTE_PERMISSIONS = {
  "/": PERMISSIONS.dashboardView,
  "/dashboard": PERMISSIONS.dashboardView,
  "/dashboardpage": PERMISSIONS.dashboardView,
  "/employees": PERMISSIONS.employeesView,
  "/board": PERMISSIONS.boardView,
  "/activities": PERMISSIONS.activitiesView,
  "/activities/master": PERMISSIONS.activitiesView,
  "/activities/bookings": PERMISSIONS.activitiesView,
  "/treasury": PERMISSIONS.treasuryView,
  "/treasury/admin": PERMISSIONS.treasuryView,
  "/treasury/ledger": PERMISSIONS.treasuryView,
  "/treasury/settlements": PERMISSIONS.treasuryView,
  "/treasury/checkbooks": PERMISSIONS.treasuryView,
  "/treasury/checks": PERMISSIONS.treasuryView,
  "/treasury/check-reports": PERMISSIONS.reportsView,
  "/treasury/collections": PERMISSIONS.treasuryView,
  "/reports": PERMISSIONS.reportsView,
  "/importer": PERMISSIONS.settingsImport,
  "/backup": PERMISSIONS.settingsImport,
  "/portal": PERMISSIONS.portalView,
  "/security": PERMISSIONS.securityView,
};

export const FINANCIAL_PRIVILEGE_PERMISSIONS = new Set([
  PERMISSIONS.treasuryCreate,
  PERMISSIONS.treasuryEdit,
  PERMISSIONS.treasuryDelete,
  PERMISSIONS.treasuryApprove,
  PERMISSIONS.treasuryPost,
  PERMISSIONS.treasurySettle,
  PERMISSIONS.treasuryMigrate,
]);

export const SECURE_ATTACHMENT_ACCEPT = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;

export function normalizeRole(role = "") {
  return ROLE_LABELS[role] ? role : "viewer";
}

export function getRolePermissions(role = "viewer") {
  return ROLE_PERMISSION_MATRIX[normalizeRole(role)] || ROLE_PERMISSION_MATRIX.viewer;
}

export function hasPermission(user, permission) {
  if (!permission) return true;
  const permissions = new Set([
    ...getRolePermissions(user?.role),
    ...(Array.isArray(user?.permissionOverrides) ? user.permissionOverrides : []),
  ]);
  return permissions.has(permission);
}

export function canAccessRoute(user, pathname = "") {
  const matchedEntry = Object.entries(ROUTE_PERMISSIONS)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([routePrefix]) => pathname === routePrefix || pathname.startsWith(`${routePrefix}/`));

  if (!matchedEntry) return true;
  return hasPermission(user, matchedEntry[1]);
}

export function getDataScope(user, resource) {
  const role = normalizeRole(user?.role);

  if (role === "treasurer" || role === "admin" || role === "auditor") {
    return "all";
  }

  if (role === "dataEntry") {
    if (resource === "treasury") return "own";
    return "all";
  }

  if (role === "viewer") {
    if (resource === "employees" || resource === "employeeProfile") return "own";
    if (resource === "treasury") return "none";
    return "all";
  }

  if (role === "member") {
    if (resource === "employees" || resource === "employeeProfile") return "own";
    return "none";
  }

  return "none";
}

function matchOwnEmployee(record, user) {
  if (!record || !user) return false;
  const userKeys = [user.employeeId, user.id, user.phone].filter(Boolean).map(String);
  const recordKeys = [record.jobId, record.employeeId, record.id, record.phone].filter(Boolean).map(String);
  return recordKeys.some((value) => userKeys.includes(value));
}

function matchOwnFinancialRecord(record, user) {
  if (!record || !user) return false;
  return [record.createdBy, record.createdById, record.userId]
    .filter(Boolean)
    .map(String)
    .includes(String(user.id));
}

export function filterDataByScope(records = [], resource, user) {
  const scope = getDataScope(user, resource);
  if (scope === "all") return records;
  if (scope === "none") return [];
  if (scope === "own" && resource === "treasury") {
    return records.filter((record) => matchOwnFinancialRecord(record, user));
  }
  if (scope === "own" && (resource === "employees" || resource === "employeeProfile")) {
    return records.filter((record) => matchOwnEmployee(record, user));
  }
  return [];
}

export function validateSecureAttachment(file) {
  if (!file) return "الملف غير صالح.";
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return "الحد الأقصى للمرفق الواحد هو 5 ميجابايت.";
  }
  if (file.type && !SECURE_ATTACHMENT_ACCEPT.includes(file.type)) {
    return "نوع الملف غير مسموح به داخل النظام.";
  }
  return "";
}
