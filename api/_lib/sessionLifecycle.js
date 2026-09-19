function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "object" && Number.isFinite(value.seconds)) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
export function isExpiredActiveSession(session = {}, now = Date.now()) {
  const expiresAt = toMillis(session.expiresAt);
  return session.status === "active" && expiresAt > 0 && expiresAt <= Number(now);
}

export function buildExpiredSessionTransition(
  session = {},
  { now = new Date(), accountExists = false, reconciliationId = "", actor = "" } = {}
) {
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!isExpiredActiveSession(session, nowDate.getTime())) return null;

  return {
    status: "expired",
    expiredAtIso: nowDate.toISOString(),
    expiredReason: accountExists
      ? "session_expired_reconciliation"
      : "identity_reconciliation_expired",
    reconciliationId,
    reconciledBy: actor,
    updatedAtIso: nowDate.toISOString(),
  };
}
