import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";
import { logAuditEvent } from "../../utils/auditLog";
import {
  BOARD_BENEFITS_COLLECTION,
  BOARD_CANDIDATES_COLLECTION,
  BOARD_MEMBERSHIPS_COLLECTION,
  BOARD_MOVEMENTS_COLLECTION,
  BOARD_TERMS_COLLECTION,
  computeTermClosingBalance,
  findNextReserveCandidate,
  normalizeBoardBenefit,
  normalizeBoardCandidate,
  normalizeBoardMovement,
  rankBoardCandidates,
  validateBoardCandidate,
} from "./boardLifecycle";

const nowIso = () => new Date().toISOString();

async function writeMovement(entry = {}) {
  const payload = normalizeBoardMovement({ ...entry, createdAtIso: entry.createdAtIso || nowIso() });
  const ref = await addDoc(collection(db, BOARD_MOVEMENTS_COLLECTION), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function logTermMovement(termId, type, notes = "", extra = {}) {
  return writeMovement({ termId, type, notes, ...extra });
}

export async function saveBoardCandidate(candidate = {}, existing = []) {
  const normalized = normalizeBoardCandidate(candidate);
  const error = validateBoardCandidate(normalized, existing);
  if (error) throw new Error(error);
  const payload = { ...normalized, updatedAt: serverTimestamp() };
  delete payload.id;
  delete payload.rank;
  delete payload.computedSeat;
  let id = normalized.id;
  if (id) {
    await updateDoc(doc(db, BOARD_CANDIDATES_COLLECTION, id), payload);
  } else {
    const ref = await addDoc(collection(db, BOARD_CANDIDATES_COLLECTION), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    id = ref.id;
  }
  const isNew = !normalized.id;
  await writeMovement({
    termId: normalized.termId,
    type: "candidate_added",
    memberId: normalized.memberId,
    memberName: normalized.memberName,
    notes: `مرشح: ${normalized.memberName} — ${normalized.position === "president" ? "رئيس المجلس" : "عضو مجلس إدارة"}`,
  });
  await logAuditEvent(isNew ? "board_candidate_added" : "board_candidate_updated", {
    targetId: id,
    termId: normalized.termId,
    memberId: normalized.memberId,
    memberName: normalized.memberName,
    votes: normalized.votes,
  });
  return id;
}

export async function approveElectionResults({ term, candidates = [], seats = 11, inactiveMap = {}, existingMemberIds = [] }) {
  if (!term?.id) throw new Error("اختر الدورة أولاً.");
  const ranked = rankBoardCandidates(candidates, seats);
  if (ranked.filter((c) => c.computedSeat === "original").length < seats) {
    throw new Error(`عدد المرشحين (${ranked.length}) أقل من المقاعد المطلوبة (${seats}).`);
  }
  const batch = writeBatch(db);
  const alreadyMembers = new Set((existingMemberIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  ranked.forEach((candidate) => {
    const status = candidate.computedSeat === "original" ? "won_original" : "won_reserve";
    batch.set(
      doc(db, BOARD_CANDIDATES_COLLECTION, candidate.id),
      { status, updatedAt: serverTimestamp() },
      { merge: true }
    );
  });
  ranked
    .filter((candidate) => candidate.computedSeat === "original")
    .filter((candidate) => !alreadyMembers.has(String(candidate.memberId || "").trim()))
    .forEach((candidate) => {
      const membershipRef = doc(collection(db, BOARD_MEMBERSHIPS_COLLECTION));
      const historicalEnd = inactiveMap[candidate.memberId] || null;
      batch.set(membershipRef, {
        termId: term.id,
        memberId: candidate.memberId,
        memberName: candidate.memberName,
        memberJobId: candidate.memberJobId || "",
        role: candidate.position === "president" ? "رئيس المجلس" : "عضو مجلس إدارة",
        roleOrder: candidate.position === "president" ? 1 : 5,
        roleStartDate: term.startDate || "",
        joinDate: term.startDate || "",
        endDate: historicalEnd?.endDate || "",
        status: historicalEnd ? "ended" : "active",
        joinMethod: "elected",
        endReason: historicalEnd?.endReason || "",
        electionRank: candidate.rank,
        electionVotes: candidate.votes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  batch.set(
    doc(db, BOARD_TERMS_COLLECTION, term.id),
    {
      resultsApproved: true,
      resultsApprovedAt: nowIso(),
      resultsApprovedBy: "",
      winnersCount: seats,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
  await writeMovement({
    termId: term.id,
    type: "election_approved",
    notes: `اعتماد نتائج الانتخابات — ${seats} عضو أصلي من ${ranked.length} مرشح`,
  });
  await logAuditEvent("board_election_approved", {
    targetId: term.id,
    termId: term.id,
    title: term.title || "",
    seats,
    candidates: ranked.length,
    riskLevel: "high",
  });
  return ranked;
}

export async function assignBoardPosition({ membership, role, effectiveDate = "", decisionRef = "" }) {
  if (!membership?.id) throw new Error("اختر العضوية أولاً.");
  if (!role) throw new Error("اختر المنصب.");
  const fromRole = membership.role || "";
  await updateDoc(doc(db, BOARD_MEMBERSHIPS_COLLECTION, membership.id), {
    role,
    roleStartDate: effectiveDate || membership.roleStartDate || membership.joinDate || "",
    updatedAt: serverTimestamp(),
  });
  await writeMovement({
    termId: membership.termId || "",
    type: "position_assigned",
    membershipId: membership.id,
    memberId: membership.memberId || "",
    memberName: membership.memberName || "",
    fromRole,
    toRole: role,
    effectiveDate: effectiveDate || "",
    decisionRef,
    notes: `تعيين ${membership.memberName || ""} في منصب ${role}`,
  });
  await logAuditEvent("board_position_assigned", {
    targetId: membership.id,
    termId: membership.termId || "",
    memberName: membership.memberName || "",
    fromRole,
    toRole: role,
  });
}

export async function endBoardMembership({ membership, endDate, endReason, decisionRef = "", notes = "" }) {
  if (!membership?.id) throw new Error("اختر العضوية أولاً.");
  if (!endDate) throw new Error("أدخل تاريخ انتهاء النشاط.");
  if (!endReason) throw new Error("اختر سبب انتهاء النشاط.");
  await updateDoc(doc(db, BOARD_MEMBERSHIPS_COLLECTION, membership.id), {
    status: "ended",
    endDate,
    endReason,
    decisionRef,
    notes: notes || membership.notes || "",
    updatedAt: serverTimestamp(),
  });
  await writeMovement({
    termId: membership.termId || "",
    type: "membership_ended",
    membershipId: membership.id,
    memberId: membership.memberId || "",
    memberName: membership.memberName || "",
    fromRole: membership.role || "",
    reason: endReason,
    effectiveDate: endDate,
    decisionRef,
    notes: notes || "",
  });
  await logAuditEvent("board_membership_ended", {
    targetId: membership.id,
    termId: membership.termId || "",
    memberName: membership.memberName || "",
    endReason,
    endDate,
    riskLevel: "medium",
  });
}

export async function escalateNextReserve({ term, endedMembership, candidates = [], memberships = [], escalationDate = "" }) {
  if (!term?.id) throw new Error("اختر الدورة أولاً.");
  if (!endedMembership?.id) throw new Error("اختر العضوية المنتهية أولاً.");
  const ranked = rankBoardCandidates(
    candidates.filter((c) => c.termId === term.id),
    Number(term.winnersCount || term.targetSeats || 11)
  );
  const activeMemberIds = memberships
    .filter((m) => m.termId === term.id && m.status === "active")
    .map((m) => m.memberId);
  const next = findNextReserveCandidate(ranked, activeMemberIds);
  if (!next) throw new Error("لا يوجد احتياطي مستحق للتصعيد.");
  const effectiveDate = escalationDate || endedMembership.endDate || term.startDate || "";
  const membershipRef = doc(collection(db, BOARD_MEMBERSHIPS_COLLECTION));
  const batch = writeBatch(db);
  batch.set(membershipRef, {
    termId: term.id,
    memberId: next.memberId,
    memberName: next.memberName,
    memberJobId: next.memberJobId || "",
    role: endedMembership.role || "عضو مجلس إدارة",
    roleOrder: endedMembership.roleOrder ?? 5,
    roleStartDate: effectiveDate,
    joinDate: effectiveDate,
    endDate: "",
    status: "active",
    joinMethod: "escalated",
    endReason: "",
    electionRank: next.rank,
    electionVotes: next.votes,
    replacementForMembershipId: endedMembership.id,
    escalationSourceMemberId: endedMembership.memberId || "",
    notes: `تصعيد تلقائي بدل ${endedMembership.memberName || ""}`,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(
    doc(db, BOARD_CANDIDATES_COLLECTION, next.id),
    { status: "won_original", updatedAt: serverTimestamp() },
    { merge: true }
  );
  await batch.commit();
  await writeMovement({
    termId: term.id,
    type: "member_escalated",
    membershipId: membershipRef.id,
    memberId: next.memberId,
    memberName: next.memberName,
    toRole: endedMembership.role || "عضو مجلس إدارة",
    reason: `تصعيد بدل ${endedMembership.memberName || ""} (${endedMembership.endReason || ""})`,
    effectiveDate,
    notes: `الترتيب ${next.rank} — ${next.votes} صوت`,
  });
  await logAuditEvent("board_member_escalated", {
    targetId: membershipRef.id,
    termId: term.id,
    memberName: next.memberName,
    votes: next.votes,
    rank: next.rank,
    riskLevel: "medium",
  });
  return { membershipId: membershipRef.id, candidate: next };
}

export async function saveBoardBenefit(benefit = {}) {
  const normalized = normalizeBoardBenefit(benefit);
  if (!normalized.termId) throw new Error("اختر الدورة.");
  if (!normalized.memberId) throw new Error("اختر العضو.");
  if (!normalized.benefitType) throw new Error("اختر نوع الميزة.");
  if (!normalized.benefitDate) throw new Error("أدخل تاريخ الميزة.");
  const payload = { ...normalized, updatedAt: serverTimestamp() };
  delete payload.id;
  let id = normalized.id;
  if (id) {
    await updateDoc(doc(db, BOARD_BENEFITS_COLLECTION, id), payload);
  } else {
    const ref = await addDoc(collection(db, BOARD_BENEFITS_COLLECTION), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    id = ref.id;
  }
  await writeMovement({
    termId: normalized.termId,
    type: "benefit_added",
    memberId: normalized.memberId,
    memberName: normalized.memberName,
    effectiveDate: normalized.benefitDate,
    notes: `${normalized.benefitType} — ${normalized.amount}`,
  });
  await logAuditEvent(id && normalized.id ? "board_benefit_updated" : "board_benefit_added", {
    targetId: id,
    termId: normalized.termId,
    memberName: normalized.memberName,
    benefitType: normalized.benefitType,
    amount: normalized.amount,
  });
  return id;
}

export async function closeTermWithBalance({ term, docs = [] }) {
  if (!term?.id) throw new Error("اختر الدورة أولاً.");
  const computed = computeTermClosingBalance(term, docs);
  await updateDoc(doc(db, BOARD_TERMS_COLLECTION, term.id), {
    status: "closed",
    closingBalance: computed.closing,
    updatedAt: serverTimestamp(),
  });
  await writeMovement({
    termId: term.id,
    type: "term_closed",
    notes: `إغلاق الدورة — الرصيد الختامي ${computed.closing}`,
  });
  await logAuditEvent("board_term_closed", {
    targetId: term.id,
    title: term.title || "",
    closingBalance: computed.closing,
    riskLevel: "medium",
  });
  return computed;
}

export async function archiveTermWithHistory({ term }) {
  if (!term?.id) throw new Error("اختر الدورة أولاً.");
  await updateDoc(doc(db, BOARD_TERMS_COLLECTION, term.id), {
    status: "archived",
    updatedAt: serverTimestamp(),
  });
  await writeMovement({ termId: term.id, type: "term_archived", notes: `أرشفة الدورة ${term.title || ""}` });
  await logAuditEvent("board_term_archived_full", { targetId: term.id, title: term.title || "" });
}

export async function carryBalanceToNewTerm({ fromTerm, toTermId, amount }) {
  if (!fromTerm?.id || !toTermId) throw new Error("حدد الدورتين.");
  const value = Number(amount ?? fromTerm.closingBalance ?? 0) || 0;
  const batch = writeBatch(db);
  batch.set(doc(db, BOARD_TERMS_COLLECTION, toTermId), {
    openingBalance: value,
    carriedFromTermId: fromTerm.id,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.set(doc(db, BOARD_TERMS_COLLECTION, fromTerm.id), {
    carriedToTermId: toTermId,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  await writeMovement({
    termId: toTermId,
    type: "balance_carried",
    notes: `ترحيل رصيد ${value} من ${fromTerm.title || fromTerm.id}`,
  });
  await logAuditEvent("board_balance_carried", {
    targetId: toTermId,
    fromTermId: fromTerm.id,
    amount: value,
    riskLevel: "medium",
  });
  return value;
}
