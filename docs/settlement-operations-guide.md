# دليل تتبع وإدارة عمليات التسوية (Settlement)

## 📋 نظرة عامة

يوفر نظام NekabaAPP نظام تسوية شامل للتعامل مع السلف والشيكات والفاعليات. يتم تتبع جميع العمليات من خلال عدة آليات:

### 1. **سجل التدقيق (Audit Log)**
جميع العمليات على التسويات يتم تسجيلها في جدول `audit_logs`:

```
مجموعة: audit_logs (Firebase Firestore)
```

#### أنواع العمليات المسجلة:
- `settlement_finalized` - تسوية معتمدة نهائياً
- `settlement_draft_saved` - حفظ مؤقت للتسوية
- `settlement_updated` - تحديث تسوية معتمدة
- `settlement_deleted` - حذف تسوية معتمدة

#### حقول التسجيل الأساسية:
```javascript
{
  action: "settlement_finalized|draft_saved|updated|deleted",
  userId: "معرف المستخدم",
  userName: "اسم المستخدم",
  role: "دور المستخدم",
  transactionId: "معرف الشيك/العهدة",
  party: "اسم صاحب العهدة (الموظف)",
  settlementDate: "تاريخ اعتماد التسوية",
  spent: "المبلغ المصروف الفعلي",
  returned: "المبلغ المتبقي/المرحّل",
  returnMode: "carry_forward|cash_return|bank_deposit",
  expensesCount: "عدد الفواتير",
  type: "check|advance|event",
  batchGroup: "معرفات الشيكات في التسوية المجمعة",
  createdAt: "timestamp",
  createdAtIso: "ISO format timestamp"
}
```

---

## 🗄️ جداول البيانات الرئيسية

### أ) جدول `issued_checks` (الشيكات المصدرة)

**حقول التسوية الأساسية:**

| الحقل | النوع | الشرح |
|------|------|-------|
| `id` | String | معرف الشيك الفريد |
| `isSettled` | Boolean | هل تمت تسويته بالكامل؟ (true = مسوى، false = غير مسوى) |
| `hasDraftSettlement` | Boolean | هل توجد نسخة مسودة محفوظة؟ |
| `settlementDate` | String | تاريخ اعتماد التسوية (YYYY-MM-DD) |
| `settlementExpenses` | Array | قائمة الفواتير والمصروفات |
| `settlementSpent` | Number | إجمالي المبلغ المصروف |
| `settlementReturned` | Number | المبلغ المرحّل للسلفة التالية |
| `returnMode` | String | طريقة الإغلاق: `carry_forward`, `cash_return`, `bank_deposit`, `settled` |
| `returnedCashAmount` | Number | المبلغ المردود نقداً |
| `bankDepositedAmount` | Number | المبلغ المودع بالبنك |
| `bankDepositDate` | String | تاريخ الإيداع البنكي |
| `bankDepositReference` | String | مرجع البنك / رقم الإيصال |
| `bankDepositTransactionId` | String | معرف عملية الإيداع في transactions |

**حقول التسوية المجمعة (Batch Settlement):**

| الحقل | الشرح |
|------|-------|
| `settlementGroupId` | معرف المجموعة |
| `settlementGroupLeaderId` | معرف الشيك الرئيسي في التسوية المجمعة |
| `settlementGroupMemberIds` | قائمة معرفات الشيكات في المجموعة |
| `settlementGroupCount` | عدد الشيكات في المجموعة |
| `settlementGroupFollower` | هل هذا الشيك تابع أم رئيسي؟ |
| `settlementGroupAdvanceAmountBase` | إجمالي قيم الشيكات |
| `settlementGroupPrevBalanceUsed` | إجمالي الأرصدة المرحلة المستخدمة |
| `settlementGroupCollectedSubscriptions` | إجمالي الاشتراكات المحصلة |

### ب) جدول `transactions` (العمليات المالية)

عند إيداع المتبقي بالبنك، يتم إنشاء عملية جديدة من نوع `deposit`:

```javascript
{
  id: "معرف العملية",
  type: "deposit",
  amount: "المبلغ المودع",
  date: "تاريخ الإيداع",
  bankReference: "مرجع البنك",
  party: "بيان الإيداع",
  employeeId: "معرف الموظف",
  state: "posted",
  sourceCollection: "transactions",
  settlementId: "معرف التسوية الأساسية",
  depositSource: "settlement_return",
  linkedCheckId: "معرف الشيك المتعلق"
}
```

---

## 🔍 حالات التسوية المختلفة

### 1️⃣ شيك غير مسوى (Unsettled)
```
isSettled = false
hasDraftSettlement = false (أو محفوظ كمسودة = true)
settlementExpenses = [] (أو يحتوي على فواتير مسودة)
```

### 2️⃣ مسودة محفوظة مؤقتاً (Draft Settlement)
```
isSettled = false
hasDraftSettlement = true
settlementExpenses = [الفواتير المدرجة مؤقتاً]
settlementDate = "" (فارغ)
```

### 3️⃣ تسوية معتمدة نهائياً (Finalized Settlement)
```
isSettled = true
settlementDate = "2026-05-09" (تاريخ الاعتماد)
settlementExpenses = [الفواتير النهائية]
settlementSpent = 15000 (مثال)
settlementReturned = 5000 (مثال)
returnMode = "carry_forward|cash_return|bank_deposit|settled"
```

### 4️⃣ تسوية مجمعة (Batch Settlement)
```
settlementGroupCount = 3 (مثلاً)
settlementGroupLeaderId = "check_001" (الرئيسي)
settlementGroupMemberIds = ["check_001", "check_002", "check_003"]
settlementGroupFollower = false (للرئيسي) / true (للأتباع)
```

