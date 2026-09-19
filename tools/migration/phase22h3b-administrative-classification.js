#!/usr/bin/env node
/* global process */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { createAdminContext, readUserAccounts } from "./firebaseAdminClient.js";
import { stableChecksum } from "./phase22h2RepairCore.js";
import {
  OPERATOR_DECISION_REFERENCE,
  assertProductionPreconditions,
  buildClassificationPatch,
  buildSafePreWriteSnapshot,
  selectAdministrativeJitCandidate,
  verifyHoldIdentities,
} from "./phase22h3bIdentityCore.js";

function parseArgs(argv) {
  return argv.reduce(
    (options, arg) => {
      if (arg === "--execute") return { ...options, execute: true };
      if (arg.startsWith("--project=")) return { ...options, projectId: arg.slice("--project=".length) };
      if (arg.startsWith("--confirm=")) return { ...options, confirm: arg.slice("--confirm=".length) };
      if (arg.startsWith("--out=")) return { ...options, outDir: arg.slice("--out=".length) };
      return options;
    },
    {
      execute: false,
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "",
      confirm: "",
      outDir: "migration-output",
    }
  );
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function listAuthUsersWithClaims(auth) {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const context = await createAdminContext({ projectId: options.projectId });
  const connectedProjectId = String(context.auth.app.options.projectId || "");
  const [accounts, employeesSnapshot, auditsSnapshot, requestsSnapshot, authUsers] = await Promise.all([
    readUserAccounts(context.db),
    context.db.collection("employees").get(),
    context.db.collection("audit_logs").get(),
    context.db.collection("registration_requests").get(),
    listAuthUsersWithClaims(context.auth),
  ]);
  const employees = employeesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const selection = selectAdministrativeJitCandidate(accounts);
  if (!selection.candidate) throw new Error(`JIT_ADMIN_CANDIDATE_COUNT_${selection.count}`);
  const account = selection.candidate;
  const authUser = authUsers.find((candidate) => candidate.uid === account.firebaseUid);
  const requests = requestsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const holdVerification = verifyHoldIdentities({ authUsers, accounts, requests });
  const audits = auditsSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((audit) => String(audit.targetId || audit.userId || "") === String(account.id))
    .sort((a, b) => String(a.createdAtIso || "").localeCompare(String(b.createdAtIso || "")));

  const preconditions = assertProductionPreconditions({
    projectId: options.projectId,
    connectedProjectId,
    account,
    authUser,
    accounts,
    employees,
    execute: options.execute,
    confirm: options.confirm,
  });

  const classificationId = `phase22h3b-${randomUUID()}`;
  const capturedAtIso = new Date().toISOString();
  const snapshot = buildSafePreWriteSnapshot({
    projectId: connectedProjectId,
    classificationId,
    account,
    authUser,
    employeeEvidence: preconditions.employeeEvidence,
    audits,
    holdVerification,
    capturedAtIso,
  });
  const outDir = resolve(options.outDir);
  await mkdir(outDir, { recursive: true });
  const snapshotPath = resolve(outDir, `${classificationId}-prewrite-snapshot.json`);
  await writeJson(snapshotPath, snapshot);

  if (!options.execute) {
    console.log(JSON.stringify({
      success: true,
      mode: "dry-run",
      projectId: connectedProjectId,
      classificationId,
      accountReference: snapshot.accountReference,
      authReference: snapshot.authReference,
      beforeStateHash: snapshot.beforeStateHash,
      employeeMatches: snapshot.employeeEvidence.totalMatches,
      holdIdentitiesUnchanged: snapshot.holdVerification.count,
      snapshotPath,
      writes: 0,
    }, null, 2));
    return;
  }

  const accountRef = context.db.collection("user_accounts").doc(account.id);
  const auditRef = context.db.collection("audit_logs").doc();
  const timestampIso = new Date().toISOString();
  const patch = buildClassificationPatch({ classificationId, timestampIso });

  await context.db.runTransaction(async (transaction) => {
    const currentDoc = await transaction.get(accountRef);
    if (!currentDoc.exists) throw new Error("TARGET_ACCOUNT_MISSING_AT_WRITE");
    const currentAccount = { id: currentDoc.id, ...currentDoc.data() };
    if (stableChecksum(currentAccount) !== snapshot.beforeStateHash) throw new Error("PREWRITE_STATE_CHANGED");
    assertProductionPreconditions({
      projectId: options.projectId,
      connectedProjectId,
      account: currentAccount,
      authUser,
      accounts: accounts.map((candidate) => candidate.id === currentAccount.id ? currentAccount : candidate),
      employees,
      execute: true,
      confirm: options.confirm,
    });

    transaction.update(accountRef, {
      ...patch,
      identityTypeClassifiedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(auditRef, {
      action: "identity.administrative_classified",
      actor: "phase22h3b_operator",
      userId: "phase22h3b_operator",
      targetId: account.id,
      riskLevel: "high",
      details: {
        accountReference: snapshot.accountReference,
        oldIdentityType: account.identityType || null,
        newIdentityType: "administrative",
        classificationReason: patch.identityTypeReason,
        classificationSource: patch.identityTypeSource,
        classificationId,
        operatorDecisionReference: OPERATOR_DECISION_REFERENCE,
      },
      createdAt: FieldValue.serverTimestamp(),
      createdAtIso: timestampIso,
    });
  });

  const [verifiedDoc, verifiedAuthUser] = await Promise.all([
    accountRef.get(),
    context.auth.getUser(account.firebaseUid),
  ]);
  const verified = { id: verifiedDoc.id, ...verifiedDoc.data() };
  if (
    verified.identityType !== "administrative" ||
    verified.identityTypeClassificationId !== classificationId ||
    verified.firebaseUid !== account.firebaseUid ||
    verified.role !== account.role ||
    verified.accountStatus !== account.accountStatus ||
    verifiedAuthUser.customClaims?.accountId !== account.id
  ) {
    throw new Error("POSTWRITE_VERIFICATION_FAILED");
  }
  const writtenAudit = await auditRef.get();
  if (!writtenAudit.exists || writtenAudit.data()?.details?.classificationId !== classificationId) {
    throw new Error("AUDIT_VERIFICATION_FAILED");
  }

  const journalPath = resolve(outDir, `${classificationId}-journal.json`);
  await writeJson(journalPath, {
    phase: "22H.3B",
    success: true,
    projectId: connectedProjectId,
    classificationId,
    timestampIso,
    accountReference: snapshot.accountReference,
    authReference: snapshot.authReference,
    beforeStateHash: snapshot.beforeStateHash,
    afterStateHash: stableChecksum(verified),
    operatorDecisionReference: OPERATOR_DECISION_REFERENCE,
    productionWrites: { accountClassification: 1, auditEvent: 1 },
    firebaseAuthMutations: 0,
    claimsMutations: 0,
    rollback: snapshot.rollback,
  });

  console.log(JSON.stringify({
    success: true,
    mode: "execute",
    projectId: connectedProjectId,
    classificationId,
    accountReference: snapshot.accountReference,
    authReference: snapshot.authReference,
    snapshotPath,
    journalPath,
    productionWrites: { accountClassification: 1, auditEvent: 1 },
    firebaseAuthMutations: 0,
    claimsMutations: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error?.message || "unknown" }));
  process.exitCode = 1;
});
