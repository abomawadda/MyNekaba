#!/usr/bin/env node
/* global process */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { createAdminContext, readUserAccounts } from "./firebaseAdminClient.js";
import {
  PHASE22E_EXECUTE_CONFIRM,
  PHASE22E_IDENTIFIER_STRATEGY,
  PHASE22E_ROLLBACK_CONFIRM,
  assertExecutionSafeguards,
  buildCanaryDryRunResult,
  countProductionWrites,
  normalizeText,
  selectCanaryAccount,
} from "./phase22eIdentityMigrationCore.js";
import { maskId, syntheticEmailForAccount } from "./phase22dIdentityMigrationCore.js";

const ACCOUNTS_COLLECTION = "user_accounts";

function parseArgs(argv) {
  return argv.reduce(
    (options, arg) => {
      if (arg === "--dry-run") return { ...options, dryRun: true };
      if (arg === "--execute") return { ...options, execute: true, dryRun: false };
      if (arg === "--rollback") return { ...options, rollback: true, dryRun: false };
      if (arg.startsWith("--account=")) return { ...options, accountId: arg.slice("--account=".length) };
      if (arg.startsWith("--confirm=")) return { ...options, confirm: arg.slice("--confirm=".length) };
      if (arg.startsWith("--project=")) return { ...options, projectId: arg.slice("--project=".length) };
      if (arg.startsWith("--out=")) return { ...options, outDir: arg.slice("--out=".length) };
      return options;
    },
    {
      dryRun: true,
      execute: false,
      rollback: false,
      accountId: "",
      confirm: "",
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "",
      outDir: "migration-output",
    }
  );
}

function assertOptions(options) {
  if (!options.projectId) throw new Error("Missing project id. Use --project=<firebase-project-id>.");
  assertExecutionSafeguards(options);
}

async function listAuthUsersWithClaims(auth) {
  const users = [];
  let pageToken;

  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(
      ...page.users.map((user) => ({
        uid: user.uid,
        email: user.email || "",
        disabled: Boolean(user.disabled),
        customClaims: user.customClaims || {},
      }))
    );
    pageToken = page.pageToken;
  } while (pageToken);

  return users;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function findAuthUser(authUsers = [], account = {}) {
  const firebaseUid = normalizeText(account.firebaseUid);
  const email = syntheticEmailForAccount(account);
  return (
    authUsers.find((user) => firebaseUid && user.uid === firebaseUid) ||
    authUsers.find((user) => normalizeText(user.email).toLowerCase() === email) ||
    null
  );
}

function sanitizedPreState(account = {}, authUser = null) {
  return {
    account: maskId(account.id),
    role: normalizeText(account.role || "viewer"),
    active: normalizeText(account.accountStatus || "active") === "active",
    hadFirebaseUid: Boolean(account.firebaseUid),
    firebaseUid: account.firebaseUid ? maskId(account.firebaseUid) : "",
    authUser: authUser ? "exists" : "missing",
    accountIdClaimMatches: Boolean(authUser?.customClaims?.accountId === account.id),
    hasLegacyCredential: Boolean(account.passwordHash),
  };
}

async function createOrReuseAuthUser(auth, authUsers, account) {
  const existing = findAuthUser(authUsers, account);
  if (existing) {
    const user = await auth.getUser(existing.uid);
    return { user, created: false };
  }

  const user = await auth.createUser({
    email: syntheticEmailForAccount(account),
    disabled: false,
    emailVerified: false,
  });
  return { user, created: true };
}

