# المرحلة الثانية: Schema دورات المجلس والعضويات الزمنية

## الهدف
- حل مشكلة اختفاء الأعضاء التاريخيين من شاشة الاجتماعات بعد المعاش أو الوفاة أو انتهاء الصفة الحالية.
- فصل "العضو الحالي" عن "عضوية المجلس عبر الزمن".
- ربط الاجتماعات والبدلات والتقارير بدورة مجلس محددة بدل الاعتماد على حالة الموظف الحالية فقط.

## المشكلة الحالية
- شاشة المجلس تبني البيانات من `employees.membershipStatus` الحالي.
- إذا خرج عضو من المجلس لاحقًا، فقد لا يظهر بشكل صحيح في الاجتماعات السابقة أو التقارير التاريخية.
- حضور الاجتماعات محفوظ كـ `attendees: string[]` فقط، بدون Snapshot تاريخي للصفة والاسم وقت الاجتماع.

## المبدأ التصميمي
- `employees` يبقى ملف العضو الرئيسي.
- المجلس لا يعتمد على حالة العضو الحالية وحدها.
- العضوية داخل المجلس تصبح سجلًا زمنيًا مستقلًا.
- الاجتماعات ترتبط بدورة مجلس، والحضور يرتبط بعضوية مجلس وقت الاجتماع.

---

## الكيانات الجديدة

## 1. `board_terms`
يمثل الدورة الانتخابية أو الدورة الإدارية للمجلس.

### الحقول الأساسية
- `id`
- `title`
  مثال: `دورة مجلس 2022 - 2027`
- `termNumber`
  رقم الدورة إن وجد
- `startDate`
- `endDate`
- `status`
  القيم المقترحة:
  - `planned`
  - `active`
  - `closed`
  - `archived`
- `electionDate`
- `approvalDate`
- `approvalRef`
  رقم/مرجع قرار الاعتماد
- `notes`
- `createdAt`
- `updatedAt`
- `createdBy`
- `updatedBy`

### حقول مساعدة اختيارية
- `boardName`
  إذا كانت هناك أكثر من لجنة/مجلس مستقبلًا
- `targetSeats`
  العدد المستهدف للمقاعد
- `endedReason`
  سبب إنهاء الدورة إن انتهت مبكرًا

