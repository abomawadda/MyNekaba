import { validateSecureAttachment } from "./permissions.js";

export const STORAGE_AUTHORIZATION_DENIED_MESSAGE = "لا تملك صلاحية الوصول إلى هذا المرفق.";

const normalize = (value = "") => String(value ?? "").trim();

export function hasStoragePermissions(can, requiredPermissions = []) {
  if (typeof can !== "function") return false;
  const permissions = (Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions])
    .map(normalize)
    .filter(Boolean);
  return permissions.length > 0 && permissions.every((permission) => can(permission) === true);
}

export function requireStoragePermissions(can, requiredPermissions = [], onDenied) {
  if (hasStoragePermissions(can, requiredPermissions)) return true;
  if (typeof onDenied === "function") onDenied(STORAGE_AUTHORIZATION_DENIED_MESSAGE);
  return false;
}

export function getStableAttachmentOwnerIds(user = {}) {
  return [...new Set([
    user.firebaseUid,
    user.accountId,
    user.employeeId,
    user.employeeCode,
    user.jobId,
    user.id,
  ].map(normalize).filter(Boolean))];
}

export function isOwnAttachmentTarget(user, ownerId) {
  const target = normalize(ownerId);
  return Boolean(target) && getStableAttachmentOwnerIds(user).includes(target);
}

export function requireSafeStorageId(value, label = "storage id") {
  const normalized = normalize(value);
  if (
    !normalized
    || normalized.length > 128
    || normalized.includes("/")
    || normalized.includes("\\")
    || normalized.includes("..")
    || !/^[\w\u0600-\u06FF-]+$/u.test(normalized)
  ) {
    throw new Error(`Invalid ${label}.`);
  }
  return normalized;
}

export function sanitizeAttachmentFileName(fileName = "file") {
  const leaf = normalize(fileName).split(/[\\/]/).pop() || "file";
  const sanitized = leaf
    .replace(/[^\w.\u0600-\u06FF-]+/gu, "_")
    .replace(/^\.+/, "")
    .slice(-96);
  return sanitized || "file";
}

export function buildEmployeeAttachmentPath({ employeeId, attachmentId, fileName }) {
  const safeEmployeeId = requireSafeStorageId(employeeId, "employee id");
  const safeAttachmentId = requireSafeStorageId(attachmentId, "attachment id");
  return `employees/${safeEmployeeId}/attachments/${safeAttachmentId}_${sanitizeAttachmentFileName(fileName)}`;
}

export function buildSettlementAttachmentPath({ contextId, attachmentId, fileName }) {
  const safeContextId = requireSafeStorageId(contextId, "settlement context id");
  const safeAttachmentId = requireSafeStorageId(attachmentId, "attachment id");
  return `settlement_attachments/${safeContextId}/${safeAttachmentId}_${sanitizeAttachmentFileName(fileName)}`;
}

export function buildTreasuryAttachmentPath({ transactionId, attachmentId, fileName }) {
  const safeTransactionId = requireSafeStorageId(transactionId, "transaction id");
  const safeAttachmentId = requireSafeStorageId(attachmentId, "attachment id");
  return `treasury/attachments/${safeTransactionId}/${safeAttachmentId}_${sanitizeAttachmentFileName(fileName)}`;
}

export function buildGeneralAttachmentPath({ contextId, attachmentId, fileName }) {
  const safeContextId = requireSafeStorageId(contextId, "attachment context id");
  const safeAttachmentId = requireSafeStorageId(attachmentId, "attachment id");
  return `attachments/${safeContextId}/${safeAttachmentId}_${sanitizeAttachmentFileName(fileName)}`;
}

export function isManagedAttachmentPath(storagePath = "") {
  const path = normalize(storagePath);
  if (!path || path.includes("\\") || path.includes("..") || path.startsWith("/")) return false;
  return [
    /^employees\/[\w\u0600-\u06FF-]+\/attachments\/[\w.\u0600-\u06FF-]+$/u,
    /^settlement_attachments\/(?:[\w\u0600-\u06FF-]+\/)?[\w.\u0600-\u06FF-]+$/u,
    /^treasury\/attachments\/[\w\u0600-\u06FF-]+\/[\w.\u0600-\u06FF-]+$/u,
    /^attachments\/(?:[\w\u0600-\u06FF-]+\/)?[\w.\u0600-\u06FF-]+$/u,
  ].some((pattern) => pattern.test(path));
}

export function requireManagedAttachmentPath(storagePath) {
  if (!isManagedAttachmentPath(storagePath)) {
    throw new Error("Invalid managed attachment path.");
  }
  return normalize(storagePath);
}

export function validateStorageUpload(file) {
  return validateSecureAttachment(file);
}
