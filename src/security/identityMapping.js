import { getFirebaseUid } from "./firebaseAuth";

export const IDENTITY_MIGRATION_STATE = {
  unknown: "unknown",
  unlinked: "unlinked",
  linked: "linked",
  mismatch: "mismatch",
};

export function normalizeFirebaseUid(value = "") {
  return String(value || "").trim();
}

export function getAccountFirebaseUid(account = {}) {
  return normalizeFirebaseUid(account.firebaseUid || account.authUid || account.firebaseUserId || "");
}

export function getCurrentFirebaseUid() {
  return normalizeFirebaseUid(getFirebaseUid());
}

export function isFirebaseLinkedAccount(account = {}) {
  return Boolean(getAccountFirebaseUid(account));
}

export function getAccountIdentityMigrationState(account = {}, currentUid = getCurrentFirebaseUid()) {
  if (!account || typeof account !== "object") return IDENTITY_MIGRATION_STATE.unknown;

  const accountUid = getAccountFirebaseUid(account);
  const activeUid = normalizeFirebaseUid(currentUid);

  if (!accountUid) return IDENTITY_MIGRATION_STATE.unlinked;
  if (!activeUid) return IDENTITY_MIGRATION_STATE.linked;
  return accountUid === activeUid
    ? IDENTITY_MIGRATION_STATE.linked
    : IDENTITY_MIGRATION_STATE.mismatch;
}

export function getAuthModeForAccount(account = {}) {
  const accountUid = getAccountFirebaseUid(account);
  if (!accountUid) return "legacy";

  if (account.authMode === "firebase-native" || account.credentialAuthority === "firebase") {
    return "firebase-native";
  }

  if (
    account.registrationState === "email_pending_verification" ||
    account.registrationState === "pending_approval" ||
    (account.role === "member" && accountUid && account.email && !account.passwordSalt)
  ) {
    return "firebase-native";
  }

  if (account.passwordHash || account.passwordSalt) return "jit-linked";

  return "firebase-native";
}

function normalizeIdentifier(value = "") {
  return String(value || "").trim().toLowerCase();
}

function countDuplicates(values = []) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return Array.from(counts.values()).filter((count) => count > 1).length;
}

export function summarizeIdentityMigration(accounts = []) {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const summary = {
    total: safeAccounts.length,
    linked: 0,
    unlinked: 0,
    mismatch: 0,
    unknown: 0,
    missingIdentifiers: 0,
    duplicateFirebaseUids: 0,
    duplicateEmails: 0,
    duplicatePhones: 0,
  };

  const firebaseUids = [];
  const emails = [];
  const phones = [];

  safeAccounts.forEach((account) => {
    const state = getAccountIdentityMigrationState(account, "");
    summary[state] = (summary[state] || 0) + 1;

    const firebaseUid = getAccountFirebaseUid(account);
    if (firebaseUid) firebaseUids.push(firebaseUid);

    const email = normalizeIdentifier(account.email);
    if (email) emails.push(email);

    const phone = normalizeIdentifier(account.phone);
    if (phone) phones.push(phone);

    if (!email && !phone && !normalizeIdentifier(account.username)) {
      summary.missingIdentifiers += 1;
    }
  });

  summary.duplicateFirebaseUids = countDuplicates(firebaseUids);
  summary.duplicateEmails = countDuplicates(emails);
  summary.duplicatePhones = countDuplicates(phones);

  return summary;
}
