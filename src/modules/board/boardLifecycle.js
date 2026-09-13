import {
  formatEmployeeDate,
  getBoardRoleLabel,
  getEffectiveMemberState,
  getMembershipEndDate,
  getRetirementDate,
  isBoardMember,
  parseEmployeeDate,
} from "../../utils/memberBenefits.js";

export const BOARD_TERMS_COLLECTION = "board_terms";
export const BOARD_MEMBERSHIPS_COLLECTION = "board_memberships";
export const BOARD_CANDIDATES_COLLECTION = "board_candidates";
export const BOARD_MOVEMENTS_COLLECTION = "board_movements";
export const BOARD_BENEFITS_COLLECTION = "board_benefits";
export const VIRTUAL_ACTIVE_TERM_ID = "__legacy_active_term__";
export const BOARD_ORIGINAL_SEATS = 11;

const normalizeText = (value = "") => String(value || "").trim();

const toDateValue = (value) => parseEmployeeDate(value) || null;

const toIsoDate = (value) => {
  const parsed = toDateValue(value);
  if (!parsed) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const getSortDate = (value = "") => {
  const parsed = toDateValue(value);
  return parsed ? parsed.getTime() : 0;
};

export const sortBoardTerms = (terms = []) =>
  [...terms].sort((a, b) => getSortDate(b.startDate) - getSortDate(a.startDate));

export const normalizeBoardTerm = (term = {}, fallback = {}) => ({
  ...term,
  id: normalizeText(term.id),
  title: normalizeText(term.title) || normalizeText(fallback.title),
  termNumber: term.termNumber ?? fallback.termNumber ?? "",
  startDate: toIsoDate(term.startDate || fallback.startDate),
  endDate: toIsoDate(term.endDate || fallback.endDate),
  electionDate: toIsoDate(term.electionDate || fallback.electionDate),
  approvalDate: toIsoDate(term.approvalDate || fallback.approvalDate),
  approvalRef: normalizeText(term.approvalRef || fallback.approvalRef),
  status: normalizeText(term.status || fallback.status) || "planned",
  notes: normalizeText(term.notes || fallback.notes),
  targetSeats: term.targetSeats ?? fallback.targetSeats ?? "",
  openingBalance: Number(term.openingBalance ?? fallback.openingBalance ?? 0) || 0,
  closingBalance: term.closingBalance === "" || term.closingBalance === null || term.closingBalance === undefined
    ? ""
    : Number(term.closingBalance) || 0,
  carriedFromTermId: normalizeText(term.carriedFromTermId || fallback.carriedFromTermId),
  carriedToTermId: normalizeText(term.carriedToTermId || fallback.carriedToTermId),
  resultsApproved: Boolean(term.resultsApproved || fallback.resultsApproved),
  resultsApprovedAt: normalizeText(term.resultsApprovedAt || fallback.resultsApprovedAt),
  resultsApprovedBy: normalizeText(term.resultsApprovedBy || fallback.resultsApprovedBy),
  winnersCount: Number(term.winnersCount ?? fallback.winnersCount ?? 11) || 11,
  allowInactiveCandidates: Boolean(term.allowInactiveCandidates ?? fallback.allowInactiveCandidates),
  isVirtual: Boolean(term.isVirtual || fallback.isVirtual),
});

export const getVirtualBoardTerm = ({
  startDate = "",
  endDate = "",
  title = "الدورة الحالية",
  targetSeats = 11,
} = {}) =>
  normalizeBoardTerm(
    {
      id: VIRTUAL_ACTIVE_TERM_ID,
      title,
      startDate,
      endDate,
      status: "active",
      targetSeats,
      isVirtual: true,
    },
    {}
  );

export const getActiveBoardTerm = (terms = [], fallback = {}) => {
  const normalized = sortBoardTerms(terms.map((term) => normalizeBoardTerm(term)));
  const active = normalized.find((term) => term.status === "active");
  if (active) return active;
  const latest = normalized[0];
  if (latest) return latest;
  return getVirtualBoardTerm(fallback);
};

export const buildBoardMembershipSnapshot = (member = {}) => ({
  name: normalizeText(member.name),
  jobId: normalizeText(member.jobId),
  nationalId: normalizeText(member.nationalId || member.nationalID),
  gender: normalizeText(member.gender),
  jobTitle: normalizeText(member.jobTitle),
  workplace: normalizeText(member.workplace),
  phone: normalizeText(member.phone || member.mobile),
  memberState: normalizeText(member.memberState),
  membershipStatus: normalizeText(member.membershipStatus),
  specialization: normalizeText(member.specialization),
});

export const normalizeBoardMembership = (membership = {}) => ({
  ...membership,
  id: normalizeText(membership.id),
  termId: normalizeText(membership.termId),
  memberId: normalizeText(membership.memberId),
  memberJobId: normalizeText(membership.memberJobId),
  memberName: normalizeText(membership.memberName),
  role: normalizeText(membership.role),
  roleOrder: membership.roleOrder ?? 99,
  joinDate: toIsoDate(membership.joinDate),
  endDate: toIsoDate(membership.endDate),
  status: normalizeText(membership.status) || "active",
  joinMethod: normalizeText(membership.joinMethod) || "legacy",
  endReason: normalizeText(membership.endReason),
  decisionDate: toIsoDate(membership.decisionDate),
  decisionRef: normalizeText(membership.decisionRef),
  replacementForMembershipId: normalizeText(membership.replacementForMembershipId),
  escalationSourceMemberId: normalizeText(membership.escalationSourceMemberId),
  notes: normalizeText(membership.notes),
  snapshot: membership.snapshot || {},
});

export const isBoardMembershipActiveOnDate = (membership = {}, onDate = new Date()) => {
  const normalized = normalizeBoardMembership(membership);
  if (normalized.status !== "active") return false;

  const referenceDate = toDateValue(onDate) || new Date();
  const joinDate = toDateValue(normalized.joinDate);
  const endDate = toDateValue(normalized.endDate);

  if (joinDate && joinDate.getTime() > referenceDate.getTime()) return false;
  if (endDate && endDate.getTime() < referenceDate.getTime()) return false;
  return true;
};

export const buildLegacyBoardMemberships = (employees = [], term = null) =>
  employees
    .filter((employee) => isBoardMember(employee))
    .map((employee, index) => {
      const retirementDate = getRetirementDate(employee);
      const membershipEndDate = getMembershipEndDate(employee);
      const resolvedEndDate = retirementDate || membershipEndDate;
      const joinDate = term?.startDate || "";
      const endDate = formatEmployeeDate(resolvedEndDate)
        ? toIsoDate(resolvedEndDate)
        : normalizeText(employee.boardMembershipEndDate || employee.membershipExpiry);
      const role = getBoardRoleLabel(employee);

      return normalizeBoardMembership({
        id: `legacy_${employee.id || employee.jobId || index}`,
        termId: term?.id || VIRTUAL_ACTIVE_TERM_ID,
        memberId: employee.id,
        memberJobId: employee.jobId || "",
        memberName: employee.name || "",
        role,
        joinDate,
        endDate,
        status: endDate && getSortDate(endDate) < getSortDate(new Date()) ? "ended" : "active",
        joinMethod: "legacy",
        snapshot: buildBoardMembershipSnapshot(employee),
      });
    });

export const buildBoardMemberView = (membership = {}, member = {}) => {
  const normalizedMembership = normalizeBoardMembership(membership);
  const snapshot = normalizedMembership.snapshot || {};

  return {
    ...snapshot,
    ...member,
    id: normalizeText(member.id || normalizedMembership.memberId),
    name: normalizeText(member.name || normalizedMembership.memberName || snapshot.name),
    jobId: normalizeText(member.jobId || normalizedMembership.memberJobId || snapshot.jobId),
    workplace: normalizeText(member.workplace || snapshot.workplace),
    jobTitle: normalizeText(member.jobTitle || snapshot.jobTitle),
    specialization: normalizeText(member.specialization || snapshot.specialization),
    phone: normalizeText(member.phone || member.mobile || snapshot.phone),
    boardRoleTitle: normalizeText(normalizedMembership.role || member.boardRoleTitle || getBoardRoleLabel(member)),
    membershipStatus: normalizeText(normalizedMembership.role || member.membershipStatus || snapshot.membershipStatus),
    memberState: normalizeText(member.memberState || snapshot.memberState),
    boardMembership: normalizedMembership,
    boardMembershipId: normalizedMembership.id,
    boardTermId: normalizedMembership.termId,
  };
};

export const buildBoardMemberViewsFromMemberships = (
  memberships = [],
  employees = [],
  { termId = "" } = {}
) => {
  const employeesMap = new Map((employees || []).map((employee) => [normalizeText(employee.id), employee]));

  return memberships
    .filter((membership) => !termId || normalizeText(membership.termId) === normalizeText(termId))
    .map((membership) =>
      buildBoardMemberView(
        membership,
        employeesMap.get(normalizeText(membership.memberId)) || {}
      )
    );
};

export const getEligibleBoardMemberViews = ({
  memberships = [],
  employees = [],
  termId = "",
  onDate = new Date(),
} = {}) =>
  buildBoardMemberViewsFromMemberships(memberships, employees, { termId }).filter((membership) =>
    isBoardMembershipActiveOnDate(membership.boardMembership || membership, onDate)
  );

export const getMeetingAttendanceRecords = (meeting = {}) =>
  Array.isArray(meeting?.attendanceRecords)
    ? meeting.attendanceRecords.map((record) => ({
      membershipId: normalizeText(record.membershipId),
      memberId: normalizeText(record.memberId),
      memberName: normalizeText(record.memberName),
      role: normalizeText(record.role),
      memberStateAtMeeting: normalizeText(record.memberStateAtMeeting),
      attendanceStatus: normalizeText(record.attendanceStatus) || "present",
      jobId: normalizeText(record.jobId),
      workplace: normalizeText(record.workplace),
      jobTitle: normalizeText(record.jobTitle),
      notes: normalizeText(record.notes),
    }))
    : [];

export const getPresentMeetingAttendanceRecords = (meeting = {}) => {
  const records = getMeetingAttendanceRecords(meeting);
  if (records.length === 0) return [];
  return records.filter((record) => record.attendanceStatus === "present");
};

export const getMeetingAttendeeIds = (meeting = {}) => {
  const recordIds = getPresentMeetingAttendanceRecords(meeting)
    .map((record) => normalizeText(record.memberId))
    .filter(Boolean);

  if (recordIds.length > 0) return recordIds;

  return Array.isArray(meeting?.attendees)
    ? meeting.attendees.map((memberId) => normalizeText(memberId)).filter(Boolean)
    : [];
};

export const validateBoardTermDates = (term = {}) => {
  const startDate = toDateValue(term.startDate);
  const endDate = toDateValue(term.endDate);
  const electionDate = toDateValue(term.electionDate);
  const approvalDate = toDateValue(term.approvalDate);
  if (!startDate || !endDate) return "يجب إدخال تاريخ بداية ونهاية الدورة.";
  if (endDate.getTime() < startDate.getTime()) return "نهاية الدورة لا يمكن أن تسبق بدايتها.";
  if (electionDate && electionDate.getTime() > endDate.getTime()) return "تاريخ الانتخاب يجب أن يكون داخل نطاق الدورة.";
  if (approvalDate && approvalDate.getTime() > endDate.getTime()) return "تاريخ الاعتماد يجب أن يكون داخل نطاق الدورة.";
  return "";
};

export const validateBoardMembershipDates = (membership = {}, term = {}) => {
  const joinDate = toDateValue(membership.joinDate);
  const endDate = toDateValue(membership.endDate);
  const termStart = toDateValue(term.startDate);
  const termEnd = toDateValue(term.endDate);
  if (!joinDate) return "يجب إدخال تاريخ الالتحاق.";
  if (endDate && endDate.getTime() < joinDate.getTime()) return "تاريخ انتهاء العضوية لا يمكن أن يسبق تاريخ الالتحاق.";
  if (termStart && joinDate.getTime() < termStart.getTime()) return "تاريخ الالتحاق يجب ألا يسبق بداية الدورة.";
  if (termEnd && joinDate.getTime() > termEnd.getTime()) return "تاريخ الالتحاق يجب أن يكون داخل نطاق الدورة.";
  if (termEnd && endDate && endDate.getTime() > termEnd.getTime()) return "تاريخ انتهاء العضوية يجب ألا يتجاوز نهاية الدورة.";
  return "";
};

export const buildAttendanceRecord = ({
  member = {},
  membership = null,
  meetingDate = new Date(),
} = {}) => {
  const resolvedRole =
    normalizeText(membership?.role) ||
    normalizeText(member.boardRoleTitle) ||
    getBoardRoleLabel(member);

  return {
    membershipId: normalizeText(membership?.id),
    memberId: normalizeText(member.id || membership?.memberId),
    memberName:
      normalizeText(member.name || membership?.memberName || membership?.snapshot?.name) || "—",
    role: resolvedRole,
    memberStateAtMeeting: getEffectiveMemberState(member, meetingDate),
    attendanceStatus: "present",
    jobId: normalizeText(member.jobId || membership?.memberJobId || membership?.snapshot?.jobId),
    workplace: normalizeText(member.workplace || membership?.snapshot?.workplace),
    jobTitle: normalizeText(member.jobTitle || membership?.snapshot?.jobTitle),
    notes: "",
  };
};

export const buildMeetingAttendancePayload = ({  selectedMemberIds = [],
  existingMeeting = {},
  eligibleMembers = [],
  allEmployees = [],
  termId = "",
  meetingDate = new Date(),
} = {}) => {
  const employeesMap = new Map((allEmployees || []).map((employee) => [normalizeText(employee.id), employee]));
  const eligibleMap = new Map(
    (eligibleMembers || []).map((member) => [
      normalizeText(member.id),
      member,
    ])
  );
  const existingRecordsMap = new Map(
    getMeetingAttendanceRecords(existingMeeting).map((record) => [normalizeText(record.memberId), record])
  );

  const attendeeIds = selectedMemberIds.map((memberId) => normalizeText(memberId)).filter(Boolean);
  const attendanceRecords = attendeeIds.map((memberId) => {
    const existingRecord = existingRecordsMap.get(memberId);
    if (existingRecord) return existingRecord;

    const eligibleMember = eligibleMap.get(memberId);
    if (eligibleMember) {
      return buildAttendanceRecord({
        member: eligibleMember,
        membership: eligibleMember.boardMembership,
        meetingDate,
      });
    }

    const employee = employeesMap.get(memberId) || {};
    return buildAttendanceRecord({
      member: employee,
      membership: null,
      meetingDate,
    });
  });

  return {
    termId: normalizeText(existingMeeting.termId || termId),
    attendees: attendeeIds,
    attendanceRecords,
  };
};

// ── المرشحون ──

export const normalizeBoardCandidate = (candidate = {}) => ({
  ...candidate,
  id: normalizeText(candidate.id),
  termId: normalizeText(candidate.termId),
  memberId: normalizeText(candidate.memberId),
  memberName: normalizeText(candidate.memberName),
  memberJobId: normalizeText(candidate.memberJobId),
  position: normalizeText(candidate.position) || "member",
  votes: Number(candidate.votes ?? 0) || 0,
  nominationDate: toIsoDate(candidate.nominationDate),
  status: normalizeText(candidate.status) || "nominated",
  notes: normalizeText(candidate.notes),
});

export const validateBoardCandidate = (candidate = {}, existing = []) => {
  if (!candidate.termId) return "اختر الدورة الانتخابية.";
  if (!candidate.memberId) return "اختر العضو المرشح.";
  if (!["president", "member"].includes(candidate.position)) return "المنصب المرشح له غير صالح.";
  const duplicate = existing.find(
    (item) => item.id !== candidate.id && item.termId === candidate.termId && item.memberId === candidate.memberId
  );
  if (duplicate) return "هذا العضو مسجل كمرشح في نفس الدورة بالفعل.";
  if (Number(candidate.votes) < 0) return "عدد الأصوات لا يمكن أن يكون سالباً.";
  return "";
};

export const rankBoardCandidates = (candidates = [], seats = 11) => {
  const sorted = [...candidates]
    .map((candidate) => normalizeBoardCandidate(candidate))
    .sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return String(a.memberName || "").localeCompare(String(b.memberName || ""), "ar");
    });
  return sorted.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    computedSeat: index < seats ? "original" : "reserve",
  }));
};

