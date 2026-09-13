export const MIGRATION_STATES = Object.freeze({
  LINKED_VALID: "LINKED_VALID",
  LEGACY_UNLINKED: "LEGACY_UNLINKED",
  UID_MISSING_IN_AUTH: "UID_MISSING_IN_AUTH",
  UID_COLLISION: "UID_COLLISION",
  EMAIL_COLLISION: "EMAIL_COLLISION",
  FIREBASE_ONLY: "FIREBASE_ONLY",
  INVALID_ACCOUNT: "INVALID_ACCOUNT",
  NEEDS_MANUAL_REVIEW: "NEEDS_MANUAL_REVIEW",
});

export const MIGRATION_ACTIONS = Object.freeze({
  NONE: "NONE",
  CREATE_FIREBASE_IDENTITY: "CREATE_FIREBASE_IDENTITY",
  VERIFY_MAPPING: "VERIFY_MAPPING",
  MANUAL_REVIEW: "MANUAL_REVIEW",
});

export function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function normalizeIdentifier(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function normalizeUid(value = "") {
  return String(value || "").trim();
}

function getAccountUid(account = {}) {
  return normalizeUid(account.firebaseUid || account.authUid || account.firebaseUserId || "");
}

function duplicateSet(values = []) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([value]) => value));
}

function authEmail(authUser = {}) {
  return normalizeEmail(authUser.email);
}

export function sanitizeAccount(account = {}) {
  return {
    id: String(account.id || ""),
    username: String(account.username || ""),
    email: normalizeEmail(account.email),
    role: String(account.role || ""),
    status: String(account.accountStatus || account.status || ""),
    firebaseUid: getAccountUid(account),
    hasLegacyCredential: Boolean(account.passwordHash),
  };
}

export function buildMigrationInventory(accounts = [], authUsers = []) {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const safeAuthUsers = Array.isArray(authUsers) ? authUsers : [];
  const authByUid = new Map(
    safeAuthUsers
      .map((user) => [normalizeUid(user.uid), user])
      .filter(([uid]) => Boolean(uid))
  );
  const localUidSet = new Set(safeAccounts.map(getAccountUid).filter(Boolean));
  const duplicateUids = duplicateSet(safeAccounts.map(getAccountUid));
  const duplicateEmails = duplicateSet(safeAccounts.map((account) => normalizeEmail(account.email)));
  const duplicateUsernames = duplicateSet(
    safeAccounts.map((account) => normalizeIdentifier(account.username))
  );

  const accountItems = safeAccounts.map((rawAccount) => {
    const account = sanitizeAccount(rawAccount);
    const firebaseUser = account.firebaseUid ? authByUid.get(account.firebaseUid) : null;
    const issues = [];

    if (!account.id) issues.push("missing_local_document_id");
    if (!account.email && !account.username) issues.push("missing_login_identifier");
    if (account.firebaseUid && duplicateUids.has(account.firebaseUid)) issues.push("duplicate_firebase_uid");
    if (account.email && duplicateEmails.has(account.email)) issues.push("duplicate_email");
    if (account.username && duplicateUsernames.has(normalizeIdentifier(account.username))) {
      issues.push("duplicate_username");
    }
    if (account.firebaseUid && !firebaseUser) issues.push("firebase_uid_missing_in_auth");
    if (firebaseUser && account.email && authEmail(firebaseUser) && account.email !== authEmail(firebaseUser)) {
      issues.push("firebase_email_mismatch");
    }
    if (firebaseUser?.disabled && account.status === "active") issues.push("auth_disabled_local_active");
    if (!firebaseUser?.disabled && account.status && account.status !== "active" && account.firebaseUid) {
      issues.push("local_disabled_auth_active");
    }

    return {
      ...account,
      state: classifyAccount(account, firebaseUser, issues),
      issues,
      auth: firebaseUser
        ? {
            uid: normalizeUid(firebaseUser.uid),
            email: authEmail(firebaseUser),
            disabled: Boolean(firebaseUser.disabled),
          }
        : null,
    };
  });

  const firebaseOnlyItems = safeAuthUsers
    .filter((user) => normalizeUid(user.uid) && !localUidSet.has(normalizeUid(user.uid)))
    .map((user) => ({
      uid: normalizeUid(user.uid),
      email: authEmail(user),
      disabled: Boolean(user.disabled),
      state: MIGRATION_STATES.FIREBASE_ONLY,
      issues: ["firebase_auth_user_without_local_account"],
    }));

  return {
    accounts: accountItems,
    firebaseOnly: firebaseOnlyItems,
    collisions: buildCollisionReport(accountItems, firebaseOnlyItems),
    summary: summarizeInventory(accountItems, firebaseOnlyItems),
  };
}

