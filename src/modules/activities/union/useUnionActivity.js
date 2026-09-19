import { useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot,
  query, serverTimestamp, updateDoc, writeBatch,
} from "firebase/firestore";
import { db } from "../../../app/providers/FirebaseProvider";
import { logAuditEvent } from "../../../utils/auditLog";
import { isEligibleForBenefit } from "../../../utils/memberBenefits";
import {
  canManageBookings,
  requireBookingManagementPermission,
} from "../bookingAuthorization";
import {
  canManageActivities,
  requireEventManagementPermission,
} from "../activityAuthorization";

const getTodayISO = () => new Date().toISOString().split("T")[0];
const EMPTY_LIST = Object.freeze([]);

export default function useUnionActivity(config, { can } = {}) {
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const bookingManagementAllowed = canManageBookings(can);
  const eventManagementAllowed = canManageActivities(can);

  useEffect(() => {
    const unsubs = [];
    unsubs.push(onSnapshot(query(collection(db, "events")), (s) => {
        const all = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        const mine = all
          .filter((e) => e.unionCategory === config.id || (!e.unionCategory && config.includeLegacyTypes && e.type === config.eventType))
          .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
        setEvents(mine);
        setLoading(false);
      }));
    if (bookingManagementAllowed) {
      unsubs.push(onSnapshot(query(collection(db, "event_bookings")), (s) => {
        setBookings(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      }));
    }
    if (bookingManagementAllowed || eventManagementAllowed) {
      unsubs.push(onSnapshot(query(collection(db, "employees")), (s) => {
        setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      }));
    }
    return () => unsubs.forEach((u) => u());
  }, [bookingManagementAllowed, config.id, config.eventType, config.includeLegacyTypes, eventManagementAllowed]);

  const scopedBookings = bookingManagementAllowed ? bookings : EMPTY_LIST;
  const scopedEmployees = bookingManagementAllowed || eventManagementAllowed ? employees : EMPTY_LIST;

  const bookingsByEvent = useMemo(() => {
    const map = {};
    scopedBookings.forEach((b) => {
      if (!map[b.eventId]) map[b.eventId] = [];
      map[b.eventId].push(b);
    });
    return map;
  }, [scopedBookings]);

  const stats = useMemo(() => {
    let confirmedPax = 0, revenue = 0, support = 0;
    events.forEach((e) => {
      (bookingsByEvent[e.id] || []).filter((b) => b.status === "confirmed").forEach((b) => {
        confirmedPax += Number(b.totalPax || 1);
        revenue += Number(b.totalCost || 0);
      });
      support += Number(e.memberSupportValue || 0);
    });
    return { events: events.length, confirmedPax, revenue, support };
  }, [events, bookingsByEvent]);

  const saveEvent = async (data, editId = null) => {
    if (!requireEventManagementPermission(can)) throw new Error("لا تملك صلاحية إدارة الفعاليات");
    const payload = {
      ...data,
      unionCategory: config.id,
      type: data.type || config.eventType,
      updatedAt: serverTimestamp(),
    };
    if (editId) {
      await updateDoc(doc(db, "events", editId), payload);
      await logAuditEvent("union_event_updated", { targetId: editId, category: config.id, title: data.title });
    } else {
      const ref = await addDoc(collection(db, "events"), {
        ...payload,
        status: "open",
        bookedCount: 0,
        createdAt: serverTimestamp(),
      });
      await logAuditEvent("union_event_created", { targetId: ref.id, category: config.id, title: data.title });
    }
  };

  const deleteEventGuarded = async (event) => {
    if (!requireEventManagementPermission(can)) throw new Error("لا تملك صلاحية إدارة الفعاليات");
    const confirmed = (bookingsByEvent[event.id] || []).filter((b) => b.status === "confirmed").length;
    if (confirmed > 0) throw new Error("لا يمكن حذف فعالية بها حجوزات مؤكدة.");
    await deleteDoc(doc(db, "events", event.id));
    await logAuditEvent("union_event_deleted", { targetId: event.id, category: config.id, title: event.title });
  };

  const calcCost = (event, member, companionsCount = 0) => {
    if (event.isFree) return 0;
    const memberCost = Number(event.memberPrice || 0);
    const companionCost = Number(event.companionPrice || 0) * companionsCount;
    return memberCost + companionCost;
  };

  const addBooking = async (event, member, companions = [], payments = {}) => {
    if (!requireBookingManagementPermission(can)) throw new Error("لا تملك صلاحية إدارة الحجوزات");
    const confirmedPax = (bookingsByEvent[event.id] || [])
      .filter((b) => b.status === "confirmed")
      .reduce((s, b) => s + Number(b.totalPax || 1), 0);
    const requestedPax = 1 + companions.length;
    if (confirmedPax + requestedPax > Number(event.capacity || 0)) {
      throw new Error("السعة لا تسمح — اكتمل العدد.");
    }
    const totalCost = calcCost(event, member, companions.length);
    const paid = Number(payments.cash || 0);
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    const bookingRef = doc(collection(db, "event_bookings"));
    batch.set(bookingRef, {
      eventId: event.id,
      eventTitle: event.title || "",
      eventDate: event.date || "",
      memberId: member.jobId || member.id || "",
      memberName: member.name || "",
      memberPhone: member.phone || member.mobile || "",
      membershipStatus: member.membershipStatus || "",
      memberState: member.memberState || "",
      companionsList: companions,
      totalPax: requestedPax,
      totalCost,
      isFree: Boolean(event.isFree),
      status: totalCost === 0 || paid >= totalCost ? "confirmed" : "pending",
      payments: { cash: paid, wallet: 0, instapay: 0, installment: 0 },
      paymentDate: getTodayISO(),
      paymentSummary: totalCost === 0 ? "مجاني" : paid >= totalCost ? `نقدي: ${paid}` : "مُعلق (انتظار الدفع)",
      amountPaid: paid,
      remainingBalance: Math.max(0, totalCost - paid),
      financingStatus: totalCost === 0 || paid >= totalCost ? "paid" : "active",
      createdAt: serverTimestamp(),
      ...(totalCost === 0 || paid >= totalCost ? { confirmedAt: now } : {}),
    });
    if (isEligibleForBenefit(member, event.date) && Number(event.memberSupportValue || 0) > 0) {
      const benefitRef = doc(collection(db, "member_benefits"));
      batch.set(benefitRef, {
        memberId: member.jobId || member.id || "",
        memberName: member.name || "",
        membershipStatus: member.membershipStatus || "",
        memberState: member.memberState || "",
        date: event.date || getTodayISO(),
        benefitType: config.benefitType,
        amount: Number(event.memberSupportValue || 0),
        notes: `دعم ${config.title} — ${event.title || ""}`,
        eventId: event.id,
        eventTitle: event.title || "",
        bookingId: bookingRef.id,
        source: "union_activity_support",
        status: "active",
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
    if (totalCost === 0 || paid >= totalCost) {
      await updateDoc(doc(db, "events", event.id), {
        bookedCount: confirmedPax + requestedPax,
        updatedAt: serverTimestamp(),
      });
    }
    await logAuditEvent("union_booking_created", {
      targetId: bookingRef.id, eventId: event.id, memberName: member.name || "",
    });
  };

  const confirmBooking = async (booking) => {
    if (!requireBookingManagementPermission(can)) throw new Error("لا تملك صلاحية إدارة الحجوزات");
    const batch = writeBatch(db);
    batch.set(doc(db, "event_bookings", booking.id), {
      status: "confirmed",
      paymentSummary: "مؤكد يدوياً",
      confirmedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    const event = events.find((e) => e.id === booking.eventId);
    if (event) {
      const confirmedPax = (bookingsByEvent[event.id] || [])
        .filter((b) => b.status === "confirmed")
        .reduce((s, b) => s + Number(b.totalPax || 1), 0);
      await updateDoc(doc(db, "events", event.id), {
        bookedCount: confirmedPax + Number(booking.totalPax || 1),
        updatedAt: serverTimestamp(),
      });
    }
    await logAuditEvent("union_booking_confirmed", { targetId: booking.id, eventId: booking.eventId });
  };

  const cancelBooking = async (booking, reason = "") => {
    if (!requireBookingManagementPermission(can)) throw new Error("لا تملك صلاحية إدارة الحجوزات");
    const wasConfirmed = booking.status === "confirmed";
    await updateDoc(doc(db, "event_bookings", booking.id), {
      status: "cancelled",
      canceledAt: new Date().toISOString(),
      cancelReason: reason,
      updatedAt: serverTimestamp(),
    });
    if (wasConfirmed) {
      const event = events.find((e) => e.id === booking.eventId);
      if (event) {
        await updateDoc(doc(db, "events", event.id), {
          bookedCount: Math.max(0, Number(event.bookedCount || 0) - Number(booking.totalPax || 1)),
          updatedAt: serverTimestamp(),
        });
      }
    }
    await logAuditEvent("union_booking_cancelled", { targetId: booking.id, eventId: booking.eventId, reason });
  };

  return {
    events, bookings: scopedBookings, bookingsByEvent, employees: scopedEmployees, loading, stats,
    saveEvent, deleteEventGuarded, addBooking, confirmBooking, cancelBooking, calcCost,
  };
}
