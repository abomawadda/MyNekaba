import { createHash } from "node:crypto";

export const JIT_LOGIN_ERROR = "تعذر تسجيل الدخول. تأكد من البيانات وحاول مرة أخرى.";
export const JIT_LEGACY_ONLY = "legacy-only";
export const JIT_FIREBASE_LINKED = "firebase-linked";
export const REQUIRED_JIT_SERVER_ENV = Object.freeze([
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "JIT_AUTH_ALLOWED_ORIGINS",
]);

export function normalizeLoginIdentifier(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function buildLegacyPasswordHash(password = "", salt = "") {
  return createHash("sha256").update(`${salt}::${password}`).digest("hex");
}

export function verifyLegacyPassword({ password = "", passwordSalt = "", passwordHash = "" } = {}) {
  if (!password || !passwordSalt || !passwordHash) return false;
  return buildLegacyPasswordHash(password, passwordSalt) === String(passwordHash);
}

export function isActiveAccount(account = {}) {
  return String(account.accountStatus || account.status || "active").trim() === "active";
}

export function findAccountByIdentifier(accounts = [], identifier = "") {
  const normalized = normalizeLoginIdentifier(identifier);
  if (!normalized) return { account: null, ambiguous: false };

  const matches = accounts.filter((account) =>
    [account.username, account.email, account.phone]
      .filter(Boolean)
      .map((value) => normalizeLoginIdentifier(value))
      .includes(normalized)
  );

  return {
    account: matches.length === 1 ? matches[0] : null,
    ambiguous: matches.length > 1,
  };
}

export function classifyJitAccount(account = {}) {
  if (!account?.id) return "missing";
  if (!isActiveAccount(account)) return "inactive";
  if (!account.passwordHash || !account.passwordSalt) return "missing-legacy-credential";
  if (account.firebaseUid) return JIT_FIREBASE_LINKED;
  return JIT_LEGACY_ONLY;
}

export function buildMinimalAccountMetadata(account = {}) {
  return {
    accountId: account.id || "",
    role: account.role || "viewer",
    firebaseLinked: Boolean(account.firebaseUid),
  };
}

export function assertClaimMatchesAccount(authUser = {}, account = {}) {
  const claimAccountId = String(authUser.customClaims?.accountId || "");
  return Boolean(claimAccountId && claimAccountId === account.id);
}

export function normalizePrivateKey(value = "") {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

export function validateJitServerEnv(env = {}) {
  const missing = REQUIRED_JIT_SERVER_ENV.filter((key) => !String(env[key] || "").trim());
  const privateKey = normalizePrivateKey(env.FIREBASE_PRIVATE_KEY);
  const allowedOrigins = String(env.JIT_AUTH_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const issues = [];

  if (missing.length > 0) issues.push("missing_required_env");
  if (privateKey && !privateKey.includes("BEGIN PRIVATE KEY")) issues.push("private_key_format_unexpected");
  if (privateKey && !privateKey.includes("\n")) issues.push("private_key_newlines_missing");
  if (allowedOrigins.includes("*")) issues.push("wildcard_origin_not_allowed");
  if (allowedOrigins.some((origin) => !/^https:\/\/[^*\s]+$/.test(origin))) {
    issues.push("allowed_origin_format_unexpected");
  }
  if (String(env.FIREBASE_CLIENT_EMAIL || "").trim() && !String(env.FIREBASE_CLIENT_EMAIL).includes("@")) {
    issues.push("client_email_format_unexpected");
  }

  return {
    ok: missing.length === 0 && issues.length === 0,
    required: REQUIRED_JIT_SERVER_ENV,
    missing,
    issues,
  };
}