export function classifyAccount(account, firebaseUser, issues = []) {
  if (!account?.id || (!account.email && !account.username)) return MIGRATION_STATES.INVALID_ACCOUNT;
  if (issues.includes("duplicate_firebase_uid")) return MIGRATION_STATES.UID_COLLISION;
  if (issues.includes("duplicate_email")) return MIGRATION_STATES.EMAIL_COLLISION;
  if (issues.some((issue) => issue.includes("mismatch") || issue.includes("disabled"))) {
    return MIGRATION_STATES.NEEDS_MANUAL_REVIEW;
  }
  if (account.firebaseUid && !firebaseUser) return MIGRATION_STATES.UID_MISSING_IN_AUTH;
  if (account.firebaseUid && firebaseUser) return MIGRATION_STATES.LINKED_VALID;
  if (!account.firebaseUid && account.hasLegacyCredential) return MIGRATION_STATES.LEGACY_UNLINKED;
  return MIGRATION_STATES.INVALID_ACCOUNT;
}

export function buildMigrationPlan(inventory) {
  const accounts = inventory?.accounts || [];
  return accounts.map((account) => {
    const base = {
      accountId: account.id,
      state: account.state,
      dryRun: true,
      writeRequiredNow: false,
      proposedAction: MIGRATION_ACTIONS.MANUAL_REVIEW,
      risk: "HIGH",
      issues: account.issues,
    };

    if (account.state === MIGRATION_STATES.LINKED_VALID) {
      return {
        ...base,
        proposedAction: MIGRATION_ACTIONS.VERIFY_MAPPING,
        risk: "LOW",
      };
    }

    if (account.state === MIGRATION_STATES.LEGACY_UNLINKED) {
      return {
        ...base,
        proposedAction: MIGRATION_ACTIONS.CREATE_FIREBASE_IDENTITY,
        risk: account.email ? "MEDIUM" : "HIGH",
      };
    }

    if (account.state === MIGRATION_STATES.UID_MISSING_IN_AUTH) {
      return {
        ...base,
        proposedAction: MIGRATION_ACTIONS.MANUAL_REVIEW,
        risk: "HIGH",
      };
    }

    if (account.state === MIGRATION_STATES.INVALID_ACCOUNT) {
      return {
        ...base,
        proposedAction: MIGRATION_ACTIONS.NONE,
        risk: "HIGH",
      };
    }

    return base;
  });
}

export function buildCollisionReport(accounts = [], firebaseOnly = []) {
  return {
    duplicateFirebaseUidAccounts: accounts.filter((account) =>
      account.issues.includes("duplicate_firebase_uid")
    ),
    duplicateEmailAccounts: accounts.filter((account) => account.issues.includes("duplicate_email")),
    duplicateUsernameAccounts: accounts.filter((account) =>
      account.issues.includes("duplicate_username")
    ),
    authMismatchAccounts: accounts.filter((account) =>
      account.issues.some((issue) => issue.includes("mismatch") || issue.includes("disabled"))
    ),
    uidMissingInAuthAccounts: accounts.filter((account) =>
      account.issues.includes("firebase_uid_missing_in_auth")
    ),
    firebaseOnly,
  };
}

export function summarizeInventory(accounts = [], firebaseOnly = []) {
  const byState = Object.fromEntries(Object.values(MIGRATION_STATES).map((state) => [state, 0]));
  accounts.forEach((account) => {
    byState[account.state] = (byState[account.state] || 0) + 1;
  });
  byState[MIGRATION_STATES.FIREBASE_ONLY] = firebaseOnly.length;
  return {
    totalLocalAccounts: accounts.length,
    totalFirebaseOnly: firebaseOnly.length,
    states: byState,
    conflicts: {
      duplicateFirebaseUid: accounts.filter((account) =>
        account.issues.includes("duplicate_firebase_uid")
      ).length,
      duplicateEmail: accounts.filter((account) => account.issues.includes("duplicate_email")).length,
      duplicateUsername: accounts.filter((account) =>
        account.issues.includes("duplicate_username")
      ).length,
      authMismatch: accounts.filter((account) =>
        account.issues.some((issue) => issue.includes("mismatch") || issue.includes("disabled"))
      ).length,
      uidMissingInAuth: accounts.filter((account) =>
        account.issues.includes("firebase_uid_missing_in_auth")
      ).length,
    },
  };
}

export function createExecutionRecord({ projectId, dryRun = true, account, plan, result = "planned" }) {
  return {
    executionId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    projectId,
    dryRun,
    accountId: account?.id || plan?.accountId || "",
    detectedState: plan?.state || account?.state || "",
    proposedAction: plan?.proposedAction || "",
    result,
    errorCode: "",
  };
}
