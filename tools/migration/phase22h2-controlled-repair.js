#!/usr/bin/env node
/* global process */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { isExpiredActiveSession, buildExpiredSessionTransition } from "../../api/_lib/sessionLifecycle.js";
import { createAdminContext } from "./firebaseAdminClient.js";
import {
  PHASE22H2_EXECUTE_CONFIRM,
  assertProductionSafeguards,
  buildIdentityMaterialFingerprint,
  buildOrphanDispositionPlan,
  classifyIdentityRepairCases,
  maskReference,
  stableChecksum,
} from "./phase22h2RepairCore.js";

const EXPECTED = Object.freeze({ accounts: 2, requests: 5, authUsers: 5, classA: 1, classB: 3, classC: 1 });
const SENSITIVE_KEY = /(password|salt|token|national.?id|phone|reset.?link|private.?key)/i;

function parseArgs(argv) {
  return argv.reduce(
    (options, arg) => {
      if (arg === "--execute") return { ...options, execute: true, dryRun: false };
      if (arg === "--dry-run") return { ...options, execute: false, dryRun: true };
      if (arg.startsWith("--project=")) return { ...options, projectId: arg.slice(10) };
      if (arg.startsWith("--confirm=")) return { ...options, confirm: arg.slice(10) };
      if (arg.startsWith("--actor=")) return { ...options, actor: arg.slice(8) };
      if (arg.startsWith("--out=")) return { ...options, outDir: arg.slice(6) };
      if (arg.startsWith("--decision=")) {
        const [reference, disposition] = arg.slice(11).split(":");
        return { ...options, decisions: { ...options.decisions, [reference]: disposition } };
      }
      return options;
    },
    {
      execute: false,
      dryRun: true,
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "nekaba2026",
      confirm: "",
      actor: process.env.PHASE22H2_ACTOR || "phase22h2_operator",
      outDir: "migration-output",
      decisions: {},
    }
  );
}

function toSerializable(value) {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toSerializable);
  if (typeof value === "object") {
    return Object.entries(value).reduce((result, [key, item]) => {
      result[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : toSerializable(item);
      return result;
    }, {});
  }
  return value;
}

