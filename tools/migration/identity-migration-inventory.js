#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildMigrationInventory,
  buildMigrationPlan,
  createExecutionRecord,
} from "./identityMigrationCore.js";
import { createAdminContext, listAuthUsers, readUserAccounts } from "./firebaseAdminClient.js";

function parseArgs(argv) {
  return argv.reduce(
    (options, arg) => {
      if (arg === "--apply") return { ...options, apply: true, dryRun: false };
      if (arg === "--dry-run") return { ...options, dryRun: true };
      if (arg === "--skip-auth") return { ...options, skipAuth: true };
      if (arg.startsWith("--project=")) return { ...options, projectId: arg.slice("--project=".length) };
      if (arg.startsWith("--out=")) return { ...options, outDir: arg.slice("--out=".length) };
      return options;
    },
    {
      apply: false,
      dryRun: true,
      skipAuth: false,
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "",
      outDir: "migration-output",
    }
  );
}

function assertSafeMode(options) {
  if (options.apply) {
    throw new Error("Phase 5 tooling is dry-run only. Remove --apply; no writes are implemented.");
  }
  if (!options.projectId) {
    throw new Error("Missing project id. Use --project=<firebase-project-id>.");
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertSafeMode(options);

  const executionId = crypto.randomUUID();
  const outDir = resolve(options.outDir, executionId);
  await mkdir(outDir, { recursive: true });

  const context = await createAdminContext({ projectId: options.projectId });
  const accounts = await readUserAccounts(context.db);
  const authUsers = options.skipAuth ? [] : await listAuthUsers(context.auth);
  const inventory = buildMigrationInventory(accounts, authUsers);
  const plan = buildMigrationPlan(inventory);
  const migrationLog = plan.map((item) =>
    createExecutionRecord({
      projectId: options.projectId,
      dryRun: true,
      plan: item,
    })
  );

  const summary = {
    executionId,
    timestamp: new Date().toISOString(),
    projectId: options.projectId,
    dryRun: true,
    writesPerformed: 0,
    authUsersCreated: 0,
    firestoreUpdates: 0,
    ...inventory.summary,
  };

  await writeJson(join(outDir, "migration-summary.json"), summary);
  await writeJson(join(outDir, "migration-conflicts.json"), inventory.collisions);
  await writeJson(join(outDir, "migration-plan.json"), plan);
  await writeJson(join(outDir, "migration-log.json"), migrationLog);

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Dry-run output written to ${outDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
