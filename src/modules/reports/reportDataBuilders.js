import {
  getEmployeeAge,
  formatEmployeeDate,
  parseEmployeeDate,
  getRetirementDate,
  isDeceasedMember,
  isBoardMember,
  isRetiredMember,
} from "../../utils/memberBenefits";
import { formatMoney } from "../../utils/numberFormat";
import {
  getIssuedCheckDisplayParty,
  getIssuedCheckTypeLabel,
  isGroupedSettlementFollower,
  mergeIssuedChecksSourcesNormalized,
  normalizeIssuedCheckType,
  normalizeRequiresSettlement,
} from "../treasury/helpers/issuedChecks";
import { getSharedFinanceLedgerRecords, TREASURY_OPENING_BALANCE as REPORT_OPENING_BALANCE } from "../treasury/helpers/financeLedger";
import { getPresentMeetingAttendanceRecords } from "../board/boardLifecycle";
import { isMembershipCoveringDate } from "../board/boardMembershipRules";
import { buildBoardMemberViewsFromMemberships, getActiveBoardTerm, isBoardMembershipActiveOnDate } from "../board/boardLifecycle";
import {
  compareArabic,
  getBookingStatusLabel,
  getLatestSettlementExpenseDate,
  getRecordStateLabel,
  getSettlementModeLabel,
  toNumber,
} from "./reportUtils";
import {
  buildMemberMovementTimeline,
  MEMBER_MOVEMENT_STATUS_LABELS,
  MEMBER_MOVEMENT_TYPE_LABELS,
} from "../employees/helpers/memberMovements";

const INCOME_TRANSACTION_TYPES = new Set(["deposit", "refund", "subs"]);
const DIRECT_FINANCE_REPORT_TYPES = new Set(["deposit", "refund", "subs", "bank_charge"]);
const POSTED_FINANCE_STATES = new Set(["posted", "approved", "paid"]);
const MONTH_NAMES_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const isPostedRecord = (record = {}) =>
  !record?.state || POSTED_FINANCE_STATES.has(record.state);

const getEmployeeStatusBucket = (member = {}) => {
  if (isDeceasedMember(member)) return "خارج الخدمة";
  if (isRetiredMember(member)) return "معاش";

  const state = String(member?.memberState || "").trim();
  if (!state || state === "نشط") return "نشط";
  if (["موقوف", "إجازة بدون أجر"].includes(state)) return "موقوف";
  if (["استقالة", "وفاة"].includes(state)) return "خارج الخدمة";
  return state;
};

const buildDistributionItems = (rows = [], key, maxItems = 8) => {
  const counts = new Map();

  rows.forEach((row) => {
    const label = String(row?.[key] || "غير محدد").trim() || "غير محدد";
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  const ordered = Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || compareArabic(a.label, b.label));

  if (ordered.length <= maxItems) return ordered;

  const visible = ordered.slice(0, maxItems);
  const otherCount = ordered.slice(maxItems).reduce((sum, item) => sum + item.count, 0);
  return [...visible, { label: "أخرى", count: otherCount }];
};

const getMergedPostedFinanceRows = (sourceData = {}) => {
  return getSharedFinanceLedgerRecords(sourceData).filter(isPostedRecord);
};

const hasMeaningfulMonthlyAnalysisData = (row = {}) => {
  const amount = Math.abs(toNumber(row.amountValue));
  if (amount > 0) return true;

  const hasDate = String(row.date || "").trim().length > 0;
  const hasParty = String(row.party || "").trim().length > 0 && String(row.party).trim() !== "—";
  const hasSource =
    String(row.incomeSourceLabel || "").trim().length > 0 &&
    String(row.incomeSourceLabel).trim() !== "—";
  const hasBucket =
    String(row.expenseBucket || "").trim().length > 0 &&
    String(row.expenseBucket).trim() !== "—";

  return hasDate && (hasParty || hasSource || hasBucket);
};

const getPostedFinanceImpactRows = (sourceData = {}) => {
  const posted = getMergedPostedFinanceRows(sourceData);

  return posted.flatMap((record) => {
    const normalizedType = normalizeIssuedCheckType(record.type);
    const amount = toNumber(record.advanceAmountBase || record.amount);
    const impactRows = [
      {
        ...record,
        type: normalizedType,
        amount,
        advanceAmountBase: amount,
      },
    ];

    const collectedSubscriptions = toNumber(
      record.collectedSubscriptions || record.memberSubscriptions
    );

    if (normalizedType === "trip" && record?.isSettled && collectedSubscriptions > 0) {
      impactRows.push({
        ...record,
        id: `${record.id}__subs`,
        type: "subs",
        date: getLatestSettlementExpenseDate(
          record.settlementExpenses,
          record.settlementDate || record.date || ""
        ),
        amount: collectedSubscriptions,
        advanceAmountBase: collectedSubscriptions,
        notes: `توريد اشتراكات رحلة (${record.date || "—"})`,
      });
    }

    return impactRows;
  });
};

const getDateParts = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return { year: "", month: "", day: "" };

  if (raw.includes("-")) {
    return {
      year: raw.slice(0, 4),
      month: raw.slice(5, 7),
      day: raw.slice(8, 10),
    };
  }

  if (raw.includes("/")) {
    const [day, month, year] = raw.split("/");
    return {
      year: String(year || ""),
      month: String(month || "").padStart(2, "0"),
      day: String(day || "").padStart(2, "0"),
    };
  }

  return { year: "", month: "", day: "" };
};

const getMonthLabel = (month = "") => {
  const monthNumber = Number(month);
  if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) return "غير محدد";
  return `${String(month).padStart(2, "0")} - ${MONTH_NAMES_AR[monthNumber - 1]}`;
};

