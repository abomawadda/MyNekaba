import { hasPermission, PERMISSIONS } from "../../security/permissions.js";
import { buildMemberPortalIdentity } from "../portal/memberPortalIdentity.js";

export const BOOKING_MANAGEMENT_PERMISSION = PERMISSIONS.bookingsManage;
export const SENSITIVE_BOOKING_EXPORT_PERMISSION = PERMISSIONS.reportsExport;
export const BOOKING_MANAGEMENT_DENIED_MESSAGE = "لا تملك صلاحية إدارة الحجوزات";
export const SENSITIVE_BOOKING_EXPORT_DENIED_MESSAGE = "لا تملك صلاحية تصدير بيانات الحجوزات الحساسة";
export const BOOKING_OWNERSHIP_DENIED_MESSAGE = "لا يمكن تنفيذ الحجز إلا على هوية العضو المسجل";

const normalizeId = (value = "") => String(value ?? "").trim();

export function getBookingOwnerIds(user = {}, employee = null) {
  return buildMemberPortalIdentity(user, employee).memberIdKeys;
}

export function getPrimaryBookingOwnerId(user = {}, employee = null) {
  return getBookingOwnerIds(user, employee)[0] || "";
}

export function isOwnBooking(booking, ownerIds = []) {
  const memberId = normalizeId(booking?.memberId);
  const normalizedOwnerIds = new Set(ownerIds.map(normalizeId).filter(Boolean));
  return Boolean(memberId) && normalizedOwnerIds.has(memberId);
}

export function canManageBookings(can) {
  return typeof can === "function" && can(BOOKING_MANAGEMENT_PERMISSION) === true;
}

export function hasBookingManagementPermission(user) {
  return hasPermission(user, BOOKING_MANAGEMENT_PERMISSION);
}

export function canExportSensitiveBookings(can) {
  return canManageBookings(can)
    && can(SENSITIVE_BOOKING_EXPORT_PERMISSION) === true;
}

export function hasSensitiveBookingExportPermission(user) {
  return hasPermission(user, BOOKING_MANAGEMENT_PERMISSION)
    && hasPermission(user, SENSITIVE_BOOKING_EXPORT_PERMISSION);
}

export function requireBookingManagementPermission(can, onDenied) {
  if (canManageBookings(can)) return true;
  if (typeof onDenied === "function") onDenied(BOOKING_MANAGEMENT_DENIED_MESSAGE);
  return false;
}

export function requireSensitiveBookingExportPermission(can, onDenied) {
  if (canExportSensitiveBookings(can)) return true;
  if (typeof onDenied === "function") onDenied(SENSITIVE_BOOKING_EXPORT_DENIED_MESSAGE);
  return false;
}

export function requireOwnBookingTarget(user, targetMemberId, onDenied) {
  const allowed = isOwnBooking(
    { memberId: targetMemberId },
    getBookingOwnerIds(user)
  );
  if (allowed) return true;
  if (typeof onDenied === "function") onDenied(BOOKING_OWNERSHIP_DENIED_MESSAGE);
  return false;
}

export function canCreateBookingForMember(can, user, targetMemberId) {
  return canManageBookings(can)
    || isOwnBooking({ memberId: targetMemberId }, getBookingOwnerIds(user));
}
