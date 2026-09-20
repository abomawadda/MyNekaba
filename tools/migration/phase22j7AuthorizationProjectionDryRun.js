/* global process */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createAdminContext } from "./firebaseAdminClient.js";
import {
  buildSafeArtifact,
  reconcileAuthorizationSnapshot,
} from "./phase22j7AuthorizationProjectionCore.js";

const DEFAULT_OUTPUT = "migration-output/phase-22j7-authorization-projection-dry-run.json";

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

async function listAuthUsersReadOnly(auth) {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users.map((user) => ({
      uid: user.uid,
      disabled: Boolean(user.disabled),
      emailVerified: Boolean(user.emailVerified),
      customClaims: { ...(user.customClaims || {}) },
    })));
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function readCollection(db, name) {
  const snapshot = await db.collection(name).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function readProductionSnapshot({ db, auth }) {
  const [accounts, employees, authUsers, existingProjections] = await Promise.all([
    readCollection(db, "user_accounts"),
    readCollection(db, "employees"),
    listAuthUsersReadOnly(auth),
    readCollection(db, "account_authorization"),
  ]);
  return { accounts, employees, authUsers, existingProjections };
}

export async function runAuthorizationProjectionDryRun({ projectId, outputPath = DEFAULT_OUTPUT, context } = {}) {
  if (projectId !== "nekaba2026") throw new Error("unexpected_firebase_project");
  const adminContext = context || await createAdminContext({ projectId });
  const snapshot = await readProductionSnapshot(adminContext);
  const result = reconcileAuthorizationSnapshot(snapshot);
  const artifact = buildSafeArtifact(result, { projectId });
  const resolvedOutput = path.resolve(outputPath);
  await mkdir(path.dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return { result, artifact, outputPath: resolvedOutput };
}

async function main() {
  const projectId = argument("project", "nekaba2026");
  const outputPath = argument("output", DEFAULT_OUTPUT);
  const { artifact, outputPath: resolvedOutput } = await runAuthorizationProjectionDryRun({ projectId, outputPath });
  console.log(JSON.stringify({
    mode: artifact.mode,
    projectId: artifact.projectId,
    summary: artifact.summary,
    readiness: artifact.readiness,
    outputPath: resolvedOutput,
    writesPerformed: 0,
  }, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`Phase 22J.7 dry-run failed: ${error.message}`);
    process.exitCode = 1;
  });
}
