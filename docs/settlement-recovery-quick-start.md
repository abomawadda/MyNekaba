# 🚀 دليل الاسترجاع السريع (Quick Start Guide)

## 📌 الخطوات السريعة

### 1️⃣ استرجاع تسوية معتمدة واحدة

```javascript
import { recoverSingleSettlement } from './settlementRecovery';

// الاستخدام الأساسي
const result = await recoverSingleSettlement('check_12345');

// مع تفاصيل كاملة
const result = await recoverSingleSettlement('check_12345', {
  reason: 'خطأ في حساب المصروفات',
  userId: 'user_001',
  userName: 'أحمد محمد'
});

// معالجة النتيجة
if (result.success) {
  console.log('✅ تم الاسترجاع');
  console.log('الموظف:', result.details.party);
  console.log('تاريخ التسوية الأصلي:', result.details.settlementDate);
  console.log('المبلغ المصروف:', result.details.spent);
} else {
  console.error('❌', result.message);
}
```

**الحقول المتوفرة في الاستجابة:**
```javascript
{
  success: true/false,
  message: "رسالة عملية واضحة",
  details: {
    settlementId: "معرف الشيك",
    party: "اسم الموظف/الجهة",
    settlementDate: "تاريخ الاعتماد الأصلي",
    wasSettled: true,
    returnMode: "carry_forward|cash_return|bank_deposit",
    spent: 15000,
    returned: 5000,
    deletedBankDepositId: "معرف الإيداع إن وجد"
  }
}
```

---

### 2️⃣ حذف مسودة (Draft) بدون اعتماد

```javascript
import { discardDraft } from './settlementRecovery';

const result = await discardDraft('check_draft_456', {
  userId: 'user_001',
  userName: 'فاطمة علي'
});

if (result.success) {
  console.log(`تم حذف مسودة بـ ${result.details.expensesCount} فاتورة`);
}
```

---

### 3️⃣ استرجاع تسوية مجمعة (عدة شيكات)

```javascript
import { recoverBatchSettlement } from './settlementRecovery';

const result = await recoverBatchSettlement(
  'group_20260509',        // معرف المجموعة
  'check_001',             // معرف الشيك الرئيسي
  ['check_001', 'check_002', 'check_003'],  // جميع الشيكات
  {
    reason: 'تصحيح خطأ في التجميع',
    userId: 'user_002',
    userName: 'محمود حسن'
  }
);

if (result.success) {
  console.log(`✅ تم استرجاع ${result.details.recovered.length} شيك`);
  console.log(`❌ فشل: ${result.details.failed.length}`);
  result.details.recovered.forEach(check => {
    console.log(`  - ${check.party} (${check.date})`);
  });
}
```

---

### 4️⃣ الحصول على تقرير شامل

```javascript
import { getSettlementReport } from './settlementRecovery';

// تقرير شامل
const report = await getSettlementReport({
  fromDate: '2026-01-01',
  toDate: '2026-05-31',
  employeeId: 'emp_123'  // اختياري
});

console.log('📊 ملخص التقرير:');
console.log('  تسويات معتمدة:', report.summary.settledCount);
console.log('  مسودات محفوظة:', report.summary.draftCount);
console.log('  غير مسوى:', report.summary.unsettledCount);
console.log('  إجمالي المصروف:', report.amounts.totalSettled);

// الوصول لكل تسوية
report.settlements.settled.forEach(s => {
  console.log(`  - ${s.party}: ${s.spent} (${s.returnMode})`);
});
```

---

### 5️⃣ البحث والتحقق

```javascript
import { 
  findSettlement,
  validateSettlement,
  findAllDrafts,
  getEmployeeSettlementHistory
} from './settlementRecovery';

// البحث عن تسوية
const settlement = await findSettlement('check_123');

// التحقق من صحة البيانات
const validation = await validateSettlement('check_456');
if (!validation.valid) {
  validation.errors.forEach(err => console.error(err));
  validation.warnings.forEach(warn => console.warn(warn));
}

// الحصول على جميع المسودات
const drafts = await findAllDrafts();
console.log(`عدد المسودات: ${drafts.length}`);

// سجل موظف شامل
const history = await getEmployeeSettlementHistory('emp_789');
console.log(`معتمد: ${history.summary.totalSettled}`);
console.log(`مسودات: ${history.summary.totalDrafts}`);
console.log(`غير مسوى: ${history.summary.totalUnsettled}`);
```

---

## 🎯 حالات الاستخدام العملية

### حالة 1: تصحيح خطأ في التسوية المعتمدة

