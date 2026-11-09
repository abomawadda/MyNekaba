import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";
import { logAuditEvent } from "../../utils/auditLog";

/**
 * Member booking/service requests.
 *
 * Members cannot write `event_bookings` directly (financial + capacity logic stays with staff).
 * Instead the member portal submits a `booking_requests` document that staff review in
 * the bookings screen and then convert to a confirmed booking.
 */
export const BOOKING_REQUESTS_COLLECTION = "booking_requests";

export const REQUEST_STATUS = {
  pending: { label: "قيد المراجعة", tone: "amber" },
  approved: { label: "مقبول", tone: "emerald" },
  rejected: { label: "مرفوض", tone: "rose" },
  cancelled: { label: "ملغي", tone: "slate" },
};

export const MAX_COMPANIONS = 10;

const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);

export function validateBookingRequest({ memberId, target, companions }) {
  if (!clean(memberId)) return "حسابك غير مرتبط بسجل عضو. تواصل مع إدارة النقابة.";
  if (!target?.id) return "اختر الرحلة أو الخدمة المطلوبة.";
  const count = Number(companions);
  if (!Number.isInteger(count) || count < 0 || count > MAX_COMPANIONS) {
    return `عدد المرافقين يجب أن يكون بين 0 و ${MAX_COMPANIONS}.`;
  }
  return "";
}

export async function submitBookingRequest({ user, member, target, companions = 0, notes = "" }) {
  const memberId = clean(member?.memberId);
  const error = validateBookingRequest({ memberId, target, companions });
  if (error) throw new Error(error);

  const payload = {
    kind: target.kind === "service" ? "service" : "event",
    targetId: clean(target.id, 120),
    targetTitle: clean(target.title, 200),
    targetDate: clean(target.date, 20),
    memberId,
    memberName: clean(member?.name, 200),
    memberPhone: clean(member?.phone, 30),
    accountId: String(user?.id || ""),
    companions: Number(companions),
    totalPax: Number(companions) + 1,
    notes: clean(notes, 500),
    status: "pending",
    createdAt: serverTimestamp(),
    createdAtIso: new Date().toISOString(),
  };

  const ref = await addDoc(collection(db, BOOKING_REQUESTS_COLLECTION), payload);
  await logAuditEvent("booking_request.created", { targetId: ref.id, page: "/portal" }).catch(() => {});
  return ref.id;
}

export async function cancelOwnBookingRequest(requestId) {
  await updateDoc(doc(db, BOOKING_REQUESTS_COLLECTION, requestId), {
    status: "cancelled",
    cancelledAt: serverTimestamp(),
  });
}

export async function reviewBookingRequest(requestId, { status, reviewer, note = "" }) {
  if (!["approved", "rejected"].includes(status)) throw new Error("حالة غير صالحة.");
  await updateDoc(doc(db, BOOKING_REQUESTS_COLLECTION, requestId), {
    status,
    reviewNote: clean(note, 500),
    reviewedBy: String(reviewer?.id || ""),
    reviewedByName: clean(reviewer?.displayName || reviewer?.username, 200),
    reviewedAt: serverTimestamp(),
  });
  await logAuditEvent(`booking_request.${status}`, { targetId: requestId, page: "/activities/bookings" }).catch(() => {});
}

/** Live subscription to a member's own requests (one listener per identity key — rules require memberId equality). */
export function subscribeMemberRequests(memberIdKeys, onChange) {
  if (!db || !memberIdKeys?.length) {
    onChange([]);
    return () => {};
  }
  const byId = new Map();
  const emit = () =>
    onChange([...byId.values()].sort((a, b) => String(b.createdAtIso || "").localeCompare(String(a.createdAtIso || ""))));
  const unsubs = memberIdKeys.map((memberId) =>
    onSnapshot(
      query(collection(db, BOOKING_REQUESTS_COLLECTION), where("memberId", "==", memberId)),
      (snap) => {
        snap.docChanges().forEach((c) => {
          if (c.type === "removed") byId.delete(c.doc.id);
          else byId.set(c.doc.id, { id: c.doc.id, ...c.doc.data() });
        });
        emit();
      },
      emit
    )
  );
  return () => unsubs.forEach((u) => u());
}

/** Staff subscription to pending requests. */
export function subscribePendingRequests(onChange) {
  if (!db) return () => {};
  return onSnapshot(
    query(collection(db, BOOKING_REQUESTS_COLLECTION), where("status", "==", "pending")),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(a.createdAtIso || "").localeCompare(String(b.createdAtIso || "")))
      ),
    () => onChange([])
  );
}