export const findNextReserveCandidate = (rankedCandidates = [], activeMemberIds = []) => {
  const activeSet = new Set((activeMemberIds || []).map((id) => normalizeText(id)));
  return rankedCandidates.find(
    (candidate) =>
      candidate.computedSeat === "reserve" &&
      normalizeText(candidate.status) !== "withdrawn" &&
      normalizeText(candidate.status) !== "disqualified" &&
      !activeSet.has(normalizeText(candidate.memberId))
  ) || null;
};

// ── السجل التاريخي ──

export const BOARD_MOVEMENT_TYPES = [
  { value: "term_created", label: "إنشاء دورة" },
  { value: "term_updated", label: "تعديل دورة" },
  { value: "election_approved", label: "اعتماد نتائج الانتخابات" },
  { value: "candidate_added", label: "إضافة مرشح" },
  { value: "position_assigned", label: "تعيين منصب" },
  { value: "membership_ended", label: "إنهاء عضوية" },
  { value: "member_escalated", label: "تصعيد احتياطي" },
  { value: "benefit_added", label: "إضافة ميزة" },
  { value: "term_closed", label: "إغلاق دورة" },
  { value: "term_archived", label: "أرشفة دورة" },
  { value: "balance_carried", label: "ترحيل رصيد" },
];

