/**
 * نظام استرجاع/استرداد التسويات (Settlement Recovery System)
 * 
 * يوفر هذا الملف مجموعة من الدوال لاسترجاع التسويات المسواة والمسودات
 * وإعادتها إلى قائمة الشيكات الغير مسواة
 * 
 * @module settlementRecovery
 */

import { doc, setDoc, writeBatch, collection, query, where, getDocs, getDoc } from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";
import { logAuditEvent } from "../../utils/auditLog";
import { buildSettlementResetPayload, commitInChunks } from "./settlementUtils";

/**
 * ============================================================================
 * 🔍 دوال الاستعلام والبحث
 * ============================================================================
 */

/**
 * البحث عن تسوية معينة
 * @param {string} settlementId - معرف الشيك/التسوية
 * @returns {Promise<Object|null>} بيانات التسوية أو null
 */
export async function findSettlement(settlementId) {
  try {
    const docRef = doc(db, "issued_checks", settlementId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() };
  } catch (error) {
    console.error("Error finding settlement:", error);
    return null;
  }
}

/**
 * البحث عن جميع التسويات المعتمدة لموظف معين
 * @param {string} employeeId - معرف الموظف
 * @returns {Promise<Array>} قائمة التسويات المعتمدة
 */
export async function findSettledByEmployee(employeeId) {
  try {
    const q = query(
      collection(db, "issued_checks"),
      where("employeeId", "==", employeeId),
      where("isSettled", "==", true)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error finding settlements by employee:", error);
    return [];
  }
}

/**
 * البحث عن جميع المسودات المحفوظة
 * @returns {Promise<Array>} قائمة المسودات
 */
export async function findAllDrafts() {
  try {
    const q = query(
      collection(db, "issued_checks"),
      where("hasDraftSettlement", "==", true),
      where("isSettled", "==", false)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error finding drafts:", error);
    return [];
  }
}

/**
 * البحث عن جميع التسويات المجمعة لموظف معين
 * @param {string} employeeId - معرف الموظف
 * @returns {Promise<Array>} قائمة التسويات المجمعة
 */
export async function findBatchSettlementsByEmployee(employeeId) {
  try {
    const q = query(
      collection(db, "issued_checks"),
      where("employeeId", "==", employeeId),
      where("settlementGroupCount", ">=", 2)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error finding batch settlements:", error);
    return [];
  }
}

/**
 * ============================================================================
 * 🎁 مزايا الجوائز النقدية المرتبطة بالتسويات
 * ============================================================================
 */

/**
 * حذف مزايا الجوائز النقدية المرتبطة بتسويات لم تعد معتمدة.
 * القاعدة: سجلات الجوائز موجودة ⟺ التسوية معتمدة بهذه الفواتير.
 */
export async function deletePrizeBenefitsForSettlements(settlementIds = []) {
  const ids = [...new Set((settlementIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  for (const settlementId of ids) {
    const snap = await getDocs(query(
      collection(db, "member_benefits"),
      where("source", "==", "settlement_prize"),
      where("settlementId", "==", settlementId)
    ));
    if (snap.empty) continue;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(doc(db, "member_benefits", d.id)));
    await batch.commit();
  }
}

/**
 * البحث عن عمليات الإيداع البنكي المتعلقة بتسوية
 * @param {string} settlementId - معرف التسوية
 * @returns {Promise<Array>} قائمة عمليات الإيداع
 */
export async function findRelatedBankDeposits(settlementId) {
  try {
    const q = query(
      collection(db, "transactions"),
      where("linkedCheckId", "==", settlementId),
      where("type", "==", "deposit")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error finding bank deposits:", error);
    return [];
  }
}

/**
 * ============================================================================
 * 🔄 دوال الاسترجاع والاسترداد
 * ============================================================================
 */

/**
 * استرجاع/استرداد تسوية معتمدة واحدة
 * تعيد الشيك إلى قائمة الشيكات الغير مسواة
 * 
 * @param {string} settlementId - معرف التسوية
 * @param {Object} options - خيارات العملية
 * @param {string} options.reason - سبب الاسترجاع
 * @param {string} options.userId - معرف المستخدم الذي أجرى العملية
 * @param {string} options.userName - اسم المستخدم
 * @returns {Promise<Object>} نتيجة العملية {success, message, details}
 */
export async function recoverSingleSettlement(settlementId, options = {}) {
  const { reason = "استرجاع يدوي", userId = "", userName = "" } = options;

  try {
    // 1️⃣ البحث عن التسوية
    const settlement = await findSettlement(settlementId);
    if (!settlement) {
      return {
        success: false,
        message: `لم يتم العثور على التسوية برقم ${settlementId}`,
        details: null
      };
    }

    if (!settlement.isSettled) {
      return {
        success: false,
        message: `التسوية برقم ${settlementId} ليست معتمدة أصلاً`,
        details: null
      };
    }

    // 2️⃣ التحضير للاسترجاع
    const batch = writeBatch(db);
    const originalData = { ...settlement };
    const recoveryDetails = {
      settlementId,
      party: settlement.employeeName || settlement.party || "",
      settlementDate: settlement.settlementDate || "",
      wasSettled: true,
      returnMode: settlement.returnMode || "carry_forward",
      spent: settlement.settlementSpent || 0,
      returned: settlement.settlementReturned || 0,
      recoveryReason: reason,
      recoveryTime: new Date().toISOString()
    };

    // 3️⃣ مسح بيانات التسوية (حمولة موحدة)
    const resetSettlementData = {
      ...buildSettlementResetPayload(settlement.type),
      // الحفاظ على البيانات الأساسية
      id: settlement.id,
      type: settlement.type,
      date: settlement.date,
      checkNum: settlement.checkNum || settlement.checkNo,
      amount: settlement.advanceAmountBase || settlement.amount,
      employeeId: settlement.employeeId,
      employeeName: settlement.employeeName,
      party: settlement.party,
      state: settlement.state || "posted",
      settlement_mode: settlement.settlement_mode || settlement.settlementMode,
    };

    batch.set(doc(db, "issued_checks", settlementId), resetSettlementData, { merge: true });

    // 4️⃣ حذف عملية الإيداع البنكي إن وجدت
    if (settlement.bankDepositTransactionId) {
      batch.delete(doc(db, "transactions", settlement.bankDepositTransactionId));
      recoveryDetails.deletedBankDepositId = settlement.bankDepositTransactionId;
    }
    if (settlement.cashReturnTransactionId) {
      batch.delete(doc(db, "transactions", settlement.cashReturnTransactionId));
      recoveryDetails.deletedCashReturnId = settlement.cashReturnTransactionId;
    }

    // 5️⃣ تنفيذ العملية
    await batch.commit();

    // 5️⃣➕ حذف مزايا الجوائز المرتبطة — التسوية لم تعد معتمدة
    await deletePrizeBenefitsForSettlements([settlementId]);

    // 6️⃣ تسجيل الحدث
    await logAuditEvent("settlement_recovered", {
      transactionId: settlementId,
      party: recoveryDetails.party,
      originalSettlementDate: originalData.settlementDate,
      originalSpent: originalData.settlementSpent,
      originalReturned: originalData.settlementReturned,
      originalReturnMode: originalData.returnMode,
      deletedBankDepositId: settlement.bankDepositTransactionId || "",
      deletedCashReturnId: settlement.cashReturnTransactionId || "",
      reason: reason,
      userId,
      userName,
      riskLevel: "high",
      before: originalData,
      after: resetSettlementData
    });

    return {
      success: true,
      message: `تم استرجاع التسوية برقم ${settlementId} بنجاح`,
      details: recoveryDetails
    };
  } catch (error) {
    console.error("Error recovering settlement:", error);
    return {
      success: false,
      message: `حدث خطأ أثناء استرجاع التسوية: ${error.message}`,
      details: null
    };
  }
}

/**
 * استرجاع تسوية مجمعة (عدة شيكات)
 * 
 * @param {string} settlementGroupId - معرف مجموعة التسوية
 * @param {string} leaderId - معرف الشيك الرئيسي
 * @param {Array} memberIds - قائمة معرفات الشيكات في المجموعة
 * @param {Object} options - خيارات العملية
 * @returns {Promise<Object>} نتيجة العملية
 */
export async function recoverBatchSettlement(settlementGroupId, leaderId, memberIds = [], options = {}) {
  const { reason = "استرجاع تسوية مجمعة", userId = "", userName = "" } = options;

  try {
    const recoverOps = [];
    const recoveredChecks = [];
    const failedChecks = [];
    const deletedDeposits = [];
    const deletedCashReturns = [];

    // استرجاع كل شيك في المجموعة
    for (const memberId of memberIds) {
      try {
        const settlement = await findSettlement(memberId);
        if (!settlement) {
          failedChecks.push({ id: memberId, reason: "لم يتم العثور على الشيك" });
          continue;
        }

        // مسح بيانات التسوية (حمولة موحدة)
        recoverOps.push({
          type: "set",
          ref: doc(db, "issued_checks", memberId),
          data: buildSettlementResetPayload(settlement.type),
          merge: true,
        });

        // حذف الإيداعات البنكية
        if (settlement.bankDepositTransactionId) {
          recoverOps.push({ type: "delete", ref: doc(db, "transactions", settlement.bankDepositTransactionId) });
          deletedDeposits.push(settlement.bankDepositTransactionId);
        }
        if (settlement.cashReturnTransactionId) {
          recoverOps.push({ type: "delete", ref: doc(db, "transactions", settlement.cashReturnTransactionId) });
          deletedCashReturns.push(settlement.cashReturnTransactionId);
        }

        recoveredChecks.push({
          id: memberId,
          party: settlement.employeeName || settlement.party,
          date: settlement.date
        });
      } catch (error) {
        failedChecks.push({ id: memberId, reason: error.message });
      }
    }

    await commitInChunks(db, recoverOps);

    await deletePrizeBenefitsForSettlements(memberIds);

    // تسجيل الحدث
    await logAuditEvent("settlement_batch_recovered", {
      settlementGroupId,
      leaderId,
      recoveredCount: recoveredChecks.length,
      failedCount: failedChecks.length,
      memberIds: memberIds.join(","),
      deletedBankDeposits: deletedDeposits.join(","),
      deletedCashReturns: deletedCashReturns.join(","),
      reason,
      userId,
      userName,
      riskLevel: "high"
    });

    return {
      success: failedChecks.length === 0,
      message: failedChecks.length === 0
        ? `تم استرجاع ${recoveredChecks.length} شيك من المجموعة`
        : `تم استرجاع ${recoveredChecks.length} شيك مع فشل ${failedChecks.length}`,
      details: {
        groupId: settlementGroupId,
        recovered: recoveredChecks,
        failed: failedChecks,
        deletedDeposits,
        deletedCashReturns,
      }
    };
  } catch (error) {
    console.error("Error recovering batch settlement:", error);
    return {
      success: false,
      message: `حدث خطأ أثناء استرجاع التسوية المجمعة: ${error.message}`,
      details: null
    };
  }
}

/**
 * حذف مسودة تسوية (بدون اعتماد)
 * 
 * @param {string} draftId - معرف المسودة
 * @param {Object} options - خيارات العملية
 * @returns {Promise<Object>} نتيجة العملية
 */
export async function discardDraft(draftId, options = {}) {
  const { userId = "", userName = "" } = options;

  try {
    const settlement = await findSettlement(draftId);
    if (!settlement) {
      return {
        success: false,
        message: `لم يتم العثور على المسودة برقم ${draftId}`,
        details: null
      };
    }

    if (!settlement.hasDraftSettlement) {
      return {
        success: false,
        message: `هذا الشيك ليس له مسودة محفوظة`,
        details: null
      };
    }

    // مسح المسودة فقط
    await setDoc(doc(db, "issued_checks", draftId), {
      hasDraftSettlement: false,
      settlementExpenses: [],
      collectedSubscriptions: 0,
      settlementDate: "",
    }, { merge: true });

    await deletePrizeBenefitsForSettlements([draftId]);

    // تسجيل الحدث
    await logAuditEvent("settlement_draft_discarded", {
      transactionId: draftId,
      party: settlement.employeeName || settlement.party || "",
      userId,
      userName
    });

    return {
      success: true,
      message: `تم حذف مسودة التسوية برقم ${draftId}`,
      details: {
        draftId,
        expensesCount: settlement.settlementExpenses?.length || 0
      }
    };
  } catch (error) {
    console.error("Error discarding draft:", error);
    return {
      success: false,
      message: `حدث خطأ أثناء حذف المسودة: ${error.message}`,
      details: null
    };
  }
}

/**
 * ============================================================================
 * 📊 دوال التقارير والإحصائيات
 * ============================================================================
 */

/**
 * الحصول على تقرير شامل عن التسويات
 * 
 * @param {Object} options - خيارات التقرير
 * @param {string} options.fromDate - من تاريخ (YYYY-MM-DD)
 * @param {string} options.toDate - إلى تاريخ (YYYY-MM-DD)
 * @param {string} options.employeeId - معرف الموظف (اختياري)
 * @returns {Promise<Object>} بيانات التقرير
 */
export async function getSettlementReport(options = {}) {
  const { fromDate = "", toDate = "", employeeId = "" } = options;

  try {
    let q = query(collection(db, "issued_checks"));

    if (employeeId) {
      q = query(
        collection(db, "issued_checks"),
        where("employeeId", "==", employeeId)
      );
    }

    const snapshot = await getDocs(q);
    const allSettlements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // تصفية حسب التواريخ
    const filteredSettlements = allSettlements.filter(s => {
      const settlementDate = s.settlementDate || s.date || "";
      if (fromDate && settlementDate < fromDate) return false;
      if (toDate && settlementDate > toDate) return false;
      return true;
    });

    // حساب الإحصائيات
    const settled = filteredSettlements.filter(s => s.isSettled);
    const drafts = filteredSettlements.filter(s => s.hasDraftSettlement && !s.isSettled);
    const unsettled = filteredSettlements.filter(s => !s.isSettled && !s.hasDraftSettlement);
    const batches = filteredSettlements.filter(s => (s.settlementGroupCount || 0) >= 2);

    const totalSettled = settled.reduce((sum, s) => sum + Number(s.settlementSpent || 0), 0);
    const totalDrafts = drafts.reduce((sum, s) => {
      const expenses = (s.settlementExpenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);
      return sum + expenses;
    }, 0);
    const totalUnsettled = unsettled.reduce((sum, s) => sum + Number(s.amount || s.advanceAmountBase || 0), 0);

    return {
      success: true,
      summary: {
        reportDate: new Date().toISOString(),
        period: { from: fromDate, to: toDate },
        employeeId: employeeId || "الكل",
        totalChecks: filteredSettlements.length,
        settledCount: settled.length,
        draftCount: drafts.length,
        unsettledCount: unsettled.length,
        batchCount: batches.length,
      },
      amounts: {
        totalSettled,
        totalDrafts,
        totalUnsettled,
        grandTotal: totalSettled + totalDrafts + totalUnsettled
      },
      settlements: {
        settled: settled.map(s => ({
          id: s.id,
          party: s.employeeName || s.party,
          date: s.settlementDate,
          spent: s.settlementSpent,
          returned: s.settlementReturned,
          returnMode: s.returnMode
        })),
        drafts: drafts.map(d => ({
          id: d.id,
          party: d.employeeName || d.party,
          date: d.date,
          expensesCount: (d.settlementExpenses || []).length,
          totalExpenses: (d.settlementExpenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0)
        })),
        unsettled: unsettled.map(u => ({
          id: u.id,
          party: u.employeeName || u.party,
          date: u.date,
          amount: u.amount || u.advanceAmountBase
        }))
      }
    };
  } catch (error) {
    console.error("Error generating settlement report:", error);
    return {
      success: false,
      message: `حدث خطأ أثناء إنشاء التقرير: ${error.message}`,
      summary: null
    };
  }
}

/**
 * ============================================================================
 * 🔐 دوال التحقق والتشخيص
 * ============================================================================
 */

/**
 * التحقق من سلامة بيانات التسوية
 * 
 * @param {string} settlementId - معرف التسوية
 * @returns {Promise<Object>} نتائج التحقق
 */
export async function validateSettlement(settlementId) {
  try {
    const settlement = await findSettlement(settlementId);
    if (!settlement) {
      return { valid: false, errors: ["التسوية غير موجودة"] };
    }

    const errors = [];
    const warnings = [];

    // التحقق من التناسق
    if (settlement.isSettled && !settlement.settlementDate) {
      errors.push("تسوية معتمدة بدون تاريخ اعتماد");
    }

    if (settlement.hasDraftSettlement && settlement.isSettled) {
      warnings.push("الشيك معتمد وعليه مسودة قديمة");
    }

    if (settlement.settlementGroupCount > 0 && settlement.settlementGroupMemberIds?.length === 0) {
      errors.push("مجموعة تسوية بدون أعضاء");
    }

    if (settlement.bankDepositTransactionId && !settlement.settlementDate) {
      errors.push("إيداع بنكي بدون تسوية معتمدة");
    }

    if (settlement.settlementSpent > 0 && (!settlement.settlementExpenses || settlement.settlementExpenses.length === 0)) {
      warnings.push("مبلغ مصروف بدون فواتير");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      settlement: {
        id: settlement.id,
        party: settlement.employeeName || settlement.party,
        status: settlement.isSettled ? "معتمد" : (settlement.hasDraftSettlement ? "مسودة" : "غير مسوى"),
        date: settlement.date,
        settlementDate: settlement.settlementDate,
        spent: settlement.settlementSpent,
        returned: settlement.settlementReturned
      }
    };
  } catch (error) {
    console.error("Error validating settlement:", error);
    return {
      valid: false,
      errors: [`خطأ في التحقق: ${error.message}`]
    };
  }
}

/**
 * ============================================================================
 * 📋 دوال البحث المتقدمة
 * ============================================================================
 */

/**
 * البحث عن جميع التسويات المرتبطة بموظف
 * مع تفاصيل كاملة عن حالتها
 * 
 * @param {string} employeeId - معرف الموظف
 * @returns {Promise<Object>} بيانات شاملة
 */
export async function getEmployeeSettlementHistory(employeeId) {
  try {
    const q = query(
      collection(db, "issued_checks"),
      where("employeeId", "==", employeeId)
    );
    const snapshot = await getDocs(q);
    const settlements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // تنظيم حسب الحالة
    const settled = settlements.filter(s => s.isSettled).sort((a, b) =>
      new Date(b.settlementDate) - new Date(a.settlementDate)
    );
    const drafts = settlements.filter(s => s.hasDraftSettlement && !s.isSettled);
    const unsettled = settlements.filter(s => !s.isSettled && !s.hasDraftSettlement);

    return {
      employeeId,
      summary: {
        totalSettled: settled.length,
        totalDrafts: drafts.length,
        totalUnsettled: unsettled.length,
        totalSettlements: settlements.length,
        totalAmountSettled: settled.reduce((sum, s) => sum + Number(s.settlementSpent || 0), 0),
        totalAmountReturned: settled.reduce((sum, s) => sum + Number(s.settlementReturned || 0), 0),
      },
      settled,
      drafts,
      unsettled
    };
  } catch (error) {
    console.error("Error getting employee settlement history:", error);
    return { employeeId, error: error.message };
  }
}
