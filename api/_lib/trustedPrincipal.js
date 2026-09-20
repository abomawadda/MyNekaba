import { effectiveIdentityType, IDENTITY_TYPE } from "./identityClassification.js";
import {
  assertAuthorizationVersionMatch,
  buildAuthzVersion,
  compileEffectivePermissions,
  normalizeAuthorizationVersion,
} from "./trustedPermissions.js";

export class TrustedAuthorizationError extends Error {
  constructor(code, status = 403) {
    super(code);
    this.name = "TrustedAuthorizationError";
    this.code = code;
    this.status = status;
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function bearerToken(req = {}) {
  const header = String(req.headers?.authorization || "");
  if (!header.startsWith("Bearer ")) throw new TrustedAuthorizationError("missing_bearer_token", 401);
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new TrustedAuthorizationError("missing_bearer_token", 401);
  return token;
}

function employeeBindingFields(account = {}) {
  return [account.employeeId, account.employeeCode, account.jobId, account.nationalId]
    .map(text)
    .filter(Boolean);
}

async function validateIdentityBinding(db, account, identityType) {
  if (identityType === IDENTITY_TYPE.administrative) {
    if (employeeBindingFields(account).length > 0) {
      throw new TrustedAuthorizationError("administrative_employee_conflict");
    }
    return null;
  }

  if (identityType !== IDENTITY_TYPE.employee) {
    throw new TrustedAuthorizationError("invalid_identity_type");
  }
  const employeeId = text(account.employeeId);
  if (!employeeId) throw new TrustedAuthorizationError("employee_mapping_missing");

  const employeeDoc = await db.collection("employees").doc(employeeId).get();
  if (!employeeDoc.exists || employeeDoc.id !== employeeId) {
    throw new TrustedAuthorizationError("employee_mapping_missing");
  }

  const linkedAccounts = await db.collection("user_accounts").where("employeeId", "==", employeeId).limit(2).get();
  const exactAccountIds = linkedAccounts.docs.map((doc) => doc.id);
  if (exactAccountIds.length !== 1 || exactAccountIds[0] !== account.id) {
    throw new TrustedAuthorizationError("duplicate_employee_mapping");
  }
  return employeeId;
}

export async function resolveTrustedPrincipal(req, { auth, db }, options = {}) {
  if (!auth || !db) throw new TrustedAuthorizationError("trusted_context_missing", 500);

  let decoded;
  try {
    decoded = await auth.verifyIdToken(bearerToken(req), true);
  } catch (error) {
    if (error instanceof TrustedAuthorizationError) throw error;
    throw new TrustedAuthorizationError("invalid_bearer_token", 401);
  }

  const firebaseUid = text(decoded.uid);
  const accountId = text(decoded.accountId);
  if (!firebaseUid) throw new TrustedAuthorizationError("missing_firebase_uid", 401);
  if (!accountId) throw new TrustedAuthorizationError("missing_account_claim", 403);

  const accountDoc = await db.collection("user_accounts").doc(accountId).get();
  if (!accountDoc.exists || accountDoc.id !== accountId) {
    throw new TrustedAuthorizationError("actor_account_missing", 403);
  }
  const account = { id: accountDoc.id, ...accountDoc.data() };
  if (text(account.firebaseUid) !== firebaseUid) {
    throw new TrustedAuthorizationError("firebase_uid_account_mismatch", 403);
  }
  if (text(account.accountStatus) !== "active") {
    throw new TrustedAuthorizationError("inactive_account", 403);
  }

  const identityType = effectiveIdentityType(account);
  const employeeId = await validateIdentityBinding(db, account, identityType);

  let permissionState;
  try {
    permissionState = compileEffectivePermissions(account);
  } catch (error) {
    throw new TrustedAuthorizationError(error?.message || "permission_compilation_failed", 403);
  }

  const permissionsVersion = normalizeAuthorizationVersion(account.permissionsVersion, 1);
  const bindingVersion = normalizeAuthorizationVersion(account.bindingVersion, 1);
  const authzVersion = buildAuthzVersion(permissionsVersion, bindingVersion);
  if (options.requireVersionClaims === true) {
    try {
      assertAuthorizationVersionMatch(decoded, { permissionsVersion, bindingVersion });
    } catch {
      throw new TrustedAuthorizationError("stale_authorization_token", 403);
    }
  }

  return {
    accountId,
    firebaseUid,
    identityType,
    employeeId,
    accountStatus: account.accountStatus,
    role: permissionState.role,
    permissionOverrides: permissionState.validOverrides,
    unknownPermissionOverrides: permissionState.unknownOverrides,
    effectivePermissions: permissionState.effectivePermissions,
    storageCapabilities: permissionState.capabilities,
    permissionsHash: permissionState.permissionsHash,
    permissionsVersion,
    bindingVersion,
    authzVersion,
    account,
    decoded,
  };
}
