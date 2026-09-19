import { hasPermission, PERMISSIONS } from "../../security/permissions.js";

export const EVENT_MANAGEMENT_PERMISSION = PERMISSIONS.activitiesManage;
export const EVENT_MANAGEMENT_DENIED_MESSAGE = "لا تملك صلاحية إدارة الفعاليات";

export function canManageActivities(can) {
  return typeof can === "function" && can(EVENT_MANAGEMENT_PERMISSION) === true;
}

export function hasEventManagementPermission(user) {
  return hasPermission(user, EVENT_MANAGEMENT_PERMISSION);
}

export function requireEventManagementPermission(can, onDenied) {
  if (canManageActivities(can)) return true;
  if (typeof onDenied === "function") onDenied(EVENT_MANAGEMENT_DENIED_MESSAGE);
  return false;
}
