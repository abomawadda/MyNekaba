# 📖 ملخص نظام إدارة وتتبع عمليات التسوية (Settlement)

## 🎯 نظرة سريعة

تم إنشاء نظام شامل لتتبع جميع عمليات التسوية واسترجاعها. يتضمن:

✅ **الوثائق:**
- `settlement-operations-guide.md` - دليل شامل عن بنية البيانات والعمليات
- `settlement-recovery-quick-start.md` - إرشادات سريعة للاستخدام
- `settlement-recovery-integration.md` - كيفية دمج الأداة في الواجهة

✅ **الأدوات:**
- `settlementRecovery.js` - مكتبة دوال الاسترجاع الكاملة
- `settlementRecoveryExamples.jsx` - أمثلة عملية وواجهة React

---

## 🗂️ الملفات المُنشأة

### 1. وثائق (docs/)

| الملف | الوصف |
|------|-------|
| `settlement-operations-guide.md` | دليل العمليات الشامل - شرح البنية والحقول والسيناريوهات |
| `settlement-recovery-quick-start.md` | دليل سريع - أمثلة عملية لكل حالة استخدام |
| `settlement-recovery-integration.md` | دليل التكامل - كيفية دمج الأداة في SettlementTab |

### 2. أدوات (src/modules/settlements/)

| الملف | الوصف |
|------|-------|
| `settlementRecovery.js` | مكتبة كاملة: استعلامات، استرجاع، تقارير، تحقق |
| `settlementRecoveryExamples.jsx` | أمثلة عملية + نموذج React + سكريبت تنفيذي |

---

## 💡 أهم الميزات

### 1️⃣ تتبع شامل للعمليات

كل عملية تسوية يتم تسجيلها في `audit_logs`:

```javascript
{
  action: "settlement_finalized|draft_saved|updated|deleted|recovered",
  transactionId: "معرف الشيك",
  party: "اسم الموظف",
  userId: "معرف المستخدم",
  userName: "اسم المستخدم",
  before: {...}, // البيانات قبل التعديل
  after: {...},  // البيانات بعد التعديل
  createdAt: timestamp
}
```

### 2️⃣ استرجاع التسويات

**استرجاع تسوية معتمدة واحدة:**
```javascript
await recoverSingleSettlement('check_123', {
  reason: 'خطأ في المبلغ',
  userId: 'user_001',
  userName: 'أحمد محمد'
});
```

**استرجاع تسوية مجمعة (عدة شيكات):**
```javascript
await recoverBatchSettlement('group_123', 'lead_check', 
  ['check_1', 'check_2', 'check_3'], 
  { reason: 'تصحيح التجميع' }
);
```

**حذف مسودة:**
```javascript
await discardDraft('draft_check_123', {
  userId: 'user_001'
});
```

### 3️⃣ استعلامات وتقارير

```javascript
// الحصول على سجل موظف شامل
const history = await getEmployeeSettlementHistory('emp_123');

// تقرير معتمد للفترة الزمنية
const report = await getSettlementReport({
  fromDate: '2026-01-01',
  toDate: '2026-05-31'
});

// التحقق من صحة التسوية
const validation = await validateSettlement('check_456');
```

### 4️⃣ التحكم في المسودات

```javascript
// الحصول على جميع المسودات
const drafts = await findAllDrafts();

// حذف مسودة
await discardDraft('draft_id');
```

---

## 📊 حالات البيانات

### قبل التسوية
```javascript
{
  isSettled: false,
  hasDraftSettlement: false,
  amount: 20000,
  state: "posted"
}
```

### مسودة محفوظة
```javascript
{
  isSettled: false,
  hasDraftSettlement: true,
  settlementExpenses: [{...}, {...}],
  settlementDate: "" // فارغ
}
```

### معتمد نهائي
```javascript
{
  isSettled: true,
  settlementDate: "2026-05-09",
  settlementExpenses: [{...}],
  settlementSpent: 15000,
  settlementReturned: 5000,
  returnMode: "carry_forward|cash_return|bank_deposit|settled"
}
```

