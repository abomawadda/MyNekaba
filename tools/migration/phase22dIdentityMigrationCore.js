export const PHASE22D_ACTIONS = Object.freeze({
  DEFER_INACTIVE: "DEFER_INACTIVE",
  JIT_LINK_ON_LEGACY_LOGIN: "JIT_LINK_ON_LEGACY_LOGIN",
  REUSE_EXISTING_AUTH_USER: "REUSE_EXISTING_AUTH_USER",
  VERIFY_EXISTING_MAPPING: "VERIFY_EXISTING_MAPPING",
  MANUAL_REVIEW: "MANUAL_REVIEW",
});

export const PHASE22D_IDENTIFIER_STRATEGY = "synthetic-internal-email";

export function normalizeText(value = "") {
  return String(value ?? "").trim();
}

export function normalizeEmail(value = "") {
  return normalizeText(value).toLowerCase();
}

export function isActiveAccount(account = {}) {
  return normalizeText(account.accountStatus || account.status || "active") === "active";
}

export function isValidEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function syntheticEmailForAccount(account = {}) {
  const stableId = normalizeText(account.id).toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  return `acct-${stableId || "missing"}@mynekaba.internal.invalid`;
}

export function maskId(value = "") {
  const text = normalizeText(value);
  if (!text) return "";
  if (text.length <= 8) return `${text.slice(0, 2)}***${text.slice(-2)}`;
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function countBy(values = []) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return counts;
}

function isDuplicate(counts, value) {
  return Boolean(value && (counts.get(value) || 0) > 1);
}

function authEmail(authUser = {}) {
  return normalizeEmail(authUser.email);
}

function authAccountIdClaim(authUser = {}) {
  return normalizeText((authUser || {}).customClaims?.accountId);
}

function emptySummary() {
  return {
    totalAccounts: 0,
    activeAccounts: 0,
    inactiveAccounts: 0,
    readyForDryRunMigration: 0,
    deferredInactive: 0,
    manualReview: 0,
    requiresFirebaseUserCreation: 0,
    canReuseExistingAuthUser: 0,
    requiresAccountIdClaim: 0,
    requiresFirebaseUidStorage: 0,
    alreadyCompatible: 0,
    conflicts: {
      duplicateUsername: 0,
      duplicateEmail: 0,
      duplicateEmployeeId: 0,
      duplicateEmployeeCode: 0,
      duplicateFirebaseUid: 0,
      authEmailCollision: 0,
      accountIdClaimMismatch: 0,
      missingAccountId: 0,
      missingLegacyCredential: 0,
    },
  };
}

