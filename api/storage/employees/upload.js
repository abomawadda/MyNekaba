import { MAX_ATTACHMENT_SIZE_BYTES } from "../../../src/security/permissions.js";
import {
  employeeResourceFromHeaders,
  getEmployeeAttachmentService,
  readBinaryBody,
  sendStorageError,
} from "../../_lib/storageHttp.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });
  try {
    const declaredSize = Number(req.headers["content-length"] || 0);
    if (!Number.isSafeInteger(declaredSize) || declaredSize < 1 || declaredSize > MAX_ATTACHMENT_SIZE_BYTES) {
      return res.status(413).json({ success: false, error: "invalid_attachment_size" });
    }
    const data = await readBinaryBody(req, MAX_ATTACHMENT_SIZE_BYTES);
    const service = getEmployeeAttachmentService();
    const result = await service.upload({
      req,
      resource: employeeResourceFromHeaders(req),
      data,
      contentType: req.headers["content-type"],
      size: declaredSize,
    });
    return res.status(201).json({ success: true, attachment: result });
  } catch (error) {
    console.error("trusted_employee_attachment_upload_failed", { code: error?.code || error?.message || "unknown" });
    return sendStorageError(res, error);
  }
}
