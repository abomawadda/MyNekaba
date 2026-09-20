import { Buffer } from "node:buffer";
import { compileAuthorizationProjection } from "../../api/_lib/authorizationProjection.js";
import { buildAuthzVersion } from "../../api/_lib/trustedPermissions.js";
import { stableChecksum } from "./phase22h2RepairCore.js";
import {
  CLAIM_ACTION,
  DRIFT_CLASS,
  opaqueReference,
  READINESS_CLASS,
  reconcileAuthorizationSnapshot,
} from "./phase22j7AuthorizationProjectionCore.js";

export const APPLY_CONFIRMATION = "INITIALIZE_PHASE_22J7W_AUTHORIZATION";
export const INITIAL_PERMISSIONS_VERSION = 1;
export const INITIAL_BINDING_VERSION = 1;
export const INITIAL_AUTHZ_VERSION = buildAuthzVersion(
  INITIAL_PERMISSIONS_VERSION,
  INITIAL_BINDING_VERSION
);

function text(value) {
  return String(value ?? "").trim();
}

function timestampText(value) {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return text(value);
}

function normalizeValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeValue(value[key])]));
  }
  return value;
}

function own(account, key) {
  return Object.prototype.hasOwnProperty.call(account, key)
    && account[key] !== undefined
    && account[key] !== null
    && account[key] !== "";
}

export function accountSourceFingerprint(account = {}) {
  return stableChecksum(account);
}

export function claimsFingerprint(claims = {}) {
  return stableChecksum(claims || {});
}

export function projectionFingerprint(projection = {}) {
  const { id: _id, updatedAt: _updatedAt, ...comparable } = projection || {};
  return stableChecksum(normalizeValue(comparable));
}

export function projectionsMatch(expected = {}, actual = {}) {
  const expectedKeys = Object.keys(expected).filter((key) => key !== "updatedAt").sort();
  const actualKeys = Object.keys(actual).filter((key) => key !== "id" && key !== "updatedAt").sort();
  if (stableChecksum(expectedKeys) !== stableChecksum(actualKeys)) return false;
  const expectedComparable = Object.fromEntries(expectedKeys.map((key) => [key, normalizeValue(expected[key])]));
  const actualComparable = Object.fromEntries(expectedKeys.map((key) => [key, normalizeValue(actual[key])]));
  return stableChecksum(expectedComparable) === stableChecksum(actualComparable);
}

export function buildCompactClaims(previousClaims = {}, accountId) {
  const exactAccountId = text(accountId);
  if (!exactAccountId) throw new Error("missing_exact_account_id");
  const nextClaims = {
    ...(previousClaims || {}),
    accountId: exactAccountId,
    permissionsVersion: INITIAL_PERMISSIONS_VERSION,
    bindingVersion: INITIAL_BINDING_VERSION,
    authzVersion: INITIAL_AUTHZ_VERSION,
  };
  if (Buffer.byteLength(JSON.stringify(nextClaims), "utf8") > 1000) {
    throw new Error("custom_claims_payload_too_large");
  }
  return nextClaims;
}

export function claimsMatchContract(claims = {}, accountId) {
  return text(claims.accountId) === text(accountId)
    && claims.permissionsVersion === INITIAL_PERMISSIONS_VERSION
    && claims.bindingVersion === INITIAL_BINDING_VERSION
    && claims.authzVersion === INITIAL_AUTHZ_VERSION;
}

function assertGlobalGate(result) {
  const summary = result.summary;
  const eligible = summary.projectionReady + summary.readyWithVersionInitialization;
  if (
    summary.applicationAccounts !== 2
    || summary.firebaseAuthUsers !== 5
    || eligible !== 2
    || summary.blockedBinding !== 0
    || summary.blockedPermissions !== 0
    || summary.holdOrphan !== 3
    || summary.inactive !== 0
    || summary.unknown !== 0
    || summary.duplicateUidBindings !== 0
    || summary.duplicateEmployeeBindings !== 0
    || summary.invalidOverrides !== 0
  ) {
    throw new Error("fresh_reconciliation_gate_failed");
  }
}

