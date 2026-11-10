import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/backend";
import { UNION_ACTIVITY_TYPES } from "../../activities/union/activityConfig";
import { validateBookingRequest } from "../bookingRequestService";
import { mapBenefit, mapBooking, mapEvent, mapMember, mapRequest } from "./mappers";

const SERVICE_TITLES = Object.fromEntries(UNION_ACTIVITY_TYPES.map((t) => [t.id, t.title]));
const today = () => new Date().toISOString().slice(0, 10);

/** Supabase implementation of the member-portal data contract. RLS limits every query to the member's own rows. */
export function useMemberPortalDataSupabase(user) {
  const memberId = user?.memberId || "";
  const userId = user?.id || "";
  const [state, setState] = useState({ bookings: [], benefits: [], events: [], requests: [], loaded: false });

  const load = useCallback(async () => {
    if (!supabase || !userId) return;
    const eventsQuery = supabase
      .from("events")
      .select("id, title, type, event_date, location, capacity, is_free, member_price, status")
      .gte("event_date", today())
      .neq("status", "cancelled")
      .order("event_date")
      .limit(12);

    if (!memberId) {
      const { data: events } = await eventsQuery;
      setState({ bookings: [], benefits: [], requests: [], events: (events || []).map(mapEvent), loaded: true });
      return;
    }

    const [events, bookings, benefits, requests] = await Promise.all([
      eventsQuery,
      supabase.from("event_bookings").select("id, event_id, status, total_pax, total_cost, events(title)").eq("member_id", memberId).order("created_at", { ascending: false }),
      supabase.from("member_benefits").select("id, benefit_type, amount, benefit_date, status, notes, events(title)").eq("member_id", memberId).order("benefit_date", { ascending: false }),
      supabase.from("booking_requests").select("id, kind, event_id, service_id, companions, status, review_note, created_at, events(title)").eq("member_id", memberId).order("created_at", { ascending: false }),
    ]);
    setState({
      events: (events.data || []).map(mapEvent),
      bookings: (bookings.data || []).map(mapBooking),
      benefits: (benefits.data || []).map(mapBenefit),
      requests: (requests.data || []).map((r) =>
        mapRequest({ ...r, notes_title: SERVICE_TITLES[r.service_id] })
      ),
      loaded: true,
    });
  }, [userId, memberId]);

  useEffect(() => {
    queueMicrotask(load);
    if (!supabase || !memberId) return undefined;
    // Live refresh when staff review a request or confirm a booking.
    const channel = supabase
      .channel(`portal-${memberId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_requests", filter: `member_id=eq.${memberId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_bookings", filter: `member_id=eq.${memberId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, memberId]);

  const submitRequest = useCallback(
    async ({ target, companions = 0, notes = "" }) => {
      const error = validateBookingRequest({ memberId, target, companions });
      if (error) throw new Error(error);
      const isService = target.kind === "service";
      const { error: insertError } = await supabase.from("booking_requests").insert({
        kind: isService ? "service" : "event",
        event_id: isService ? null : target.id,
        service_id: isService ? String(target.id).replace(/^service:/, "") : null,
        member_id: memberId,
        requested_by: userId,
        companions: Number(companions),
        notes: String(notes || "").trim().slice(0, 500),
      });
      if (insertError) {
        throw new Error(insertError.code === "23505" ? "لديك طلب قائم لنفس الرحلة أو الخدمة." : "تعذر إرسال الطلب. حاول مرة أخرى.");
      }
      await load();
    },
    [memberId, userId, load]
  );

  const cancelRequest = useCallback(
    async (id) => {
      const { error } = await supabase.from("booking_requests").update({ status: "cancelled" }).eq("id", id);
      if (error) throw new Error("تعذر إلغاء الطلب.");
      await load();
    },
    [load]
  );

  const member = user?.member;
  const employee = useMemo(() => mapMember(member) || null, [member]);

  return {
    employee,
    employeeLoaded: Boolean(user),
    bookings: state.bookings,
    benefits: state.benefits,
    events: state.events,
    requests: state.requests,
    submitRequest,
    cancelRequest,
  };
}
