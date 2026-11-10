/** Map Supabase rows (snake_case) to the shapes the existing UI components already use. */

export const mapMember = (m) =>
  m && {
    id: m.id,
    name: m.name,
    jobId: m.job_id,
    nationalId: m.national_id,
    phone: m.phone,
    email: m.email,
    workplace: m.workplace,
    jobTitle: m.job_title,
    gender: m.gender,
    birthDate: m.birth_date,
    hireDate: m.hire_date,
    retirementDate: m.retirement_date,
    membershipStatus: m.membership_status,
    memberState: m.member_state,
  };

export const mapEvent = (e) => ({
  id: e.id,
  title: e.title,
  type: e.type,
  date: e.event_date,
  location: e.location,
  capacity: e.capacity,
  isFree: e.is_free,
  memberPrice: e.member_price,
  status: e.status,
});

export const mapBooking = (b) => ({
  id: b.id,
  eventId: b.event_id,
  eventTitle: b.events?.title || "",
  status: b.status,
  totalPax: b.total_pax,
  totalCost: Number(b.total_cost || 0),
});

export const mapBenefit = (b) => ({
  id: b.id,
  benefitType: b.benefit_type,
  amount: Number(b.amount || 0),
  date: b.benefit_date,
  status: b.status,
  notes: b.notes,
  eventTitle: b.events?.title || "",
});

export const mapRequest = (r) => ({
  id: r.id,
  kind: r.kind,
  targetId: r.kind === "service" ? `service:${r.service_id}` : r.event_id,
  targetTitle: r.kind === "service" ? r.notes_title || r.service_id : r.events?.title || "",
  totalPax: Number(r.companions || 0) + 1,
  status: r.status,
  reviewNote: r.review_note,
  createdAtIso: r.created_at,
});
