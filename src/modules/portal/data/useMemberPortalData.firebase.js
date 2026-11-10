import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../app/providers/FirebaseProvider";
import { buildMemberPortalIdentity } from "../memberPortalIdentity";
import { cancelOwnBookingRequest, submitBookingRequest, subscribeMemberRequests } from "../bookingRequestService";

/** Firestore implementation of the member-portal data contract (see useMemberPortalData.js). */
export function useMemberPortalDataFirebase(user) {
  const [requests, setRequests] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [benefits, setBenefits] = useState([]);
  const [events, setEvents] = useState([]);
  const [employeeLoaded, setEmployeeLoaded] = useState(false);

  const identity = useMemo(() => buildMemberPortalIdentity(user, employee), [user, employee]);
  const lookupIdentity = useMemo(() => buildMemberPortalIdentity(user, null), [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadEmployee() {
      if (!db || !lookupIdentity.employeeLookupKeys.length) {
        setEmployee(null);
        return;
      }

      const directId = lookupIdentity.employeeDocId;
      if (directId) {
        const directSnap = await getDoc(doc(db, "employees", directId));
        if (cancelled) return;
        if (directSnap.exists()) {
          setEmployee({ id: directSnap.id, ...directSnap.data() });
          return;
        }
      }

      const scopedQueries = [];

      if (lookupIdentity.jobCode) {
        scopedQueries.push(
          query(collection(db, "employees"), where("jobId", "==", lookupIdentity.jobCode), limit(1)),
          query(collection(db, "employees"), where("employeeCode", "==", lookupIdentity.jobCode), limit(1))
        );
      }

      for (const scopedQuery of scopedQueries) {
        const snap = await getDocs(scopedQuery);
        if (cancelled) return;
        if (!snap.empty) {
          const first = snap.docs[0];
          setEmployee({ id: first.id, ...first.data() });
          return;
        }
      }

      setEmployee(null);
    }

    loadEmployee()
      .catch(() => {
        if (!cancelled) setEmployee(null);
      })
      .finally(() => {
        if (!cancelled) setEmployeeLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [lookupIdentity]);

  useEffect(() => {
    if (!db || identity.memberIdKeys.length === 0) {
      queueMicrotask(() => {
        setBookings([]);
        setBenefits([]);
      });
      return undefined;
    }

    const bookingsById = new Map();
    const benefitsById = new Map();
    const syncBookings = () => setBookings([...bookingsById.values()]);
    const syncBenefits = () => setBenefits([...benefitsById.values()]);

    const unsubBookings = identity.memberIdKeys.map((memberId) =>
      onSnapshot(
        query(collection(db, "event_bookings"), where("memberId", "==", memberId)),
        (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type === "removed") bookingsById.delete(change.doc.id);
            else bookingsById.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
          });
          syncBookings();
        },
        () => syncBookings()
      )
    );
    const unsubBenefits = identity.memberIdKeys.map((memberId) =>
      onSnapshot(
        query(collection(db, "member_benefits"), where("memberId", "==", memberId)),
        (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type === "removed") benefitsById.delete(change.doc.id);
            else benefitsById.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
          });
          syncBenefits();
        },
        () => syncBenefits()
      )
    );
    const unsubE = onSnapshot(query(collection(db, "events")), (snap) => {
      const today = new Date().toISOString().slice(0, 10);
      setEvents(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((e) => (e.date || "") >= today)
          .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
          .filter((e) => e.status !== "cancelled")
          .slice(0, 12)
      );
    }, () => setEvents([]));
    return () => {
      unsubBookings.forEach((unsubscribe) => unsubscribe());
      unsubBenefits.forEach((unsubscribe) => unsubscribe());
      unsubE();
    };
  }, [identity]);



  useEffect(() => subscribeMemberRequests(identity.memberIdKeys, setRequests), [identity]);

  const submitRequest = useCallback(
    ({ target, companions, notes }) =>
      submitBookingRequest({
        user,
        member: { memberId: identity.memberIdKeys[0], name: employee?.name || user?.displayName, phone: employee?.phone },
        target,
        companions,
        notes,
      }),
    [user, identity, employee]
  );

  return { employee, employeeLoaded, bookings, benefits, events, requests, submitRequest, cancelRequest: cancelOwnBookingRequest };
}