### مثال
```json
{
  "title": "دورة مجلس 2022 - 2027",
  "termNumber": 7,
  "startDate": "2022-06-01",
  "endDate": "2027-05-31",
  "status": "active",
  "electionDate": "2022-05-15",
  "approvalDate": "2022-05-20",
  "approvalRef": "قرار رقم 12/2022",
  "targetSeats": 11,
  "notes": "",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

---

## 2. `board_memberships`
يمثل عضوية عضو داخل دورة مجلس محددة، مع تاريخ البداية والنهاية والصفة وأسباب التغيير.

### الحقول الأساسية
- `id`
- `termId`
  مرجع إلى `board_terms`
- `memberId`
  مرجع إلى `employees.id`
- `memberJobId`
  نسخة مرجعية لتسهيل البحث والتقارير
- `memberName`
  Snapshot اسم العضو وقت تسجيل العضوية
- `role`
  مثال:
  - `رئيس المجلس`
  - `الأمين العام`
  - `أمين الصندوق`
  - `عضو مجلس إدارة`
  - `عضو مجلس`
- `roleOrder`
  للفرز الثابت في الشاشات والتقارير
- `joinDate`
- `endDate`
- `status`
  القيم المقترحة:
  - `active`
  - `ended`
  - `suspended`
  - `vacated`
- `joinMethod`
  طريقة الالتحاق:
  - `elected`
  - `escalated`
  - `appointed`
  - `replacement`
- `endReason`
  سبب الانتهاء:
  - `term_completed`
  - `retirement`
  - `death`
  - `resignation`
  - `dismissal`
  - `membership_end`
  - `board_restructure`
- `escalationSourceMemberId`
  إذا كان العضو صعد بدل عضو آخر
- `replacementForMembershipId`
  إذا كانت العضوية الحالية بديلة عن عضوية سابقة
- `decisionDate`
- `decisionRef`
- `notes`
- `createdAt`
- `updatedAt`
- `createdBy`
- `updatedBy`

### Snapshot مهم داخل العضوية
هذه الحقول تحفظ شكل العضو وقت انضمامه للمجلس لتثبيت التاريخ:
- `snapshot`
  - `name`
  - `jobId`
  - `jobTitle`
  - `workplace`
  - `membershipStatus`
  - `memberState`
  - `phone`

### مثال
```json
{
  "termId": "term_2022_2027",
  "memberId": "emp_123",
  "memberJobId": "68663",
  "memberName": "منى محمد محي الدين البري",
  "role": "عضو جمعية عمومية",
  "roleOrder": 5,
  "joinDate": "2022-06-01",
  "endDate": "2026-03-01",
  "status": "ended",
  "joinMethod": "elected",
  "endReason": "retirement",
  "decisionDate": "2026-03-01",
  "decisionRef": "محضر مجلس رقم 8",
  "replacementForMembershipId": "",
  "snapshot": {
    "name": "منى محمد محي الدين البري",
    "jobId": "68663",
    "jobTitle": "فني أول حركة",
    "workplace": "المنصورة",
    "membershipStatus": "عضو جمعية عمومية",
    "memberState": "نشط",
    "phone": ""
  }
}
```

---

## تعديل الكيانات الحالية

## 3. `board_meetings`
يبقى الكيان الحالي، لكن يحتاج حقولًا إضافية.

### الحقول الحالية المهمة
- `title`
- `type`
- `date`
- `time`
- `venue`
- `status`
- `agenda`
- `decisions`
- `attendees`

### الإضافات المطلوبة
- `termId`
  لربط الاجتماع بدورة محددة
- `attendanceRecords`
  بدل الاعتماد على `attendees` فقط

### شكل `attendanceRecords`
- `membershipId`
- `memberId`
- `memberName`
- `role`
- `memberStateAtMeeting`
- `attendanceStatus`
  - `present`
  - `absent`
  - `excused`
- `recordedAt`
- `notes`

### لماذا نحتاج `attendanceRecords`
- لو تغيّر اسم العضو أو صفته أو خرج للمعاش لاحقًا، لا يتأثر سجل الاجتماع التاريخي.
- يمكن استخراج كشف حضور تاريخي صحيح.
- يمكن حساب النصاب القانوني بناءً على العضويات السارية وقت الاجتماع.

### إبقاء `attendees`
- يمكن إبقاء `attendees: string[]` مؤقتًا للتوافق الخلفي.
- لكن المصدر الحقيقي لاحقًا يجب أن يكون `attendanceRecords`.

### مثال
```json
{
  "title": "الاجتماع العادي الأول",
  "date": "2025-01-15",
  "status": "held",
  "termId": "term_2022_2027",
  "attendees": ["emp_1", "emp_2"],
  "attendanceRecords": [
    {
      "membershipId": "bm_001",
      "memberId": "emp_1",
      "memberName": "أحمد محمد",
      "role": "رئيس المجلس",
      "memberStateAtMeeting": "نشط",
      "attendanceStatus": "present",
      "notes": ""
    }
  ]
}
```

---

## 4. التسويات والبدلات
يفضل توسيع بنود البدلات داخل التسويات لتسجل العضوية التاريخية أيضًا.

### الإضافة المقترحة داخل `settlementExpenses[]`
- `termId`
- `meetingId`
- `meetingTitle`
- `boardMembershipIds`
- `boardMembers`
  يظل موجودًا مؤقتًا
- `boardMemberSnapshots`
  يحتوي:
  - `membershipId`
  - `memberId`
  - `memberName`
  - `role`
  - `amount`

### الفائدة
- البدلات لا تضيع إذا تغيّر وضع العضو لاحقًا.
- التقارير المالية وتقرير بدلات المجلس يصبحان تاريخيين بدقة.

---

## العلاقات

### العلاقة الأساسية
- `board_terms (1) -> (N) board_memberships`
- `board_terms (1) -> (N) board_meetings`
- `board_memberships (1) -> (N) attendanceRecords`

### قواعد الربط
- أي اجتماع يجب أن يحمل `termId`.
- أي عضو ظاهر في الاجتماع يجب أن يكون له `board_membership` صالح في تاريخ الاجتماع.
- إذا انتهت العضوية بعد الاجتماع، يبقى العضو ظاهرًا تاريخيًا داخل الاجتماع.

---

## قواعد العمل

## 1. العضو التاريخي
- إذا حضر اجتماعًا قبل المعاش أو الوفاة ثم انتهت عضويته لاحقًا:
  - يبقى ظاهرًا في الاجتماع السابق
  - لا يظهر ضمن الأعضاء المؤهلين للاجتماعات الجديدة بعد تاريخ الانتهاء

## 2. التحقق من الأهلية
- أهلية الحضور لا تحسب من `employees.membershipStatus` فقط
- بل من:
  - وجود `board_membership`
  - وأن `joinDate <= meeting.date`
  - وأن `endDate` فارغ أو `endDate >= meeting.date`
  - وأن `status` ليس `vacated`

## 3. الترقية/التصعيد
- التصعيد لا يغير العضوية القديمة
- ينشئ `board_membership` جديدة للعضو المصعد
- ويربطها بـ:
  - `joinMethod = escalated`
  - `replacementForMembershipId`
  - `escalationSourceMemberId` عند الحاجة

## 4. انتهاء الخدمة
- معاش/وفاة/استقالة العضو لا تحذف عضويته
- بل تغلق العضوية الحالية عبر:
  - `endDate`
  - `endReason`
  - `status = ended`

## 5. انتهاء الدورة
- عند انتهاء الدورة:
  - تغلق كل العضويات المفتوحة بسبب `term_completed`
  - وتصبح الدورة `closed` ثم `archived`

---

## الفهارس المقترحة

## `board_terms`
- `status + startDate`
- `startDate + endDate`

## `board_memberships`
- `termId + status`
- `termId + memberId`
- `termId + roleOrder`
- `memberId + joinDate`
- `memberId + status`

## `board_meetings`
- `termId + date`
- `termId + status`

---

## خطة الترحيل من الوضع الحالي

## المرحلة 1
- إنشاء أول `board_term` من الثوابت الحالية:
  - `BOARD_TERM_START`
  - `BOARD_TERM_END`

## المرحلة 2
- إنشاء `board_memberships` لكل الأعضاء الحاليين الذين لديهم صفة مجلس الآن.
- `joinDate` مبدئيًا = بداية الدورة الحالية إذا لم تتوفر بيانات أدق.

## المرحلة 3
- تحديث كل `board_meetings`
  - إضافة `termId`
  - تحويل `attendees[]` إلى `attendanceRecords[]`
  - بناء Snapshot من بيانات العضو المتاحة وقت الترحيل

## المرحلة 4
- تحديث التسويات التي فيها بدلات مجلس
  - إضافة `termId`
  - حفظ `boardMemberSnapshots`

## ملاحظة مهمة
- الاجتماعات القديمة التي تحتوي على أعضاء خرجوا من المجلس بالفعل ستظل تحتاج Snapshot من البيانات الحالية، وهذا حل انتقال مؤقت.
- الدقة الكاملة تبدأ من لحظة تفعيل schema الجديد.

---

## التعديلات المطلوبة على الشاشات

## شاشة دورات المجلس
- قائمة الدورات
- إنشاء دورة جديدة
- إغلاق دورة
- أرشفة دورة

## شاشة عضويات المجلس
- أعضاء الدورة الحالية
- أعضاء الدورات السابقة
- إضافة عضو للدورة
- إنهاء عضوية عضو
- تسجيل سبب الإنهاء
- تسجيل التصعيد/البديل

## شاشة الاجتماعات
- اختيار الدورة
- بناء قائمة المؤهلين من `board_memberships`
- عرض الحضور التاريخي من `attendanceRecords`

## التقارير
- كشف التشكيل الرسمي لكل دورة
- سجل الحضور حسب الدورة
- تقرير من التحق ومن انتهت عضويته وسبب الانتهاء
- تقرير التصعيد والاستبدال

---

## التوصية التنفيذية

## الأفضل
- تنفيذ `board_terms` و`board_memberships` أولًا
- ثم تعديل `board_meetings`
- ثم ترحيل الحضور إلى `attendanceRecords`

## لماذا هذا هو الترتيب الصحيح
- لأنه يعالج أصل المشكلة لا العرض فقط
- ويجعل الاجتماعات والبدلات والتقارير كلها متسقة زمنيًا
- ويمنع تكرار مشكلة "العضو اختفى لأنه لم يعد عضو مجلس حالي"

---

## أقل تنفيذ ممكن MVP
إذا أردنا خطوة وسطى سريعة قبل البناء الكامل:
- إضافة `termId` إلى `board_meetings`
- إضافة `attendanceRecords`
- حفظ Snapshot للحضور عند كل اجتماع

لكن هذا حل مرحلي فقط، وليس بديلًا عن `board_memberships`.

---

## قرار مقترح
- نعتمد رسميًا أن المجلس سيصبح مبنيًا على:
  - `board_terms`
  - `board_memberships`
  - `board_meetings.attendanceRecords`

- ولا يعود الاعتماد الرئيسي على `employees.membershipStatus` وحده في منطق المجلس.
