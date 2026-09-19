/* eslint-disable no-unused-vars */
/**
 * EventBookings — محرك الحجز والتذاكر وكشوف الحضور (النسخة المدمجة النهائية)
 *
 * ✅ نافذة اعتذار وإلغاء احترافية (Cancel Modal).
 * ✅ حقل "تاريخ الدفع" في نافذة الدفع لمرونة التحصيل.
 * ✅ استخراج تلقائي للبيانات من الرقم القومي (NID Parser).
 * ✅ خصومات وإشراف أعضاء المجلس وحساب التكلفة المزدوجة.
 * ✅ طباعة كشف حضور وطباعة تقرير مالي ذكي.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection, query, onSnapshot, doc, writeBatch,
  serverTimestamp, where, updateDoc, getDocs, addDoc
} from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";
import { useT } from "../../app/providers/ThemeProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import ArabicDatePicker from "../../ui/inputs/ArabicDatePicker";
import { PageHeader, StatusBadge, EmptyState, SearchBar, getModuleIcon } from "../../ui/enterprise";
import { getPrintBrandHeader, getPrintBrandStyles } from "../../utils/branding";
import { escapeHtml } from "../../utils/escapeHtml";
import { openPrintWindow } from "../../utils/print";
import {
  BOARD_MEMBERSHIP_ROLES,
  createBenefitLabel,
  formatEmployeeDate,
  getRetirementDate,
  isBoardMember,
  isEligibleForBenefit,
  isIndependentMember,
  isRetiredMember,
  sortMembersByAgeThenJobId,
} from "../../utils/memberBenefits";
import { sortBoardMembersUnified } from "../board/boardMembershipRules";
import {
  canExportSensitiveBookings,
  canManageBookings as resolveCanManageBookings,
  getBookingOwnerIds,
  getPrimaryBookingOwnerId,
  isOwnBooking,
  requireBookingManagementPermission,
  requireOwnBookingTarget,
  requireSensitiveBookingExportPermission,
} from "./bookingAuthorization";
import {
  Ticket, Users, CheckCircle2, AlertCircle, Search,
  CreditCard, Printer, Copy, X, Banknote, Smartphone, Receipt,
  ShieldAlert, Trash2, Plus, UserX, UserCheck, BarChart3,
  AlertTriangle, Award, Phone
} from "lucide-react";
import clsx from "clsx";

const getTodayISO = () => new Date().toISOString().split("T")[0];
const PENDING_TIMEOUT_DAYS = 3;
const DEVICE_EVENT_TYPE = "عرض أجهزة وموبايل";

// ── تحليل الرقم القومي ──
const toMillisSafe = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis() || 0;
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};
const toDateSafe = (value, fallback = new Date()) => {
  const millis = toMillisSafe(value);
  return millis > 0 ? new Date(millis) : fallback;
};
const parseNationalID = (nid) => {
  if (!nid || nid.length !== 14 || isNaN(nid)) return null;
  const century = nid[0] === "2" ? "19" : nid[0] === "3" ? "20" : null;
  if (!century) return null;
  const year = century + nid.slice(1, 3), month = nid.slice(3, 5), day = nid.slice(5, 7);
  const govCode = nid.slice(7, 9);
  const genderCode = parseInt(nid[12]);
  const dob = `${year}-${month}-${day}`;
  const gender = genderCode % 2 === 0 ? "أنثى" : "ذكر";
  const birthDate = new Date(dob), today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  const GOV_MAP = { "01": "القاهرة", "02": "الإسكندرية", "12": "الدقهلية", "21": "الجيزة" };
  return { dob, gender, age, gov: GOV_MAP[govCode] || `أخرى` };
};

// ── طباعة كشف الحضور ──
const printManifest = (event, bookings, authorize) => {
  if (typeof authorize !== "function" || authorize() !== true) return false;
  const win = openPrintWindow("event-manifest", "width=1100,height=850");
  if (!win) return false;
  const confirmed = bookings.filter(b => b.status === "confirmed")
    .sort((a, b) => String(a.memberId || "").localeCompare(String(b.memberId || ""), "ar", { numeric: true }));
  const totalPax = confirmed.reduce((s, b) => s + Number(b.totalPax || 1), 0);
  const totalRev = confirmed.reduce((s, b) => s + Number(b.totalCost || 0), 0);
  const supervisors = Array.isArray(event.supervisors) ? event.supervisors : [];

  const rows = confirmed.map((b, i) => `
    <tr>
      <td style="text-align:center;font-weight:900">${i + 1}</td>
      <td>
        <strong style="font-size:12px">${escapeHtml(b.memberName)}</strong>
        <div style="font-size:9px;color:#64748b;margin-top:2px">كود: ${escapeHtml(b.memberId)} &nbsp;|&nbsp; ${escapeHtml(b.memberPhone) || "—"}</div>
        ${b.boardDiscountType && b.boardDiscountType !== "0" ? `<span style="font-size:8px;background:#e0f2fe;color:#0284c7;padding:1px 5px;border-radius:4px;margin-top:2px;display:inline-block">إشراف مجلس</span>` : ""}
        ${b.companionsList?.length ? `
          <div style="margin-top:5px;padding:5px;background:#f8fafc;border-radius:4px;font-size:10px">
            <strong>المرافقون (${b.companionsList.length}):</strong><br>
            ${b.companionsList.map(c => `• ${escapeHtml(c.name)} (${escapeHtml(c.relation)})`).join("<br>")}
          </div>` : ""}
      </td>
      <td style="text-align:center;font-weight:900">${escapeHtml(b.totalPax)} فرد</td>
      <td style="text-align:center;font-weight:900;color:${Number(b.totalCost) > 0 ? "#059669" : "#64748b"}">${Number(b.totalCost).toLocaleString()} ج</td>
      <td style="text-align:center;font-size:9px">${escapeHtml(b.paymentSummary) || "مجاني"}</td>
      <td style="text-align:center;font-size:18px">☐</td>
    </tr>`).join("");

  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كشف حضور — ${escapeHtml(event.title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    @page{size:A4 landscape;margin:10mm 8mm 14mm}
    *{font-family:'Cairo',sans-serif;box-sizing:border-box;margin:0;padding:0;}
    html,body{width:100%;height:auto;}
    body{padding:16px;font-size:12px;color:#1e293b;}
    .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0;}
    .m{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;text-align:center;}
    .m .v{font-size:16px;font-weight:900;color:#4f46e5;}
    .m .l{font-size:9px;color:#64748b;font-weight:700;}
    table{width:100%;border-collapse:collapse;page-break-inside:auto;break-inside:auto;}
    th{background:#1e293b;color:#fff;padding:9px 6px;text-align:center;font-size:11px;}
    td{padding:8px 6px;border:1px solid #e2e8f0;vertical-align:top;overflow-wrap:anywhere;}
    tbody tr:nth-child(even){background:#f8fafc;}
    tfoot td{background:#eef2ff;font-weight:900;border-top:2px solid #4f46e5;}
    .sigs{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:36px;text-align:center;}
    .sig{border-top:2px dashed #cbd5e1;padding-top:8px;font-size:12px;font-weight:900;color:#475569;}
    @media print{body{padding:0}thead{display:table-header-group}tfoot{display:table-footer-group}tr,td,th{break-inside:avoid;page-break-inside:avoid}.brand-header,.meta,.sigs{break-inside:avoid;page-break-inside:avoid}}
    ${getPrintBrandStyles()}
  </style></head><body>
  ${getPrintBrandHeader({ reportTitle: `كشف حضور: ${event.title}`, reportMeta: `${event.type || ""} | التاريخ: ${event.date || "—"} | المكان: ${event.location || "—"}` })}
  <div class="meta">
    <div class="m"><div class="v">${confirmed.length}</div><div class="l">مشترك مؤكد</div></div>
    <div class="m"><div class="v">${totalPax}</div><div class="l">إجمالي الأفراد</div></div>
    <div class="m"><div class="v" style="color:#059669">${totalRev.toLocaleString()} ج</div><div class="l">إجمالي المحصل</div></div>
    <div class="m"><div class="v" style="font-size:12px">${supervisors.length ? supervisors.map(s => escapeHtml(s.name)).join("، ") : "—"}</div><div class="l">مشرفو الرحلة</div></div>
  </div>
  <table><thead><tr><th style="width:5%">#</th><th style="width:38%">المشترك والمرافقون</th><th style="width:8%">الأفراد</th><th style="width:10%">التكلفة</th><th style="width:24%">تفاصيل الدفع</th><th style="width:15%">توقيع الحضور</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="6" style="text-align:center;padding:30px;">لا يوجد مشتركون مؤكدون</td></tr>`}</tbody>
  <tfoot><tr><td colspan="2" style="text-align:center">الإجمالي</td><td style="text-align:center">${totalPax} فرد</td><td style="text-align:center;color:#059669">${totalRev.toLocaleString()} ج</td><td colspan="2"></td></tr></tfoot></table>
  <div class="sigs"><div class="sig">توقيع المشرف<div style="height:40px"></div></div><div class="sig">المراجعة<div style="height:40px"></div></div><div class="sig">يعتمد أمين الصندوق<div style="height:40px"></div></div></div>
  <script>window.onload=()=>setTimeout(()=>window.print(),500);</script></body></html>`);
  win.document.close();
  return true;
};

export default function EventBookings() {
  const T = useT();
  const { user, can } = useAuth();
  const canManageBookings = resolveCanManageBookings(can);
  const canExportBookings = canExportSensitiveBookings(can);
  const ownerIds = useMemo(() => getBookingOwnerIds(user), [user]);
  const canCreateBookings = canManageBookings || ownerIds.length > 0;
  const primaryOwnerId = useMemo(() => getPrimaryBookingOwnerId(user), [user]);
  const fallbackOwnMember = useMemo(() => primaryOwnerId ? ({
    id: user?.employeeId || primaryOwnerId,
    jobId: primaryOwnerId,
    employeeCode: user?.employeeCode || primaryOwnerId,
    name: user?.fullName || user?.displayName || "عضو",
    phone: user?.phone || "",
    email: user?.email || "",
    membershipStatus: user?.membershipStatus || user?.title || "",
  }) : null, [primaryOwnerId, user]);

  // بيانات
  const [events, setEvents] = useState([]);
  const [members, setMembers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  // حالة الحجز الجديد
  const [selectedEventId, setSelectedEventId] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [showRes, setShowRes] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [companionsList, setCompanionsList] = useState([]);
  const [boardDiscount, setBoardDiscount] = useState("0");
  // مشرفو الرحلة من مجلس الإدارة
  const [supMemberId, setSupMemberId] = useState("");
  const [supKind, setSupKind] = useState("amount");
  const [supValue, setSupValue] = useState("");

  // مودال الدفع ومودال الإلغاء
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentDate, setPaymentDate] = useState(getTodayISO());
  const [payments, setPayments] = useState({ cash: "", wallet: "", instapay: "", installment: "" });
  const [cancelModal, setCancelModal] = useState(null);
  const [benefitModal, setBenefitModal] = useState(null);
  const [benefitForm, setBenefitForm] = useState({ type: "جائزة مسابقة", amount: "", notes: "" });

  // فلاتر
  const [statusFilter, setStatusFilter] = useState("all");
  const [bookingSearch, setBookingSearch] = useState("");

  const showToast = useCallback((msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); }, []);

  useEffect(() => {
    const unsubEvents = onSnapshot(query(collection(db, "events"), where("date", ">=", getTodayISO())), snap => {
      const evs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      evs.sort((a, b) => a.date.localeCompare(b.date));
      setEvents(evs);
      setLoading(false);
    });
    let unsubMembers = () => {};
    if (canManageBookings) {
      unsubMembers = onSnapshot(query(collection(db, "employees")), snap => {
        setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    } else if (ownerIds.length > 0) {
      unsubMembers = onSnapshot(
        query(collection(db, "employees"), where("jobId", "in", ownerIds)),
        snap => {
          const scopedMembers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setMembers(scopedMembers.length > 0 ? scopedMembers : (fallbackOwnMember ? [fallbackOwnMember] : []));
        },
        () => setMembers(fallbackOwnMember ? [fallbackOwnMember] : [])
      );
    } else {
      setMembers([]);
    }
    return () => { unsubEvents(); unsubMembers(); };
  }, [canManageBookings, fallbackOwnMember, ownerIds]);

  useEffect(() => {
    if (!selectedEventId || (!canManageBookings && ownerIds.length === 0)) { setBookings([]); return undefined; }
    const scopedQuery = canManageBookings
      ? query(collection(db, "event_bookings"), where("eventId", "==", selectedEventId))
      : query(collection(db, "event_bookings"), where("memberId", "in", ownerIds));
    const unsubBookings = onSnapshot(scopedQuery, snap => {
      const bks = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(b => canManageBookings || b.eventId === selectedEventId);
      bks.sort((a, b) => {
        const order = { confirmed: 0, pending: 1, cancelled: 2 };
        const oa = order[a.status] ?? 3, ob = order[b.status] ?? 3;
        if (oa !== ob) return oa - ob;
        return toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt);
      });
      setBookings(bks);
    });
    return () => unsubBookings();
  }, [canManageBookings, ownerIds, selectedEventId]);

  const activeEvent = useMemo(() => events.find(e => e.id === selectedEventId) || null, [events, selectedEventId]);
  const memberIsBoard = useMemo(() => isBoardMember(selectedMember), [selectedMember]);
  const isIndependentSelected = useMemo(() => isIndependentMember(selectedMember), [selectedMember]);

  useEffect(() => { setBoardDiscount("0"); setCompanionsList([]); setPayments({ cash: "", wallet: "", instapay: "", installment: "" }); }, [selectedMember]);

  const addCompanion = () => {
    if (companionsList.length >= 5) return showToast("الحد الأقصى 5 مرافقين", "error");
    setCompanionsList(prev => [...prev, { id: Date.now(), name: "", relation: "", nid: "", phone: "", parsedInfo: null }]);
  };
  const removeCompanion = (id) => setCompanionsList(prev => prev.filter(c => c.id !== id));
  const updateCompanion = (id, field, value) => {
    setCompanionsList(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, [field]: value };
      if (field === "nid") updated.parsedInfo = parseNationalID(value);
      return updated;
    }));
  };

  const memberBasePrice = activeEvent?.isFree ? 0 : Number(activeEvent?.memberPrice || 0);
  const companionBasePrice = activeEvent?.isFree ? 0 : Number(activeEvent?.companionPrice || 0);
  const memberSupportValue = useMemo(() => {
    if (!selectedMember || !activeEvent || activeEvent.isFree || !isEligibleForBenefit(selectedMember, activeEvent.date || getTodayISO())) return 0;
    return Number(activeEvent.memberSupportValue || 0);
  }, [selectedMember, activeEvent]);

  const { memberCost, companionsCost, totalCost } = useMemo(() => {
    if (!activeEvent || !selectedMember) return { memberCost: 0, companionsCost: 0, totalCost: 0 };
    if (activeEvent.isDeviceOffer || activeEvent.type === DEVICE_EVENT_TYPE) {
      return { memberCost: Number(activeEvent.devicePrice || 0), companionsCost: 0, totalCost: Number(activeEvent.devicePrice || 0) };
    }
    let mCost = memberBasePrice;
    if (memberIsBoard && !activeEvent.isFree) {
      if (boardDiscount === "50") mCost = memberBasePrice * 0.5;
      if (boardDiscount === "100") mCost = 0;
    }
    const cCost = companionBasePrice * companionsList.length;
    return { memberCost: mCost, companionsCost: cCost, totalCost: mCost + cCost };
  }, [activeEvent, selectedMember, companionsList, memberIsBoard, boardDiscount, memberBasePrice, companionBasePrice]);

  const totalPaidInput = Number(payments.cash || 0) + Number(payments.wallet || 0) + Number(payments.instapay || 0) + Number(payments.installment || 0);
  const remainingToPay = totalCost - totalPaidInput;
  const isDeviceOffer = Boolean(activeEvent?.isDeviceOffer || activeEvent?.type === DEVICE_EVENT_TYPE);
  const installmentMonths = isDeviceOffer ? Math.max(1, Number(activeEvent?.installmentMonths || 1)) : 0;
  const installmentAmount = isDeviceOffer ? Number(activeEvent?.installmentAmount || (totalCost / installmentMonths)).toFixed(2) : "0";
  const buildInstallmentPlan = () => {
    if (!isDeviceOffer) return [];
    const start = activeEvent?.installmentStart || activeEvent?.date || getTodayISO();
    const baseAmount = Number(installmentAmount);
    return Array.from({ length: installmentMonths }, (_, index) => {
      const dueDate = new Date(`${start}T00:00:00`);
      dueDate.setMonth(dueDate.getMonth() + index);
      return {
        number: index + 1,
        dueDate: dueDate.toISOString().split("T")[0],
        amount: index === installmentMonths - 1 ? Number((totalCost - baseAmount * (installmentMonths - 1)).toFixed(2)) : baseAmount,
        status: "pending",
        paidAmount: 0,
      };
    });
  };

  const capacity = Number(activeEvent?.capacity || 1);
  const requestedPax = 1 + companionsList.length;
  const confirmedPax = canManageBookings
    ? bookings.filter(b => b.status === "confirmed").reduce((s, b) => s + Number(b.totalPax || 1), 0)
    : Number(activeEvent?.bookedCount || 0);
  const isOverCapacity = (confirmedPax + requestedPax) > capacity;

  const today = getTodayISO();
  const isBookingClosed = activeEvent && (today < activeEvent.bookingStart || today > activeEvent.bookingEnd);

  const filteredMembers = useMemo(() => {
    if (!searchQ || searchQ.length < 2) return [];
    const q = searchQ.toLowerCase();
    const bookedMemberIds = new Set(bookings.filter(b => b.status !== "cancelled").map(b => b.memberId?.toString()));
    return sortMembersByAgeThenJobId(
      members.filter(m => !bookedMemberIds.has(m.jobId?.toString()) && (m.name?.toLowerCase().includes(q) || m.jobId?.toString().includes(q)))
    ).slice(0, 5);
  }, [searchQ, members, bookings]);

  const buildBenefitPayload = useCallback((booking, benefitType, amount, notes = "") => ({
    memberId: booking.memberId,
    memberName: booking.memberName,
    membershipStatus: selectedMember?.membershipStatus || booking.membershipStatus || "",
    date: getTodayISO(),
    benefitType,
    amount: Number(amount || 0),
    notes,
    eventId: activeEvent?.id || booking.eventId,
    eventTitle: activeEvent?.title || booking.eventTitle,
    bookingId: booking.id,
    source: "activity_booking",
    status: "active",
    displayLabel: createBenefitLabel({ benefitType, eventTitle: activeEvent?.title || booking.eventTitle, notes }),
    createdAt: serverTimestamp(),
  }), [activeEvent, selectedMember]);

  const closeBenefitModal = () => {
    setBenefitModal(null);
    setBenefitForm({ type: "جائزة مسابقة", amount: "", notes: "" });
  };

  const saveManualBenefit = async () => {
    if (!requireBookingManagementPermission(can, (message) => showToast(message, "error"))) return;
    if (!benefitModal) return;
    if (!isEligibleForBenefit(benefitModal, benefitModal.benefitDate || getTodayISO())) {
      showToast("هذا العضو غير مستحق للدعم أو الميزة في هذا التاريخ.", "error");
      return;
    }

    try {
      const benefitRef = doc(collection(db, "member_benefits"));
      const batch = writeBatch(db);
      batch.set(benefitRef, {
        memberId: benefitModal.memberId,
        memberName: benefitModal.memberName,
        membershipStatus: benefitModal.membershipStatus || "",
        memberState: benefitModal.memberState || "",
        memberRetirementDate: benefitModal.memberRetirementDate || "",
        date: benefitModal.benefitDate || getTodayISO(),
        benefitType: benefitForm.type,
        amount: Number(benefitForm.amount || 0),
        notes: benefitForm.notes || "",
        eventId: benefitModal.eventId,
        eventTitle: benefitModal.eventTitle,
        bookingId: benefitModal.id,
        source: "manual_activity_benefit",
        status: "active",
        displayLabel: createBenefitLabel({ benefitType: benefitForm.type, eventTitle: benefitModal.eventTitle, notes: benefitForm.notes }),
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      showToast("تم تسجيل الميزة/الجائزة للعضو بنجاح");
      closeBenefitModal();
    } catch (error) {
      console.error(error);
      showToast("تعذر حفظ الميزة أو الجائزة", "error");
    }
  };

  // ── تسجيل الحجز ──
  const handleConfirmBooking = async (isPending = false) => {
    if (!activeEvent || !selectedMember) return;
    const targetMemberId = selectedMember.jobId || selectedMember.employeeCode || selectedMember.id || "";
    if (!canManageBookings && !requireOwnBookingTarget(user, targetMemberId, (message) => showToast(message, "error"))) return;
    if (isOverCapacity) return showToast("العدد المطلوب يتجاوز المقاعد المتاحة!", "error");
    if (isBookingClosed) return showToast("الحجز مغلق حالياً وفقاً للمواعيد المحددة", "error");

    const invalidCompanions = companionsList.some(c => !c.name?.trim() || !c.relation || c.nid?.length !== 14);
    if (invalidCompanions) return showToast("برجاء إكمال بيانات المرافقين (الاسم، الصلة، والرقم القومي 14 رقم)", "error");

    if (!isPending && !isDeviceOffer && !activeEvent.isFree && totalCost > 0 && remainingToPay !== 0) {
      return showToast("برجاء توزيع التكلفة على طرق الدفع بحيث يكون المتبقي صفراً.", "error");
    }
    if (!isPending && isDeviceOffer && totalPaidInput < 0) return showToast("قيمة الدفعة غير صحيحة", "error");

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const bookingRef = doc(collection(db, "event_bookings"));

      let paymentSummaryStr = "مُعلق (انتظار الدفع)";
      if (!isPending && !activeEvent.isFree && totalCost > 0) {
        const methods = [];
        if (payments.cash) methods.push(`نقدي:${payments.cash}`);
        if (payments.wallet) methods.push(`محفظة:${payments.wallet}`);
        if (payments.instapay) methods.push(`إنستا:${payments.instapay}`);
        if (payments.installment) methods.push(`قسط:${payments.installment}`);
        paymentSummaryStr = methods.join(" | ");
      }

      const installmentPlan = isDeviceOffer ? buildInstallmentPlan() : [];

      batch.set(bookingRef, {
        eventId: activeEvent.id, eventTitle: activeEvent.title,
        eventDate: activeEvent.date,
        memberId: selectedMember.jobId, memberName: selectedMember.name, memberPhone: selectedMember.phone || "",
        membershipStatus: selectedMember.membershipStatus || "",
        memberState: selectedMember.memberState || "",
        memberRetirementDate: selectedMember.retirementDate || "",
        companionsList: companionsList.map(({ id, parsedInfo, ...rest }) => rest),
        totalPax: requestedPax, totalCost: totalCost,
        isFree: activeEvent.isFree, boardDiscountType: boardDiscount,
        memberSupportValue: memberSupportValue,
        status: isPending ? "pending" : "confirmed",
        payments: isPending ? {} : payments,
        paymentDate: isPending ? null : paymentDate,
        paymentSummary: activeEvent.isFree ? "مجاني" : paymentSummaryStr,
        isDeviceOffer,
        deviceOffer: isDeviceOffer ? {
          category: activeEvent.deviceCategory || "",
          brand: activeEvent.deviceBrand || "",
          model: activeEvent.deviceModel || "",
          color: activeEvent.deviceColor || "",
          storage: activeEvent.deviceStorage || "",
          totalPrice: totalCost,
          interestFree: true,
          downPayment: 0,
        } : null,
        installmentPlan,
        installmentMonths: isDeviceOffer ? installmentMonths : 0,
        installmentAmount: isDeviceOffer ? Number(installmentAmount) : 0,
        amountPaid: isPending ? 0 : totalPaidInput,
        remainingBalance: isPending ? totalCost : Math.max(totalCost - totalPaidInput, 0),
        financingStatus: isDeviceOffer ? (totalPaidInput >= totalCost ? "paid" : "active") : "none",
        createdAt: serverTimestamp()
      });

      if (!isPending && memberSupportValue > 0 && isEligibleForBenefit(selectedMember, activeEvent.date || getTodayISO())) {
        batch.set(doc(collection(db, "member_benefits")), {
          memberId: selectedMember.jobId,
          memberName: selectedMember.name,
          membershipStatus: selectedMember.membershipStatus || "",
          memberState: selectedMember.memberState || "",
          memberRetirementDate: selectedMember.retirementDate || "",
          date: activeEvent.date || getTodayISO(),
          benefitType: "دعم فعالية",
          amount: Number(memberSupportValue || 0),
          notes: "دعم معتمد على مستوى العضو داخل الفعالية",
          eventId: activeEvent.id,
          eventTitle: activeEvent.title,
          bookingId: bookingRef.id,
          source: "activity_support",
          status: "active",
          displayLabel: createBenefitLabel({ benefitType: "دعم فعالية", eventTitle: activeEvent.title }),
          createdAt: serverTimestamp(),
        });
      }

      if (memberIsBoard && boardDiscount !== "0" && !activeEvent.isFree && !isPending) {
        const rewardAmount = memberBasePrice - memberCost;
        if (rewardAmount > 0) {
          batch.set(doc(collection(db, "member_benefits")), {
            memberId: selectedMember.jobId,
            memberName: selectedMember.name,
            membershipStatus: selectedMember.membershipStatus || "",
            memberState: selectedMember.memberState || "",
            memberRetirementDate: selectedMember.retirementDate || "",
            eventId: activeEvent.id,
            eventTitle: activeEvent.title,
            bookingId: bookingRef.id,
            date: activeEvent.date || getTodayISO(),
            benefitType: boardDiscount === "100" ? "إعفاء إشراف فعالية" : "خصم إشراف فعالية",
            amount: rewardAmount,
            notes: boardDiscount === "100" ? "إعفاء كامل للعضو القائم بالإشراف" : "خصم إشراف جزئي للعضو القائم بالإشراف",
            source: "board_supervision_discount",
            status: "active",
            displayLabel: createBenefitLabel({ benefitType: boardDiscount === "100" ? "إعفاء إشراف فعالية" : "خصم إشراف فعالية", eventTitle: activeEvent.title }),
            createdAt: serverTimestamp()
          });
        }
      }

      batch.update(doc(db, "events", activeEvent.id), { bookedCount: confirmedPax + (isPending ? 0 : requestedPax), updatedAt: serverTimestamp() });
      await batch.commit();

      showToast(isPending ? "تم الحجز المؤقت بنجاح (مهلة 3 أيام)" : "تم تأكيد الحجز وتسجيل الدفع بنجاح");
      setShowPaymentModal(false); setSelectedMember(null); setSearchQ(""); setCompanionsList([]); setBoardDiscount("0"); setPayments({ cash: "", wallet: "", instapay: "", installment: "" }); setPaymentDate(getTodayISO());
    } catch (err) { showToast("حدث خطأ أثناء الحجز", "error"); } finally { setSaving(false); }
  };

  // ── تنفيذ الإلغاء عبر المودال ──
  const executeCancelBooking = async () => {
    if (!requireBookingManagementPermission(can, (message) => showToast(message, "error"))) return;
    if (!cancelModal || !activeEvent) return;
    const { booking, isTimeout } = cancelModal;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "event_bookings", booking.id), { status: "cancelled", cancelReason: isTimeout ? "انتهاء المهلة الآلية" : "اعتذار المشترك", canceledAt: serverTimestamp() });
      if (booking.status === "confirmed") {
        batch.update(doc(db, "events", activeEvent.id), { bookedCount: Math.max(0, confirmedPax - Number(booking.totalPax || 1)), updatedAt: serverTimestamp() });
      }

      const benefitsSnap = await getDocs(query(collection(db, "member_benefits"), where("bookingId", "==", booking.id)));
      benefitsSnap.forEach((benefitDoc) => {
        batch.update(doc(db, "member_benefits", benefitDoc.id), {
          status: "cancelled",
          cancelledAt: serverTimestamp(),
          cancelReason: isTimeout ? "انتهاء المهلة الآلية" : "إلغاء الحجز",
        });
      });

      await batch.commit();
      showToast(isTimeout ? "تم الاستبعاد وإرجاع المقاعد" : "تم الإلغاء واعتذار العضو", "success");
      setCancelModal(null);
    } catch (e) { showToast("خطأ أثناء التنفيذ", "error"); }
  };

  const handleConfirmPending = async (booking) => {
    if (!requireBookingManagementPermission(can, (message) => showToast(message, "error"))) return;
    if (!window.confirm(`تأكيد حجز "${booking.memberName}"؟`)) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "event_bookings", booking.id), { status: "confirmed", confirmedAt: serverTimestamp(), paymentSummary: "مؤكد يدوياً" });
      batch.update(doc(db, "events", activeEvent.id), { bookedCount: confirmedPax + Number(booking.totalPax || 1) });

      if (Number(booking.memberSupportValue || 0) > 0 && isEligibleForBenefit(booking, booking.eventDate || getTodayISO())) {
        batch.set(doc(collection(db, "member_benefits")), {
          memberId: booking.memberId,
          memberName: booking.memberName,
          membershipStatus: booking.membershipStatus || "",
          memberState: booking.memberState || "",
          memberRetirementDate: booking.memberRetirementDate || "",
          date: booking.eventDate || getTodayISO(),
          benefitType: "دعم فعالية",
          amount: Number(booking.memberSupportValue || 0),
          notes: "دعم معتمد على مستوى العضو داخل الفعالية",
          eventId: booking.eventId,
          eventTitle: booking.eventTitle,
          bookingId: booking.id,
          source: "activity_support",
          status: "active",
          displayLabel: createBenefitLabel({ benefitType: "دعم فعالية", eventTitle: booking.eventTitle }),
          createdAt: serverTimestamp(),
        });
      }

      if (BOARD_MEMBERSHIP_ROLES.includes(String(booking.membershipStatus || "").trim()) && !activeEvent.isFree && booking.boardDiscountType && booking.boardDiscountType !== "0") {
        const rewardAmount = memberBasePrice - Number(booking.totalCost || 0) + (companionBasePrice * Number((booking.companionsList || []).length || 0));
        if (rewardAmount > 0) {
          batch.set(doc(collection(db, "member_benefits")), {
            memberId: booking.memberId,
            memberName: booking.memberName,
            membershipStatus: booking.membershipStatus || "",
            memberState: booking.memberState || "",
            memberRetirementDate: booking.memberRetirementDate || "",
            date: booking.eventDate || getTodayISO(),
            benefitType: booking.boardDiscountType === "100" ? "إعفاء إشراف فعالية" : "خصم إشراف فعالية",
            amount: rewardAmount,
            notes: booking.boardDiscountType === "100" ? "إعفاء كامل للعضو القائم بالإشراف" : "خصم إشراف جزئي للعضو القائم بالإشراف",
            eventId: booking.eventId,
            eventTitle: booking.eventTitle,
            bookingId: booking.id,
            source: "board_supervision_discount",
            status: "active",
            displayLabel: createBenefitLabel({ benefitType: booking.boardDiscountType === "100" ? "إعفاء إشراف فعالية" : "خصم إشراف فعالية", eventTitle: booking.eventTitle }),
            createdAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
      showToast("تم تأكيد الحجز");
    } catch (err) { showToast("خطأ في التأكيد", "error"); }
  };

  const copyPhones = () => {
    if (!requireSensitiveBookingExportPermission(can, (message) => showToast(message, "error"))) return;
    const phones = bookings.filter(b => b.status === "confirmed" && b.memberPhone).map(b => b.memberPhone).join(", ");
    if (!phones) return showToast("لا توجد أرقام", "error");
    navigator.clipboard.writeText(phones); showToast("تم نسخ الأرقام بنجاح");
  };

  // ── مشرفو الرحلة من مجلس الإدارة ──
  const isTripEvent = String(activeEvent?.type || "").includes("رحلة");
  const boardMembersList = useMemo(() => sortBoardMembersUnified(members.filter((m) => isBoardMember(m))), [members]);
  const eventSupervisors = useMemo(
    () => Array.isArray(activeEvent?.supervisors) ? activeEvent.supervisors : [],
    [activeEvent]
  );

  const addSupervisor = async () => {
    if (!requireBookingManagementPermission(can, (message) => showToast(message, "error"))) return;
    if (!activeEvent || !supMemberId) return showToast("اختر المشرف من مجلس الإدارة أولاً", "error");
    const member = boardMembersList.find((m) => String(m.jobId || m.id) === String(supMemberId));
    if (!member) return showToast("تعذر العثور على بيانات المشرف", "error");
    if (eventSupervisors.some((s) => String(s.memberId) === String(member.jobId || member.id))) {
      return showToast("هذا المشرف مسجل بالفعل", "error");
    }
    const basePrice = Number(activeEvent.memberPrice || 0);
    let benefitType = "دعم إشراف رحلة";
    let amount = Number(supValue || 0);
    let notes = `إشراف رحلة: ${activeEvent.title || ""}`;
    if (supKind === "discount") {
      const percent = Math.min(100, Math.max(0, Number(supValue || 0)));
      amount = Math.round((basePrice * percent) / 100);
      benefitType = "خصم إشراف فعالية";
      notes = `خصم إشراف ${percent}% — رحلة: ${activeEvent.title || ""}`;
    } else if (supKind === "exempt") {
      amount = basePrice;
      benefitType = "إعفاء إشراف فعالية";
      notes = `إعفاء كامل للمشرف — رحلة: ${activeEvent.title || ""}`;
    }
    if (amount <= 0 && supKind !== "exempt") return showToast("أدخل قيمة الدعم أو نسبة الخصم", "error");
    try {
      const supervisor = {
        memberId: member.jobId || member.id || "",
        name: member.name || "",
        phone: member.phone || "",
        kind: supKind,
        value: supKind === "amount" ? amount : Number(supValue || 0),
        benefitType,
        amount,
        addedAt: new Date().toISOString(),
      };
      await updateDoc(doc(db, "events", activeEvent.id), {
        supervisors: [...eventSupervisors, supervisor],
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, "member_benefits"), {
        memberId: supervisor.memberId,
        memberName: supervisor.name,
        membershipStatus: member.membershipStatus || "",
        memberState: member.memberState || "",
        memberRetirementDate: member.retirementDate || "",
        date: activeEvent.date || getTodayISO(),
        benefitType,
        amount,
        notes,
        eventId: activeEvent.id,
        eventTitle: activeEvent.title || "",
        bookingId: "",
        source: "trip_supervision",
        status: "active",
        displayLabel: createBenefitLabel({ benefitType, eventTitle: activeEvent.title, notes }),
        createdAt: serverTimestamp(),
      });
      setSupMemberId("");
      setSupValue("");
      showToast(`تم تسجيل ${member.name} مشرفاً (${benefitType}: ${amount.toLocaleString()} ج)`);
    } catch (e) {
      showToast("تعذر تسجيل المشرف", "error");
    }
  };

  const removeSupervisor = async (memberId) => {
    if (!requireBookingManagementPermission(can, (message) => showToast(message, "error"))) return;
    if (!activeEvent) return;
    if (!window.confirm("حذف المشرف من الرحلة؟ (المزايا المسجلة بملفه تبقى محفوظة)")) return;
    try {
      await updateDoc(doc(db, "events", activeEvent.id), {
        supervisors: eventSupervisors.filter((s) => String(s.memberId) !== String(memberId)),
        updatedAt: serverTimestamp(),
      });
      showToast("تم حذف المشرف من الرحلة");
    } catch {
      showToast("تعذر حذف المشرف", "error");
    }
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (bookingSearch.trim().length > 1) return b.memberName?.toLowerCase().includes(bookingSearch.toLowerCase()) || b.memberId?.toString().includes(bookingSearch);
      return true;
    });
  }, [bookings, statusFilter, bookingSearch]);

  const bookingKpis = useMemo(() => {
    const c = bookings.filter((b) => b.status === "confirmed");
    const p = bookings.filter((b) => b.status === "pending");
    const x = bookings.filter((b) => b.status === "cancelled");
    return {
      confirmed: c.length,
      pending: p.length,
      cancelled: x.length,
      revenue: c.reduce((s, b) => s + Number(b.totalCost || 0), 0),
      pax: c.reduce((s, b) => s + Number(b.totalPax || 1), 0),
    };
  }, [bookings]);

  useEffect(() => {
    if (canManageBookings || selectedMember || members.length === 0) return;
    const mine = members.find((member) => isOwnBooking(
      { memberId: member.jobId || member.employeeCode || member.id },
      ownerIds
    ));
    if (mine) {
      setSelectedMember(mine);
      setSearchQ(mine.name || "");
    }
  }, [canManageBookings, members, ownerIds, selectedMember]);

  if (loading) return <div className="p-20 text-center animate-pulse font-black text-slate-400">جاري التحميل...</div>;

  return (
    <div className={clsx("flex flex-col gap-4 max-w-7xl mx-auto pb-12", T.text)} dir="rtl">
      {toast && (
        <div className={clsx("fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3.5 rounded-2xl shadow-xl flex items-center gap-2 text-white font-bold text-xs animate-in fade-in slide-in-from-top-4", toast.type === "error" ? "bg-rose-600" : "bg-emerald-600")}>
          {toast.type === "error" ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />} {toast.msg}
        </div>
      )}

      {/* 🎯 نافذة الإلغاء والاعتذار */}
      {canManageBookings && cancelModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className={clsx("w-full max-w-sm p-6 rounded-3xl shadow-2xl border space-y-5 animate-in zoom-in-95", T.card)}>
            <div className="flex items-center gap-3 text-rose-600 border-b border-rose-100 pb-3">
              <div className="p-2.5 bg-rose-100 rounded-xl"><AlertTriangle size={20} /></div>
              <div><h2 className="font-black text-sm">{cancelModal.isTimeout ? "استبعاد الحجز المؤقت" : "اعتذار وإلغاء الحجز"}</h2><p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">إجراء غير قابل للتراجع</p></div>
            </div>
            <p className="text-xs font-bold leading-relaxed">
              سيتم إلغاء حجز المشترك <span className="font-black text-indigo-600">({cancelModal.booking.memberName})</span> وتحرير عدد <span className="font-black text-indigo-600">{cancelModal.booking.totalPax} مقعد</span>.
            </p>
            {!cancelModal.isTimeout && Number(cancelModal.booking.totalCost) > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl"><p className="text-[10px] font-black text-amber-700">ملاحظة هامة:</p><p className="text-[10px] font-bold text-amber-600 mt-1">يجب التوجه للخزينة لرد مبلغ <span className="font-black">({cancelModal.booking.totalCost} ج.م)</span> للمشترك.</p></div>
            )}
            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setCancelModal(null)} className={clsx("flex-1 py-2.5 rounded-xl font-bold text-xs border shadow-sm", T.btn)}>تراجع</button>
              <button onClick={executeCancelBooking} className="flex-1 py-2.5 rounded-xl font-black text-xs bg-rose-600 text-white hover:bg-rose-700 shadow-md active:scale-95 flex items-center justify-center gap-2"><Trash2 size={14} /> {cancelModal.isTimeout ? "استبعاد المشترك" : "تأكيد الاعتذار"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة الدفع ── */}
      {showPaymentModal && activeEvent && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className={clsx("w-full max-w-lg p-6 rounded-3xl shadow-2xl border space-y-5 animate-in zoom-in-95", T.card)}>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="font-black text-sm flex items-center gap-2 text-indigo-600"><CreditCard size={18} /> تفاصيل تحصيل الاشتراك</h2>
              <button onClick={() => setShowPaymentModal(false)} className="p-1.5 bg-slate-100 hover:bg-rose-100 text-slate-500 rounded-lg transition-colors"><X size={16} /></button>
            </div>
            <div className="relative z-[100]"><ArabicDatePicker label="تاريخ التحصيل والدفع" value={paymentDate} onChange={setPaymentDate} maxVal={getTodayISO()} /></div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <div><p className="text-[10px] font-black text-slate-400 uppercase">إجمالي التكلفة المطلوبة</p><p className="text-2xl font-black text-indigo-600">{totalCost.toLocaleString()} <span className="text-xs">ج.م</span></p></div>
              <div className="text-left"><p className="text-[10px] font-black text-slate-400 uppercase">المتبقي للتوزيع</p><p className={clsx("text-xl font-black", remainingToPay === 0 ? "text-emerald-500" : remainingToPay < 0 ? "text-rose-500" : "text-amber-500")}>{remainingToPay.toLocaleString()} <span className="text-xs">ج.م</span></p></div>
            </div>
            {isDeviceOffer && (
              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 space-y-1">
                <p className="text-[10px] font-black text-emerald-700">{activeEvent.deviceBrand} {activeEvent.deviceModel} {activeEvent.deviceStorage ? `• ${activeEvent.deviceStorage}` : ""}</p>
                <p className="text-[10px] font-bold text-emerald-600">خطة بلا فوائد أو مقدم: {installmentMonths} قسط × {Number(installmentAmount).toLocaleString()} ج.م</p>
                <p className="text-[9px] font-bold text-slate-500">المبلغ المسجل الآن: {totalPaidInput.toLocaleString()} ج.م • الرصيد: {Math.max(remainingToPay, 0).toLocaleString()} ج.م</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 relative z-10">
              <div className="space-y-1"><label className="text-[10px] font-black text-emerald-600 flex items-center gap-1"><Banknote size={12} /> دفع نقدي (للخزينة)</label><input type="number" value={payments.cash} onChange={e => setPayments({ ...payments, cash: e.target.value })} className={clsx("w-full px-3 py-2 rounded-xl border text-xs font-black outline-none focus:ring-2 focus:border-emerald-500", T.inp)} placeholder="0" /></div>
              <div className="space-y-1"><label className="text-[10px] font-black text-sky-600 flex items-center gap-1"><Smartphone size={12} /> محفظة إلكترونية</label><input type="number" value={payments.wallet} onChange={e => setPayments({ ...payments, wallet: e.target.value })} className={clsx("w-full px-3 py-2 rounded-xl border text-xs font-black outline-none focus:ring-2 focus:border-sky-500", T.inp)} placeholder="0" /></div>
              <div className="space-y-1"><label className="text-[10px] font-black text-purple-600 flex items-center gap-1"><Smartphone size={12} /> إنستا باي</label><input type="number" value={payments.instapay} onChange={e => setPayments({ ...payments, instapay: e.target.value })} className={clsx("w-full px-3 py-2 rounded-xl border text-xs font-black outline-none focus:ring-2 focus:border-purple-500", T.inp)} placeholder="0" /></div>
              <div className="space-y-1"><label className="text-[10px] font-black text-rose-600 flex items-center gap-1"><Receipt size={12} /> تقسيط (خصم راتب)</label><input type="number" value={payments.installment} onChange={e => setPayments({ ...payments, installment: e.target.value })} className={clsx("w-full px-3 py-2 rounded-xl border text-xs font-black outline-none focus:ring-2 focus:border-rose-500", T.inp)} placeholder="0" /></div>
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 mt-2">
              <button onClick={() => handleConfirmBooking(true)} disabled={saving} className="flex-[1] py-3 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl font-black text-xs shadow-sm active:scale-95 transition-all disabled:opacity-50">حجز مؤقت (3 أيام)</button>
              <button onClick={() => handleConfirmBooking(false)} disabled={saving || remainingToPay !== 0} className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"><CheckCircle2 size={16} /> اعتماد الدفع والتأكيد</button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="الحجز والتذاكر"
        hint="اختيار الفعالية وحجز المقاعد وتحصيل الاشتراكات"
        icon={getModuleIcon("/activities/bookings")}
        crumbs={[{ label: "الخدمات النقابية" }, { label: "الحجز والتذاكر" }]}
      />

      {/* ── رأس الصفحة واختيار الفعالية ── */}
      <div className="rounded-3xl border border-indigo-100 dark:border-indigo-900/40 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-l from-indigo-600 via-violet-600 to-indigo-700 p-5 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/15 rounded-2xl text-white backdrop-blur"><Ticket size={24} /></div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white">محرك الحجز وإصدار التذاكر</h1>
              <p className="text-[11px] font-bold mt-0.5 text-indigo-100">{activeEvent ? `${activeEvent.title} • ${activeEvent.date || ""}` : "اختر الفعالية للبدء في حجز المقاعد"}</p>
            </div>
          </div>
          <div className="w-full md:w-1/3">
            <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="w-full px-4 py-3 rounded-xl border-0 text-sm font-bold outline-none focus:ring-2 focus:ring-white/50 shadow-sm bg-white text-slate-800">
              <option value="">— اختر الفعالية —</option>
              {events.map(e => <option key={e.id} value={e.id}>{e.title} ({e.date})</option>)}
            </select>
          </div>
        </div>
        {activeEvent && (
          <div className={clsx("grid grid-cols-2 sm:grid-cols-5 gap-px bg-slate-100 dark:bg-slate-800", T.card)}>
            {[
              { label: "مؤكد", value: bookingKpis.confirmed, tone: "text-emerald-600" },
              { label: "معلق", value: bookingKpis.pending, tone: "text-amber-600" },
              { label: "ملغي", value: bookingKpis.cancelled, tone: "text-rose-500" },
              { label: "الأفراد", value: bookingKpis.pax, tone: "text-indigo-600" },
              { label: "المحصل ج.م", value: bookingKpis.revenue.toLocaleString(), tone: "text-teal-600" },
            ].map((k) => (
              <div key={k.label} className="bg-white dark:bg-slate-900 px-4 py-3 text-center">
                <div className="text-[10px] font-black text-slate-400">{k.label}</div>
                <div className={clsx("text-lg font-black mt-0.5", k.tone)}>{k.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeEvent && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-in fade-in duration-500">
          {/* ── ماكينة الحجز ── */}
          {canCreateBookings && <div className={clsx("lg:col-span-4 p-5 rounded-3xl border shadow-sm space-y-5 h-fit", T.card)}>
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm flex items-center gap-2 text-indigo-600"><Plus size={16} /> تسجيل مشترك ومرافقين</h3>
              <div className="mt-3 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                <div className="flex justify-between text-[10px] font-black mb-1"><span className="text-slate-500">المقاعد المتاحة للرصيد:</span><span className={isOverCapacity ? "text-rose-600" : "text-teal-600"}>{capacity - confirmedPax} من {capacity}</span></div>
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"><div className={clsx("h-full rounded-full transition-all", isOverCapacity ? "bg-rose-500" : "bg-indigo-500")} style={{ width: `${Math.min(100, (confirmedPax / capacity) * 100)}%` }} /></div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1 relative z-[100]">
                <label className="text-[10px] font-black text-slate-400 uppercase flex justify-between">1. ابحث عن العضو {isBookingClosed && <span className="text-rose-500 font-bold animate-pulse">التسجيل مغلق!</span>}</label>
                {!canManageBookings && selectedMember ? (
                  <div className="w-full px-4 py-2.5 rounded-xl border border-teal-200 bg-teal-50 text-xs font-black text-teal-800">
                    الحجز باسم: {selectedMember.name} ({selectedMember.jobId || ""})
                  </div>
                ) : (
                <div className="relative group">
                  <Search size={14} className="absolute right-3 top-3 text-slate-400" />
                  <input disabled={isBookingClosed || !canManageBookings} type="text" value={searchQ} onChange={e => { setSearchQ(e.target.value); setShowRes(true); if (canManageBookings) setSelectedMember(null); }} placeholder="الاسم أو الرقم الوظيفي..." className={clsx("w-full pr-9 pl-4 py-2.5 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:border-indigo-500", T.inp, (isBookingClosed || !canManageBookings) && "opacity-50 cursor-not-allowed")} />
                  {showRes && filteredMembers.length > 0 && (
                    <div className={clsx("absolute top-full mt-1 w-full border rounded-xl shadow-2xl overflow-hidden z-[200]", T.card)}>
                      {filteredMembers.map(emp => {
                        const retired = isRetiredMember(emp);
                        return (
                          <button key={emp.id} type="button" onMouseDown={() => { setSelectedMember(emp); setSearchQ(emp.name); setShowRes(false); }} className={clsx("w-full p-2.5 flex items-center justify-between hover:bg-indigo-50 transition-colors border-b last:border-0 text-right", retired && "bg-rose-50/60")}>
                            <div>
                              <p className={clsx("text-[11px] font-black", retired && "line-through text-rose-700")}>{emp.name}</p>
                              <p className="text-[9px] text-slate-400">{retired ? `معاش${getRetirementDate(emp) ? ` - ${formatEmployeeDate(getRetirementDate(emp))}` : ""}` : (emp.membershipStatus || emp.jobTitle)}</p>
                            </div>
                            <span className="text-[9px] font-bold bg-slate-100 px-2 py-0.5 rounded-lg">{emp.jobId}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                )}
              </div>

              {canManageBookings && memberIsBoard && !activeEvent.isFree && (
                <div className="p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-1.5 text-[11px] font-black text-sky-700 dark:text-sky-400"><Award size={14} /> إشراف مجلس الإدارة</div>
                  <select value={boardDiscount} onChange={e => setBoardDiscount(e.target.value)} className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none text-sky-800", T.sel)}>
                    <option value="0">دفع اشتراك العضو كاملاً (بدون خصم)</option>
                    <option value="50">إشراف بخصم 50% على اشتراك العضو</option>
                    <option value="100">إشراف واشتراك مجاني 100% للعضو</option>
                  </select>
                </div>
              )}

              {isTripEvent && canManageBookings && (
                <div className="p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-1.5 text-[11px] font-black text-violet-700 dark:text-violet-300"><Award size={14} /> مشرفو الرحلة من مجلس الإدارة ({eventSupervisors.length})</div>
                  <select value={supMemberId} onChange={e => setSupMemberId(e.target.value)} className={clsx("w-full px-3 py-2 rounded-lg border text-xs font-bold outline-none", T.sel)}>
                    <option value="">— اختر المشرف من المجلس —</option>
                    {boardMembersList.map((m) => <option key={m.id} value={m.jobId || m.id}>{m.name} ({m.jobId || ""})</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={supKind} onChange={e => setSupKind(e.target.value)} className={clsx("px-3 py-2 rounded-lg border text-xs font-bold outline-none", T.sel)}>
                      <option value="amount">دعم بمبلغ ثابت</option>
                      <option value="discount">خصم بنسبة %</option>
                      <option value="exempt">إعفاء كامل</option>
                    </select>
                    {supKind !== "exempt" && <input type="number" min="0" value={supValue} onChange={e => setSupValue(e.target.value)} placeholder={supKind === "discount" ? "النسبة %" : "المبلغ ج.م"} className={clsx("px-3 py-2 rounded-lg border text-xs font-bold outline-none", T.inp)} />}
                  </div>
                  <button onClick={addSupervisor} className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black text-xs transition-all">تسجيل المشرف + الميزة بملفه</button>
                  {eventSupervisors.length > 0 && (
                    <div className="space-y-1">
                      {eventSupervisors.map((s) => (
                        <div key={s.memberId} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5 border border-violet-100 dark:border-violet-800/40">
                          <span className="text-[10px] font-black">{s.name} <span className="text-violet-500 font-bold">• {s.benefitType} {Number(s.amount || 0).toLocaleString()} ج</span></span>
                          <button onClick={() => removeSupervisor(s.memberId)} className="text-rose-400 hover:text-rose-600"><X size={13} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedMember && (
                <div className="space-y-2 animate-in fade-in border-t border-slate-100 dark:border-slate-800 pt-3">
                  <div className="flex justify-between items-center"><label className="text-[10px] font-black text-slate-400 uppercase">2. تسجيل المرافقين ({companionsList.length})</label><button onClick={addCompanion} className="text-[9px] font-black flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-200 transition-colors"><Plus size={12} /> إضافة مرافق</button></div>
                  {companionsList.map((comp, idx) => (
                    <div key={comp.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 space-y-2 relative group">
                      <button onClick={() => removeCompanion(comp.id)} className="absolute top-2 right-2 p-1 text-rose-400 hover:text-rose-600 bg-white dark:bg-slate-700 rounded-md md:opacity-0 md:group-hover:opacity-100 transition-all"><X size={12} /></button>
                      <p className="text-[9px] font-black text-indigo-500 absolute top-2 left-2">مرافق #{idx + 1}</p>
                      <div className="grid grid-cols-2 gap-2 mt-4"><input type="text" placeholder="الاسم رباعي" value={comp.name} onChange={e => updateCompanion(comp.id, "name", e.target.value)} className={clsx("px-2 py-1.5 rounded-lg border text-[10px] font-bold outline-none", T.inp)} /><select value={comp.relation} onChange={e => updateCompanion(comp.id, "relation", e.target.value)} className={clsx("px-2 py-1.5 rounded-lg border text-[10px] font-bold outline-none", T.sel)}><option value="">- صلة القرابة -</option><option value="زوج/زوجة">زوج / زوجة</option><option value="ابن/ابنة">ابن / ابنة</option><option value="أب/أم">أب / أم</option><option value="أخ/أخت">أخ / أخت</option><option value="أخرى">أخرى</option></select></div>
                      <div className="grid grid-cols-1 gap-2"><input type="text" placeholder="رقم الهاتف (اختياري)" value={comp.phone} onChange={e => updateCompanion(comp.id, "phone", e.target.value)} className={clsx("px-2 py-1.5 rounded-lg border text-[10px] font-bold outline-none", T.inp)} /><input type="text" maxLength={14} placeholder="الرقم القومي (14 رقم)" value={comp.nid} onChange={e => updateCompanion(comp.id, "nid", e.target.value)} className={clsx("px-2 py-1.5 rounded-lg border text-[10px] font-bold outline-none", T.inp, comp.nid.length > 0 && comp.nid.length !== 14 && "border-rose-400")} /></div>
                      {comp.parsedInfo && (<div className="flex flex-wrap gap-1 mt-1"><StatusBadge tone="success">الميلاد: {comp.parsedInfo.dob}</StatusBadge><StatusBadge tone="success">{comp.parsedInfo.age} سنة</StatusBadge><StatusBadge tone="success">{comp.parsedInfo.gender}</StatusBadge><StatusBadge tone="neutral">{comp.parsedInfo.gov}</StatusBadge></div>)}
                    </div>
                  ))}
                </div>
              )}

              {selectedMember && (
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800 mt-4">
                  <div className="flex justify-between items-center text-[10px] font-bold mb-1"><span className="text-slate-500">حجز العضو:</span><span>{activeEvent.isFree ? "مجاني" : memberCost === 0 ? "مجاني (إشراف)" : `${memberCost.toLocaleString()} ج`}</span></div>
                  {Number(activeEvent.memberSupportValue || 0) > 0 && (
                    <div className="flex justify-between items-center text-[10px] font-bold mb-1">
                      <span className="text-slate-500">قيمة الدعم الخاص بالعضو:</span>
                      <span className={memberSupportValue > 0 ? "text-emerald-600" : "text-rose-600"}>
                        {memberSupportValue > 0 ? `${memberSupportValue.toLocaleString()} ج` : "غير مستحق"}
                      </span>
                    </div>
                  )}
                  {companionsList.length > 0 && <div className="flex justify-between items-center text-[10px] font-bold mb-2"><span className="text-slate-500">المرافقين ({companionsList.length}):</span><span>{activeEvent.isFree ? "مجاني" : `${companionsCost.toLocaleString()} ج`}</span></div>}
                  <div className="flex justify-between items-center pt-2 border-t border-indigo-200 dark:border-indigo-700"><span className="text-xs font-black text-indigo-700 dark:text-indigo-400">الإجمالي المطلوب:</span><span className="text-xl font-black text-indigo-700 dark:text-indigo-400">{totalCost.toLocaleString()} <span className="text-[10px]">ج.م</span></span></div>
                </div>
              )}

              {selectedMember && (isIndependentSelected || (activeEvent?.date && !isEligibleForBenefit(selectedMember, activeEvent.date))) && (
                <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-[10px] font-black">
                  {isIndependentSelected
                    ? "عضو النقابة المستقلة لا يستحق دعماً أو مزايا مرتبطة بالفعالية."
                    : `هذا العضو محال للمعاش، لذلك لا تُسجل له مزايا بتاريخ ${activeEvent.date}${getRetirementDate(selectedMember) ? ` بعد تاريخ المعاش ${formatEmployeeDate(getRetirementDate(selectedMember))}` : ""}.`}
                </div>
              )}

              <button onClick={() => activeEvent.isFree || totalCost === 0 ? handleConfirmBooking(false) : setShowPaymentModal(true)} disabled={!selectedMember || isOverCapacity || isBookingClosed} className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40">
                <Ticket size={18} /> {activeEvent.isFree || totalCost === 0 ? "تأكيد الحجز المجاني" : "المتابعة للتحصيل"}
              </button>
            </div>
          </div>}

          {/* ── 3. كشف المشتركين ── */}
          <div className={clsx("lg:col-span-8 p-5 rounded-3xl border shadow-sm flex flex-col min-h-[500px]", T.card)}>
            <div className="flex flex-wrap justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4 mb-4 gap-3">
              <h3 className="font-black text-sm flex items-center gap-2"><Users size={18} className="text-indigo-600" /> {canManageBookings ? "كشف المشتركين" : "حجوزاتي"} ({filteredBookings.filter(b => b.status !== "cancelled").length})</h3>
              <div className="flex items-center gap-2">
                {canExportBookings && (
                <button onClick={copyPhones} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-[10px] transition-all flex items-center gap-1.5 border shadow-sm">
                  <Copy size={14} /> استخراج الأرقام
                </button>
                )}
                {canExportBookings && <button onClick={() => printManifest(activeEvent, filteredBookings, () => requireSensitiveBookingExportPermission(can, (message) => showToast(message, "error")))} className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold text-[10px] transition-all flex items-center gap-1.5 border shadow-sm">
                  <Printer size={14} /> طباعة الكشف
                </button>}
              </div>
            </div>

            <div className="mb-3">
              <SearchBar value={bookingSearch} onChange={setBookingSearch} placeholder="بحث باسم المشترك أو الكود...">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={clsx("border rounded-xl px-3 py-2 text-[11px] font-bold outline-none", T.sel)}>
                  <option value="all">كل الحالات</option>
                  <option value="confirmed">مؤكد</option>
                  <option value="pending">معلق</option>
                  <option value="cancelled">ملغي</option>
                </select>
              </SearchBar>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50/80 dark:bg-slate-800/50 border-b">
                  <tr>{["المشترك الأساسي والمرافقين", "العدد", "التكلفة", "طرق الدفع", "الحالة", "إجراء"].map((h, i) => <th key={i} className="p-3 text-slate-500 font-black">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                  {filteredBookings.length === 0 ? (
                    <tr><td colSpan={6}><div className="p-4"><EmptyState title="لا يوجد مشتركون مطابقون للبحث" hint="جرّب تغيير البحث أو حالة الحجز" /></div></td></tr>
                  ) : filteredBookings.map((b) => {
                    const isPending = b.status === "pending";
                    const bookingDate = toDateSafe(b.createdAt);
                    const daysSinceBooking = Math.floor((new Date() - bookingDate) / (1000 * 60 * 60 * 24));
                    const isTimeout = isPending && daysSinceBooking >= PENDING_TIMEOUT_DAYS;

                    return (
                      <tr key={b.id} className={clsx("transition-colors group", b.status === "cancelled" ? "opacity-50 bg-slate-50/30" : isTimeout ? "bg-rose-50/50 dark:bg-rose-900/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/30")}>
                        <td className="p-3">
                          <p className={clsx("font-black max-w-[250px]", b.status === "cancelled" && "line-through")}>
                            {b.memberName}
                            {b.boardDiscountType && b.boardDiscountType !== "0" && <span className="mr-1"><StatusBadge tone="info">إشراف</StatusBadge></span>}
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 mt-0.5">كود: {b.memberId} {b.memberPhone && `| 📱 ${b.memberPhone}`}</p>
                          {b.companionsList?.length > 0 && (
                            <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700">
                              {b.companionsList.map((c, i) => <p key={i} className="text-[9px] font-bold text-indigo-500 mb-0.5 truncate max-w-[250px]">- {c.name} ({c.relation})</p>)}
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-black text-indigo-600">{b.totalPax} أفراد</td>
                        <td className="p-3 font-black text-rose-600">{Number(b.totalCost).toLocaleString()} ج</td>
                        <td className="p-3 text-[9px] font-bold text-slate-500 max-w-[150px]">{b.paymentSummary || "مجاني"}</td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            <StatusBadge tone={b.status === "cancelled" ? "danger" : isPending ? "warning" : "success"}>
                              {b.status === "cancelled" ? "ملغي" : isPending ? "معلق (الدفع)" : "مؤكد"}
                            </StatusBadge>
                            {isTimeout && <span className="text-[8px] font-black text-rose-500 animate-pulse flex items-center gap-0.5"><AlertCircle size={10} /> تجاوز 3 أيام</span>}
                          </div>
                        </td>
                        <td className="p-3 text-left">
                          {canManageBookings && b.status !== "cancelled" && (
                            <div className="flex justify-end gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              {isPending && (
                                <>
                                  <button onClick={() => handleConfirmPending(b)} className="p-1.5 text-emerald-500 bg-emerald-50 hover:bg-emerald-500 hover:text-white rounded-lg transition-colors" title="تأكيد الحجز"><UserCheck size={14} /></button>
                                  <button onClick={() => setCancelModal({ booking: b, isTimeout: true })} className="p-1.5 text-amber-500 bg-amber-50 hover:bg-amber-500 hover:text-white rounded-lg transition-colors" title="استبعاد لانتهاء المهلة"><UserX size={14} /></button>
                                </>
                              )}
                              <button onClick={() => setCancelModal({ booking: b, isTimeout: false })} className="p-1.5 text-rose-500 bg-rose-50 hover:bg-rose-500 hover:text-white rounded-lg transition-colors" title="اعتذار واسترداد"><Trash2 size={14} /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
