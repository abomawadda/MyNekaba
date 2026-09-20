/* global Buffer */
import { randomUUID } from "node:crypto";
import { resolveTrustedPrincipal, TrustedAuthorizationError } from "./trustedPrincipal.js";
import {
  assertDownloadRelease,
  assertEmployeeAttachmentMetadata,
  authorizeEmployeeAttachmentOperation,
  buildEmployeeAttachmentMetadata,
  buildTrustedEmployeeAttachmentPath,
  normalizeEmployeeStorageResource,
  validateTrustedUpload,
} from "./trustedStorageResource.js";
import {
  buildStorageAuditEvent,
  safeStorageError,
  writeStorageAuditEvent,
} from "./storageAudit.js";

function objectNotFound(error) {
  return error?.code === 404
    || error?.code === "storage/object-not-found"
    || error?.message === "object_not_found";
}

export function createEmployeeAttachmentService({
  auth,
  db,
  storage,
  resolvePrincipal = resolveTrustedPrincipal,
  auditWriter = writeStorageAuditEvent,
  now = () => new Date().toISOString(),
  requestId = () => randomUUID(),
} = {}) {
  if (!auth || !db || !storage) throw new Error("trusted_storage_context_missing");

  async function principalFor(req) {
    return resolvePrincipal(req, { auth, db }, { requireVersionClaims: true });
  }

  async function requireEmployee(employeeId) {
    const employee = await db.collection("employees").doc(employeeId).get();
    if (!employee.exists || employee.id !== employeeId) throw new TrustedAuthorizationError("employee_target_missing", 404);
    return { id: employee.id, ...employee.data() };
  }

  async function audit(event, principal, resource, details = {}) {
    return auditWriter(db, buildStorageAuditEvent({
      event,
      principal,
      resource,
      requestId: details.requestId,
      decision: details.decision,
      reasonCode: details.reasonCode,
      now: now(),
    }));
  }

  async function authorize(principal, resource, operation, operationRequestId) {
    try {
      return authorizeEmployeeAttachmentOperation(principal, resource, operation);
    } catch (error) {
      await audit("attachment.authorization_denied", principal, resource, {
        requestId: operationRequestId,
        decision: "denied",
        reasonCode: safeStorageError(error),
      });
      throw error;
    }
  }

  async function upload({ req, resource: inputResource, data, contentType, size }) {
    const principal = await principalFor(req);
    const resource = normalizeEmployeeStorageResource(inputResource);
    const operationRequestId = requestId();
    await authorize(principal, resource, "upload", operationRequestId);
    await requireEmployee(resource.employeeId);

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
    const validated = validateTrustedUpload({
      fileName: resource.fileName,
      contentType,
      size: size ?? buffer.byteLength,
    });
    if (buffer.byteLength !== validated.size) throw new Error("attachment_size_mismatch");

    const path = buildTrustedEmployeeAttachmentPath(resource);
    const metadata = buildEmployeeAttachmentMetadata({ resource, principal, now: now() });
    await audit("attachment.upload_requested", principal, resource, {
      requestId: operationRequestId,
      decision: "authorized",
    });
    await storage.save({ path, data: buffer, contentType: validated.contentType, metadata });
    await audit("attachment.upload_completed", principal, resource, {
      requestId: operationRequestId,
      decision: "completed",
    });

    return {
      attachmentId: resource.attachmentId,
      employeeId: resource.employeeId,
      attachmentType: resource.attachmentType,
      storagePath: path,
      scanStatus: metadata.scanStatus,
      accessState: metadata.accessState,
    };
  }

  async function download({ req, resource: inputResource }) {
    const principal = await principalFor(req);
    const resource = normalizeEmployeeStorageResource(inputResource);
    const operationRequestId = requestId();
    await authorize(principal, resource, "view", operationRequestId);
    await requireEmployee(resource.employeeId);

    const path = buildTrustedEmployeeAttachmentPath(resource);
    const object = await storage.getMetadata(path);
    assertDownloadRelease(object.metadata, resource);
    await audit("attachment.view_requested", principal, resource, {
      requestId: operationRequestId,
      decision: "authorized",
    });

    return {
      stream: storage.createReadStream(path),
      contentType: object.contentType,
      size: object.size,
      attachmentId: resource.attachmentId,
    };
  }

  async function remove({ req, resource: inputResource }) {
    const principal = await principalFor(req);
    const resource = normalizeEmployeeStorageResource(inputResource);
    const operationRequestId = requestId();
    await authorize(principal, resource, "delete", operationRequestId);
    await requireEmployee(resource.employeeId);

    const path = buildTrustedEmployeeAttachmentPath(resource);
    try {
      const object = await storage.getMetadata(path);
      assertEmployeeAttachmentMetadata(object.metadata, resource);
    } catch (error) {
      if (!objectNotFound(error)) throw error;
      await audit("attachment.delete_requested", principal, resource, {
        requestId: operationRequestId,
        decision: "authorized",
        reasonCode: "already_absent",
      });
      await audit("attachment.delete_completed", principal, resource, {
        requestId: operationRequestId,
        decision: "completed",
        reasonCode: "already_absent",
      });
      return { deleted: false, alreadyAbsent: true, attachmentId: resource.attachmentId };
    }

    await audit("attachment.delete_requested", principal, resource, {
      requestId: operationRequestId,
      decision: "authorized",
    });
    await storage.delete(path);
    await audit("attachment.delete_completed", principal, resource, {
      requestId: operationRequestId,
      decision: "completed",
    });
    return { deleted: true, alreadyAbsent: false, attachmentId: resource.attachmentId };
  }

  return { upload, download, remove };
}
