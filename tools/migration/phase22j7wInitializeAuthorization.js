/* global process */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FieldValue } from "firebase-admin/firestore";
import { createAdminContext } from "./firebaseAdminClient.js";
import { readProductionSnapshot } from "./phase22j7AuthorizationProjectionDryRun.js";
import {
  accountSourceFingerprint,
  APPLY_CONFIRMATION,
  buildInitializationPlan,
  buildSafePreWriteManifest,
  claimsFingerprint,
  INITIAL_AUTHZ_VERSION,
  INITIAL_BINDING_VERSION,
  INITIAL_PERMISSIONS_VERSION,
  projectionsMatch,
  verifyFinalTargetState,
} from "./phase22j7wAuthorizationCore.js";

const DEFAULT_OUT_DIR = "migration-output";

function parseArgs(argv) {
  return argv.reduce((options, arg) => {
    if (arg === "--dry-run") return { ...options, mode: "dry-run" };
    if (arg === "--apply") return { ...options, mode: "apply" };
    if (arg === "--verify") return { ...options, mode: "verify" };
    if (arg.startsWith("--project=")) return { ...options, projectId: arg.slice(10) };
    if (arg.startsWith("--confirm=")) return { ...options, confirm: arg.slice(10) };
    if (arg.startsWith("--fingerprint=")) return { ...options, fingerprint: arg.slice(14) };
    if (arg.startsWith("--out=")) return { ...options, outDir: arg.slice(6) };
    return options;
  }, {
    mode: "dry-run",
    projectId: "nekaba2026",
    confirm: "",
    fingerprint: "",
    outDir: DEFAULT_OUT_DIR,
  });
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function connectedProjectId(context) {
  return String(context.auth?.app?.options?.projectId || context.projectId || "");
}

function assertApplyOptions(options, plan) {
  if (options.confirm !== APPLY_CONFIRMATION) {
    throw new Error(`apply_confirmation_required:${APPLY_CONFIRMATION}`);
  }
  if (!options.fingerprint || options.fingerprint !== plan.fingerprint) {
    throw new Error("fresh_reconciliation_fingerprint_mismatch");
  }
}

function assertSnapshotAccounts(currentAccounts, expectedFingerprints) {
  const actual = currentAccounts
    .map((account) => ({ id: account.id, hash: accountSourceFingerprint(account) }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  if (JSON.stringify(actual) !== JSON.stringify(expectedFingerprints)) {
    throw new Error("concurrent_account_source_change");
  }
}

async function initializeFirestoreState(context, target, plan) {
  const accountRef = context.db.collection("user_accounts").doc(target.account.id);
  const projectionRef = context.db.collection("account_authorization").doc(target.authUser.uid);
  await context.db.runTransaction(async (transaction) => {
    const accountsSnapshot = await transaction.get(context.db.collection("user_accounts"));
    const currentAccounts = accountsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    assertSnapshotAccounts(currentAccounts, plan.snapshotAccountFingerprints);
    const currentAccount = currentAccounts.find((account) => account.id === target.account.id);
    if (!currentAccount || accountSourceFingerprint(currentAccount) !== target.sourceFingerprint) {
      throw new Error("target_source_changed_before_write");
    }
    if (
      currentAccount.permissionsVersion !== undefined
      || currentAccount.bindingVersion !== undefined
    ) {
      throw new Error("source_versions_already_present_at_write");
    }

    if (target.employee) {
      const employeeDoc = await transaction.get(context.db.collection("employees").doc(target.employee.id));
      if (!employeeDoc.exists) throw new Error("employee_missing_at_write");
      const currentEmployee = { id: employeeDoc.id, ...employeeDoc.data() };
      if (accountSourceFingerprint(currentEmployee) !== target.employeeFingerprint) {
        throw new Error("employee_changed_before_write");
      }
    }

    const projectionDoc = await transaction.get(projectionRef);
    if (projectionDoc.exists) throw new Error("unexpected_projection_at_write");

    transaction.update(accountRef, {
      permissionsVersion: INITIAL_PERMISSIONS_VERSION,
      bindingVersion: INITIAL_BINDING_VERSION,
    });
    transaction.create(projectionRef, {
      ...target.expectedProjection,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function readTargetState(context, target) {
  const [accountDoc, projectionDoc, authUser] = await Promise.all([
    context.db.collection("user_accounts").doc(target.account.id).get(),
    context.db.collection("account_authorization").doc(target.authUser.uid).get(),
    context.auth.getUser(target.authUser.uid),
  ]);
  return {
    account: accountDoc.exists ? { id: accountDoc.id, ...accountDoc.data() } : null,
    projection: projectionDoc.exists ? { id: projectionDoc.id, ...projectionDoc.data() } : null,
    authUser,
  };
}

async function verifyFirestoreBeforeClaims(context, target) {
  const state = await readTargetState(context, target);
  if (!state.account || !state.projection) throw new Error("firestore_initialization_missing");
  if (
    state.account.permissionsVersion !== INITIAL_PERMISSIONS_VERSION
    || state.account.bindingVersion !== INITIAL_BINDING_VERSION
    || !projectionsMatch(target.expectedProjection, state.projection)
  ) {
    throw new Error("firestore_initialization_verification_failed");
  }
  return state;
}

async function rollbackFirestoreBeforeClaims(context, target) {
  const accountRef = context.db.collection("user_accounts").doc(target.account.id);
  const projectionRef = context.db.collection("account_authorization").doc(target.authUser.uid);
  await context.db.runTransaction(async (transaction) => {
    const accountDoc = await transaction.get(accountRef);
    const projectionDoc = await transaction.get(projectionRef);
    if (!accountDoc.exists || !projectionDoc.exists) throw new Error("rollback_state_missing");
    const account = { id: accountDoc.id, ...accountDoc.data() };
    const projection = { id: projectionDoc.id, ...projectionDoc.data() };
    if (
      account.permissionsVersion !== INITIAL_PERMISSIONS_VERSION
      || account.bindingVersion !== INITIAL_BINDING_VERSION
      || !projectionsMatch(target.expectedProjection, projection)
    ) {
      throw new Error("rollback_precondition_failed");
    }
    transaction.delete(projectionRef);
    transaction.update(accountRef, {
      permissionsVersion: FieldValue.delete(),
      bindingVersion: FieldValue.delete(),
    });
  });
}

async function invalidateBeforeClaimRollback(context, target) {
  const accountRef = context.db.collection("user_accounts").doc(target.account.id);
  const projectionRef = context.db.collection("account_authorization").doc(target.authUser.uid);
  await context.db.runTransaction(async (transaction) => {
    const accountDoc = await transaction.get(accountRef);
    const projectionDoc = await transaction.get(projectionRef);
    if (!accountDoc.exists || !projectionDoc.exists) throw new Error("incident_state_missing");
    transaction.update(accountRef, { permissionsVersion: 2, bindingVersion: 2 });
    transaction.update(projectionRef, {
      status: "inactive",
      permissionsVersion: 2,
      bindingVersion: 2,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function restoreAfterInvalidation(context, target) {
  const accountRef = context.db.collection("user_accounts").doc(target.account.id);
  const projectionRef = context.db.collection("account_authorization").doc(target.authUser.uid);
  await context.db.runTransaction(async (transaction) => {
    const accountDoc = await transaction.get(accountRef);
    const projectionDoc = await transaction.get(projectionRef);
    if (!accountDoc.exists || !projectionDoc.exists) throw new Error("incident_rollback_state_missing");
    const account = accountDoc.data();
    const projection = projectionDoc.data();
    if (
      account.permissionsVersion !== 2
      || account.bindingVersion !== 2
      || projection.status !== "inactive"
      || projection.permissionsVersion !== 2
      || projection.bindingVersion !== 2
    ) {
      throw new Error("incident_rollback_precondition_failed");
    }
    transaction.delete(projectionRef);
    transaction.update(accountRef, {
      permissionsVersion: FieldValue.delete(),
      bindingVersion: FieldValue.delete(),
    });
  });
}

async function rollbackInitialization(context, target, expectedClaimsMayExist) {
  const currentAuth = await context.auth.getUser(target.authUser.uid);
  const expectedClaimsPresent = expectedClaimsMayExist
    || claimsFingerprint(currentAuth.customClaims || {}) === claimsFingerprint(target.nextClaims);
  if (!expectedClaimsPresent) {
    await rollbackFirestoreBeforeClaims(context, target);
    return { rolledBack: true, refreshTokensRevoked: false };
  }

  await invalidateBeforeClaimRollback(context, target);
  await context.auth.setCustomUserClaims(target.authUser.uid, target.previousClaims);
  const restoredAuth = await context.auth.getUser(target.authUser.uid);
  if (claimsFingerprint(restoredAuth.customClaims || {}) !== claimsFingerprint(target.previousClaims)) {
    throw new Error("incident_claim_restore_failed");
  }
  await context.auth.revokeRefreshTokens(target.authUser.uid);
  await restoreAfterInvalidation(context, target);
  return { rolledBack: true, refreshTokensRevoked: true };
}

async function initializeTarget(context, target, plan) {
  const beforeAuth = await context.auth.getUser(target.authUser.uid);
  if (claimsFingerprint(beforeAuth.customClaims || {}) !== target.claimsFingerprint) {
    throw new Error("auth_claims_changed_before_write");
  }

  let firestoreWritten = false;
  let claimWriteAttempted = false;
  try {
    await initializeFirestoreState(context, target, plan);
    firestoreWritten = true;
    await verifyFirestoreBeforeClaims(context, target);

    const currentAuth = await context.auth.getUser(target.authUser.uid);
    if (claimsFingerprint(currentAuth.customClaims || {}) !== target.claimsFingerprint) {
      throw new Error("auth_claims_changed_before_initialization");
    }
    claimWriteAttempted = true;
    await context.auth.setCustomUserClaims(target.authUser.uid, target.nextClaims);

    const state = await readTargetState(context, target);
    const verification = verifyFinalTargetState({ ...state, target });
    if (!verification.valid) throw new Error("final_target_verification_failed");
    return { initialized: true, verification, refreshTokensRevoked: false };
  } catch (error) {
    if (firestoreWritten) {
      const rollback = await rollbackInitialization(context, target, claimWriteAttempted);
      error.rollback = rollback;
    }
    throw error;
  }
}

function safeOutput(plan, mode, extra = {}) {
  return {
    success: true,
    mode,
    projectId: plan.projectId,
    reconciliationFingerprint: plan.fingerprint,
    eligibleAccounts: plan.counts.eligibleTargets,
    holdExcluded: plan.counts.holdExcluded,
    blocked: plan.counts.blocked,
    writesPlanned: {
      sourceVersionInitialization: plan.counts.plannedSourceVersionWrites,
      projectionCreates: plan.counts.plannedProjectionCreates,
      claimInitializations: plan.counts.plannedClaimUpdates,
    },
    ...extra,
  };
}

export async function runControlledAuthorizationInitialization({ options, context } = {}) {
  if (!options) throw new Error("options_required");
  if (options.projectId !== "nekaba2026") throw new Error("unexpected_firebase_project");
  const adminContext = context || await createAdminContext({ projectId: options.projectId });
  if (connectedProjectId(adminContext) !== "nekaba2026") throw new Error("connected_project_mismatch");
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  await mkdir(outDir, { recursive: true });
  const runId = `phase22j7w-${randomUUID()}`;
  const initialSnapshot = await readProductionSnapshot(adminContext);
  const initialPlan = buildInitializationPlan(initialSnapshot, { projectId: options.projectId });
  const manifest = buildSafePreWriteManifest(initialPlan, { mode: options.mode.toUpperCase(), runId });
  const manifestPath = path.join(outDir, `${runId}-prewrite-manifest.json`);
  await writeJson(manifestPath, manifest);

  if (options.mode === "dry-run") {
    return safeOutput(initialPlan, "dry-run", { manifestPath, writesPerformed: 0 });
  }
  if (options.mode === "verify") {
    return safeOutput(initialPlan, "verify", {
      manifestPath,
      verification: {
        ready: initialPlan.targets.every((target) => target.status === "ALREADY_INITIALIZED"),
        targetStatuses: initialPlan.targets.map((target) => target.status),
      },
      writesPerformed: 0,
    });
  }
  if (options.mode !== "apply") throw new Error("unsupported_mode");
  assertApplyOptions(options, initialPlan);

  const counters = {
    accountsInitialized: 0,
    accountsAlreadyInitialized: 0,
    accountsFailed: 0,
    sourceVersionWrites: 0,
    projectionCreates: 0,
    projectionUpdates: 0,
    claimUpdates: 0,
    holdOrphanWrites: 0,
    employeeWrites: 0,
    storageWrites: 0,
    authUserDisableDeleteActions: 0,
    refreshTokenRevocations: 0,
  };
  const results = [];
  const approvedAccountRefs = initialPlan.targets.map((target) => target.accountRef);

  for (const approvedRef of approvedAccountRefs) {
    const freshSnapshot = await readProductionSnapshot(adminContext);
    const freshPlan = buildInitializationPlan(freshSnapshot, { projectId: options.projectId });
    const target = freshPlan.targets.find((candidate) => candidate.accountRef === approvedRef);
    if (!target) throw new Error("approved_target_left_fresh_target_set");
    if (target.status === "ALREADY_INITIALIZED") {
      counters.accountsAlreadyInitialized += 1;
      results.push({ accountRef: target.accountRef, authRef: target.authRef, result: "ALREADY_INITIALIZED" });
      continue;
    }
    try {
      const initialized = await initializeTarget(adminContext, target, freshPlan);
      counters.accountsInitialized += 1;
      counters.sourceVersionWrites += 1;
      counters.projectionCreates += 1;
      counters.claimUpdates += 1;
      counters.refreshTokenRevocations += initialized.refreshTokensRevoked ? 1 : 0;
      results.push({
        accountRef: target.accountRef,
        authRef: target.authRef,
        result: "INITIALIZED",
        verification: initialized.verification,
      });
    } catch (error) {
      counters.accountsFailed += 1;
      counters.refreshTokenRevocations += error.rollback?.refreshTokensRevoked ? 1 : 0;
      error.counters = counters;
      error.results = results;
      throw error;
    }
  }

  const postSnapshot = await readProductionSnapshot(adminContext);
  const postPlan = buildInitializationPlan(postSnapshot, { projectId: options.projectId });
  if (!postPlan.targets.every((target) => target.status === "ALREADY_INITIALIZED")) {
    throw new Error("post_write_reconciliation_failed");
  }
  const journal = {
    phase: "22J.7W",
    success: true,
    mode: "apply",
    runId,
    projectId: options.projectId,
    appliedAt: new Date().toISOString(),
    preWriteFingerprint: initialPlan.fingerprint,
    postWriteFingerprint: postPlan.fingerprint,
    results,
    counters,
    postWriteSummary: postPlan.reconciliation.summary,
    postWriteDriftCounts: postPlan.reconciliation.driftCounts,
    idempotentRerun: postPlan.targets.every((target) => target.status === "ALREADY_INITIALIZED"),
    freshClientIdTokenRuntimeVerification: "PENDING_MANUAL_LOGIN",
    applicationDeployment: false,
    rulesDeployment: false,
    storageMutation: false,
  };
  const journalPath = path.join(outDir, `${runId}-execution-journal.json`);
  await writeJson(journalPath, journal);
  return safeOutput(postPlan, "apply", {
    manifestPath,
    journalPath,
    counters,
    postWriteSummary: postPlan.reconciliation.summary,
    postWriteDriftCounts: postPlan.reconciliation.driftCounts,
    idempotentRerun: journal.idempotentRerun,
    freshClientIdTokenRuntimeVerification: journal.freshClientIdTokenRuntimeVerification,
    expectedAuthzVersion: INITIAL_AUTHZ_VERSION,
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runControlledAuthorizationInitialization({ options });
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(JSON.stringify({
      success: false,
      error: error?.message || "unknown_error",
      rollback: error?.rollback || null,
      counters: error?.counters || null,
      completedResults: error?.results || [],
    }));
    process.exitCode = 1;
  });
}