function targetStatus({ account, accountResult, authUser, existingProjection }) {
  const sourceVersionsPresent = own(account, "permissionsVersion") || own(account, "bindingVersion");
  if (accountResult.readinessClass === READINESS_CLASS.initialize) {
    if (sourceVersionsPresent) throw new Error("unexpected_source_version_state");
    if (existingProjection) throw new Error("unexpected_existing_projection");
    if (accountResult.claims.action !== CLAIM_ACTION.initialize) {
      throw new Error("unexpected_claim_initialization_state");
    }
    const claims = authUser.customClaims || {};
    if (
      own(claims, "permissionsVersion")
      || own(claims, "bindingVersion")
      || own(claims, "authzVersion")
    ) {
      throw new Error("partial_authorization_claim_state");
    }
    return "INITIALIZE";
  }

  if (accountResult.readinessClass === READINESS_CLASS.ready) {
    if (!sourceVersionsPresent || !existingProjection) throw new Error("partial_initialization_state");
    if (accountResult.claims.action !== CLAIM_ACTION.none) throw new Error("partial_claim_initialization_state");
    if (!accountResult.drift.includes(DRIFT_CLASS.none)) throw new Error("initialized_projection_drift");
    return "ALREADY_INITIALIZED";
  }
  throw new Error("account_not_approved_for_initialization");
}

export function buildInitializationPlan(snapshot = {}, { projectId = "nekaba2026" } = {}) {
  if (projectId !== "nekaba2026") throw new Error("unexpected_firebase_project");
  const reconciliation = reconcileAuthorizationSnapshot(snapshot);
  assertGlobalGate(reconciliation);
  const accountById = new Map((snapshot.accounts || []).map((account) => [text(account.id), account]));
  const authByUid = new Map((snapshot.authUsers || []).map((user) => [text(user.uid), user]));
  const projectionByUid = new Map((snapshot.existingProjections || []).map((projection) => [
    text(projection.id || projection.firebaseUid),
    projection,
  ]));
  const employeeById = new Map((snapshot.employees || []).map((employee) => [text(employee.id), employee]));

  const targets = reconciliation.accounts.map((accountResult) => {
    const account = accountById.get(accountResult.accountId);
    const authUser = authByUid.get(text(account.firebaseUid));
    const existingProjection = projectionByUid.get(text(account.firebaseUid));
    if (!account || !authUser) throw new Error("approved_target_source_missing");
    const status = targetStatus({ account, accountResult, authUser, existingProjection });
    const versionedAccount = {
      ...account,
      permissionsVersion: INITIAL_PERMISSIONS_VERSION,
      bindingVersion: INITIAL_BINDING_VERSION,
    };
    const expectedProjection = compileAuthorizationProjection(versionedAccount, {
      updatedAt: "<SERVER_TIMESTAMP>",
    });
    const employee = text(account.employeeId) ? employeeById.get(text(account.employeeId)) : null;
    return {
      status,
      account,
      authUser,
      employee,
      existingProjection,
      accountResult,
      accountRef: opaqueReference("account", account.id),
      authRef: opaqueReference("auth", authUser.uid),
      employeeRef: opaqueReference("employee", account.employeeId),
      sourceFingerprint: accountSourceFingerprint(account),
      claimsFingerprint: claimsFingerprint(authUser.customClaims || {}),
      employeeFingerprint: employee ? stableChecksum(employee) : "",
      previousClaims: { ...(authUser.customClaims || {}) },
      previousVersionFields: {
        permissionsVersionPresent: own(account, "permissionsVersion"),
        permissionsVersion: own(account, "permissionsVersion") ? account.permissionsVersion : null,
        bindingVersionPresent: own(account, "bindingVersion"),
        bindingVersion: own(account, "bindingVersion") ? account.bindingVersion : null,
      },
      expectedProjection,
      expectedProjectionFingerprint: projectionFingerprint(expectedProjection),
      nextClaims: buildCompactClaims(authUser.customClaims || {}, account.id),
    };
  }).sort((left, right) => left.accountRef.localeCompare(right.accountRef));

  const snapshotAccountFingerprints = (snapshot.accounts || [])
    .map((account) => ({ id: account.id, hash: accountSourceFingerprint(account) }))
    .sort((left, right) => text(left.id).localeCompare(text(right.id)));
  const holdRefs = reconciliation.authOnlyIdentities
    .filter((item) => item.readinessClass === READINESS_CLASS.hold)
    .map((item) => item.authRef)
    .sort();
  const fingerprint = stableChecksum({
    projectId,
    summary: reconciliation.summary,
    targets: targets.map((target) => ({
      accountRef: target.accountRef,
      authRef: target.authRef,
      status: target.status,
      sourceFingerprint: target.sourceFingerprint,
      claimsFingerprint: target.claimsFingerprint,
      expectedProjectionFingerprint: target.expectedProjectionFingerprint,
    })),
    holdRefs,
  });

  return {
    projectId,
    fingerprint,
    reconciliation,
    snapshot,
    snapshotAccountFingerprints,
    holdRefs,
    targets,
    counts: {
      eligibleTargets: targets.length,
      initialize: targets.filter((target) => target.status === "INITIALIZE").length,
      alreadyInitialized: targets.filter((target) => target.status === "ALREADY_INITIALIZED").length,
      holdExcluded: holdRefs.length,
      blocked: reconciliation.summary.blockedBinding
        + reconciliation.summary.blockedPermissions
        + reconciliation.summary.unknown,
      plannedSourceVersionWrites: targets.filter((target) => target.status === "INITIALIZE").length,
      plannedProjectionCreates: targets.filter((target) => target.status === "INITIALIZE").length,
      plannedClaimUpdates: targets.filter((target) => target.status === "INITIALIZE").length,
    },
  };
}

