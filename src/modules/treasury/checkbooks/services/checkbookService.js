import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy,
  query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { db } from "../../../../app/providers/FirebaseProvider";
import { logAuditEvent } from "../../../../utils/auditLog";
import {
  CHECKBOOK_COLLECTION, calcChecksCount, findOverlappingBook, normalizeCheckbookNumber,
} from "../checkbookConstants";

const normNum = (v) =>
  String(v ?? "").trim()
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));

export function subscribeCheckbooks(cb, onError) {
  const q = query(collection(db, CHECKBOOK_COLLECTION), orderBy("requestDate", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export async function saveCheckbook(data = {}, user, existingBooks = []) {
  const now = new Date().toISOString();
  const payload = { ...data };
  if (payload.status === "received") {
    payload.checksCount = calcChecksCount(payload.serialFrom, payload.serialTo);
    const overlap = findOverlappingBook(payload, existingBooks);
    if (overlap) throw new Error(`تداخل في المسلسلات مع دفتر ${overlap.requestNo || overlap.serialFrom}→${overlap.serialTo}`);
  }
  const prev = existingBooks.find((b) => b.id === payload.id);
  const historyEntry = {
    at: now,
    by: user?.displayName || user?.fullName || "",
    byId: user?.id || "",
    from: prev?.status || "—",
    to: payload.status || "requested",
    decisionDate: payload.decisionDate || "",
    reason: payload.reason || "",
  };
  payload.history = [...(prev?.history || []), historyEntry];
  payload.updatedAt = now;
  payload.updatedBy = user?.id || "";
  payload.updatedByName = user?.displayName || user?.fullName || "";
  if (payload.id) {
    const { id, ...rest } = payload;
    await setDoc(doc(db, CHECKBOOK_COLLECTION, id), { ...rest, updatedAtServer: serverTimestamp() }, { merge: true });
    await logAuditEvent("checkbook.updated", { targetId: id, before: { status: prev?.status }, after: { status: payload.status }, page: "/treasury/checkbooks", riskLevel: "medium" });
    return id;
  }
  payload.createdAt = now;
  payload.createdBy = user?.id || "";
  payload.createdByName = user?.displayName || user?.fullName || "";
  payload.requestNo = payload.requestNo || `REQ-${now.slice(0, 10)}-${Math.floor(Math.random() * 900 + 100)}`;
  const ref = await addDoc(collection(db, CHECKBOOK_COLLECTION), { ...payload, createdAtServer: serverTimestamp() });
  await logAuditEvent("checkbook.created", { targetId: ref.id, after: { requestNo: payload.requestNo }, page: "/treasury/checkbooks", riskLevel: "low" });
  return ref.id;
}

export async function deleteCheckbook(id) {
  await deleteDoc(doc(db, CHECKBOOK_COLLECTION, id));
  await logAuditEvent("checkbook.deleted", { targetId: id, page: "/treasury/checkbooks", riskLevel: "high" });
}

const CHECK_TRANSITIONS = {
  issued: ["delivered", "cancelled"],
  delivered: ["cashed", "uncashed", "cancelled"],
  uncashed: ["cashed", "cancelled"],
  cashed: [],
  cancelled: [],
  replaced: [],
  available: [],
};

export function allowedCheckTransitions(status = "") {
  return CHECK_TRANSITIONS[status] || [];
}

export async function updateCheckLifecycle(checkRef, patch = {}, user, auditAction = "check.status_changed") {
  const before = { checkStatus: checkRef?.checkStatus || "" };
  await updateDoc(doc(db, "issued_checks", checkRef.id), {
    ...patch,
    financialEffect: patch.checkStatus === "cashed" ? Number(checkRef.amount || checkRef.advanceAmountBase || 0) : 0,
    lastReviewDate: patch.lastReviewDate || checkRef.lastReviewDate || "",
    updatedAt: new Date().toISOString(),
    updatedBy: user?.id || "",
  });
  await logAuditEvent(auditAction, {
    targetId: checkRef.id,
    before,
    after: { checkStatus: patch.checkStatus },
    details: { checkNum: checkRef.checkNum, ...patch },
    page: "/treasury/checks",
    riskLevel: patch.checkStatus === "cancelled" ? "high" : "medium",
  });
}

export async function isCheckNumDuplicate(checkNum, currentId = null) {
  const v = normNum(checkNum);
  if (!v) return false;
  const snap = await getDocs(query(collection(db, "issued_checks"), where("checkNum", "==", v)));
  return snap.docs.some((d) => d.id !== currentId);
}

export function checkInBookRange(checkNum, book) {
  if (!book || book.status !== "received") return true;
  const n = normalizeCheckbookNumber(checkNum);
  const f = normalizeCheckbookNumber(book.serialFrom);
  const t = normalizeCheckbookNumber(book.serialTo);
  if (![n, f, t].every(Number.isFinite)) return false;
  return n >= f && n <= t;
}

export async function findCheckbookForNum(checkNum, books = []) {
  const n = normalizeCheckbookNumber(checkNum);
  if (!Number.isFinite(n)) return null;
  return books.find((b) => {
    if (b.status !== "received") return false;
    const f = normalizeCheckbookNumber(b.serialFrom);
    const t = normalizeCheckbookNumber(b.serialTo);
    return Number.isFinite(f) && Number.isFinite(t) && n >= f && n <= t;
  }) || null;
}
