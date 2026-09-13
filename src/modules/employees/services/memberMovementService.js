import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useFirebase } from "../../../app/providers/FirebaseProvider";
import { logAuditEvent } from "../../../utils/auditLog";
import { parseEmployeeDate } from "../../../utils/memberBenefits";
import {
  BOARD_MEMBERSHIPS_COLLECTION,
  normalizeBoardMembership,
} from "../../board/boardLifecycle";
import {
  buildEmployeeLifecyclePatch,
  buildMemberMovementTimeline,
  buildMovementAfterSnapshot,
  normalizeMemberMovement,
} from "../helpers/memberMovements";

const EMPLOYEES_COLLECTION = "employees";
const MEMBER_MOVEMENTS_COLLECTION = "member_movements";
const BOARD_END_REASON_BY_MOVEMENT = {
  retirement: "retirement",
  death: "death",
  resignation: "resignation",
  service_end: "membership_end",
  board_exit: "board_restructure",
};

const toDateTimestamp = (value = "") => {
  if (!value) return 0;
  const parsed = parseEmployeeDate(value) || new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const buildBoardMembershipClosureNote = (movement = {}) =>
  [
    "أغلقت عضوية المجلس تلقائيًا",
    movement?.movementLabel ? `بسبب ${movement.movementLabel}` : "",
    movement?.effectiveDate ? `بتاريخ ${movement.effectiveDate}` : "",
    movement?.reason ? `(${movement.reason})` : "",
  ]
    .filter(Boolean)
    .join(" ");

export function useMemberMovementService() {
  const { app } = useFirebase();
  const db = getFirestore(app);

  const getEmployeeById = async (employeeId) => {
    if (!employeeId) return null;
    const employeeSnap = await getDoc(doc(db, EMPLOYEES_COLLECTION, employeeId));
    return employeeSnap.exists() ? { id: employeeSnap.id, ...employeeSnap.data() } : null;
  };

  const closeBoardMembershipsForMovement = async (batch, movement, member) => {
    const endReason = BOARD_END_REASON_BY_MOVEMENT[movement?.movementType];
    if (!endReason || !member?.id) return [];

    const membershipsSnap = await getDocs(
      query(collection(db, BOARD_MEMBERSHIPS_COLLECTION), where("memberId", "==", member.id))
    );

    const effectiveTimestamp = toDateTimestamp(movement?.effectiveDate);
    const closureNote = buildBoardMembershipClosureNote(movement);
    const updatedMembershipIds = [];

    membershipsSnap.docs.forEach((membershipSnap) => {
      const membership = normalizeBoardMembership({
        id: membershipSnap.id,
        ...membershipSnap.data(),
      });

      if (!["active", "suspended"].includes(membership.status)) return;

      const membershipEndTimestamp = toDateTimestamp(membership.endDate);
      if (membershipEndTimestamp && effectiveTimestamp && membershipEndTimestamp < effectiveTimestamp) return;

      batch.set(
        doc(db, BOARD_MEMBERSHIPS_COLLECTION, membership.id),
        {
          status: "ended",
          endDate: movement.effectiveDate || membership.endDate || "",
          endReason,
          decisionDate: movement.decisionDate || movement.effectiveDate || membership.decisionDate || "",
          decisionRef: movement.reason || membership.decisionRef || "",
          notes: [membership.notes, closureNote].filter(Boolean).join(" | "),
          updatedAt: new Date().toISOString(),
          updatedAtServer: serverTimestamp(),
        },
        { merge: true }
      );

      updatedMembershipIds.push(membership.id);
    });

    return updatedMembershipIds;
  };

  const saveMemberMovement = async (movement, member) => {
    const movementId = movement?.id || doc(collection(db, MEMBER_MOVEMENTS_COLLECTION)).id;
    const normalized = normalizeMemberMovement(movement, member, {
      id: movementId,
      updatedAt: new Date().toISOString(),
      createdAt: movement?.createdAt || new Date().toISOString(),
    });

    await setDoc(
      doc(db, MEMBER_MOVEMENTS_COLLECTION, movementId),
      {
        ...normalized,
        createdAtServer: movement?.createdAtServer || serverTimestamp(),
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );

    await logAuditEvent("employees.movement.save", {
      targetId: movementId,
      after: {
        memberId: normalized.memberId,
        movementType: normalized.movementType,
        effectiveDate: normalized.effectiveDate,
        status: normalized.status,
      },
      riskLevel: "medium",
      page: "/employees",
    });

    return normalized;
  };

  const approveMemberMovement = async (movement, member) => {
    if (movement?.createdById && movement?.approvedById && movement.createdById === movement.approvedById) {
      throw new Error("لا يمكن اعتماد حركة أنشأها المستخدم نفسه.");
    }
    if (movement?.createdById && movement?.approvedById === movement.createdById) {
      throw new Error("لا يمكن اعتماد حركة أنشأها المستخدم نفسه.");
    }
    const resolvedMember = member || (await getEmployeeById(movement?.memberId));
    if (!resolvedMember?.id) {
      throw new Error("تعذر العثور على العضو المطلوب لاعتماد الحركة.");
    }

    const movementId = movement?.id || doc(collection(db, MEMBER_MOVEMENTS_COLLECTION)).id;
    const approvedMovement = normalizeMemberMovement(movement, resolvedMember, {
      id: movementId,
      status: "approved",
      updatedAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
    });
    const employeePatch = buildEmployeeLifecyclePatch(resolvedMember, approvedMovement);
    const afterSnapshot = buildMovementAfterSnapshot(resolvedMember, approvedMovement);
    const batch = writeBatch(db);

    batch.set(
      doc(db, MEMBER_MOVEMENTS_COLLECTION, movementId),
      {
        ...approvedMovement,
        afterSnapshot,
        createdAtServer: approvedMovement?.createdAtServer || serverTimestamp(),
        updatedAtServer: serverTimestamp(),
        approvedAtServer: serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(
      doc(db, EMPLOYEES_COLLECTION, resolvedMember.id),
      {
        ...employeePatch,
        updatedAt: new Date().toISOString(),
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );

    const closedBoardMembershipIds = await closeBoardMembershipsForMovement(
      batch,
      approvedMovement,
      resolvedMember
    );

    await batch.commit();

    await logAuditEvent("employees.movement.approve", {
      targetId: movementId,
      before: approvedMovement.beforeSnapshot || null,
      after: afterSnapshot,
      metadata: {
        closedBoardMembershipIds,
      },
      riskLevel: "high",
      page: "/employees",
    });

    return {
      movement: approvedMovement,
      employeePatch,
      closedBoardMembershipIds,
    };
  };

  const createAndApplyMemberMovement = async (movement, member) => saveMemberMovement(
    {
      ...movement,
      status: "draft",
      approvedBy: "",
      approvedById: "",
      approvedAt: "",
    },
    member
  );

  const buildServiceEndMovement = ({ reason = "", notes = "", effectiveDate = "", decisionDate = "" } = {}, member) =>
    normalizeMemberMovement(
      {
        movementType: "service_end",
        reason,
        notes,
        effectiveDate,
        decisionDate,
        source: "employee_module",
      },
      member
    );

  const normalizeMovementFeed = (movements = []) => buildMemberMovementTimeline(movements);

  return {
    getEmployeeById,
    saveMemberMovement,
    approveMemberMovement,
    createAndApplyMemberMovement,
    buildServiceEndMovement,
    normalizeMovementFeed,
  };
}