### مسترجع (بعد الاسترجاع)
```javascript
{
  isSettled: false,
  hasDraftSettlement: false,
  settlementExpenses: [],
  settlementDate: "",
  // جميع بيانات التسوية تُمسح
}
```

---

## 🔄 عملية الاسترجاع خطوة بخطوة

### عند استدعاء `recoverSingleSettlement`:

1. **البحث عن التسوية** ✓
   - التحقق من وجود التسوية
   - التحقق من أنها معتمدة

2. **حفظ البيانات الأصلية** ✓
   - لأغراض التدقيق والنسخ الاحتياطية

3. **مسح بيانات التسوية** ✓
   - `isSettled = false`
   - `settlementDate = ""`
   - `settlementExpenses = []`
   - جميع حقول التسوية الأخرى

4. **حذف العمليات المرتبطة** ✓
   - حذف عملية الإيداع البنكي إن وجدت
   - الحفاظ على البيانات الأساسية للشيك

5. **تسجيل الحدث** ✓
   - في `audit_logs` مع كل التفاصيل

6. **العودة إلى الواجهة** ✓
   - إظهار الشيك في قائمة التسويات المفتوحة

---

## 🔐 الحماية والأمان

### تسجيل تلقائي
- كل عملية تُسجل مع معرف المستخدم واسمه
- البيانات قبل وبعد التعديل محفوظة

### التحقق من الصحة
```javascript
const validation = await validateSettlement('check_123');
if (!validation.valid) {
  validation.errors.forEach(err => console.error(err));
}
```

### توثيق الأسباب
- كل استرجاع يجب أن يكون له سبب موثق
- السبب يُحفظ في `audit_logs`

---

## 📈 أمثلة العمليات الشائعة

### مثال 1: تصحيح خطأ في التسوية

```javascript
// 1. التحقق من التسوية
const validation = await validateSettlement('check_123');
if (!validation.valid) {
  console.error(validation.errors);
  return;
}

// 2. استرجاع التسوية
const recovery = await recoverSingleSettlement('check_123', {
  reason: 'خطأ في إدراج الفواتير - يجب إعادة التسوية',
  userId: 'user_admin',
  userName: 'مدير النظام'
});

if (recovery.success) {
  console.log('✅ تم الاسترجاع:', recovery.details);
  // الآن يمكن إعادة تسوية الشيك من الصفر
}
```

### مثال 2: تنظيف المسودات القديمة

```javascript
const drafts = await findAllDrafts();
const oldDrafts = drafts.filter(d => {
  const createdDate = new Date(d.date);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return createdDate < thirtyDaysAgo;
});

for (const draft of oldDrafts) {
  await discardDraft(draft.id);
}
console.log(`تم حذف ${oldDrafts.length} مسودات قديمة`);
```

### مثال 3: الحصول على تقرير شامل

```javascript
const report = await getSettlementReport({
  fromDate: '2026-01-01',
  toDate: '2026-05-31'
});

console.log('📊 إجمالي التقرير:');
console.log(`  - معتمد: ${report.summary.settledCount}`);
console.log(`  - مسودات: ${report.summary.draftCount}`);
console.log(`  - غير مسوى: ${report.summary.unsettledCount}`);
console.log(`  - المبلغ: ${report.amounts.totalSettled}`);
```

---

## 🚀 كيفية البدء

### الخطوة 1: فهم البنية
اقرأ `settlement-operations-guide.md` لفهم:
- جداول البيانات وحقولها
- الحالات المختلفة للتسوية
- السيناريوهات المعقدة

### الخطوة 2: التعلم السريع
اتبع `settlement-recovery-quick-start.md` لـ:
- أمثلة عملية مباشرة
- حالات الاستخدام الشائعة
- قائمة التحقق قبل الاسترجاع

