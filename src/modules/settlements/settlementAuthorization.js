import { hasPermission, PERMISSIONS } from "../../security/permissions.js";

export const SETTLEMENT_DIAGNOSTIC_PERMISSION = PERMISSIONS.treasurySettle;
export const SETTLEMENT_DIAGNOSTIC_DENIED_MESSAGE = "لا تملك صلاحية تنفيذ إجراءات تشخيص التسويات";

export function canAccessSettlementDiagnostic(can) {
  return typeof can === "function" && can(SETTLEMENT_DIAGNOSTIC_PERMISSION) === true;
}

export function hasSettlementDiagnosticPermission(user) {
  return hasPermission(user, SETTLEMENT_DIAGNOSTIC_PERMISSION);
}

export function requireSettlementDiagnosticPermission(can, onDenied) {
  if (canAccessSettlementDiagnostic(can)) return true;
  if (typeof onDenied === "function") onDenied(SETTLEMENT_DIAGNOSTIC_DENIED_MESSAGE);
  return false;
}