export function buildPhase22dDryRunPlan(accounts = [], authUsers = [], options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const safeAuthUsers = Array.isArray(authUsers) ? authUsers : [];
  const summary = emptySummary();

  const usernameCounts = countBy(safeAccounts.map((account) => normalizeText(account.username).toLowerCase()));
  const emailCounts = countBy(safeAccounts.map((account) => normalizeEmail(account.email)));
  const employeeIdCounts = countBy(safeAccounts.map((account) => normalizeText(account.employeeId)));
  const employeeCodeCounts = countBy(safeAccounts.map((account) => normalizeText(account.employeeCode || account.jobId)));
  const firebaseUidCounts = countBy(safeAccounts.map((account) => normalizeText(account.firebaseUid)));
  const authByUid = new Map(safeAuthUsers.map((user) => [normalizeText(user.uid), user]).filter(([uid]) => uid));
  const authByEmail = new Map(safeAuthUsers.map((user) => [authEmail(user), user]).filter(([email]) => email));

  const rows = safeAccounts.map((account) => {
    const accountId = normalizeText(account.id);
    const role = normalizeText(account.role || "viewer");
    const active = isActiveAccount(account);
    const firebaseUid = normalizeText(account.firebaseUid);
    const intendedEmail = syntheticEmailForAccount(account);
    const existingAuthByUid = firebaseUid ? authByUid.get(firebaseUid) : null;
    const existingAuthByEmail = authByEmail.get(intendedEmail);
    const authUser = existingAuthByUid || existingAuthByEmail || null;
    const accountIdClaim = authAccountIdClaim(authUser);
    const issues = [];

    summary.totalAccounts += 1;
    if (active) summary.activeAccounts += 1;
    else summary.inactiveAccounts += 1;

    if (!accountId) issues.push("missing_account_id");
    if (!account.passwordHash) issues.push("missing_legacy_credential");
    if (isDuplicate(usernameCounts, normalizeText(account.username).toLowerCase())) issues.push("duplicate_username");
    if (isDuplicate(emailCounts, normalizeEmail(account.email))) issues.push("duplicate_email");
    if (isDuplicate(employeeIdCounts, normalizeText(account.employeeId))) issues.push("duplicate_employeeId");
    if (isDuplicate(employeeCodeCounts, normalizeText(account.employeeCode || account.jobId))) {
      issues.push("duplicate_employeeCode");
    }
    if (isDuplicate(firebaseUidCounts, firebaseUid)) issues.push("duplicate_firebaseUid");
    if (existingAuthByEmail && firebaseUid && existingAuthByEmail.uid !== firebaseUid) {
      issues.push("auth_email_collision");
    }
    if (accountIdClaim && accountIdClaim !== accountId) issues.push("accountId_claim_mismatch");

    issues.forEach((issue) => {
      if (issue === "missing_account_id") summary.conflicts.missingAccountId += 1;
      if (issue === "missing_legacy_credential") summary.conflicts.missingLegacyCredential += 1;
      if (issue === "duplicate_username") summary.conflicts.duplicateUsername += 1;
      if (issue === "duplicate_email") summary.conflicts.duplicateEmail += 1;
      if (issue === "duplicate_employeeId") summary.conflicts.duplicateEmployeeId += 1;
      if (issue === "duplicate_employeeCode") summary.conflicts.duplicateEmployeeCode += 1;
      if (issue === "duplicate_firebaseUid") summary.conflicts.duplicateFirebaseUid += 1;
      if (issue === "auth_email_collision") summary.conflicts.authEmailCollision += 1;
      if (issue === "accountId_claim_mismatch") summary.conflicts.accountIdClaimMismatch += 1;
    });

    const blockingIssues = issues.filter((issue) =>
      [
        "missing_account_id",
        "duplicate_username",
        "duplicate_email",
        "duplicate_employeeId",
        "duplicate_employeeCode",
        "duplicate_firebaseUid",
        "auth_email_collision",
        "accountId_claim_mismatch",
      ].includes(issue)
    );

    let intendedAction = PHASE22D_ACTIONS.JIT_LINK_ON_LEGACY_LOGIN;
    if (!active && !includeInactive) intendedAction = PHASE22D_ACTIONS.DEFER_INACTIVE;
    else if (blockingIssues.length > 0) intendedAction = PHASE22D_ACTIONS.MANUAL_REVIEW;
    else if (authUser && firebaseUid && accountIdClaim === accountId) intendedAction = PHASE22D_ACTIONS.VERIFY_EXISTING_MAPPING;
    else if (authUser) intendedAction = PHASE22D_ACTIONS.REUSE_EXISTING_AUTH_USER;

    const needsFirebaseUser = !authUser && intendedAction === PHASE22D_ACTIONS.JIT_LINK_ON_LEGACY_LOGIN;
    const needsClaim = Boolean(authUser && accountIdClaim !== accountId) || needsFirebaseUser;
    const needsFirebaseUidStorage = Boolean(authUser?.uid && authUser.uid !== firebaseUid) || needsFirebaseUser;

    if (intendedAction === PHASE22D_ACTIONS.DEFER_INACTIVE) summary.deferredInactive += 1;
    else if (intendedAction === PHASE22D_ACTIONS.MANUAL_REVIEW) summary.manualReview += 1;
    else summary.readyForDryRunMigration += 1;
    if (needsFirebaseUser) summary.requiresFirebaseUserCreation += 1;
    if (authUser && intendedAction === PHASE22D_ACTIONS.REUSE_EXISTING_AUTH_USER) summary.canReuseExistingAuthUser += 1;
    if (needsClaim) summary.requiresAccountIdClaim += 1;
    if (needsFirebaseUidStorage) summary.requiresFirebaseUidStorage += 1;
    if (intendedAction === PHASE22D_ACTIONS.VERIFY_EXISTING_MAPPING) summary.alreadyCompatible += 1;

    return {
      account: maskId(accountId),
      accountId,
      role,
      active,
      firebaseUser: authUser ? "exists" : "missing",
      intendedIdentifier: intendedEmail,
      intendedAction,
      claimAction: needsClaim ? `set accountId=${maskId(accountId)}` : "none",
      firebaseUidAction: needsFirebaseUidStorage ? "store future firebaseUid on user_accounts" : "none",
      conflict: blockingIssues.length ? blockingIssues.join(",") : "",
      issues,
      dryRun: true,
      writesPerformed: 0,
    };
  });

  return {
    strategy: PHASE22D_IDENTIFIER_STRATEGY,
    summary,
    rows,
  };
}
