#!/usr/bin/env node
/* global process */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createAdminContext, readUserAccounts } from "./firebaseAdminClient.js";

function parseArgs(argv) {
  return argv.reduce(
    (options, arg) => {
      if (arg.startsWith("--project=")) return { ...options, projectId: arg.slice("--project=".length) };
      if (arg.startsWith("--out=")) return { ...options, outDir: arg.slice("--out=".length) };
      if (arg.startsWith("--sample=")) return { ...options, sample: Number(arg.slice("--sample=".length)) || 20 };
      return options;
    },
    {
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "",
      outDir: "migration-output",
      sample: 20,
    }
  );
}

function assertOptions(options) {
  if (!options.projectId) throw new Error("Missing project id. Use --project=<firebase-project-id>.");
}

function roleBucket(role = "") {
  return role || "missing";
}

function emptyRoleSummary() {
  return {
    total: 0,
    active: 0,
    withFirebaseUid: 0,
    uidEqualsDocId: 0,
    uidDiffersFromDocId: 0,
    authUserFound: 0,
    authUserMissing: 0,
    accountIdClaimEqualsDocId: 0,
    accountIdClaimMissing: 0,
    accountIdClaimMismatch: 0,
    withEmployeeId: 0,
    withEmployeeCode: 0,
  };
}

function increment(summary, role, key, amount = 1) {
  if (!summary.byRole[role]) summary.byRole[role] = emptyRoleSummary();
  summary.byRole[role][key] += amount;
}

function classifyModel(summary) {
  if (summary.total === 0) return "UNKNOWN";
  if (summary.uidEqualsDocId === summary.withFirebaseUid && summary.withFirebaseUid > 0) return "Model A";
  if (summary.uidDiffersFromDocId > 0 && summary.accountIdClaimEqualsDocId === summary.uidDiffersFromDocId) return "Model C";
  if (summary.uidDiffersFromDocId > 0 && summary.accountIdClaimEqualsDocId === 0) return "Model B";
  return "Model D";
}

function redactId(value = "") {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return `${text.slice(0, 2)}***${text.slice(-2)}`;
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertOptions(options);

  const context = await createAdminContext({ projectId: options.projectId });
  const accounts = await readUserAccounts(context.db);
  const authByUid = new Map();
  let nextPageToken;

  do {
    const page = await context.auth.listUsers(1000, nextPageToken);
    page.users.forEach((user) => {
      authByUid.set(user.uid, {
        uid: user.uid,
        disabled: Boolean(user.disabled),
        customClaims: user.customClaims || {},
      });
    });
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  const summary = {
    timestamp: new Date().toISOString(),
    projectId: options.projectId,
    writesPerformed: 0,
    totalAuthUsers: authByUid.size,
    authUsersWithAccountIdClaim: 0,
    total: accounts.length,
    withFirebaseUid: 0,
    uidEqualsDocId: 0,
    uidDiffersFromDocId: 0,
    authUserFound: 0,
    authUserMissing: 0,
    accountIdClaimEqualsDocId: 0,
    accountIdClaimMissing: 0,
    accountIdClaimMismatch: 0,
    activeMembers: 0,
    activeMembersRulesCompatible: 0,
    activeMembersNeedAccountIdClaim: 0,
    byRole: {},
    sample: [],
  };

  authByUid.forEach((authUser) => {
    if (authUser.customClaims?.accountId) summary.authUsersWithAccountIdClaim += 1;
  });

  accounts.forEach((account) => {
    const role = roleBucket(account.role);
    const bucket = summary.byRole[role] || emptyRoleSummary();
    summary.byRole[role] = bucket;
    bucket.total += 1;

    if (account.accountStatus === "active") {
      bucket.active += 1;
      if (role === "member") summary.activeMembers += 1;
    }
    if (account.employeeId) bucket.withEmployeeId += 1;
    if (account.employeeCode) bucket.withEmployeeCode += 1;

    const firebaseUid = String(account.firebaseUid || "").trim();
    const authUser = firebaseUid ? authByUid.get(firebaseUid) : null;
    const claims = authUser?.customClaims || {};
    const accountIdClaim = String(claims.accountId || "").trim();
    const uidEqualsDoc = firebaseUid && firebaseUid === account.id;
    const claimEqualsDoc = accountIdClaim && accountIdClaim === account.id;

    if (firebaseUid) {
      summary.withFirebaseUid += 1;
      bucket.withFirebaseUid += 1;
      if (uidEqualsDoc) {
        summary.uidEqualsDocId += 1;
        bucket.uidEqualsDocId += 1;
      } else {
        summary.uidDiffersFromDocId += 1;
        bucket.uidDiffersFromDocId += 1;
      }

      if (authUser) {
        summary.authUserFound += 1;
        bucket.authUserFound += 1;
      } else {
        summary.authUserMissing += 1;
        bucket.authUserMissing += 1;
      }

      if (claimEqualsDoc) {
        summary.accountIdClaimEqualsDocId += 1;
        bucket.accountIdClaimEqualsDocId += 1;
      } else if (accountIdClaim) {
        summary.accountIdClaimMismatch += 1;
        bucket.accountIdClaimMismatch += 1;
      } else {
        summary.accountIdClaimMissing += 1;
        bucket.accountIdClaimMissing += 1;
      }
    }

    const rulesCompatible = Boolean(uidEqualsDoc || claimEqualsDoc);
    if (role === "member" && account.accountStatus === "active") {
      if (rulesCompatible) summary.activeMembersRulesCompatible += 1;
      else summary.activeMembersNeedAccountIdClaim += 1;
    }

    if (summary.sample.length < options.sample) {
      summary.sample.push({
        docId: redactId(account.id),
        role,
        accountStatus: account.accountStatus || "",
        hasFirebaseUid: Boolean(firebaseUid),
        uidEqualsDocId: Boolean(uidEqualsDoc),
        authUserFound: Boolean(authUser),
        hasAccountIdClaim: Boolean(accountIdClaim),
        accountIdClaimEqualsDocId: Boolean(claimEqualsDoc),
        hasEmployeeId: Boolean(account.employeeId),
        hasEmployeeCode: Boolean(account.employeeCode),
      });
    }

    increment(summary, role, "total", 0);
  });

  summary.productionModel = classifyModel(summary);

  const outDir = resolve(options.outDir);
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, "phase22c-identity-audit.json");
  await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    timestamp: summary.timestamp,
    projectId: summary.projectId,
    writesPerformed: summary.writesPerformed,
    productionModel: summary.productionModel,
    total: summary.total,
    withFirebaseUid: summary.withFirebaseUid,
    totalAuthUsers: summary.totalAuthUsers,
    authUsersWithAccountIdClaim: summary.authUsersWithAccountIdClaim,
    uidEqualsDocId: summary.uidEqualsDocId,
    uidDiffersFromDocId: summary.uidDiffersFromDocId,
    accountIdClaimEqualsDocId: summary.accountIdClaimEqualsDocId,
    accountIdClaimMissing: summary.accountIdClaimMissing,
    activeMembers: summary.activeMembers,
    activeMembersRulesCompatible: summary.activeMembersRulesCompatible,
    activeMembersNeedAccountIdClaim: summary.activeMembersNeedAccountIdClaim,
    byRole: summary.byRole,
    output: outPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
