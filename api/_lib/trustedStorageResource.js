import {
  MAX_ATTACHMENT_SIZE_BYTES,
  PERMISSIONS,
  validateSecureAttachment,
} from "../../src/security/permissions.js";
import { IDENTITY_TYPE } from "./identityClassification.js";
import { hasEffectivePermissions } from "./trustedPermissions.js";
import { TrustedAuthorizationError } from "./trustedPrincipal.js";

export const EMPLOYEE_ATTACHMENT_SCHEMA_VERSION = "1";
export const EMPLOYEE_ATTACHMENT_AUTHORIZATION_VERSION = "1";

export const EMPLOYEE_ATTACHMENT_TYPES = Object.freeze({
  identity: Object.freeze({ ownerView: true, ownerUpload: false, ownerDelete: false, backendOnly: true, scanningRequired: true, retention: "identity_record" }),
  hr: Object.freeze({ ownerView: false, ownerUpload: false, ownerDelete: false, backendOnly: true, scanningRequired: true, retention: "employment_record" }),
  qualification: Object.freeze({ ownerView: true, ownerUpload: true, ownerDelete: false, backendOnly: true, scanningRequired: true, retention: "qualification_record" }),
  medical: Object.freeze({ ownerView: true, ownerUpload: false, ownerDelete: false, backendOnly: true, scanningRequired: true, retention: "restricted_medical_record" }),
  general_employee: Object.freeze({ ownerView: true, ownerUpload: true, ownerDelete: false, backendOnly: true, scanningRequired: true, retention: "employee_record" }),
});

const OPERATION_ATTACHMENT_PERMISSION = Object.freeze({
  view: PERMISSIONS.attachmentsView,
  upload: PERMISSIONS.attachmentsUpload,
  delete: PERMISSIONS.attachmentsDelete,
});

const OPERATION_EMPLOYEE_PERMISSION = Object.freeze({
  view: PERMISSIONS.employeesView,
  upload: PERMISSIONS.employeesEdit,
  delete: PERMISSIONS.employeesEdit,
});

function text(value) {
  return String(value ?? "").trim();
}

export function requireSafeStorageSegment(value, label = "storage segment") {
  const segment = text(value);
  if (
    !segment
    || segment.length > 128
    || segment.includes("/")
    || segment.includes("\\")
    || segment.includes("..")
    || !/^[\w\u0600-\u06FF-]+$/u.test(segment)
  ) {
    throw new Error(`invalid_${label.replace(/\s+/g, "_")}`);
  }
  return segment;
}

export function sanitizeTrustedFileName(fileName = "file") {
  const leaf = text(fileName).split(/[\\/]/).pop() || "file";
  const sanitized = leaf
    .replace(/[^\w.\u0600-\u06FF-]+/gu, "_")
    .replace(/^\.+/, "")
    .slice(-96);
  if (!sanitized || sanitized.includes("..")) throw new Error("invalid_file_name");
  return sanitized;
}

export function normalizeEmployeeStorageResource(input = {}) {
  if (input.path || input.storagePath || input.url || input.downloadUrl) {
    throw new Error("arbitrary_storage_path_rejected");
  }
  if (text(input.family || "employee") !== "employee") throw new Error("invalid_storage_family");
  const attachmentType = text(input.attachmentType);
  if (!Object.prototype.hasOwnProperty.call(EMPLOYEE_ATTACHMENT_TYPES, attachmentType)) {
    throw new Error("invalid_attachment_type");
  }
  return {
    family: "employee",
    employeeId: requireSafeStorageSegment(input.employeeId, "employee_id"),
    attachmentId: requireSafeStorageSegment(input.attachmentId, "attachment_id"),
    attachmentType,
    fileName: sanitizeTrustedFileName(input.fileName),
  };
}

export function buildTrustedEmployeeAttachmentPath(resource) {
  const normalized = normalizeEmployeeStorageResource(resource);
  return `employees/${normalized.employeeId}/attachments/${normalized.attachmentId}/${normalized.fileName}`;
}

