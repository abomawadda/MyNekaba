import { createHash } from "node:crypto";
import { compileAuthorizationProjection } from "../../api/_lib/authorizationProjection.js";
import { effectiveIdentityType, IDENTITY_TYPE } from "../../api/_lib/identityClassification.js";
import {
  buildAuthzVersion,
  compileEffectivePermissions,
  normalizeAuthorizationVersion,
} from "../../api/_lib/trustedPermissions.js";

export const READINESS_CLASS = Object.freeze({
  ready: "P1_READY",
  initialize: "P2_READY_WITH_VERSION_INITIALIZATION",
  binding: "P3_BLOCKED_BINDING",
  permissions: "P4_BLOCKED_PERMISSIONS",
  hold: "P5_HOLD_ORPHAN",
  inactive: "P6_INACTIVE",
  unknown: "P7_UNKNOWN",
});

export const CLAIM_ACTION = Object.freeze({
  none: "NONE",
  initialize: "INITIALIZE",
  refresh: "REFRESH_REQUIRED",
  revoke: "REVOKE_AND_REFRESH_REQUIRED",
  blocked: "BLOCKED",
});

export const DRIFT_CLASS = Object.freeze({
  none: "NO_DRIFT",
  projectionMissing: "PROJECTION_MISSING",
  projectionStalePermissions: "PROJECTION_STALE_PERMISSIONS",
  projectionStaleBinding: "PROJECTION_STALE_BINDING",
  claimsStale: "CLAIMS_STALE",
  claimsMissingVersion: "CLAIMS_MISSING_VERSION",
  uidMismatch: "UID_MISMATCH",
  accountMissing: "ACCOUNT_MISSING",
  employeeBindingMismatch: "EMPLOYEE_BINDING_MISMATCH",
  invalidOverride: "INVALID_OVERRIDE",
  unknownRole: "UNKNOWN_ROLE",
  inactiveAccount: "INACTIVE_ACCOUNT",
});

export const PROJECTION_FIELDS = Object.freeze([
  "schemaVersion",
  "accountId",
  "firebaseUid",
  "identityType",
  "employeeId",
  "status",
  "capabilities",
  "permissionsVersion",
  "permissionsHash",
  "bindingVersion",
  "sourceAccountUpdatedAt",
  "updatedAt",
]);

const DRY_RUN_TIMESTAMP = "<SERVER_TIMESTAMP>";