```javascript
// 1. التحقق أولاً
const validation = await validateSettlement('check_123');
if (!validation.valid) {
  console.error('مشاكل:', validation.errors);
  return;
}

// 2. استرجاع التسوية
const recovery = await recoverSingleSettlement('check_123', {
  reason: 'خطأ في عدد الفواتير - تم إضافة فاتورة مستبعدة',
  userId: getCurrentUserId(),
  userName: getCurrentUserName()
});

// 3. التحقق من النجاح
if (recovery.success) {
  // إعادة إنشاء التسوية من الصفر
  console.log('✅ جاهزة لإعادة التسوية');
} else {
  console.error('فشل الاسترجاع:', recovery.message);
}
```

### حالة 2: تنظيف المسودات القديمة

```javascript
// الحصول على جميع المسودات
const drafts = await findAllDrafts();

// تصفية المسودات الأقدم من شهر
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const oldDrafts = drafts.filter(d => 
  new Date(d.date) < thirtyDaysAgo
);

console.log(`وجدت ${oldDrafts.length} مسودات قديمة`);

// حذف المسودات
for (const draft of oldDrafts) {
  const result = await discardDraft(draft.id);
  console.log(`${draft.id}: ${result.success ? '✅' : '❌'}`);
}
```

### حالة 3: مراجعة التسويات لموظف معين

```javascript
const employeeId = 'emp_456';

// الحصول على السجل الكامل
const history = await getEmployeeSettlementHistory(employeeId);

console.log(`📊 سجل الموظف ${employeeId}`);
console.log(`معتمد: ${history.summary.totalSettled}`);
console.log(`مسودات: ${history.summary.totalDrafts}`);
console.log(`غير مسوى: ${history.summary.totalUnsettled}`);

// عرض التفاصيل
console.log('\n✅ التسويات المعتمدة:');
history.settled.forEach(s => {
  console.log(`  - ${s.settlementDate}: ${s.settlementSpent || 0}`);
});

console.log('\n📋 المسودات:');
history.drafts.forEach(d => {
  const total = (d.settlementExpenses || [])
    .reduce((sum, e) => sum + e.amount, 0);
  console.log(`  - ${d.date}: ${total} (${d.settlementExpenses.length} فواتير)`);
});

console.log('\n⏳ غير مسوى:');
history.unsettled.forEach(u => {
  console.log(`  - ${u.date}: ${u.amount || u.advanceAmountBase}`);
});
```

---

## 📋 قائمة التحقق قبل الاسترجاع

- [ ] التأكد من معرف التسوية الصحيح
- [ ] التحقق من أن التسوية معتمدة فعلاً (`isSettled = true`)
- [ ] توثيق سبب الاسترجاع بوضوح
- [ ] مراجعة المبالغ المتعلقة (المصروف والمرتجع)
- [ ] التحقق من وجود إيداع بنكي متعلق
- [ ] في حالة التسوية المجمعة: التأكد من جميع معرفات الشيكات

---

## ⚠️ أخطاء شائعة وحلولها

| الخطأ | السبب | الحل |
|------|------|-----|
| "التسوية غير موجودة" | معرف خاطئ | تحقق من معرف الشيك في قاعدة البيانات |
| "التسوية ليست معتمدة" | محاولة استرجاع مسودة | استخدم `discardDraft` بدلاً من `recoverSingleSettlement` |
| "خطأ في الإيداع البنكي" | مشاكل في حذف العملية | تحقق من معرف الإيداع المرتبط |
| "حذف مجموعة جزئي" | فشل بعض الشيكات | راجع قائمة `failed` في الاستجابة |

---

## 🔐 أفضل الممارسات الأمنية

1. **التسجيل**: جميع العمليات تُسجل في `audit_logs`
2. **المصادقة**: تأكد من معرفة المستخدم قبل الاسترجاع
3. **التوثيق**: وضح سبب الاسترجاع دائماً
4. **المراجعة**: قم بمراجعة التقرير بعد الاسترجاع
5. **النسخ الاحتياطية**: احتفظ بنسخ من البيانات الأصلية

---

## 📞 الدعم والمساعدة

في حالة الأخطاء:
1. راجع `audit_logs` للعمليات السابقة
2. تحقق من `settlementRecovery.validateSettlement()` 
3. تحقق من الاتصال بـ Firestore
4. راجع رسائل الخطأ في console

---

## 📚 وثائق إضافية

- [settlement-operations-guide.md](./settlement-operations-guide.md) - دليل العمليات الشامل
- [settlementRecovery.js](./settlementRecovery.js) - كود المكتبة الكامل
- [settlementRecoveryExamples.jsx](./settlementRecoveryExamples.jsx) - أمثلة عملية
