import {
  formatEmployeeDate,
  getDeathDate,
  getEffectiveMemberState,
  getMembershipEndDate,
  getRetirementDate,
  parseEmployeeDate,
} from "../../../utils/memberBenefits";

export const MEMBER_MOVEMENT_TYPES = [
  "hire",
  "promotion",
  "transfer",
  "leave_without_pay",
  "suspension",
  "return_from_leave",
  "board_assignment",
  "board_exit",
  "retirement",
  "resignation",
  "death",
  "service_end",
  "membership_renewal",
  "membership_expiry_update",
];

export const FINAL_MEMBER_MOVEMENT_TYPES = new Set([
  "retirement",
  "resignation",
  "death",
  "service_end",
]);

export const MEMBER_MOVEMENT_TYPE_LABELS = {
  hire: "تعيين",
  promotion: "ترقية",
  transfer: "نقل",
  leave_without_pay: "إجازة بدون أجر",
  suspension: "إيقاف",
  return_from_leave: "عودة من إجازة",
  board_assignment: "إسناد منصب مجلس",
  board_exit: "خروج من المجلس",
  retirement: "إحالة للمعاش",
  resignation: "استقالة",
  death: "وفاة",
  service_end: "إنهاء خدمة",
  membership_renewal: "تجديد عضوية",
  membership_expiry_update: "تحديث انتهاء العضوية",
};

export const MEMBER_MOVEMENT_STATUS_LABELS = {
  draft: "مسودة",
  approved: "معتمدة",
  cancelled: "ملغاة",
};

export const MEMBER_MOVEMENT_SOURCE_LABELS = {
  manual: "إدخال يدوي",
  automatic_retirement: "تحديث تلقائي للمعاش",
  migration: "ترحيل من البيانات الحالية",
  board_module: "وحدة مجلس الإدارة",
  employee_module: "وحدة الأعضاء",
};

const normalizeText = (value = "") => String(value || "").trim();

export const formatMovementDate = (value = "") =>
  formatEmployeeDate(value) || normalizeText(value) || "—";

export const getMovementSortValue = (movement = {}) => {
  const dateCandidate =
    movement?.effectiveDate ||
    movement?.decisionDate ||
    movement?.updatedAt ||
    movement?.createdAt ||
    "";
  const parsed = parseEmployeeDate(dateCandidate);

  if (parsed) return parsed.getTime();

  const rawDate = new Date(dateCandidate);
  if (!Number.isNaN(rawDate.getTime())) return rawDate.getTime();

  return 0;
};

export const buildMemberSnapshot = (member = {}) => ({
  memberId: normalizeText(member?.id),
  memberJobId: normalizeText(member?.jobId),
  memberName: normalizeText(member?.name),
  membershipStatus: normalizeText(member?.membershipStatus),
  memberState: normalizeText(member?.memberState),
  employmentStatus: normalizeText(member?.employmentStatus),
  retirementDate:
    formatEmployeeDate(getRetirementDate(member)) || normalizeText(member?.retirementDate),
  membershipExpiry:
    formatEmployeeDate(getMembershipEndDate(member)) || normalizeText(member?.membershipExpiry),
  deathDate: formatEmployeeDate(getDeathDate(member)) || normalizeText(member?.deathDate),
  workplace: normalizeText(member?.workplace),
  jobTitle: normalizeText(member?.jobTitle),
});

export const normalizeMemberMovementType = (type = "") => {
  const normalized = normalizeText(type);
  return MEMBER_MOVEMENT_TYPES.includes(normalized) ? normalized : "membership_expiry_update";
};

