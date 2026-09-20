const ALLOWED_EVENTS = new Set([
  "attachment.view_requested",
  "attachment.upload_requested",
  "attachment.upload_completed",
  "attachment.delete_requested",
  "attachment.delete_completed",
  "attachment.authorization_denied",
]);

function text(value, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

export function buildStorageAuditEvent({ event, principal, resource, decision = "requested", reasonCode = "", requestId = "", now = new Date().toISOString() }) {
  if (!ALLOWED_EVENTS.has(event)) throw new Error("invalid_storage_audit_event");
  return {
    action: event,
    userId: text(principal?.accountId),
    firebaseUid: text(principal?.firebaseUid),
    identityType: text(principal?.identityType),
    role: text(principal?.role),
    targetId: text(resource?.attachmentId),
    family: text(resource?.family),
    employeeId: text(resource?.employeeId),
    attachmentType: text(resource?.attachmentType),
    authorizationVersion: text(principal?.authzVersion),
    decision: text(decision, 40),
    reasonCode: text(reasonCode, 80),
    requestId: text(requestId, 100),
    riskLevel: "high",
    page: "/api/storage/employees",
    createdAtIso: text(now, 64),
  };
}

export async function writeStorageAuditEvent(db, event) {
  if (!db) throw new Error("audit_database_required");
  await db.collection("audit_logs").add(event);
  return event;
}

export function safeStorageError(error) {
  const code = String(error?.code || error?.message || "storage_operation_failed");
  return /^[a-z0-9_]+$/i.test(code) ? code.slice(0, 80) : "storage_operation_failed";
}
