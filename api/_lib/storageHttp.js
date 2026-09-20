/* global Buffer */
import { createAdminStorageAdapter } from "./adminStorageAdapter.js";
import { createEmployeeAttachmentService } from "./employeeAttachmentService.js";
import { getAdminContext } from "./firebaseAdmin.js";
import { MAX_ATTACHMENT_SIZE_BYTES } from "../../src/security/permissions.js";

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export async function readBinaryBody(req, maximum = MAX_ATTACHMENT_SIZE_BYTES) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.byteLength > maximum) throw new Error("attachment_too_large");
    return req.body;
  }
  if (typeof req.body === "string") {
    const buffer = Buffer.from(req.body);
    if (buffer.byteLength > maximum) throw new Error("attachment_too_large");
    return buffer;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maximum) throw new Error("attachment_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function employeeResourceFromHeaders(req) {
  return {
    family: "employee",
    employeeId: req.headers["x-employee-id"],
    attachmentId: req.headers["x-attachment-id"],
    attachmentType: req.headers["x-attachment-type"],
    fileName: req.headers["x-file-name"],
  };
}

export function getEmployeeAttachmentService() {
  const context = getAdminContext();
  const storage = createAdminStorageAdapter({
    app: context.app,
    bucketName: context.storageBucketName,
  });
  return createEmployeeAttachmentService({ ...context, storage });
}

export function sendStorageError(res, error) {
  const status = Number(error?.status || 0);
  const safeStatus = [400, 401, 403, 404, 409, 413].includes(status) ? status : 400;
  const code = String(error?.code || error?.message || "storage_operation_failed");
  const safeCode = /^[a-z0-9_]+$/i.test(code) ? code : "storage_operation_failed";
  return res.status(safeStatus).json({ success: false, error: safeCode });
}
