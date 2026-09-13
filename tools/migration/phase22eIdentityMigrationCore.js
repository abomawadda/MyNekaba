import {
  buildPhase22dDryRunPlan,
  isActiveAccount,
  maskId,
  syntheticEmailForAccount,
} from "./phase22dIdentityMigrationCore.js";

export const PHASE22E_EXECUTE_CONFIRM = "MIGRATE_ONE_CANARY";
export const PHASE22E_ROLLBACK_CONFIRM = "ROLLBACK_ONE_CANARY";
export const PHASE22E_IDENTIFIER_STRATEGY = "synthetic-internal-email";

export function normalizeText(value = "") {
  return String(value ?? "").trim();
}

export function isAdminCanaryCandidate(account = {}) {
  return (
    isActiveAccount(account) &&
    normalizeText(account.role).toLowerCase() === "admin" &&
    Boolean(account.passwordHash)
  );
}

export function assertSingleAccountId(accountId = "") {
  const value = normalizeText(accountId);
  if (!value) throw new Error("Phase 22E execution requires --account=<accountId>.");
  if (/[,\s]/.test(value)) {
    throw new Error("Phase 22E canary execution accepts exactly one account id.");
  }
  return value;
}

export function assertExecutionSafeguards(options = {}) {
  if (!options.execute && !options.rollback) return;
  assertSingleAccountId(options.accountId);

  if (options.execute && options.rollback) {
    throw new Error("Choose either --execute or --rollback, not both.");
  }

  if (options.execute && options.confirm !== PHASE22E_EXECUTE_CONFIRM) {
    throw new Error(`Execution requires --confirm=${PHASE22E_EXECUTE_CONFIRM}.`);
  }

  if (options.rollback && options.confirm !== PHASE22E_ROLLBACK_CONFIRM) {
    throw new Error(`Rollback requires --confirm=${PHASE22E_ROLLBACK_CONFIRM}.`);
  }
}

export function selectCanaryAccount(accounts = [], authUsers = [], options = {}) {
  const plan = buildPhase22dDryRunPlan(accounts, authUsers);
  const accountById = new Map(accounts.map((account) => [normalizeText(account.id), account]));
  const requestedId = normalizeText(options.accountId);
  const candidates = plan.rows
    .map((row) => ({ row, account: accountById.get(row.accountId) }))
    .filter(({ row, account }) => {
      if (!account) return false;
      if (requestedId && row.accountId !== requestedId) return false;
      if (row.conflict) return false;
      return isAdminCanaryCandidate(account);
    });

  const selected = candidates[0] || null;
  return {
    plan,
    selected: selected
      ? {
          account: selected.account,
          maskedAccountId: maskId(selected.row.accountId),
          intendedIdentifier: syntheticEmailForAccount(selected.account),
          intendedAction: selected.row.intendedAction,
          firebaseUser: selected.row.firebaseUser,
          issues: selected.row.issues,
        }
      : null,
    candidateCount: candidates.length,
  };
}

export function buildCanaryDryRunResult(accounts = [], authUsers = [], options = {}) {
  const selection = selectCanaryAccount(accounts, authUsers, options);
  const selected = selection.selected;

  return {
    dryRun: true,
    writesPerformed: 0,
    selected: selected
      ? {
          account: selected.maskedAccountId,
          role: "admin",
          active: true,
          intendedIdentifier: selected.intendedIdentifier,
          intendedAction: selected.intendedAction,
          firebaseUser: selected.firebaseUser,
          issues: selected.issues,
        }
      : null,
    summary: {
      totalAccounts: selection.plan.summary.totalAccounts,
      activeAccounts: selection.plan.summary.activeAccounts,
      adminCandidates: selection.candidateCount,
      manualReview: selection.plan.summary.manualReview,
      conflicts: selection.plan.summary.conflicts,
    },
  };
}

export function countProductionWrites(result = {}) {
  return {
    authUsersCreated: Number(result.authUsersCreated || 0),
    customClaimsWritten: Number(result.customClaimsWritten || 0),
    firestoreDocumentsUpdated: Number(result.firestoreDocumentsUpdated || 0),
    accountsAffected: Number(result.accountsAffected || 0),
    total:
      Number(result.authUsersCreated || 0) +
      Number(result.customClaimsWritten || 0) +
      Number(result.firestoreDocumentsUpdated || 0),
  };
}