---

## 📊 البيانات المسجلة للفاتورة الواحدة (Expense)

```javascript
{
  id: "e_1673823941234",                    // معرف فريد
  date: "2026-05-09",                       // تاريخ الفاتورة
  category: "بدل انتقال",                  // التصنيف المحاسبي
  amount: 500,                              // المبلغ
  notes: "نقل من القاهرة لإسكندرية",        // ملاحظات
  files: ["url1", "url2"],                  // مرفقات
  
  // حقول الفعاليات/الاجتماعات
  meetingId: "meeting_005",                 // معرف الاجتماع (للبدلات المرتبطة)
  meetingTitle: "اجتماع الجمعية العمومية", // عنوان الاجتماع
  
  // حقول أعضاء المجلس
  boardMembers: ["emp_001", "emp_002"],     // معرفات الأعضاء
  boardMemberSnapshots: [                   // لقطة تاريخية
    {
      memberId: "emp_001",
      name: "أحمد علي",
      role: "نائب الرئيس",
      workplace: "القاهرة"
    }
  ],
  allowancePerMember: 250                   // البدل لكل عضو
}
```

---

## 🔄 سيناريوهات العمليات

### سيناريو 1: إصدار وتسوية شيك عادي
```
1. إصدار شيك: issued_checks.isSettled = false
2. حفظ مسودة: issued_checks.hasDraftSettlement = true, settlementExpenses = [...]
3. اعتماد نهائي: issued_checks.isSettled = true, settlementDate = "2026-05-09"
4. إيداع متبقي: transactions type=deposit يتم إنشاؤه
```

### سيناريو 2: تسوية مجمعة (عدة شيكات)
```
1. تحديد عدة شيكات من نفس الموظف
2. الشيك الأول يصبح Leader: settlementGroupFollower = false
3. باقي الشيكات تصبح Followers: settlementGroupFollower = true
4. الفواتير تُخزن في الشيك الرئيسي فقط
5. الأتباع يحتفظون بمعرفات المجموعة للربط
```

### سيناريو 3: تعديل تسوية معتمدة
```
1. فتح التسوية: editingSettlementId = "check_123"
2. تعديل الفواتير والمبالغ
3. إعادة الاعتماد: settlement_updated يتم تسجيله
4. البيانات الجديدة تحل محل القديمة
```

---

## 🚨 كيفية الاستفسار عن جميع العمليات

### 1. البحث عن عملية معينة في السجل:

```javascript
// في console أو من خلال Firebase Admin
const auditLogs = await db.collection('audit_logs')
  .where('transactionId', '==', 'check_123')
  .orderBy('createdAt', 'desc')
  .get();

auditLogs.forEach(doc => {
  console.log(doc.data());
});
```

### 2. الاستعلام عن جميع تسويات موظف معين:

```javascript
const settlements = await db.collection('issued_checks')
  .where('employeeId', '==', 'emp_456')
  .where('isSettled', '==', true)
  .orderBy('settlementDate', 'desc')
  .get();
```

### 3. الاستعلام عن جميع التسويات في فترة زمنية:

```javascript
const fromDate = "2026-01-01";
const toDate = "2026-05-31";

const settlements = await db.collection('issued_checks')
  .where('settlementDate', '>=', fromDate)
  .where('settlementDate', '<=', toDate)
  .orderBy('settlementDate', 'desc')
  .get();
```

---

## 🔙 استرجاع/استرداد التسويات

### الحالات التي تحتاج استرجاع:

1. **تسوية معتمدة خاطئة**: إرجاعها إلى قائمة الشيكات الغير مسواة
2. **مسودة قديمة**: حذف المسودة والعودة إلى حالة أولية
3. **إيداع بنكي خاطئ**: حذف عملية الإيداع والعودة للحالة السابقة

### خطوات الاسترجاع:

```javascript
// أنظر ملف settlementRecovery.js لتفاصيل الدالة

const recoverSettlement = async (settlementId, options = {}) => {
  // 1. البحث عن التسوية
  // 2. حذف جميع الفواتير المرتبطة
  // 3. حذف عمليات الإيداع البنكي إن وجدت
  // 4. إعادة تعيين حقول التسوية إلى الحالة الأولية
  // 5. في التسويات المجمعة: حذف جميع بيانات المجموعة
  // 6. تسجيل العملية في audit_logs
}
```

---

## 📝 ملاحظات مهمة

⚠️ **عند حذف تسوية:**
- **لا تُحذف الفواتير الأصلية** من جدول المصروفات العام
- الفواتير المحفوظة هي نسخة محلية للتسوية فقط
- يتم حذف نسخة الفواتير من الشيك فقط (`settlementExpenses = []`)

⚠️ **عند إرجاع شيك:**
- المتبقي المودع بالبنك يتم حذف عملية الإيداع منه
- الأرصدة المرحلة لا يتم استردادها من السلف التالية تلقائياً
- يجب مراجعة السلف التالية يدويًا

✅ **أفضل الممارسات:**
- حفظ المسودات قبل الاعتماد النهائي
- مراجعة قائمة الفواتير قبل الاعتماد
- توثيق سبب الاسترجاع في التعليقات
- تتبع الأرصدة المرحلة في السلف اللاحقة

---

## 🔗 الملفات المرتبطة

- `src/modules/settlements/SettlementTab.jsx` - واجهة التسوية الرئيسية
- `src/utils/auditLog.js` - نظام تسجيل التدقيق
- `src/modules/settlements/settlementRecovery.js` - أداة الاسترجاع (يتم إنشاؤها)
- `docs/settlement-operations-guide.md` - هذا الدليل