export const normalizeMemberMovement = (movement = {}, member = {}, overrides = {}) => {
  const movementType = normalizeMemberMovementType(overrides.movementType || movement.movementType);
  const effectiveDate = formatMovementDate(overrides.effectiveDate || movement.effectiveDate);
  const decisionDate = formatMovementDate(overrides.decisionDate || movement.decisionDate);
  const source = normalizeText(overrides.source || movement.source) || "manual";
  const status = normalizeText(overrides.status || movement.status) || "draft";
  const memberSnapshot = buildMemberSnapshot(member);

  return {
    ...movement,
    ...overrides,
    id: normalizeText(overrides.id || movement.id),
    memberId: normalizeText(overrides.memberId || movement.memberId || memberSnapshot.memberId),
    memberJobId: normalizeText(
      overrides.memberJobId || movement.memberJobId || memberSnapshot.memberJobId
    ),
    memberName: normalizeText(
      overrides.memberName || movement.memberName || memberSnapshot.memberName
    ),
    movementType,
    movementLabel: MEMBER_MOVEMENT_TYPE_LABELS[movementType] || movementType,
    effectiveDate,
    decisionDate,
    reason: normalizeText(overrides.reason || movement.reason),
    notes: normalizeText(overrides.notes || movement.notes),
    source,
    sourceLabel: MEMBER_MOVEMENT_SOURCE_LABELS[source] || source || "غير محدد",
    status,
    statusLabel: MEMBER_MOVEMENT_STATUS_LABELS[status] || status || "غير محدد",
    attachments: Array.isArray(overrides.attachments || movement.attachments)
      ? overrides.attachments || movement.attachments
      : [],
    beforeSnapshot: overrides.beforeSnapshot || movement.beforeSnapshot || memberSnapshot,
    afterSnapshot: overrides.afterSnapshot || movement.afterSnapshot || null,
    createdBy: normalizeText(overrides.createdBy || movement.createdBy),
    createdById: normalizeText(overrides.createdById || movement.createdById),
    approvedBy: normalizeText(overrides.approvedBy || movement.approvedBy),
    approvedById: normalizeText(overrides.approvedById || movement.approvedById),
    createdAt: overrides.createdAt || movement.createdAt || "",
    updatedAt: overrides.updatedAt || movement.updatedAt || "",
    approvedAt: overrides.approvedAt || movement.approvedAt || "",
  };
};

export const buildEmployeeLifecyclePatch = (member = {}, movement = {}) => {
  const normalizedMovement = normalizeMemberMovement(movement, member);
  const patch = {
    lastMovementType: normalizedMovement.movementType,
    lastMovementDate: normalizedMovement.effectiveDate,
  };

  switch (normalizedMovement.movementType) {
    case "retirement":
      patch.memberState = "معاش";
      patch.employmentStatus = "retired";
      patch.retirementDate = normalizedMovement.effectiveDate;
      patch.membershipExpiry = normalizedMovement.effectiveDate;
      patch.serviceEndReason = normalizedMovement.reason || "بلوغ سن المعاش";
      patch.serviceEndRecordedBy = normalizedMovement.createdBy || normalizedMovement.approvedBy || "";
      break;
    case "death":
      patch.memberState = "وفاة";
      patch.employmentStatus = "deceased";
      patch.deathDate = normalizedMovement.effectiveDate;
      patch.membershipExpiry = normalizedMovement.effectiveDate;
      patch.serviceEndReason = normalizedMovement.reason || "وفاة";
      patch.serviceEndRecordedBy = normalizedMovement.createdBy || normalizedMovement.approvedBy || "";
      break;
    case "resignation":
      patch.memberState = "استقالة";
      patch.employmentStatus = "inactive";
      patch.membershipExpiry = normalizedMovement.effectiveDate;
      patch.serviceEndReason = normalizedMovement.reason || "استقالة";
      patch.serviceEndRecordedBy = normalizedMovement.createdBy || normalizedMovement.approvedBy || "";
      break;
    case "service_end":
      patch.memberState = "استقالة";
      patch.employmentStatus = "inactive";
      patch.membershipExpiry = normalizedMovement.effectiveDate;
      patch.serviceEndReason = normalizedMovement.reason || "إنهاء خدمة";
      patch.serviceEndRecordedBy = normalizedMovement.createdBy || normalizedMovement.approvedBy || "";
      break;
    case "suspension":
      patch.memberState = "موقوف";
      patch.employmentStatus = "suspended";
      break;
    case "leave_without_pay":
      patch.memberState = "إجازة بدون أجر";
      patch.employmentStatus = "on_leave";
      break;
    case "return_from_leave":
    case "hire":
    case "promotion":
    case "transfer":
    case "board_assignment":
    case "board_exit":
    case "membership_renewal":
      patch.memberState = "نشط";
      patch.employmentStatus = "active";
      break;
    case "membership_expiry_update":
      if (normalizedMovement.effectiveDate && normalizedMovement.effectiveDate !== "—") {
        patch.membershipExpiry = normalizedMovement.effectiveDate;
      }
      break;
    default:
      break;
  }

  return patch;
};

