const COMMON_PASSWORDS = [
  "123456",
  "123456789",
  "12345678",
  "password",
  "password123",
  "qwerty",
  "qwerty123",
  "admin",
  "admin123",
  "welcome",
  "welcome123",
  "letmein",
  "abc123",
  "111111",
  "000000",
  "1q2w3e4r",
  "123123",
  "987654321",
  "passw0rd",
  "iloveyou",
  "monkey",
  "dragon",
  "baseball",
  "football",
  "master",
  "superman",
  "batman",
  "shadow",
  "secret",
  "trustno1",
  "freedom",
  "whatever",
  "zaq12wsx",
  "login",
  "administrator",
  "root",
  "00000000",
  "121212",
  "654321",
  "user123",
  "welcome1",
  "pass1234",
  "p@ssword",
  "asdfgh",
  "asdf1234",
  "nekaba",
  "nekaba123",
  "treasurer",
  "viewer123",
  "system123",
];

export const PASSWORD_POLICY_HINTS = [
  "8 أحرف على الأقل",
  "حرف كبير واحد على الأقل",
  "حرف صغير واحد على الأقل",
  "رقم واحد على الأقل",
  "رمز خاص واحد على الأقل",
  "ليست من كلمات المرور المتوقعة",
];

export function validatePasswordPolicy(password = "", profile = {}) {
  const normalized = String(password || "");
  const lowered = normalized.toLowerCase();
  const relatedWords = [
    profile?.fullName,
    profile?.phone,
    profile?.email,
    profile?.username,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  const errors = [];

  if (normalized.length < 8) errors.push("يجب ألا تقل كلمة المرور عن 8 أحرف.");
  if (!/[A-Z]/.test(normalized)) errors.push("يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل.");
  if (!/[a-z]/.test(normalized)) errors.push("يجب أن تحتوي كلمة المرور على حرف صغير واحد على الأقل.");
  if (!/\d/.test(normalized)) errors.push("يجب أن تحتوي كلمة المرور على رقم واحد على الأقل.");
  if (!/[^\w\s]/.test(normalized)) errors.push("يجب أن تحتوي كلمة المرور على رمز خاص واحد على الأقل.");
  if (COMMON_PASSWORDS.includes(lowered)) errors.push("كلمة المرور شائعة جدًا وغير مسموح بها.");
  if (relatedWords.some((word) => word && lowered.includes(word))) {
    errors.push("لا تستخدم بياناتك الشخصية داخل كلمة المرور.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
