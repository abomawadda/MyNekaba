import {
  getEmployeeAttachmentService,
  readJsonBody,
  sendStorageError,
} from "../../_lib/storageHttp.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });
  try {
    const body = await readJsonBody(req);
    const service = getEmployeeAttachmentService();
    const result = await service.download({ req, resource: body.resource || {} });
    res.statusCode = 200;
    res.setHeader("Content-Type", result.contentType || "application/octet-stream");
    if (Number.isFinite(result.size) && result.size >= 0) res.setHeader("Content-Length", String(result.size));
    res.setHeader("Content-Disposition", `attachment; filename="attachment-${result.attachmentId}"`);
    result.stream.on("error", () => {
      if (!res.headersSent) res.status(502).end();
      else res.destroy();
    });
    return result.stream.pipe(res);
  } catch (error) {
    console.error("trusted_employee_attachment_download_failed", { code: error?.code || error?.message || "unknown" });
    return sendStorageError(res, error);
  }
}