export const buildMovementAfterSnapshot = (member = {}, movement = {}) => ({
  ...buildMemberSnapshot(member),
  ...buildEmployeeLifecyclePatch(member, movement),
});

export const sortMemberMovements = (movements = []) =>
  [...movements].sort((a, b) => getMovementSortValue(b) - getMovementSortValue(a));

export const dedupeMemberMovements = (movements = []) => {
  const seen = new Map();
  movements.forEach((movement) => {
    const key =
      normalizeText(movement?.id) ||
      [
        normalizeText(movement?.memberId),
        normalizeText(movement?.memberJobId),
        normalizeText(movement?.movementType),
        formatMovementDate(movement?.effectiveDate),
      ].join("|");
    if (!seen.has(key)) seen.set(key, movement);
  });
  return Array.from(seen.values());
};

export const buildMemberMovementTimeline = (movements = []) =>
  sortMemberMovements(dedupeMemberMovements(movements)).map((movement) => {
    const normalized = normalizeMemberMovement(movement);
    return {
      ...normalized,
      isFinal: FINAL_MEMBER_MOVEMENT_TYPES.has(normalized.movementType),
      displayDate: normalized.effectiveDate || normalized.decisionDate || "—",
      displayTitle: normalized.movementLabel,
      searchText: [
        normalized.memberName,
        normalized.memberJobId,
        normalized.movementLabel,
        normalized.reason,
        normalized.notes,
        normalized.sourceLabel,
        normalized.statusLabel,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

export const getLatestApprovedMovement = (movements = []) =>
  buildMemberMovementTimeline(movements).find((movement) => movement.status === "approved") || null;

export const inferMovementSummaryFromMember = (member = {}) => {
  const state = getEffectiveMemberState(member);
  const retirementDate = formatEmployeeDate(getRetirementDate(member)) || "";
  const deathDate = formatEmployeeDate(getDeathDate(member)) || "";
  const membershipExpiry = formatEmployeeDate(getMembershipEndDate(member)) || member?.membershipExpiry || "";

  if (state === "وفاة") {
    return {
      movementType: "death",
      movementLabel: MEMBER_MOVEMENT_TYPE_LABELS.death,
      effectiveDate: deathDate || "—",
    };
  }

  if (state === "معاش") {
    return {
      movementType: "retirement",
      movementLabel: MEMBER_MOVEMENT_TYPE_LABELS.retirement,
      effectiveDate: retirementDate || membershipExpiry || "—",
    };
  }

  if (state === "استقالة") {
    return {
      movementType: "resignation",
      movementLabel: MEMBER_MOVEMENT_TYPE_LABELS.resignation,
      effectiveDate: membershipExpiry || "—",
    };
  }

  if (state === "موقوف") {
    return {
      movementType: "suspension",
      movementLabel: MEMBER_MOVEMENT_TYPE_LABELS.suspension,
      effectiveDate: membershipExpiry || "—",
    };
  }

  return {
    movementType: "hire",
    movementLabel: "الحالة الحالية",
    effectiveDate: membershipExpiry || "—",
  };
};