export function buildSafePreWriteManifest(plan, metadata = {}) {
  return {
    phase: "22J.7W",
    mode: metadata.mode || "DRY_RUN",
    projectId: plan.projectId,
    runId: metadata.runId || "",
    capturedAt: metadata.capturedAt || new Date().toISOString(),
    reconciliationFingerprint: plan.fingerprint,
    counts: plan.counts,
    reconciliationSummary: plan.reconciliation.summary,
    holdRefs: plan.holdRefs,
    targets: plan.targets.map((target) => ({
      accountRef: target.accountRef,
      authRef: target.authRef,
      employeeRef: target.employeeRef,
      status: target.status,
      sourceFingerprint: target.sourceFingerprint,
      employeeFingerprint: target.employeeFingerprint,
      claimsFingerprint: target.claimsFingerprint,
      existingClaimKeys: Object.keys(target.previousClaims).sort(),
      expectedClaimKeys: Object.keys(target.nextClaims).sort(),
      expectedProjectionFingerprint: target.expectedProjectionFingerprint,
      previousVersionFields: target.previousVersionFields,
      proposedVersions: {
        permissionsVersion: INITIAL_PERMISSIONS_VERSION,
        bindingVersion: INITIAL_BINDING_VERSION,
        authzVersion: INITIAL_AUTHZ_VERSION,
      },
    })),
    sensitiveValuesStored: false,
    marker: "CONTROLLED_INITIALIZATION_MANIFEST",
  };
}

export function verifyFinalTargetState({ account, projection, authUser, target }) {
  const sourceVersionsMatch = account.permissionsVersion === INITIAL_PERMISSIONS_VERSION
    && account.bindingVersion === INITIAL_BINDING_VERSION;
  const projectionMatchesExpected = projectionsMatch(target.expectedProjection, projection);
  const claimsMatch = claimsMatchContract(authUser.customClaims || {}, account.id);
  const bindingExact = text(account.firebaseUid) === text(authUser.uid)
    && text(projection.firebaseUid) === text(authUser.uid)
    && text(projection.accountId) === text(account.id);
  return {
    valid: sourceVersionsMatch && projectionMatchesExpected && claimsMatch && bindingExact,
    sourceVersionsMatch,
    projectionMatchesExpected,
    claimsMatch,
    bindingExact,
    sourceUpdatedAt: timestampText(account.updatedAtIso || account.updatedAt),
  };
}