async function executeCanaryMigration({ context, accounts, authUsers, accountId }) {
  const selection = selectCanaryAccount(accounts, authUsers, { accountId });
  if (!selection.selected) {
    throw new Error("No safe active admin canary candidate matched the requested account.");
  }

  const account = selection.selected.account;
  const existingAuthUser = findAuthUser(authUsers, account);
  const before = sanitizedPreState(account, existingAuthUser);
  const startedAt = new Date().toISOString();

  const { user, created } = await createOrReuseAuthUser(context.auth, authUsers, account);
  const previousClaims = user.customClaims || {};
  await context.auth.setCustomUserClaims(user.uid, {
    ...previousClaims,
    accountId: account.id,
  });

  const verifiedAuthUser = await context.auth.getUser(user.uid);
  if (verifiedAuthUser.customClaims?.accountId !== account.id) {
    throw new Error("Custom claim verification failed after setCustomUserClaims.");
  }

  await context.db.collection(ACCOUNTS_COLLECTION).doc(account.id).update({
    firebaseUid: user.uid,
    "identityMigration.phase": "22E",
    "identityMigration.strategy": PHASE22E_IDENTIFIER_STRATEGY,
    "identityMigration.migrationCreatedAuthUser": created,
    "identityMigration.migratedAtIso": startedAt,
    "identityMigration.updatedAtIso": new Date().toISOString(),
  });

  const updatedDoc = await context.db.collection(ACCOUNTS_COLLECTION).doc(account.id).get();
  const updatedAccount = { id: updatedDoc.id, ...updatedDoc.data() };
  if (updatedAccount.firebaseUid !== user.uid) {
    throw new Error("Firestore firebaseUid mapping verification failed.");
  }

  const result = {
    timestamp: new Date().toISOString(),
    projectId: context.projectId,
    mode: "execute",
    dryRun: false,
    account: maskId(account.id),
    role: normalizeText(account.role || "viewer"),
    identifierStrategy: PHASE22E_IDENTIFIER_STRATEGY,
    intendedIdentifier: syntheticEmailForAccount(account),
    preState: before,
    postState: {
      account: maskId(updatedAccount.id),
      firebaseUid: maskId(updatedAccount.firebaseUid),
      authUser: "exists",
      accountIdClaimMatches: true,
      firestoreMappingMatches: true,
      migrationCreatedAuthUser: created,
    },
    rollback: {
      available: true,
      command: `node tools/migration/phase22e-identity-migration.js --project=${context.projectId} --account=<same-account-id> --rollback --confirm=${PHASE22E_ROLLBACK_CONFIRM}`,
      deletesAuthUserOnlyIfMigrationCreatedIt: true,
    },
    authUsersCreated: created ? 1 : 0,
    customClaimsWritten: 1,
    firestoreDocumentsUpdated: 1,
    accountsAffected: 1,
  };

  return {
    ...result,
    writes: countProductionWrites(result),
  };
}

async function rollbackCanaryMigration({ context, accounts, authUsers, accountId }) {
  const account = accounts.find((candidate) => normalizeText(candidate.id) === accountId);
  if (!account) throw new Error("Requested account was not found.");
  if (normalizeText(account?.identityMigration?.phase) !== "22E") {
    throw new Error("Rollback refused: account is not marked as Phase 22E migrated.");
  }

  const authUser = findAuthUser(authUsers, account);
  if (!authUser) throw new Error("Rollback refused: mapped Auth user was not found.");
  if (authUser.customClaims?.accountId !== account.id) {
    throw new Error("Rollback refused: Auth claim does not match the account.");
  }

  const nextClaims = { ...(authUser.customClaims || {}) };
  delete nextClaims.accountId;
  await context.auth.setCustomUserClaims(authUser.uid, nextClaims);

  if (account.identityMigration?.migrationCreatedAuthUser === true) {
    await context.auth.deleteUser(authUser.uid);
  }

  await context.db.collection(ACCOUNTS_COLLECTION).doc(account.id).update({
    firebaseUid: FieldValue.delete(),
    "identityMigration.rolledBackAtIso": new Date().toISOString(),
    "identityMigration.rollbackPhase": "22E",
  });

  const result = {
    timestamp: new Date().toISOString(),
    projectId: context.projectId,
    mode: "rollback",
    dryRun: false,
    account: maskId(account.id),
    authUserDeleted: account.identityMigration?.migrationCreatedAuthUser === true,
    customClaimsWritten: 1,
    firestoreDocumentsUpdated: 1,
    accountsAffected: 1,
  };

  return {
    ...result,
    writes: countProductionWrites(result),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertOptions(options);

  const context = await createAdminContext({ projectId: options.projectId });
  const accounts = await readUserAccounts(context.db);
  const authUsers = await listAuthUsersWithClaims(context.auth);
  const outDir = resolve(options.outDir);
  await mkdir(outDir, { recursive: true });

  let output;
  if (options.execute) {
    output = await executeCanaryMigration({
      context,
      accounts,
      authUsers,
      accountId: normalizeText(options.accountId),
    });
  } else if (options.rollback) {
    output = await rollbackCanaryMigration({
      context,
      accounts,
      authUsers,
      accountId: normalizeText(options.accountId),
    });
  } else {
    output = {
      timestamp: new Date().toISOString(),
      projectId: options.projectId,
      mode: "dry-run",
      ...buildCanaryDryRunResult(accounts, authUsers, { accountId: options.accountId }),
    };
  }

  const outFile = join(outDir, "phase22e-controlled-canary-journal.json");
  await writeJson(outFile, output);

  console.log(JSON.stringify({
    timestamp: output.timestamp,
    projectId: options.projectId,
    mode: output.mode,
    dryRun: output.dryRun,
    account: output.account || output.selected?.account || "",
    writes: output.writes || countProductionWrites(output),
    output: outFile,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