### الخطوة 3: الدمج في الواجهة
استخدم `settlement-recovery-integration.md` لـ:
- إضافة أزرار الاسترجاع
- بناء نوافذ التأكيد
- ربط الأحداث

### الخطوة 4: الاستخدام المباشر
```javascript
import { recoverSingleSettlement } from './settlementRecovery';

// استخدم الدالة مباشرة
const result = await recoverSingleSettlement('check_id');
```

---

## 📚 القائمة الكاملة للدوال

### دوال الاستعلام
- `findSettlement(settlementId)` - البحث عن تسوية معينة
- `findSettledByEmployee(employeeId)` - جميع التسويات المعتمدة لموظف
- `findAllDrafts()` - جميع المسودات
- `findBatchSettlementsByEmployee(employeeId)` - التسويات المجمعة
- `findRelatedBankDeposits(settlementId)` - الإيداعات البنكية

### دوال الاسترجاع
- `recoverSingleSettlement(settlementId, options)` - استرجاع واحد
- `recoverBatchSettlement(groupId, leaderId, memberIds, options)` - استرجاع مجموعة
- `discardDraft(draftId, options)` - حذف مسودة

### دوال التقارير
- `getSettlementReport(options)` - تقرير شامل
- `getEmployeeSettlementHistory(employeeId)` - سجل موظف

### دوال التحقق
- `validateSettlement(settlementId)` - التحقق من الصحة

---

## ⚡ نصائح الأداء

1. **استخدم الاستعلامات المحددة:**
   ```javascript
   // بدلاً من جلب الكل
   const settlements = await findSettledByEmployee('emp_123');
   ```

2. **الفرز والتصفية محلياً:**
   ```javascript
   const settled = settlements
     .filter(s => s.settlementDate >= '2026-01-01')
     .sort((a, b) => new Date(b.settlementDate) - new Date(a.settlementDate));
   ```

3. **التخزين المؤقت:**
   ```javascript
   const cache = new Map();
   async function getCached(id) {
     if (cache.has(id)) return cache.get(id);
     const data = await findSettlement(id);
     cache.set(id, data);
     return data;
   }
   ```

---

## 🐛 استكشاف الأخطاء

| المشكلة | السبب المحتمل | الحل |
|--------|--------------|-----|
| "التسوية غير موجودة" | معرف خاطئ أو محذوف | تحقق من معرف الشيك |
| "لا يمكن الاسترجاع - ليست معتمدة" | محاولة استرجاع مسودة | استخدم `discardDraft` بدلاً من `recover` |
| "خطأ في الإيداع البنكي" | قاعدة بيانات متعارضة | تحقق من `bankDepositTransactionId` |
| العملية طويلة جداً | عدد كبير من الشيكات | استخدم `batch` للعمليات الكبيرة |

---

## 📞 الدعم

في حالة الأسئلة:
1. راجع الوثائق ذات الصلة
2. تحقق من `audit_logs` للعمليات السابقة
3. استخدم `validateSettlement()` للتشخيص
4. راجع console للأخطاء التفصيلية

---

## 📋 الملفات المرجعية

```
NekabaAPP-main/
├── docs/
│   ├── settlement-operations-guide.md        ← دليل العمليات الشامل
│   ├── settlement-recovery-quick-start.md    ← دليل سريع
│   └── settlement-recovery-integration.md    ← دليل التكامل
│
├── src/modules/settlements/
│   ├── SettlementTab.jsx                    ← الواجهة الأساسية
│   ├── settlementRecovery.js                ← مكتبة الاسترجاع
│   └── settlementRecoveryExamples.jsx       ← الأمثلة والواجهات
│
└── src/utils/
    └── auditLog.js                          ← تسجيل التدقيق
```

---

**تم الانتهاء من إنشاء نظام إدارة وتتبع التسويات الشامل ✅**

جميع الملفات جاهزة للاستخدام الفوري. ابدأ بقراءة `settlement-recovery-quick-start.md` للبدء السريع! 🚀