export const BOARD_MOVEMENT_LABELS = Object.fromEntries(
  BOARD_MOVEMENT_TYPES.map((item) => [item.value, item.label])
);

export const normalizeBoardMovement = (movement = {}) => ({
  ...movement,
  id: normalizeText(movement.id),
  termId: normalizeText(movement.termId),
  type: normalizeText(movement.type),
  membershipId: normalizeText(movement.membershipId),
  memberId: normalizeText(movement.memberId),
  memberName: normalizeText(movement.memberName),
  fromRole: normalizeText(movement.fromRole),
  toRole: normalizeText(movement.toRole),
  reason: normalizeText(movement.reason),
  effectiveDate: toIsoDate(movement.effectiveDate),
  decisionRef: normalizeText(movement.decisionRef),
  notes: normalizeText(movement.notes),
  createdAtIso: normalizeText(movement.createdAtIso),
});

// ── المزايا ──

export const normalizeBoardBenefit = (benefit = {}) => ({
  ...benefit,
  id: normalizeText(benefit.id),
  termId: normalizeText(benefit.termId),
  memberId: normalizeText(benefit.memberId),
  memberName: normalizeText(benefit.memberName),
  benefitType: normalizeText(benefit.benefitType),
  amount: Number(benefit.amount ?? 0) || 0,
  benefitDate: toIsoDate(benefit.benefitDate),
  description: normalizeText(benefit.description),
  source: normalizeText(benefit.source) || "manual",
  refDocId: normalizeText(benefit.refDocId),
  checkNum: normalizeText(benefit.checkNum),
  settlementId: normalizeText(benefit.settlementId),
  settlementState: normalizeText(benefit.settlementState),
  notes: normalizeText(benefit.notes),
});