export function authorizeEmployeeAttachmentOperation(principal, resource, operation) {
  const normalized = normalizeEmployeeStorageResource(resource);
  const policy = EMPLOYEE_ATTACHMENT_TYPES[normalized.attachmentType];
  const attachmentPermission = OPERATION_ATTACHMENT_PERMISSION[operation];
  const employeePermission = OPERATION_EMPLOYEE_PERMISSION[operation];
  if (!attachmentPermission || !employeePermission) throw new Error("invalid_storage_operation");

  const ownsEmployee = principal?.identityType === IDENTITY_TYPE.employee
    && text(principal.employeeId) === normalized.employeeId;
  const ownerPolicyAllows = policy[`owner${operation[0].toUpperCase()}${operation.slice(1)}`] === true;
  const attachmentAllowed = hasEffectivePermissions(principal, [attachmentPermission]);
  const staffAllowed = hasEffectivePermissions(principal, [employeePermission, attachmentPermission]);

  if ((ownsEmployee && ownerPolicyAllows && attachmentAllowed) || staffAllowed) {
    return { resource: normalized, accessMode: ownsEmployee && ownerPolicyAllows ? "owner" : "staff", policy };
  }
  throw new TrustedAuthorizationError("attachment_authorization_denied", 403);
}

export function validateTrustedUpload({ fileName, contentType, size }) {
  const normalizedSize = Number(size);
  const error = validateSecureAttachment({ name: fileName, type: text(contentType), size: normalizedSize });
  if (error) throw new Error("invalid_attachment_file");
  if (!Number.isSafeInteger(normalizedSize) || normalizedSize < 1 || normalizedSize > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new Error("invalid_attachment_size");
  }
  return { contentType: text(contentType), size: normalizedSize };
}

export function buildEmployeeAttachmentMetadata({ resource, principal, now = new Date().toISOString() }) {
  const normalized = normalizeEmployeeStorageResource(resource);
  return {
    schemaVersion: EMPLOYEE_ATTACHMENT_SCHEMA_VERSION,
    family: "employee",
    attachmentId: normalized.attachmentId,
    employeeId: normalized.employeeId,
    businessEntityType: "employee",
    businessEntityId: normalized.employeeId,
    attachmentType: normalized.attachmentType,
    createdByAccountId: text(principal?.accountId),
    createdByFirebaseUid: text(principal?.firebaseUid),
    createdAt: text(now),
    authorizationVersion: EMPLOYEE_ATTACHMENT_AUTHORIZATION_VERSION,
    scanStatus: EMPLOYEE_ATTACHMENT_TYPES[normalized.attachmentType].scanningRequired ? "pending" : "not_required",
    accessState: "quarantined",
  };
}

export function assertEmployeeAttachmentMetadata(metadata = {}, resource) {
  const normalized = normalizeEmployeeStorageResource(resource);
  const required = {
    schemaVersion: EMPLOYEE_ATTACHMENT_SCHEMA_VERSION,
    family: "employee",
    attachmentId: normalized.attachmentId,
    employeeId: normalized.employeeId,
    businessEntityType: "employee",
    businessEntityId: normalized.employeeId,
    attachmentType: normalized.attachmentType,
    authorizationVersion: EMPLOYEE_ATTACHMENT_AUTHORIZATION_VERSION,
  };
  for (const [key, value] of Object.entries(required)) {
    if (text(metadata[key]) !== value) throw new Error("attachment_binding_mismatch");
  }
  return true;
}

export function assertDownloadRelease(metadata = {}, resource) {
  assertEmployeeAttachmentMetadata(metadata, resource);
  const policy = EMPLOYEE_ATTACHMENT_TYPES[resource.attachmentType];
  if (policy.scanningRequired && metadata.scanStatus !== "clean") throw new Error("attachment_not_released");
  if (metadata.accessState !== "released") throw new Error("attachment_not_released");
  return true;
}
