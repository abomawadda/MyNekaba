const normalizeDigits = (value = "") => String(value ?? "")
  .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
  .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit));

const normalizeIdentity = (value = "") => normalizeDigits(value).trim().replace(/\s+/g, "").toLowerCase();

export function validateEmployee(emp, existingList = []) {
  const errors = {};
  const jobId = normalizeIdentity(emp.jobId);
  const phone = normalizeIdentity(emp.phone);
  const email = normalizeIdentity(emp.email);
  const nationalId = normalizeIdentity(emp.nationalId);

  // required
  if (!jobId) errors.jobId = "الرقم الوظيفي مطلوب";
  if (!emp.name?.trim()) errors.name = "الاسم الرباعي مطلوب";

  // unique constraints
  if (phone) {
    const exists = existingList.some(
      (e) => normalizeIdentity(e.phone) === phone && normalizeIdentity(e.jobId) !== jobId
    );
    if (exists) errors.phone = "رقم الهاتف مسجل بالفعل";
  }

  if (email) {
    const exists = existingList.some(
      (e) => normalizeIdentity(e.email) === email && normalizeIdentity(e.jobId) !== jobId
    );
    if (exists) errors.email = "البريد الإلكتروني مسجل بالفعل";
  }

  if (nationalId) {
    if (!/^\d{14}$/.test(nationalId))
      errors.nationalId = "الرقم القومي يجب أن يكون 14 رقمًا";

    const exists = existingList.some(
      (e) => normalizeIdentity(e.nationalId) === nationalId && normalizeIdentity(e.jobId) !== jobId
    );
    if (exists) errors.nationalId = "الرقم القومي مسجل بالفعل";
  }

  return errors;
}