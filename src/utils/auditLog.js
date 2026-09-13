import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../app/providers/FirebaseProvider";
import { SESSION_STORAGE_KEY } from "../security/session";

function readSessionSnapshot() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function logAuditEvent(actionOrPayload, details = {}) {
  try {
    const currentSession = readSessionSnapshot();
    const actor = currentSession?.user || null;
    const payload =
      typeof actionOrPayload === "string"
        ? { action: actionOrPayload, ...details }
        : actionOrPayload || {};

    await addDoc(collection(db, "audit_logs"), {
      action: payload.action || "system.event",
      userId: payload.userId || actor?.id || "",
      userName: payload.userName || actor?.displayName || actor?.fullName || "",
      role: payload.role || actor?.role || "",
      sessionId: payload.sessionId || currentSession?.sessionId || "",
      page: payload.page || window.location.pathname || "",
      ip: payload.ip || "",
      before: payload.before || null,
      after: payload.after || null,
      targetId: payload.targetId || "",
      riskLevel: payload.riskLevel || "low",
      details:
        payload.details ||
        Object.fromEntries(
          Object.entries(payload).filter(
            ([key]) =>
              ![
                "action",
                "userId",
                "userName",
                "role",
                "sessionId",
                "page",
                "ip",
                "before",
                "after",
                "targetId",
                "riskLevel",
                "details",
              ].includes(key)
          )
        ),
      createdAt: serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    });
  } catch (error) {
    console.error("audit_logs:", error);
  }
}