function documentRows(snapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function readCollection(db, name) {
  return documentRows(await db.collection(name).get());
}

async function listAuthUsers(auth) {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(
      ...page.users.map((user) => ({
        uid: user.uid,
        email: user.email || "",
        emailVerified: Boolean(user.emailVerified),
        disabled: Boolean(user.disabled),
        creationTime: user.metadata?.creationTime || "",
        lastSignInTime: user.metadata?.lastSignInTime || "",
        customClaims: user.customClaims || {},
      }))
    );
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function readState(context) {
  const [accounts, requests, authUsers, employees, recoveries, audits, sessions] = await Promise.all([
    readCollection(context.db, "user_accounts"),
    readCollection(context.db, "registration_requests"),
    listAuthUsers(context.auth),
    readCollection(context.db, "employees"),
    readCollection(context.db, "account_recovery_requests").catch(() => []),
    readCollection(context.db, "audit_logs"),
    readCollection(context.db, "auth_sessions"),
  ]);
  return { accounts, requests, authUsers, employees, recoveries, audits, sessions };
}

function relatedState(state, now) {
  const requestAccountIds = new Set(state.requests.map((item) => String(item.accountId || "")).filter(Boolean));
  const employeeIds = new Set(state.requests.map((item) => String(item.employeeId || "")).filter(Boolean));
  const requestIds = new Set(state.requests.map((item) => String(item.id || "")).filter(Boolean));
  const authUids = new Set(state.requests.map((item) => String(item.firebaseUid || "")).filter(Boolean));
  const relatedRecoveries = state.recoveries.filter(
    (item) => requestAccountIds.has(String(item.accountId || "")) || employeeIds.has(String(item.employeeId || ""))
  );
  const relatedAudits = state.audits.filter((item) => {
    const target = String(item.targetId || "");
    return requestAccountIds.has(target) || employeeIds.has(target) || requestIds.has(target) || authUids.has(target);
  });
  const affectedEmployees = state.employees.filter((item) => employeeIds.has(String(item.id || "")));
  const affectedSessions = state.sessions.filter((item) => isExpiredActiveSession(item, now));
  return { relatedRecoveries, relatedAudits, affectedEmployees, affectedSessions };
}

function assertExpectedBaseline(state, classified) {
  const actual = {
    accounts: state.accounts.length,
    requests: state.requests.length,
    authUsers: state.authUsers.length,
    classA: classified.classA.length,
    classB: classified.classB.length,
    classC: classified.classC.length,
  };
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (actual[key] !== expected) throw new Error(`Material baseline drift: ${key} expected ${expected}, found ${actual[key]}.`);
  }
  if (classified.unclassified.length) throw new Error("Material baseline drift: unclassified registration identity exists.");

  const stale = classified.classA[0];
  if (stale.request.status !== "email_pending_verification" || !stale.expired || !stale.employee || !stale.deletionAudit) {
    throw new Error("Class A evidence no longer matches the proven stale reservation.");
  }

  const valid = classified.classC[0];
  if (
    valid.request.status !== "email_pending_verification" ||
    valid.account.accountStatus !== "active" ||
    valid.account.registrationState !== "email_pending_verification" ||
    valid.authUser.disabled ||
    !valid.authUser.emailVerified ||
    valid.authUser.customClaims?.accountId !== valid.account.id
  ) {
    throw new Error("Class C lifecycle or identity evidence changed.");
  }

  for (const orphan of classified.classB) {
    if (
      orphan.request.status !== "email_pending_verification" ||
      !orphan.expired ||
      orphan.authUser.disabled ||
      !orphan.authUser.emailVerified ||
      orphan.authUser.customClaims?.accountId !== orphan.request.accountId
    ) {
      throw new Error(`Class B evidence changed for ${maskReference(orphan.authUser.uid)}.`);
    }
  }
  return actual;
}

function selectOrphanPlans(classified, decisions) {
  return classified.classB.map((identityCase) => {
    const uid = identityCase.authUser.uid;
    const maskedUid = maskReference(uid);
    const disposition = decisions[uid] || decisions[maskedUid] || "HOLD";
    const plan = buildOrphanDispositionPlan(identityCase, disposition);
    if (plan.disposition !== "HOLD") {
      throw new Error(`Non-HOLD disposition for ${maskedUid} requires a separately reviewed evidence package.`);
    }
    return {
      uid,
      maskedUid,
      request: identityCase.request.id,
      maskedRequest: maskReference(identityCase.request.id),
      account: identityCase.request.accountId,
      maskedAccount: maskReference(identityCase.request.accountId),
      ...plan,
    };
  });
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildSnapshot({ state, related, classified, context, reconciliationId, actor, capturedAt }) {
  const sections = {
    registrationRequests: state.requests,
    userAccounts: state.accounts,
    recoveryRequests: related.relatedRecoveries,
    auditEvents: related.relatedAudits,
    employees: related.affectedEmployees,
    affectedSessions: related.affectedSessions,
    firebaseAuthUsers: state.authUsers,
  };
  const sectionHashes = Object.fromEntries(
    Object.entries(sections).map(([name, rows]) => [name, stableChecksum(rows)])
  );
  const rollback = {
    classARequest: {
      id: classified.classA[0].request.id,
      lifecycle: toSerializable(classified.classA[0].request),
    },
    classCAccount: {
      id: classified.classC[0].account.id,
      registrationState: classified.classC[0].account.registrationState,
      updatedAt: toSerializable(classified.classC[0].account.updatedAt),
      updatedAtIso: classified.classC[0].account.updatedAtIso || "",
    },
    classCRequest: {
      id: classified.classC[0].request.id,
      lifecycle: toSerializable(classified.classC[0].request),
    },
    sessions: related.affectedSessions.map((session) => ({
      id: session.id,
      status: session.status,
      expiresAt: toSerializable(session.expiresAt),
    })),
  };
  const snapshotHash = stableChecksum({ sectionHashes, rollback });
  return {
    phase: "22H.2",
    reconciliationId,
    actor,
    projectId: context.projectId,
    capturedAt,
    counts: Object.fromEntries(Object.entries(sections).map(([name, rows]) => [name, rows.length])),
    sectionHashes,
    snapshotHash,
    sections: Object.fromEntries(
      Object.entries(sections).map(([name, rows]) => [name, toSerializable(rows)])
    ),
    rollback,
    redaction: "Password, salt, token, national-ID, phone, reset-link, and private-key fields are redacted.",
  };
}

function auditRecord({ reconciliationId, actor, targetId, action, oldState, newState, disposition, reason, snapshotHash, firebaseImpact = false, sessionImpact = false, nowIso }) {
  return {
    action,
    userId: actor,
    userName: actor,
    role: "operator",
    targetId,
    riskLevel: "high",
    reconciliationId,
    affectedReference: maskReference(targetId),
    oldLifecycleState: oldState,
    newLifecycleState: newState,
    disposition,
    reason,
    snapshotHash,
    firebaseImpact,
    sessionImpact,
    createdAt: FieldValue.serverTimestamp(),
    createdAtIso: nowIso,
  };
}

async function repairClassA({ context, identityCase, reconciliationId, actor, snapshotHash }) {
  const requestRef = context.db.collection("registration_requests").doc(identityCase.request.id);
  const accountRef = context.db.collection("user_accounts").doc(identityCase.request.accountId);
  const auditRef = context.db.collection("audit_logs").doc();
  const nowIso = new Date().toISOString();
  await context.db.runTransaction(async (transaction) => {
    const [requestDoc, accountDoc] = await Promise.all([transaction.get(requestRef), transaction.get(accountRef)]);
    if (!requestDoc.exists || accountDoc.exists) throw new Error("Class A precondition conflict.");
    const current = requestDoc.data();
    if (
      current.status !== identityCase.request.status ||
      current.accountId !== identityCase.request.accountId ||
      current.firebaseUid !== identityCase.request.firebaseUid ||
      current.employeeId !== identityCase.request.employeeId
    ) {
      throw new Error("Class A request changed after snapshot.");
    }
    transaction.update(requestRef, {
      status: "retired",
      retiredAt: FieldValue.serverTimestamp(),
      retiredAtIso: nowIso,
      retiredBy: actor,
      retiredReason: "post_deletion_identity_absent",
      reconciliationId,
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: nowIso,
    });
    transaction.set(
      auditRef,
      auditRecord({
        reconciliationId,
        actor,
        targetId: identityCase.request.id,
        action: "registration.stale_reservation_cleared",
        oldState: identityCase.request.status,
        newState: "retired",
        disposition: "CLEAR_STALE_REGISTRATION_RESERVATION",
        reason: "post_deletion_identity_absent",
        snapshotHash,
        nowIso,
      })
    );
  });
  const verified = await requestRef.get();
  if (!verified.exists || verified.data().status !== "retired" || verified.data().reconciliationId !== reconciliationId) {
    throw new Error("Class A post-write verification failed.");
  }
  return { request: maskReference(identityCase.request.id), writes: 2 };
}

async function repairClassC({ context, identityCase, reconciliationId, actor, snapshotHash }) {
  const accountRef = context.db.collection("user_accounts").doc(identityCase.account.id);
  const requestRef = context.db.collection("registration_requests").doc(identityCase.request.id);
  const auditRef = context.db.collection("audit_logs").doc();
  const nowIso = new Date().toISOString();
  const currentAuth = await context.auth.getUser(identityCase.authUser.uid);
  if (
    currentAuth.disabled ||
    !currentAuth.emailVerified ||
    currentAuth.customClaims?.accountId !== identityCase.account.id
  ) {
    throw new Error("Class C Firebase identity changed after snapshot.");
  }

  await context.db.runTransaction(async (transaction) => {
    const [accountDoc, requestDoc] = await Promise.all([transaction.get(accountRef), transaction.get(requestRef)]);
    if (!accountDoc.exists || !requestDoc.exists) throw new Error("Class C document disappeared after snapshot.");
    const account = accountDoc.data();
    const request = requestDoc.data();
    if (
      account.accountStatus !== "active" ||
      account.registrationState !== "email_pending_verification" ||
      account.firebaseUid !== identityCase.authUser.uid ||
      request.status !== "email_pending_verification" ||
      request.accountId !== identityCase.account.id ||
      request.firebaseUid !== identityCase.authUser.uid
    ) {
      throw new Error("Class C lifecycle changed after snapshot.");
    }
    transaction.update(accountRef, {
      registrationState: "active",
      registrationReconciliationId: reconciliationId,
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: nowIso,
    });
    transaction.update(requestRef, {
      status: "completed",
      completedAt: FieldValue.serverTimestamp(),
      completedAtIso: nowIso,
      completedBy: actor,
      reconciliationId,
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: nowIso,
    });
    transaction.set(
      auditRef,
      auditRecord({
        reconciliationId,
        actor,
        targetId: identityCase.account.id,
        action: "registration.lifecycle_reconciled",
        oldState: "active/email_pending_verification",
        newState: "active/active",
        disposition: "LIFECYCLE_RECONCILIATION_ONLY",
        reason: "valid_firebase_native_lifecycle_stale",
        snapshotHash,
        nowIso,
      })
    );
  });
  const [verifiedAccount, verifiedRequest] = await Promise.all([accountRef.get(), requestRef.get()]);
  if (
    verifiedAccount.data()?.registrationState !== "active" ||
    verifiedRequest.data()?.status !== "completed" ||
    verifiedAccount.data()?.registrationReconciliationId !== reconciliationId ||
    verifiedRequest.data()?.reconciliationId !== reconciliationId
  ) {
    throw new Error("Class C post-write verification failed.");
  }
  return { account: maskReference(identityCase.account.id), request: maskReference(identityCase.request.id), writes: 3 };
}

async function reconcileSessions({ context, sessions, accountIds, reconciliationId, actor, snapshotHash }) {
  const results = [];
  for (const session of sessions) {
    const sessionRef = context.db.collection("auth_sessions").doc(session.id);
    const auditRef = context.db.collection("audit_logs").doc();
    const now = new Date();
    const accountExists = accountIds.has(String(session.userId || ""));
    const transition = buildExpiredSessionTransition(session, { now, accountExists, reconciliationId, actor });
    if (!transition) throw new Error(`Session ${maskReference(session.id)} is no longer eligible for expiry reconciliation.`);

    await context.db.runTransaction(async (transaction) => {
      const currentDoc = await transaction.get(sessionRef);
      if (!currentDoc.exists || !isExpiredActiveSession(currentDoc.data(), now.getTime())) {
        throw new Error(`Session ${maskReference(session.id)} changed after snapshot.`);
      }
      transaction.update(sessionRef, {
        ...transition,
        expiredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(
        auditRef,
        auditRecord({
          reconciliationId,
          actor,
          targetId: session.id,
          action: "identity.session_expired_reconciled",
          oldState: "active",
          newState: "expired",
          disposition: "SESSION_EXPIRY_RECONCILIATION",
          reason: transition.expiredReason,
          snapshotHash,
          sessionImpact: true,
          nowIso: transition.expiredAtIso,
        })
      );
    });
    const verified = await sessionRef.get();
    if (verified.data()?.status !== "expired" || verified.data()?.reconciliationId !== reconciliationId) {
      throw new Error(`Session ${maskReference(session.id)} post-write verification failed.`);
    }
    results.push({ session: maskReference(session.id), reason: transition.expiredReason, writes: 2 });
  }
  return results;
}

function duplicateCount(rows, keySelector) {
  const counts = new Map();
  for (const row of rows) {
    const key = String(keySelector(row) || "");
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.values()).filter((count) => count > 1).length;
}

function finalInventory(state, now = Date.now()) {
  const authByUid = new Map(state.authUsers.map((user) => [user.uid, user]));
  const accountIds = new Set(state.accounts.map((account) => account.id));
  const orphanFirebase = state.authUsers.filter(
    (user) => user.customClaims?.accountId && !accountIds.has(user.customClaims.accountId)
  );
  const orphanFirestore = state.accounts.filter((account) => account.firebaseUid && !authByUid.has(account.firebaseUid));
  const currentClaimMismatches = state.accounts.filter(
    (account) => account.firebaseUid && authByUid.get(account.firebaseUid)?.customClaims?.accountId !== account.id
  );
  const activeExpired = state.sessions.filter((session) => isExpiredActiveSession(session, now));
  const staleRequests = state.requests.filter(
    (request) =>
      ["identity_verified", "email_pending_verification", "pending_approval"].includes(request.status) &&
      new Date(request.expiresAt || 0).getTime() <= now
  );
  const firebaseNative = state.accounts.filter(
    (account) => account.firebaseUid && !account.passwordHash && !account.passwordSalt
  );
  const jitLinked = state.accounts.filter(
    (account) => account.firebaseUid && (account.passwordHash || account.passwordSalt)
  );
  const legacyOnly = state.accounts.filter((account) => !account.firebaseUid);
  const lifecycleInconsistent = firebaseNative.filter(
    (account) => account.accountStatus === "active" && account.registrationState !== "active"
  );
  const mappingConflicts =
    currentClaimMismatches.length +
    duplicateCount(state.accounts, (account) => account.firebaseUid) +
    duplicateCount(state.accounts, (account) => account.employeeId) +
    duplicateCount(state.accounts, (account) => account.employeeCode || account.jobId);

  return {
    appAccountCount: state.accounts.length,
    firebaseAuthCount: state.authUsers.length,
    firebaseNativeCount: firebaseNative.length,
    jitLinkedCount: jitLinked.length,
    legacyOnlyCount: legacyOnly.length,
    orphanFirebaseUserCount: orphanFirebase.length,
    orphanFirebaseUsers: orphanFirebase.map((user) => maskReference(user.uid)),
    orphanFirestoreAccountCount: orphanFirestore.length,
    mappingConflictCount: mappingConflicts,
    staleRegistrationRequestCount: staleRequests.length,
    staleRegistrationRequests: staleRequests.map((request) => maskReference(request.id)),
    activeButExpiredSessionCount: activeExpired.length,
    currentClaimExactCount: state.accounts.length - currentClaimMismatches.length,
    currentClaimExpectedCount: state.accounts.length,
    lifecycleInconsistencyCount: lifecycleInconsistent.length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertProductionSafeguards(options);
  const context = await createAdminContext({ projectId: options.projectId });
  if (context.projectId !== "nekaba2026") throw new Error("Connected Firebase project is not nekaba2026.");

  const reconciliationId = `phase22h2-${randomUUID()}`;
  const capturedAt = new Date().toISOString();
  const state = await readState(context);
  const classified = classifyIdentityRepairCases(state);
  const baseline = assertExpectedBaseline(state, classified);
  const orphanPlans = selectOrphanPlans(classified, options.decisions);
  const related = relatedState(state, Date.now());
  const snapshot = buildSnapshot({
    state,
    related,
    classified,
    context,
    reconciliationId,
    actor: options.actor,
    capturedAt,
  });

  const outDir = resolve(options.outDir);
  await mkdir(outDir, { recursive: true });
  const snapshotFile = join(outDir, `${reconciliationId}-prewrite-snapshot.json`);
  await writeJson(snapshotFile, snapshot);

  const journal = {
    phase: "22H.2",
    reconciliationId,
    actor: options.actor,
    projectId: context.projectId,
    mode: options.execute ? "execute" : "dry-run",
    capturedAt,
    snapshotFile,
    snapshotHash: snapshot.snapshotHash,
    baseline,
    dispositions: orphanPlans.map((plan) => ({
      maskedUid: plan.maskedUid,
      maskedRequest: plan.maskedRequest,
      maskedAccount: plan.maskedAccount,
      disposition: plan.disposition,
      authMutations: plan.authMutations,
      firestoreMutations: plan.firestoreMutations,
      unresolved: plan.unresolved,
    })),
    productionWrites: [],
    productionDeletes: 0,
    firebaseAuthDisables: 0,
    firestoreRulesDeployment: "NO",
  };

  if (options.execute) {
    const immediateState = await readState(context);
    const immediateClassified = classifyIdentityRepairCases(immediateState);
    assertExpectedBaseline(immediateState, immediateClassified);
    if (buildIdentityMaterialFingerprint(state) !== buildIdentityMaterialFingerprint(immediateState)) {
      throw new Error("Material identity state changed between snapshot and write gate.");
    }

    journal.productionWrites.push({
      category: "stale_registration_reservation",
      ...(await repairClassA({
        context,
        identityCase: immediateClassified.classA[0],
        reconciliationId,
        actor: options.actor,
        snapshotHash: snapshot.snapshotHash,
      })),
    });
    journal.productionWrites.push({
      category: "valid_firebase_native_lifecycle",
      ...(await repairClassC({
        context,
        identityCase: immediateClassified.classC[0],
        reconciliationId,
        actor: options.actor,
        snapshotHash: snapshot.snapshotHash,
      })),
    });
    const sessionResults = await reconcileSessions({
      context,
      sessions: related.affectedSessions,
      accountIds: new Set(state.accounts.map((account) => account.id)),
      reconciliationId,
      actor: options.actor,
      snapshotHash: snapshot.snapshotHash,
    });
    journal.productionWrites.push({
      category: "expired_active_sessions",
      sessions: sessionResults,
      sessionDocuments: sessionResults.length,
      writes: sessionResults.reduce((sum, result) => sum + result.writes, 0),
    });
  }

  const postState = options.execute ? await readState(context) : state;
  journal.finalInventory = finalInventory(postState);
  journal.totalProductionWrites = journal.productionWrites.reduce((sum, item) => sum + Number(item.writes || 0), 0);
  journal.completedAt = new Date().toISOString();
  journal.verdict = options.execute
    ? "PHASE 22H.2 PASSED - RECONCILED WITH HOLDS"
    : "DRY RUN - NO PRODUCTION WRITES";

  const journalFile = join(outDir, "phase22h2-controlled-repair-journal.json");
  await writeJson(journalFile, journal);
  console.log(
    JSON.stringify(
      {
        reconciliationId,
        mode: journal.mode,
        projectId: journal.projectId,
        snapshot: snapshotFile,
        journal: journalFile,
        baseline,
        holds: orphanPlans.length,
        affectedExpiredSessions: related.affectedSessions.length,
        totalProductionWrites: journal.totalProductionWrites,
        finalInventory: journal.finalInventory,
        verdict: journal.verdict,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  console.error(`To execute after review: --execute --confirm=${PHASE22H2_EXECUTE_CONFIRM}`);
  process.exitCode = 1;
});
