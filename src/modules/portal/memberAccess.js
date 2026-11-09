import { isAssemblyMember } from "../../utils/memberBenefits.js";

/**
 * Single source of truth for what a logged-in member may do from the portal.
 * The account is the gateway: it must be active, linked to a member record,
 * and that record must be an active general-assembly member to book or request services.
 */
export function resolveMemberAccess({ user, employee, employeeLoaded = true } = {}) {
  if (!user) return { canBook: false, badge: "غير مسجل", reason: "سجّل الدخول للاستفادة من الخدمات." };

  if (user.accountStatus && user.accountStatus !== "active") {
    return {
      canBook: false,
      badge: "الحساب قيد المراجعة",
      reason: "حسابك قيد المراجعة من إدارة النقابة. سيتاح الحجز وطلب الخدمات فور تفعيله.",
    };
  }

  if (!employeeLoaded) return { canBook: false, badge: "جارٍ التحقق...", reason: "جارٍ التحقق من بيانات العضوية." };

  if (!employee) {
    return {
      canBook: false,
      badge: "غير مرتبط بسجل عضو",
      reason: "حسابك غير مرتبط بسجل عضو في النقابة. تواصل مع الإدارة لربط الحساب بكودك الوظيفي.",
    };
  }

  if (!isAssemblyMember(employee)) {
    return {
      canBook: false,
      badge: employee.membershipStatus || "عضوية غير فعالة",
      reason: "الحجز وطلب الخدمات متاح لأعضاء الجمعية العمومية الفعالين فقط. راجع إدارة النقابة لتحديث حالة عضويتك.",
    };
  }

  return { canBook: true, badge: "عضو جمعية عمومية", reason: "" };
}