function text(value) {
  return String(value ?? "").trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function opaqueReference(kind, value) {
  const exact = text(value);
  return exact ? `ref_${sha256(`${kind}:${exact}`).slice(0, 10)}` : "";
}

function duplicateKeys(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const key = text(selector(item));
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

function hasExplicitVersion(account, key) {
  return account[key] !== undefined && account[key] !== null && account[key] !== "";
}

function versionProposal(account) {
  const permissionsVersion = normalizeAuthorizationVersion(account.permissionsVersion, 1);
  const bindingVersion = normalizeAuthorizationVersion(account.bindingVersion, 1);
  return {
    permissionsVersion,
    bindingVersion,
    authzVersion: buildAuthzVersion(permissionsVersion, bindingVersion),
    initializationRequired:
      !hasExplicitVersion(account, "permissionsVersion") || !hasExplicitVersion(account, "bindingVersion"),
  };
}

export function reconcileClaims(authUser, account, versions) {
  if (!authUser || !account || !versions) return { action: CLAIM_ACTION.blocked };
  const claims = authUser.customClaims || {};
  const accountIdExact = text(claims.accountId) === text(account.id);
  const versionClaimsPresent = ["permissionsVersion", "bindingVersion", "authzVersion"]
    .every((key) => claims[key] !== undefined && claims[key] !== null && claims[key] !== "");

  if (!accountIdExact) {
    return { accountIdExact: false, versionClaimsPresent, versionsMatch: false, action: CLAIM_ACTION.revoke };
  }
  if (!versionClaimsPresent) {
    return { accountIdExact: true, versionClaimsPresent: false, versionsMatch: false, action: CLAIM_ACTION.initialize };
  }

  const versionsMatch =
    claims.permissionsVersion === versions.permissionsVersion
    && claims.bindingVersion === versions.bindingVersion
    && claims.authzVersion === versions.authzVersion;
  if (versionsMatch) {
    return { accountIdExact: true, versionClaimsPresent: true, versionsMatch: true, action: CLAIM_ACTION.none };
  }

  const claimsCouldBeMorePrivileged =
    Number(claims.permissionsVersion) > versions.permissionsVersion
    || Number(claims.bindingVersion) > versions.bindingVersion;
  return {
    accountIdExact: true,
    versionClaimsPresent: true,
    versionsMatch: false,
    action: claimsCouldBeMorePrivileged ? CLAIM_ACTION.revoke : CLAIM_ACTION.refresh,
  };
}

function validateBinding({ account, authByUid, authByClaim, employeeById, duplicateUids, duplicateEmployees }) {
  const firebaseUid = text(account.firebaseUid);
  if (!firebaseUid || duplicateUids.has(firebaseUid)) return { valid: false, reason: "firebase_uid_missing_or_duplicate" };

  const authUser = authByUid.get(firebaseUid);
  if (!authUser) {
    const claimed = authByClaim.get(text(account.id)) || [];
    return { valid: false, reason: claimed.length ? "firebase_uid_mismatch" : "firebase_user_missing" };
  }
  if (text(authUser.uid) !== firebaseUid) return { valid: false, reason: "firebase_uid_mismatch" };
  if (text(authUser.customClaims?.accountId) !== text(account.id)) {
    return { valid: false, reason: "account_claim_mismatch", authUser };
  }

  const identityType = effectiveIdentityType(account);
  if (![IDENTITY_TYPE.employee, IDENTITY_TYPE.administrative].includes(identityType)) {
    return { valid: false, reason: "invalid_identity_type", authUser };
  }

  const employeeFields = [account.employeeId, account.employeeCode, account.jobId, account.nationalId]
    .map(text)
    .filter(Boolean);
  if (identityType === IDENTITY_TYPE.administrative) {
    if (employeeFields.length) return { valid: false, reason: "administrative_employee_conflict", authUser };
    return { valid: true, authUser, identityType, employeeId: null };
  }

  const employeeId = text(account.employeeId);
  if (!employeeId || !employeeById.has(employeeId)) {
    return { valid: false, reason: "employee_mapping_missing", authUser };
  }
  if (duplicateEmployees.has(employeeId)) {
    return { valid: false, reason: "duplicate_employee_mapping", authUser };
  }
  return { valid: true, authUser, identityType, employeeId };
}

function projectionDrift(existing, proposed) {
  if (!existing) return DRIFT_CLASS.projectionMissing;
  if (
    text(existing.firebaseUid) !== text(proposed.firebaseUid)
    || text(existing.accountId) !== text(proposed.accountId)
  ) return DRIFT_CLASS.uidMismatch;
  if (
    text(existing.identityType) !== text(proposed.identityType)
    || text(existing.employeeId) !== text(proposed.employeeId)
    || Number(existing.bindingVersion) !== proposed.bindingVersion
  ) return DRIFT_CLASS.projectionStaleBinding;
  if (
    text(existing.permissionsHash) !== proposed.permissionsHash
    || Number(existing.permissionsVersion) !== proposed.permissionsVersion
    || stableJson(existing.capabilities || {}) !== stableJson(proposed.capabilities)
  ) return DRIFT_CLASS.projectionStalePermissions;

  const comparable = Object.fromEntries(PROJECTION_FIELDS
    .filter((field) => field !== "updatedAt")
    .map((field) => [field, existing[field]]));
  const target = Object.fromEntries(PROJECTION_FIELDS
    .filter((field) => field !== "updatedAt")
    .map((field) => [field, proposed[field]]));
  return stableJson(comparable) === stableJson(target) ? DRIFT_CLASS.none : DRIFT_CLASS.projectionStaleBinding;
}

export function validateProjectionSafety(documentId, projection) {
  const keys = Object.keys(projection).sort();
  const allowed = [...PROJECTION_FIELDS].sort();
  const capabilitiesValid = projection.capabilities
    && Object.values(projection.capabilities).every((value) => typeof value === "boolean");
  const noPiiFields = !keys.some((key) => /email|phone|national|password|token/i.test(key));
  const identityValid = projection.identityType === IDENTITY_TYPE.employee
    ? Boolean(text(projection.employeeId))
    : projection.identityType === IDENTITY_TYPE.administrative && projection.employeeId === null;
  return {
    safe:
      stableJson(keys) === stableJson(allowed)
      && text(documentId) === text(projection.firebaseUid)
      && projection.status === "active"
      && capabilitiesValid
      && noPiiFields
      && identityValid,
    documentIdMatchesUid: text(documentId) === text(projection.firebaseUid),
    fieldsWhitelisted: stableJson(keys) === stableJson(allowed),
    capabilitiesCanonicalBooleans: Boolean(capabilitiesValid),
    piiFieldsAbsent: noPiiFields,
    identitySemanticsValid: identityValid,
  };
}

function classifyAccount(context, account) {
  const accountId = text(account.id);
  const base = {
    accountId,
    accountRef: opaqueReference("account", accountId),
    authRef: opaqueReference("auth", account.firebaseUid),
    employeeRef: opaqueReference("employee", account.employeeId),
    projection: null,
    projectionDocumentId: "",
    projectionSafety: null,
    determinism: null,
    permissionState: null,
    versions: null,
    claims: { action: CLAIM_ACTION.blocked },
    drift: [],
    reason: "",
  };

  if (text(account.accountStatus) !== "active") {
    return { ...base, readinessClass: READINESS_CLASS.inactive, reason: "inactive_account", drift: [DRIFT_CLASS.inactiveAccount] };
  }

  const binding = validateBinding({ account, ...context });
  if (!binding.valid) {
    const drift = binding.reason.includes("employee")
      ? DRIFT_CLASS.employeeBindingMismatch
      : DRIFT_CLASS.uidMismatch;
    return { ...base, readinessClass: READINESS_CLASS.binding, reason: binding.reason, drift: [drift] };
  }

  let permissionState;
  try {
    permissionState = compileEffectivePermissions(account);
  } catch (error) {
    const reason = error?.message || "permission_compilation_failed";
    return {
      ...base,
      readinessClass: READINESS_CLASS.permissions,
      reason,
      drift: [reason === "invalid_account_role" ? DRIFT_CLASS.unknownRole : DRIFT_CLASS.invalidOverride],
    };
  }
  if (permissionState.unknownOverrides.length) {
    return {
      ...base,
      readinessClass: READINESS_CLASS.permissions,
      reason: "invalid_permission_override",
      permissionState,
      drift: [DRIFT_CLASS.invalidOverride],
    };
  }

  let versions;
  try {
    versions = versionProposal(account);
  } catch (error) {
    return { ...base, readinessClass: READINESS_CLASS.unknown, reason: error?.message || "invalid_version" };
  }

  const projectionA = compileAuthorizationProjection(account, { updatedAt: DRY_RUN_TIMESTAMP });
  const projectionB = compileAuthorizationProjection(account, { updatedAt: DRY_RUN_TIMESTAMP });
  const deterministic = stableJson(projectionA) === stableJson(projectionB);
  const projectionSafety = validateProjectionSafety(binding.authUser.uid, projectionA);
  if (!deterministic || !projectionSafety.safe) {
    return {
      ...base,
      readinessClass: READINESS_CLASS.unknown,
      reason: deterministic ? "unsafe_projection" : "non_deterministic_projection",
      permissionState,
      versions,
      projectionSafety,
    };
  }

  const claims = reconcileClaims(binding.authUser, account, versions);
  const existing = context.projectionByUid.get(binding.authUser.uid);
  const drift = [projectionDrift(existing, projectionA)];
  if (!claims.versionClaimsPresent) drift.push(DRIFT_CLASS.claimsMissingVersion);
  else if (!claims.versionsMatch) drift.push(DRIFT_CLASS.claimsStale);

  return {
    ...base,
    readinessClass: versions.initializationRequired ? READINESS_CLASS.initialize : READINESS_CLASS.ready,
    reason: versions.initializationRequired ? "version_initialization_required" : "ready",
    authRef: opaqueReference("auth", binding.authUser.uid),
    employeeRef: opaqueReference("employee", binding.employeeId),
    projection: projectionA,
    projectionDocumentId: binding.authUser.uid,
    projectionSafety,
    determinism: {
      projection: deterministic,
      permissionsHash: permissionState.permissionsHash === compileEffectivePermissions(account).permissionsHash,
      versions: stableJson(versions) === stableJson(versionProposal(account)),
    },
    permissionState,
    versions,
    claims,
    drift: [...new Set(drift)],
  };
}

function safeProjection(accountResult) {
  if (!accountResult.projection) return null;
  return {
    documentId: accountResult.authRef,
    document: {
      ...accountResult.projection,
      accountId: accountResult.accountRef,
      firebaseUid: accountResult.authRef,
      employeeId: accountResult.projection.employeeId === null ? null : accountResult.employeeRef,
    },
    exactProjectionHash: sha256(stableJson(accountResult.projection)),
    marker: "DRY_RUN_ONLY",
  };
}

export function buildSafeArtifact(result, metadata = {}) {
  return {
    schemaVersion: 1,
    mode: "DRY_RUN_ONLY",
    generatedAt: metadata.generatedAt || new Date().toISOString(),
    projectId: metadata.projectId || "",
    summary: result.summary,
    determinism: result.determinism,
    readiness: result.readiness,
    driftCounts: result.driftCounts,
    accounts: result.accounts.map((item) => ({
      accountRef: item.accountRef,
      authRef: item.authRef,
      employeeRef: item.employeeRef,
      readinessClass: item.readinessClass,
      reason: item.reason,
      roleRecognized: Boolean(item.permissionState?.role),
      overrideCount: item.permissionState?.validOverrides?.length || 0,
      invalidOverrideCount: item.permissionState?.unknownOverrides?.length || 0,
      storageCapabilityCount: Object.values(item.permissionState?.capabilities || {}).filter(Boolean).length,
      permissionsHashPresent: Boolean(item.permissionState?.permissionsHash),
      permissionsHashRef: item.permissionState?.permissionsHash
        ? opaqueReference("permissions", item.permissionState.permissionsHash)
        : "",
      versions: item.versions,
      claims: item.claims,
      drift: item.drift,
      projectionSafety: item.projectionSafety,
      determinism: item.determinism,
      proposedProjection: safeProjection(item),
    })),
    authOnlyIdentities: result.authOnlyIdentities,
    productionMutations: {
      projectionWrites: 0,
      accountWrites: 0,
      employeeWrites: 0,
      claimMutations: 0,
      authMutations: 0,
      storageReads: 0,
      storageWrites: 0,
      storageDeletes: 0,
      holdMutations: 0,
    },
  };
}

export function reconcileAuthorizationSnapshot(snapshot = {}) {
  const accounts = snapshot.accounts || [];
  const employees = snapshot.employees || [];
  const authUsers = snapshot.authUsers || [];
  const existingProjections = snapshot.existingProjections || [];
  const authByUid = new Map(authUsers.map((user) => [text(user.uid), user]));
  const authByClaim = new Map();
  for (const user of authUsers) {
    const accountId = text(user.customClaims?.accountId);
    if (!accountId) continue;
    authByClaim.set(accountId, [...(authByClaim.get(accountId) || []), user]);
  }
  const employeeById = new Map(employees.map((employee) => [text(employee.id), employee]));
  const duplicateUids = duplicateKeys(accounts, (account) => account.firebaseUid);
  const employeeAccounts = accounts.filter((account) => effectiveIdentityType(account) === IDENTITY_TYPE.employee);
  const duplicateEmployees = duplicateKeys(employeeAccounts, (account) => account.employeeId);
  const projectionByUid = new Map(existingProjections.map((projection) => [text(projection.id || projection.firebaseUid), projection]));
  const context = { authByUid, authByClaim, employeeById, duplicateUids, duplicateEmployees, projectionByUid };
  const accountResults = accounts.map((account) => classifyAccount(context, account));
  const linkedAuthUids = new Set(accounts.map((account) => text(account.firebaseUid)).filter(Boolean));
  const accountIds = new Set(accounts.map((account) => text(account.id)));
  const authOnlyIdentities = authUsers
    .filter((user) => !linkedAuthUids.has(text(user.uid)))
    .map((user) => {
      const claimAccountId = text(user.customClaims?.accountId);
      const accountExists = accountIds.has(claimAccountId);
      return {
        authRef: opaqueReference("auth", user.uid),
        claimedAccountRef: opaqueReference("account", claimAccountId),
        readinessClass: accountExists ? READINESS_CLASS.binding : claimAccountId ? READINESS_CLASS.hold : READINESS_CLASS.unknown,
        reason: accountExists ? "firebase_uid_mismatch" : claimAccountId ? "orphan_claim_account_missing" : "account_claim_missing",
        projectionGenerated: false,
        drift: [accountExists ? DRIFT_CLASS.uidMismatch : DRIFT_CLASS.accountMissing],
      };
    });

  const allClasses = [...accountResults.map((item) => item.readinessClass), ...authOnlyIdentities.map((item) => item.readinessClass)];
  const invalidOverrides = accountResults.reduce(
    (sum, item) => sum + (item.permissionState?.unknownOverrides?.length || (item.reason === "invalid_permission_overrides" ? 1 : 0)),
    0
  );
  const driftCounts = {};
  for (const drift of [...accountResults.flatMap((item) => item.drift), ...authOnlyIdentities.flatMap((item) => item.drift)]) {
    driftCounts[drift] = (driftCounts[drift] || 0) + 1;
  }
  const eligible = accountResults.filter((item) => [READINESS_CLASS.ready, READINESS_CLASS.initialize].includes(item.readinessClass));
  const determinism = {
    projection: eligible.every((item) => item.determinism?.projection === true),
    permissionsHash: eligible.every((item) => item.determinism?.permissionsHash === true),
    versions: eligible.every((item) => item.determinism?.versions === true),
  };
  const blockedApplicationIdentity = accountResults.some((item) =>
    [READINESS_CLASS.binding, READINESS_CLASS.permissions, READINESS_CLASS.unknown].includes(item.readinessClass)
  );

  const summary = {
    applicationAccounts: accounts.length,
    firebaseAuthUsers: authUsers.length,
    employeeIdentities: accounts.filter((account) => effectiveIdentityType(account) === IDENTITY_TYPE.employee).length,
    administrativeIdentities: accounts.filter((account) => effectiveIdentityType(account) === IDENTITY_TYPE.administrative).length,
    projectionReady: allClasses.filter((value) => value === READINESS_CLASS.ready).length,
    readyWithVersionInitialization: allClasses.filter((value) => value === READINESS_CLASS.initialize).length,
    blockedBinding: allClasses.filter((value) => value === READINESS_CLASS.binding).length,
    blockedPermissions: allClasses.filter((value) => value === READINESS_CLASS.permissions).length,
    holdOrphan: allClasses.filter((value) => value === READINESS_CLASS.hold).length,
    inactive: allClasses.filter((value) => value === READINESS_CLASS.inactive).length,
    unknown: allClasses.filter((value) => value === READINESS_CLASS.unknown).length,
    duplicateUidBindings: duplicateUids.size,
    duplicateEmployeeBindings: duplicateEmployees.size,
    invalidOverrides,
    claimsRequiringInitialization: eligible.filter((item) => item.claims.action === CLAIM_ACTION.initialize).length,
    claimsRequiringRefreshOrRevoke: eligible.filter((item) =>
      [CLAIM_ACTION.refresh, CLAIM_ACTION.revoke].includes(item.claims.action)
    ).length,
    existingAuthorizationProjections: existingProjections.length,
  };

  return {
    accounts: accountResults,
    authOnlyIdentities,
    summary,
    driftCounts,
    determinism,
    readiness: {
      codeReady: determinism.projection && determinism.permissionsHash && determinism.versions,
      identityDataReady: !blockedApplicationIdentity,
      claimsReady: eligible.every((item) => item.claims.action === CLAIM_ACTION.none),
      projectionReady: existingProjections.length > 0
        && eligible.every((item) => projectionDrift(projectionByUid.get(item.projectionDocumentId), item.projection) === DRIFT_CLASS.none),
      projectionState: "DRY_RUN_ONLY",
      runtimeReady: false,
      deploymentReady: false,
    },
  };
}
