#!/usr/bin/env node
/* global process */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createAdminContext, readUserAccounts } from "./firebaseAdminClient.js";
import { buildPhase22dDryRunPlan } from "./phase22dIdentityMigrationCore.js";

function parseArgs(argv) {
  return argv.reduce(
    (options, arg) => {
      if (arg === "--dry-run") return { ...options, dryRun: true };
      if (arg === "--execute") return { ...options, execute: true, dryRun: false };
      if (arg === "--include-inactive") return { ...options, includeInactive: true };
      if (arg.startsWith("--project=")) return { ...options, projectId: arg.slice("--project=".length) };
      if (arg.startsWith("--out=")) return { ...options, outDir: arg.slice("--out=".length) };
      return options;
    },
    {
      dryRun: true,
      execute: false,
      includeInactive: false,
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "",
      outDir: "migration-output",
    }
  );
}

function assertSafe(options) {
  if (options.execute) {
    throw new Error("Phase 22D is dry-run only. Remove --execute; production identity writes are forbidden.");
  }
  if (!options.projectId) {
    throw new Error("Missing project id. Use --project=<firebase-project-id>.");
  }
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertSafe(options);

  const context = await createAdminContext({ projectId: options.projectId });
  const accounts = await readUserAccounts(context.db);
  const authUsers = await listAuthUsersWithClaims(context.auth);
  const plan = buildPhase22dDryRunPlan(accounts, authUsers, {
    includeInactive: options.includeInactive,
  });

  const output = {
    timestamp: new Date().toISOString(),
    projectId: options.projectId,
    dryRun: true,
    writesPerformed: 0,
    includeInactive: options.includeInactive,
    identifierStrategy: plan.strategy,
    summary: plan.summary,
    rows: plan.rows.map((row) => ({
      account: row.account,
      role: row.role,
      active: row.active,
      firebaseUser: row.firebaseUser,
      intendedIdentifier: row.intendedIdentifier,
      intendedAction: row.intendedAction,
      claimAction: row.claimAction,
      firebaseUidAction: row.firebaseUidAction,
      conflict: row.conflict,
      issues: row.issues,
      dryRun: row.dryRun,
      writesPerformed: row.writesPerformed,
    })),
  };

  const outDir = resolve(options.outDir);
  await mkdir(outDir, { recursive: true });
  await writeJson(join(outDir, "phase22d-identity-migration-dry-run.json"), output);

  console.log(JSON.stringify({
    timestamp: output.timestamp,
    projectId: output.projectId,
    dryRun: output.dryRun,
    writesPerformed: output.writesPerformed,
    identifierStrategy: output.identifierStrategy,
    summary: output.summary,
    output: join(outDir, "phase22d-identity-migration-dry-run.json"),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