// ── الرصيد الختامي للدورة ──

const TERM_INCOME_TYPES = new Set(["deposit", "refund", "subs"]);

const getTermDocAmount = (record = {}) => {
  const fields = ["advanceAmountBase", "amount", "checkAmount", "totalAmount", "paidAmount", "netAmount"];
  for (const field of fields) {
    const value = Number(record?.[field]);
    if (Number.isFinite(value) && value !== 0) return Math.abs(value);
  }
  return 0;
};

export const computeTermClosingBalance = (term = {}, docs = []) => {
  const opening = Number(term?.openingBalance ?? 0) || 0;
  const start = toDateValue(term?.startDate);
  const end = toDateValue(term?.endDate);
  let credit = 0;
  let debit = 0;
  (docs || []).forEach((record) => {
    const state = record?.state || "posted";
    if (!["posted", "approved", "paid"].includes(state)) return;
    const docDate = toDateValue(record?.date);
    if (start && docDate && docDate.getTime() < start.getTime()) return;
    if (end && docDate && docDate.getTime() > end.getTime()) return;
    const amount = getTermDocAmount(record);
    if (!amount) return;
    if (TERM_INCOME_TYPES.has(String(record?.type || ""))) credit += amount;
    else debit += amount;
  });
  return { opening, credit, debit, closing: opening + credit - debit };
};
