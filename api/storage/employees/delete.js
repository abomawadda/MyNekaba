import {
  getEmployeeAttachmentService,
  readJsonBody,
  sendStorageError,
} from "../../_lib/storageHttp.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });
  try {
    const body = await readJsonBody(req);
    const service = getEmployeeAttachmentService();
    const result = await service.remove({ req, resource: body.resource || {} });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("trusted_employee_attachment_delete_failed", { code: error?.code || error?.message || "unknown" });
    return sendStorageError(res, error);
  }
}