const shiftMonthKey = (monthKey = "", delta = -1) => {
  const [year, month] = String(monthKey || "").split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  const shifted = new Date(year, month - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
};

const groupAmountBy = (rows = [], labelGetter) => {
  const map = new Map();
  rows.forEach((row) => {
    const label = String(labelGetter(row) || "غير محدد").trim() || "غير محدد";
    map.set(label, (map.get(label) || 0) + toNumber(row.amountValue || row.income || row.expense));
  });
  return Array.from(map.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount || compareArabic(a.label, b.label));
};

const toIsoSortableDate = (value = "") => {
  const parsed = parseEmployeeDate(value);
  if (!parsed) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

export const getBoardRoleWeight = (role = "", roles = []) => {
  const index = roles.indexOf(String(role || "").trim());
  return index >= 0 ? index : roles.length;
};

export const getIssuedCheckStatusLabel = (doc = {}) => {
  if (doc?.isSettled) return "تمت التسوية";
  if (normalizeRequiresSettlement(doc)) return "بانتظار التسوية";
  return "لا تتطلب تسوية";
};

export const buildTreasuryRows = (sourceData = {}) => {
  return getPostedFinanceImpactRows(sourceData)
    .map((record) => {
      const normalizedType = normalizeIssuedCheckType(record.type);
      const amount = toNumber(record.advanceAmountBase || record.amount);
      const isIncome = INCOME_TRANSACTION_TYPES.has(normalizedType);
      return {
        id: record.id,
        date: record.date || record.settlementDate || "",
        typeLabel: getIssuedCheckTypeLabel(normalizedType),
        reference: record.checkNum || record.bankReference || record.receiptNo || "—",
        memberId: record.employeeId || record.jobId || record.memberId || "",
        party: getIssuedCheckDisplayParty(record) || "—",
        statement:
          record.notes ||
          record.activityName ||
          record.eventName ||
          record.expenseItem ||
          record.bankChargeCategory ||
          "—",
        income: isIncome ? amount : 0,
        expense: isIncome ? 0 : amount,
        statusLabel: getRecordStateLabel(record.state),
        __search: [
          record.date,
          record.checkNum,
          record.bankReference,
          getIssuedCheckDisplayParty(record),
          getIssuedCheckTypeLabel(normalizedType),
          record.notes,
          record.expenseItem,
          record.bankChargeCategory,
        ].filter(Boolean).join(" "),
      };
    });
};

export const buildIssuedChecksRows = (sourceData = {}) => {
  const merged = mergeIssuedChecksSourcesNormalized(
    sourceData.issued_checks || [],
    sourceData.transactions || []
  );
  return merged
    .filter(
      (record) =>
        !["deposit", "refund", "subs", "bank_charge"].includes(record.type)
    )
    .map((record) => ({
      id: record.id,
      date: record.date || "",
      typeLabel: getIssuedCheckTypeLabel(normalizeIssuedCheckType(record.type)),
      reference: record.checkNum || "—",
      memberId: record.employeeId || record.jobId || record.memberId || "",
      party: getIssuedCheckDisplayParty(record) || "—",
      amount: toNumber(record.advanceAmountBase || record.amount),
      settlementLabel: normalizeRequiresSettlement(record) ? "تتطلب تسوية" : "لا تتطلب تسوية",
      settlementStatusLabel: getIssuedCheckStatusLabel(record),
      settlementModeLabel: getSettlementModeLabel(record.settlement_mode || record.settlementMode || "none"),
      purpose:
        record.expenseItem ||
        record.aidCategory ||
        record.activityName ||
        record.eventName ||
        record.notes ||
        "—",
      __search: [
        record.date,
        record.checkNum,
        getIssuedCheckDisplayParty(record),
        record.expenseItem,
        record.aidCategory,
        record.activityName,
        record.notes,
      ].filter(Boolean).join(" "),
    }));
};

export const buildSettlementRows = (sourceData = {}) => {
  const merged = mergeIssuedChecksSourcesNormalized(
    sourceData.issued_checks || [],
    sourceData.transactions || []
  );

  return merged
    .filter(
      (record) =>
        !isGroupedSettlementFollower(record) &&
        Boolean(record?.isSettled) &&
        isPostedRecord(record)
    )
    .map((record) => ({
      id: record.id,
      approvalDate: getLatestSettlementExpenseDate(
        record.settlementExpenses,
        record.settlementDate || record.date || ""
      ),
      checkDate: record.date || "",
      typeLabel: getIssuedCheckTypeLabel(normalizeIssuedCheckType(record.type)),
      reference: record.checkNum || "—",
      memberId: record.employeeId || record.jobId || record.memberId || "",
      party: getIssuedCheckDisplayParty(record) || "—",
      checkAmount: toNumber(record.advanceAmountBase || record.amount),
      spent: toNumber(record.settlementSpent),
      returned: toNumber(record.settlementReturned),
      invoicesCount: Array.isArray(record.settlementExpenses) ? record.settlementExpenses.length : 0,
      settlementModeLabel: getSettlementModeLabel(record.settlement_mode || record.settlementMode || "none"),
      returnStatus: record.returnedActually ? "رُد نقدًا" : "مرحل لاحقًا",
      __search: [
        record.settlementDate,
        record.date,
        record.checkNum,
        getIssuedCheckDisplayParty(record),
        record.notes,
      ].filter(Boolean).join(" "),
    }));
};

export const buildCarryForwardAuditRows = (sourceData = {}) => {
  const settlements = getSharedFinanceLedgerRecords(sourceData)
    .filter((record) =>
      normalizeRequiresSettlement(record) &&
      record.isSettled &&
      !isGroupedSettlementFollower(record) &&
      isPostedRecord(record)
    )
    .sort((a, b) => {
      const partyCompare = compareArabic(
        getIssuedCheckDisplayParty(a),
        getIssuedCheckDisplayParty(b)
      );
      if (partyCompare !== 0) return partyCompare;
      return String(a.date || "").localeCompare(String(b.date || "")) ||
        String(a.checkNum || "").localeCompare(String(b.checkNum || ""));
    });

  const previousByParty = new Map();
  return settlements.map((record) => {
    const partyKey = getIssuedCheckDisplayParty(record) || record.employeeId || "غير محدد";
    const previous = previousByParty.get(partyKey) || null;
    const advanceAmount = toNumber(record.advanceAmountBase || record.amount);
    const carriedIn = toNumber(record.prevBalanceUsed ?? previous?.remaining ?? 0);
    const spent = toNumber(record.settlementSpent);
    const remaining = toNumber(record.settlementReturned);
    const row = {
      id: record.id,
      party: partyKey,
      checkDate: record.date || "",
      reference: record.checkNum || "—",
      memberId: record.employeeId || record.jobId || record.memberId || "",
      advanceAmount,
      carriedIn,
      spent,
      remaining,
      returnMode: getSettlementModeLabel(record.returnMode || "settled"),
      nextAdvance: "—",
      __search: [partyKey, record.date, record.checkNum].filter(Boolean).join(" "),
    };
    if (previous) previous.nextAdvance = row.reference;
    previousByParty.set(partyKey, { remaining, row });
    return row;
  });
};

export const buildBankChargesRows = (sourceData = {}) =>
  (sourceData.transactions || [])
    .filter((record) => record.type === "bank_charge")
    .map((record) => ({
      id: record.id,
      date: record.date || "",
      category: record.bankChargeCategory || "خصم بنكي",
      reference: record.bankReference || "—",
      memberId: record.employeeId || record.jobId || record.memberId || "",
      amount: toNumber(record.amount),
      statement: record.notes || "—",
      statusLabel: getRecordStateLabel(record.state),
      __search: [
        record.date,
        record.bankChargeCategory,
        record.bankReference,
        record.notes,
      ].filter(Boolean).join(" "),
    }));

export const buildAidsRows = (sourceData = {}) => {
  const merged = mergeIssuedChecksSourcesNormalized(
    sourceData.issued_checks || [],
    sourceData.transactions || []
  );

  return merged
    .filter((record) => normalizeIssuedCheckType(record.type) === "aid")
    .map((record) => ({
      id: record.id,
      date: record.date || "",
      name: getIssuedCheckDisplayParty(record) || "—",
      party: getIssuedCheckDisplayParty(record) || "—",
      memberName: getIssuedCheckDisplayParty(record) || "—",
      memberId: record.employeeId || record.jobId || "—",
      category: record.aidCategory || "رعاية",
      aidRel: record.aidRel || "—",
      relation: record.aidRel || "—",
      incidentDate: record.incidentDate || "—",
      amount: toNumber(record.advanceAmountBase || record.amount),
      reference: record.checkNum || "—",
      checkNum: record.checkNum || "—",
      notes: record.notes || record.expenseItem || "—",
      statusLabel: getIssuedCheckStatusLabel(record),
      __search: [
        record.date,
        record.employeeId,
        record.party,
        record.employeeName,
        record.aidCategory,
        record.aidRel,
        record.checkNum,
      ].filter(Boolean).join(" "),
    }));
};

export const buildEmployeesRows = (sourceData = {}) =>
  (sourceData.employees || []).map((member) => ({
    id: member.id,
    jobId: member.jobId || "—",
    name: member.name || "—",
    membershipStatus: member.membershipStatus || "—",
    gender: member.gender || "غير محدد",
    memberState: member.memberState || "—",
    jobTitle: member.jobTitle || "—",
    workplace: member.workplace || "—",
    phone: member.phone || member.mobile || "—",
    subscriptionStatus: member.subscriptionStatus || "—",
    retirementDate: formatEmployeeDate(getRetirementDate(member)) || "—",
    __search: [
      member.jobId,
      member.name,
      member.membershipStatus,
      member.gender,
      member.jobTitle,
      member.workplace,
      member.phone,
    ].filter(Boolean).join(" "),
  }));

export const buildAssemblyMembersRows = (sourceData = {}) =>
  (sourceData.employees || [])
    .filter((member) => String(member?.membershipStatus || "").trim() === "عضو جمعية عمومية")
    .map((member) => {
      const age = getEmployeeAge(member);
      const statusBucket = getEmployeeStatusBucket(member);

      return {
        id: member.id,
        jobId: member.jobId || "—",
        name: member.name || "—",
        administration: member.workplace || "غير محدد",
        qualification: member.qualification || "غير محدد",
        unionJoinDate: member.unionJoinDate || "",
        memberState: member.memberState || "—",
        memberStateNormalized: statusBucket,
        jobTitle: member.jobTitle || "—",
        phone: member.phone || member.mobile || "—",
        age: age >= 0 ? age : null,
        ageLabel: age >= 0 ? `${age}` : "—",
        __search: [
          member.jobId,
          member.name,
          member.workplace,
          member.qualification,
          member.memberState,
          member.unionJoinDate,
          member.jobTitle,
          member.phone,
          member.mobile,
        ].filter(Boolean).join(" "),
      };
    });

export const buildBoardMembersRows = (sourceData = {}) => {
  const activeTerm = getActiveBoardTerm(sourceData.board_terms || []);
  const termId = sourceData.activeTermId || activeTerm?.id || "";
  const membershipRows = buildBoardMemberViewsFromMemberships(
    sourceData.board_memberships || [],
    sourceData.employees || [],
    { termId }
  ).filter((member) => isBoardMembershipActiveOnDate(member.boardMembership || member));
  const members = membershipRows.length > 0
    ? membershipRows
    : (sourceData.employees || []).filter((member) => isBoardMember(member));

  return members.map((member) => ({
    id: member.id,
    role: member.boardRoleTitle || member.membershipStatus || "—",
    name: member.name || "—",
    jobId: member.jobId || "—",
    nationalId: member.nationalId || member.nationalID || "—",
    gender: member.gender || "—",
    phone: member.phone || member.mobile || "—",
    workplace: member.workplace || "—",
    memberState: member.memberState || "—",
    joinDate: member.boardMembership?.joinDate || "—",
    endDate: member.boardMembership?.endDate || "—",
    __search: [
      member.membershipStatus,
      member.name,
      member.jobId,
      member.nationalId,
      member.workplace,
    ].filter(Boolean).join(" "),
  }));
};

export const buildBoardMeetingsRows = (sourceData = {}) => {
  const membersMap = new Map(
    (sourceData.employees || []).map((member) => [member.id, member.name || "—"])
  );
  const termMemberships = sourceData.board_memberships || [];

  return (sourceData.board_meetings || []).map((meeting) => {
    const presentRecords = getPresentMeetingAttendanceRecords(meeting);
    const attendeeIds = presentRecords.length > 0
      ? presentRecords.map((record) => record.memberId)
      : (meeting.attendees || []);
    const presentSet = new Set(attendeeIds.map((id) => String(id)));
    const absentees = termMemberships
      .filter((m) => {
        if (String(m.termId || "") !== String(meeting.termId || "") && meeting.termId) return false;
        if (!isMembershipCoveringDate(m, meeting.date)) return false;
        const key = String(m.memberId || "");
        return key && !presentSet.has(key);
      })
      .map((m) => m.memberName || membersMap.get(m.memberId) || "—");
    const decisions = Array.isArray(meeting.decisions) ? meeting.decisions : [];
    return ({
      id: meeting.id,
      date: meeting.date || "",
      title: meeting.title || "—",
      statusLabel: meeting.status === "held" ? "منعقد" : meeting.status === "cancelled" ? "ملغي" : "مجدول",
      attendeesCount: attendeeIds.length,
      decisionsCount: decisions.length,
      absenteesCount: absentees.length,
      approvedDecisions: decisions.length > 0
        ? decisions.map((d, i) => `${i + 1}) ${typeof d === "string" ? d : (d.text || "—")} (موافق ${d.votes?.for ?? "—"} — معارض ${d.votes?.against ?? "—"} — ممتنع ${d.votes?.abstain ?? "—"})`).join(" | ")
        : "—",
      absenteesNames: absentees.length > 0 ? absentees.join("، ") : "لا يوجد",
      __search: [
        meeting.date,
        meeting.title,
        meeting.status,
        attendeeIds.map((id) => membersMap.get(id) || "—").join(" "),
        absentees.join(" "),
      ].filter(Boolean).join(" "),
    });
  });
};

export const buildBoardAllowancesRows = (sourceData = {}, boardRoles = []) => {
  const boardMembers = (sourceData.employees || []).filter((member) => isBoardMember(member));
  const merged = mergeIssuedChecksSourcesNormalized(
    sourceData.issued_checks || [],
    sourceData.transactions || []
  );
  const allowanceSnapshotMembers = new Map();

  merged
    .filter((record) => Boolean(record?.isSettled))
    .forEach((record) => {
      (record.settlementExpenses || []).forEach((expense) => {
        (expense.boardMemberSnapshots || []).forEach((snapshot) => {
          if (!snapshot?.memberId || allowanceSnapshotMembers.has(snapshot.memberId)) return;
          allowanceSnapshotMembers.set(snapshot.memberId, snapshot);
        });
      });
    });

  const rowsMap = new Map(
    boardMembers.map((member) => [
      member.id,
      {
        id: member.id,
        role: member.membershipStatus || "—",
        name: member.name || "—",
        jobId: member.jobId || "—",
        sessionsAllowance: 0,
        travelAllowance: 0,
        hospitalityAllowance: 0,
        totalAllowance: 0,
        lastAllowanceDate: "",
      },
    ])
  );

  allowanceSnapshotMembers.forEach((snapshot, memberId) => {
    if (rowsMap.has(memberId)) return;
    rowsMap.set(memberId, {
      id: memberId,
      role: snapshot.role || "—",
      name: snapshot.name || "—",
      jobId: snapshot.jobId || "—",
      sessionsAllowance: 0,
      travelAllowance: 0,
      hospitalityAllowance: 0,
      totalAllowance: 0,
      lastAllowanceDate: "",
    });
  });

  merged
    .filter((record) => Boolean(record?.isSettled))
    .forEach((record) => {
      (record.settlementExpenses || []).forEach((expense) => {
        if (!Array.isArray(expense.boardMembers) || expense.boardMembers.length === 0) return;
        const perMember =
          toNumber(expense.allowancePerMember) ||
          toNumber(expense.amount) / Math.max(expense.boardMembers.length, 1);
        expense.boardMembers.forEach((memberId) => {
          const row = rowsMap.get(memberId);
          if (!row) return;
          if (expense.category === "بدل جلسات") row.sessionsAllowance += perMember;
          if (expense.category === "بدل انتقال") row.travelAllowance += perMember;
          if (["بدل ضيافة", "ضيافة وبوفيه"].includes(expense.category)) {
            row.hospitalityAllowance += perMember;
          }
          row.totalAllowance =
            row.sessionsAllowance + row.travelAllowance + row.hospitalityAllowance;
          const expenseDate = expense.date || record.settlementDate || record.date || "";
          if (compareArabic(expenseDate, row.lastAllowanceDate) > 0) {
            row.lastAllowanceDate = expenseDate;
          }
        });
      });
    });

  return Array.from(rowsMap.values()).map((row) => ({
    ...row,
    roleWeight: getBoardRoleWeight(row.role, boardRoles),
    __search: [row.role, row.name, row.lastAllowanceDate].filter(Boolean).join(" "),
  }));
};

export const buildEventsRows = (sourceData = {}, todayValue = "") =>
  (sourceData.events || []).map((event) => {
    const booked = toNumber(event.bookedCount);
    const capacity = Math.max(toNumber(event.capacity), 0);
    const available = Math.max(capacity - booked, 0);
    const today = todayValue || "";
    const statusLabel =
      event.date < today
        ? "منتهية"
        : today >= (event.bookingStart || "") && today <= (event.bookingEnd || "")
          ? "الحجز مفتوح"
          : today < (event.bookingStart || "")
            ? "قريبًا"
            : "الحجز مغلق";

    return {
      id: event.id,
      date: event.date || "",
      reference: event.checkNum || event.reference || "—",
      memberId: event.memberId || event.ownerMemberId || "",
      title: event.title || "—",
      type: event.type || "—",
      location: event.location || "—",
      capacity,
      booked,
      available,
      bookingWindow: `${event.bookingStart || "—"} → ${event.bookingEnd || "—"}`,
      pricing: event.isFree
        ? "مجانية"
        : `عضو ${event.memberPrice || 0} | مرافق ${event.companionPrice || 0} | دعم ${event.memberSupportValue || 0}`,
      statusLabel,
      __search: [event.date, event.title, event.type, event.location].filter(Boolean).join(" "),
    };
  });

export const buildBookingsRows = (sourceData = {}) => {
  const eventsMap = new Map((sourceData.events || []).map((event) => [event.id, event]));

  return (sourceData.event_bookings || []).map((booking) => {
    const linkedEvent = eventsMap.get(booking.eventId) || {};
    const createdAtLabel =
      booking.createdAt?.toDate?.()?.toISOString?.().split("T")[0] ||
      (booking.createdAt?.seconds
        ? new Date(booking.createdAt.seconds * 1000).toISOString().split("T")[0]
        : "—");

    return {
      id: booking.id,
      eventDate: booking.eventDate || linkedEvent.date || "",
      reference: booking.checkNum || linkedEvent.checkNum || "—",
      eventTitle: booking.eventTitle || linkedEvent.title || "—",
      memberName: booking.memberName || "—",
      memberId: booking.memberId || "—",
      totalPax: toNumber(booking.totalPax || 1),
      totalCost: toNumber(booking.totalCost),
      statusLabel: getBookingStatusLabel(booking.status),
      paymentSummary: booking.paymentSummary || "—",
      createdAtLabel,
      __search: [
        booking.eventTitle,
        linkedEvent.title,
        booking.memberName,
        booking.memberId,
        booking.paymentSummary,
        booking.status,
      ].filter(Boolean).join(" "),
    };
  });
};

export const buildMemberBenefitsRows = (sourceData = {}) =>
  (sourceData.member_benefits || []).map((entry) => ({
    id: entry.id,
    date: entry.date || "",
    reference: entry.checkNum || entry.refDocId || entry.eventId || entry.bookingId || "—",
    memberName: entry.memberName || "—",
    memberId: entry.memberId || "—",
    benefitType: entry.benefitType || "ميزة صندوق",
    amount: toNumber(entry.amount),
    eventTitle: entry.eventTitle || "—",
    sourceLabel: entry.source || "—",
    statusLabel: entry.status === "cancelled" ? "ملغي" : "نشط",
    notes: entry.notes || entry.displayLabel || "—",
    __search: [
      entry.date,
      entry.memberName,
      entry.memberId,
      entry.benefitType,
      entry.eventTitle,
      entry.notes,
      entry.displayLabel,
    ].filter(Boolean).join(" "),
  }));

export const buildMemberMovementsReportRows = (sourceData = {}) =>
  buildMemberMovementTimeline(sourceData.member_movements || []).map((movement) => {
    const beforeState = String(movement?.beforeSnapshot?.memberState || "").trim() || "—";
    const afterState = String(movement?.afterSnapshot?.memberState || "").trim() || beforeState;
    const workplace =
      String(movement?.afterSnapshot?.workplace || movement?.beforeSnapshot?.workplace || "").trim() ||
      "—";
    const jobTitle =
      String(movement?.afterSnapshot?.jobTitle || movement?.beforeSnapshot?.jobTitle || "").trim() ||
      "—";
    const memberCode = String(movement?.memberJobId || movement?.memberId || "").trim() || "—";
    const movementCategory = movement.isFinal ? "حركة نهائية" : "حركة إدارية";

    return {
      id: movement.id,
      effectiveDateRaw: toIsoSortableDate(movement.effectiveDate),
      reference: movement.reference || movement.decisionNo || movement.decisionNumber || "—",
      decisionDateRaw: toIsoSortableDate(movement.decisionDate),
      effectiveDateLabel: movement.effectiveDate || "—",
      decisionDateLabel: movement.decisionDate || "—",
      memberName: movement.memberName || "—",
      memberCode,
      movementType: movement.movementType || "",
      movementLabel:
        MEMBER_MOVEMENT_TYPE_LABELS[movement.movementType] || movement.movementLabel || "—",
      movementCategory,
      status: movement.status || "",
      statusLabel:
        MEMBER_MOVEMENT_STATUS_LABELS[movement.status] || movement.statusLabel || "—",
      fromState: beforeState,
      toState: afterState,
      workplace,
      jobTitle,
      sourceLabel: movement.sourceLabel || "—",
      reason: movement.reason || "—",
      notes: movement.notes || "—",
      __search: [
        movement.memberName,
        memberCode,
        movement.movementLabel,
        movementCategory,
        movement.statusLabel,
        beforeState,
        afterState,
        workplace,
        jobTitle,
        movement.reason,
        movement.notes,
        movement.sourceLabel,
        movement.effectiveDate,
        movement.decisionDate,
        toIsoSortableDate(movement.effectiveDate),
        toIsoSortableDate(movement.decisionDate),
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

export const buildMemberMovementsSummary = ({ rows = [] } = {}) => {
  const approvedCount = rows.filter((row) => row.status === "approved").length;
  const finalCount = rows.filter((row) => row.movementCategory === "حركة نهائية").length;
  const uniqueMembers = new Set(
    rows
      .map((row) => {
        const memberCode = String(row.memberCode || "").trim();
        if (memberCode && memberCode !== "—") return memberCode;
        return String(row.memberName || "").trim();
      })
      .filter(Boolean)
  ).size;

  return {
    cards: [
      { label: "إجمالي الحركات", value: String(rows.length) },
      { label: "الحركات المعتمدة", value: String(approvedCount) },
      { label: "الحركات النهائية", value: String(finalCount) },
      { label: "الأعضاء المتأثرون", value: String(uniqueMembers) },
    ],
    sections: [
      {
        title: "التوزيع حسب نوع الحركة",
        items: buildDistributionItems(rows, "movementLabel", 8).map((item) => ({
          label: item.label,
          value: String(item.count),
        })),
      },
      {
        title: "التوزيع حسب حالة الاعتماد",
        items: buildDistributionItems(rows, "statusLabel", 6).map((item) => ({
          label: item.label,
          value: String(item.count),
        })),
      },
      {
        title: "التوزيع حسب الحالة بعد الحركة",
        items: buildDistributionItems(rows, "toState", 8).map((item) => ({
          label: item.label,
          value: String(item.count),
        })),
      },
    ],
  };
};

export const buildAssemblyMembersSummary = ({ rows = [] } = {}) => {
  const ages = rows
    .map((row) => Number(row?.age))
    .filter((value) => Number.isFinite(value) && value >= 0);

  const totalMembers = rows.length;
  const activeCount = rows.filter((row) => row.memberStateNormalized === "نشط").length;
  const retiredCount = rows.filter((row) => row.memberStateNormalized === "معاش").length;
  const frozenCount = rows.filter((row) => row.memberStateNormalized === "موقوف").length;
  const averageAge = ages.length
    ? `${(ages.reduce((sum, value) => sum + value, 0) / ages.length).toFixed(1)} سنة`
    : "—";

  return {
    cards: [
      { label: "عدد الأعضاء الإجمالي", value: String(totalMembers) },
      { label: "عدد النشطين", value: String(activeCount) },
      { label: "عدد المعاشات", value: String(retiredCount) },
      { label: "عدد المجمدين", value: String(frozenCount) },
      { label: "متوسط الأعمار", value: averageAge },
    ],
    sections: [
      {
        title: "حسب الحالة الوظيفية",
        items: buildDistributionItems(rows, "memberStateNormalized", 6).map((item) => ({
          label: item.label,
          value: String(item.count),
        })),
      },
      {
        title: "توزيع حسب المؤهل",
        items: buildDistributionItems(rows, "qualification", 6).map((item) => ({
          label: item.label,
          value: String(item.count),
        })),
      },
      {
        title: "توزيع حسب الإدارات",
        items: buildDistributionItems(rows, "administration", 8).map((item) => ({
          label: item.label,
          value: String(item.count),
        })),
      },
    ],
  };
};

export const buildSimplifiedBalanceSheetRows = (sourceData = {}) => {
  const posted = getMergedPostedFinanceRows(sourceData);
  const postedFinanceImpactRows = getPostedFinanceImpactRows(sourceData);

  const totalIncome = postedFinanceImpactRows.reduce((sum, record) => {
    const normalizedType = normalizeIssuedCheckType(record.type);
    return sum + (INCOME_TRANSACTION_TYPES.has(normalizedType) ? toNumber(record.advanceAmountBase || record.amount) : 0);
  }, 0);

  const totalExpenses = postedFinanceImpactRows.reduce((sum, record) => {
    const normalizedType = normalizeIssuedCheckType(record.type);
    return sum + (INCOME_TRANSACTION_TYPES.has(normalizedType) ? 0 : toNumber(record.advanceAmountBase || record.amount));
  }, 0);

  const currentAdvancesRows = posted.filter((record) => {
    const normalizedType = normalizeIssuedCheckType(record.type);
    return normalizedType === "advance" && normalizeRequiresSettlement(record) && !record?.isSettled;
  });

  const settlementsInProgressRows = posted.filter((record) => {
    const normalizedType = normalizeIssuedCheckType(record.type);
    return normalizedType !== "advance" && normalizeRequiresSettlement(record) && !record?.isSettled;
  });

  const debtorsRows = posted.filter(
    (record) => toNumber(record?.settlementReturned) > 0 && !record?.returnedActually
  );

  const creditorsRows = posted.filter((record) => {
    if (!record?.isSettled) return false;
    const availableAmount =
      toNumber(record?.advanceAmountBase || record?.amount) +
      toNumber(record?.prevBalanceUsed) +
      toNumber(record?.collectedSubscriptions || record?.memberSubscriptions);
    return toNumber(record?.settlementSpent) > availableAmount;
  });

  const currentAdvances = currentAdvancesRows.reduce(
    (sum, record) => sum + toNumber(record.advanceAmountBase || record.amount),
    0
  );
  const settlementsInProgress = settlementsInProgressRows.reduce(
    (sum, record) => sum + toNumber(record.advanceAmountBase || record.amount),
    0
  );
  const debtors = debtorsRows.reduce((sum, record) => sum + toNumber(record.settlementReturned), 0);
  const creditors = creditorsRows.reduce((sum, record) => {
    const availableAmount =
      toNumber(record?.advanceAmountBase || record?.amount) +
      toNumber(record?.prevBalanceUsed) +
      toNumber(record?.collectedSubscriptions || record?.memberSubscriptions);
    return sum + Math.max(toNumber(record?.settlementSpent) - availableAmount, 0);
  }, 0);
  const cashBalance = REPORT_OPENING_BALANCE + totalIncome - totalExpenses;

  return [
    {
      id: "cash_balance",
      category: "أصل متداول",
      item: "رصيد نقدي",
      amount: cashBalance,
      note: `افتتاحي ${formatMoney(REPORT_OPENING_BALANCE)} + إيرادات ${formatMoney(totalIncome)} - مصروفات ${formatMoney(totalExpenses)}`,
      countLabel: "حركة مجمعة",
    },
    {
      id: "current_advances",
      category: "أصل متداول",
      item: "سلف جارية",
      amount: currentAdvances,
      note: "شيكات سلفة مفتوحة لم تُسوَّ بعد",
      countLabel: `${currentAdvancesRows.length} حالة`,
    },
    {
      id: "settlements_in_progress",
      category: "أصل متداول",
      item: "تسويات تحت الإجراء",
      amount: settlementsInProgress,
      note: "شيكات تتطلب تسوية ولم تُغلق حتى الآن",
      countLabel: `${settlementsInProgressRows.length} حالة`,
    },
    {
      id: "debtors",
      category: "مدينون",
      item: "أرصدة مرحّلة مستحقة",
      amount: debtors,
      note: "مبالغ باقية لم تُرد نقدًا ورُحلت للمتابعة",
      countLabel: `${debtorsRows.length} حالة`,
    },
    {
      id: "creditors",
      category: "دائنون",
      item: "مستحقات واجبة السداد",
      amount: creditors,
      note: "تجاوزات صرف معتمدة لصالح المستفيدين",
      countLabel: `${creditorsRows.length} حالة`,
    },
    {
      id: "revenues",
      category: "نتيجة النشاط",
      item: "إيرادات",
      amount: totalIncome,
      note: "إيداعات + ردود سلف + اشتراكات مرحّلة",
      countLabel: "إجمالي الفترة",
    },
    {
      id: "expenses",
      category: "نتيجة النشاط",
      item: "مصاريف",
      amount: totalExpenses,
      note: "إعانات + سلف + رحلات + أنشطة + خصومات مباشرة",
      countLabel: "إجمالي الفترة",
    },
  ].map((row) => ({
    ...row,
    __search: [row.category, row.item, row.note, row.countLabel].filter(Boolean).join(" "),
  }));
};

export const buildSimplifiedBalanceSheetSummary = ({ rows = [] } = {}) => {
  const lookup = Object.fromEntries(rows.map((row) => [row.id, row]));
  const revenues = toNumber(lookup.revenues?.amount);
  const expenses = toNumber(lookup.expenses?.amount);

  return {
    cards: [
      { label: "رصيد نقدي", value: formatMoney(toNumber(lookup.cash_balance?.amount)) },
      { label: "سلف جارية", value: formatMoney(toNumber(lookup.current_advances?.amount)) },
      { label: "تسويات تحت الإجراء", value: formatMoney(toNumber(lookup.settlements_in_progress?.amount)) },
      { label: "مدينون", value: formatMoney(toNumber(lookup.debtors?.amount)) },
      { label: "دائنون", value: formatMoney(toNumber(lookup.creditors?.amount)) },
      { label: "صافي النشاط", value: formatMoney(revenues - expenses) },
    ],
    sections: [
      {
        title: "ملخص محاسبي",
        items: [
          { label: "الرصيد الافتتاحي", value: formatMoney(REPORT_OPENING_BALANCE) },
          { label: "إجمالي الإيرادات", value: formatMoney(revenues) },
          { label: "إجمالي المصروفات", value: formatMoney(expenses) },
        ],
      },
    ],
  };
};

export const buildMonthlyFinancialAnalysisRows = (sourceData = {}) =>
  getMergedPostedFinanceRows(sourceData)
    .map((record) => {
      const normalizedType = normalizeIssuedCheckType(record.type);
      const amount = toNumber(record.advanceAmountBase || record.amount);
      const { year, month } = getDateParts(record.date || record.settlementDate || "");
      const monthKey = year && month ? `${year}-${month}` : "";
      const isIncome = INCOME_TRANSACTION_TYPES.has(normalizedType);
      const party = getIssuedCheckDisplayParty(record) || "—";

      const incomeSourceLabel =
        normalizedType === "deposit"
          ? record.party || record.notes || "إيداع"
          : normalizedType === "refund"
            ? `رد سلفة${party && party !== "—" ? ` - ${party}` : ""}`
            : normalizedType === "subs"
              ? record.party || "اشتراكات أعضاء"
              : getIssuedCheckTypeLabel(normalizedType);

      const expenseBucket =
        normalizedType === "aid"
          ? record.aidCategory || "إعانات"
          : normalizedType === "advance"
            ? record.expenseItem || "سلف وعهد"
            : normalizedType === "bank_charge"
              ? record.bankChargeCategory || "مصروفات بنكية"
              : record.expenseItem ||
              record.activityName ||
              record.eventName ||
              getIssuedCheckTypeLabel(normalizedType);

      return {
        id: record.id,
        date: record.date || record.settlementDate || "",
        reference: record.checkNum || record.bankReference || record.receiptNo || "—",
        memberId: record.employeeId || record.jobId || record.memberId || "",
        monthKey,
        monthLabel: getMonthLabel(month),
        yearLabel: year || "غير محدد",
        typeLabel: getIssuedCheckTypeLabel(normalizedType),
        party,
        incomeSourceLabel,
        expenseBucket,
        analysisBucket: isIncome ? "إيراد" : "مصروف",
        income: isIncome ? amount : 0,
        expense: isIncome ? 0 : amount,
        amountValue: amount,
        __search: [
          record.date,
          record.settlementDate,
          party,
          incomeSourceLabel,
          expenseBucket,
          record.notes,
          record.expenseItem,
          record.aidCategory,
          record.activityName,
          record.eventName,
        ].filter(Boolean).join(" "),
      };
    })
    .filter(hasMeaningfulMonthlyAnalysisData);

export const buildMonthlyFinancialAnalysisSummary = ({ rows = [], sourceData = {}, filters = {} } = {}) => {
  const allRows = buildMonthlyFinancialAnalysisRows(sourceData);
  const selectedMonthLabel = String(filters.monthLabel || "").trim();
  const selectedYearLabel = String(filters.yearLabel || "").trim();

  const currentMonthKey =
    rows
      .map((row) => row.monthKey)
      .filter(Boolean)
      .sort(compareArabic)
      .slice(-1)[0] ||
    allRows
      .filter((row) =>
        (!selectedMonthLabel || row.monthLabel === selectedMonthLabel) &&
        (!selectedYearLabel || row.yearLabel === selectedYearLabel)
      )
      .map((row) => row.monthKey)
      .filter(Boolean)
      .sort(compareArabic)
      .slice(-1)[0] ||
    allRows.map((row) => row.monthKey).filter(Boolean).sort(compareArabic).slice(-1)[0] ||
    "";

  const currentRows = currentMonthKey ? rows.filter((row) => row.monthKey === currentMonthKey) : rows;
  const previousMonthKey = shiftMonthKey(currentMonthKey, -1);
  const previousRows = previousMonthKey ? allRows.filter((row) => row.monthKey === previousMonthKey) : [];

  const currentIncome = currentRows.reduce((sum, row) => sum + toNumber(row.income), 0);
  const currentExpense = currentRows.reduce((sum, row) => sum + toNumber(row.expense), 0);
  const currentNet = currentIncome - currentExpense;

  const previousIncome = previousRows.reduce((sum, row) => sum + toNumber(row.income), 0);
  const previousExpense = previousRows.reduce((sum, row) => sum + toNumber(row.expense), 0);
  const previousNet = previousIncome - previousExpense;
  const netChange = currentNet - previousNet;
  const growthRate =
    previousNet === 0
      ? currentNet === 0
        ? 0
        : 100
      : (netChange / Math.abs(previousNet)) * 100;

  const topExpenseParties = groupAmountBy(
    currentRows.filter((row) => toNumber(row.expense) > 0),
    (row) => row.party
  ).slice(0, 5);

  const topIncomeSources = groupAmountBy(
    currentRows.filter((row) => toNumber(row.income) > 0),
    (row) => row.incomeSourceLabel
  ).slice(0, 5);

  const expenseDistribution = groupAmountBy(
    currentRows.filter((row) => toNumber(row.expense) > 0),
    (row) => row.expenseBucket
  ).slice(0, 6);

  const incomeDistribution = groupAmountBy(
    currentRows.filter((row) => toNumber(row.income) > 0),
    (row) => row.incomeSourceLabel
  ).slice(0, 6);

  const advanceRows = currentRows.filter((row) => row.typeLabel === "سلفة");
  const aidRows = currentRows.filter((row) => row.typeLabel === "رعاية");
  const eventRows = currentRows.filter((row) => ["فاعليات", "رحلات", "أنشطة"].includes(row.typeLabel));

  const currentMonthLabel =
    currentRows.find((row) => row.monthKey === currentMonthKey)?.monthLabel ||
    (currentMonthKey ? currentMonthKey : "الشهر المحدد");
  const previousMonthLabel =
    previousRows.find((row) => row.monthKey === previousMonthKey)?.monthLabel ||
    (previousMonthKey ? previousMonthKey : "الشهر السابق");

  return {
    cards: [
      { label: `إجمالي إيرادات ${currentMonthLabel}`, value: formatMoney(currentIncome) },
      { label: `إجمالي مصروفات ${currentMonthLabel}`, value: formatMoney(currentExpense) },
      { label: "صافي الشهر", value: formatMoney(currentNet) },
      { label: `صافي ${previousMonthLabel}`, value: formatMoney(previousNet) },
      { label: "المقارنة مع الشهر السابق", value: formatMoney(netChange) },
      { label: "معدل النمو Growth Rate", value: `${growthRate.toFixed(1)}%` },
    ],
    sections: [
      {
        title: "توزيع المصروفات حسب البنود",
        items: expenseDistribution.map((item) => ({
          label: item.label,
          value: formatMoney(item.amount),
        })),
      },
      {
        title: "توزيع الإيرادات حسب المصادر",
        items: incomeDistribution.map((item) => ({
          label: item.label,
          value: formatMoney(item.amount),
        })),
      },
      {
        title: "أعلى 5 جهات تم الصرف لها",
        items: topExpenseParties.map((item) => ({
          label: item.label,
          value: formatMoney(item.amount),
        })),
      },
      {
        title: "أعلى 5 مصادر إيراد",
        items: topIncomeSources.map((item) => ({
          label: item.label,
          value: formatMoney(item.amount),
        })),
      },
      {
        title: "تحليل السلف خلال الشهر",
        items: [
          { label: "عدد حركات السلف", value: String(advanceRows.length) },
          { label: "إجمالي السلف", value: formatMoney(advanceRows.reduce((sum, row) => sum + toNumber(row.expense), 0)) },
        ],
      },
      {
        title: "تحليل الإعانات خلال الشهر",
        items: [
          { label: "عدد الإعانات", value: String(aidRows.length) },
          { label: "إجمالي الإعانات", value: formatMoney(aidRows.reduce((sum, row) => sum + toNumber(row.expense), 0)) },
        ],
      },
      {
        title: "تحليل الفعاليات خلال الشهر",
        items: [
          { label: "عدد الحركات", value: String(eventRows.length) },
          { label: "إجمالي قيمة الفعاليات", value: formatMoney(eventRows.reduce((sum, row) => sum + toNumber(row.expense), 0)) },
        ],
      },
    ],
  };
};
