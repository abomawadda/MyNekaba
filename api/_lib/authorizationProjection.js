import { effectiveIdentityType, IDENTITY_TYPE } from "./identityClassification.js";
import {
  AUTHORIZATION_SCHEMA_VERSION,
  compileEffectivePermissions,
  normalizeAuthorizationVersion,
} from "./trustedPermissions.js";

function text(value) {
  return String(value ?? "").trim();
}

function serializeSourceTime(value) {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return text(value);
}

export function compileAuthorizationProjection(account = {}, options = {}) {
  const accountId = text(account.id);
  const firebaseUid = text(account.firebaseUid);
  if (!accountId) throw new Error("missing_account_id");
  if (!firebaseUid) throw new Error("missing_firebase_uid");

  const identityType = effectiveIdentityType(account);
  if (![IDENTITY_TYPE.employee, IDENTITY_TYPE.administrative].includes(identityType)) {
    throw new Error("invalid_identity_type");
  }
  const employeeId = text(account.employeeId);
  if (identityType === IDENTITY_TYPE.employee && !employeeId) throw new Error("employee_mapping_missing");
  if (
    identityType === IDENTITY_TYPE.administrative
    && [account.employeeId, account.employeeCode, account.jobId, account.nationalId].some((value) => text(value))
  ) {
    throw new Error("administrative_employee_conflict");
  }

  const compiled = compileEffectivePermissions(account);
  const permissionsVersion = normalizeAuthorizationVersion(account.permissionsVersion, 1);
  const bindingVersion = normalizeAuthorizationVersion(account.bindingVersion, 1);
  const status = text(account.accountStatus);
  const updatedAt = options.updatedAt || new Date().toISOString();

  return {
    schemaVersion: AUTHORIZATION_SCHEMA_VERSION,
    accountId,
    firebaseUid,
    identityType,
    employeeId: identityType === IDENTITY_TYPE.employee ? employeeId : null,
    status: status === "active" ? "active" : "inactive",
    capabilities: compiled.capabilities,
    permissionsVersion,
    permissionsHash: compiled.permissionsHash,
    bindingVersion,
    sourceAccountUpdatedAt: serializeSourceTime(account.updatedAtIso || account.updatedAt),
    updatedAt: serializeSourceTime(updatedAt),
  };
}

export async function persistAuthorizationProjection({ db, projection, dryRun = true, trusted = false } = {}) {
  if (!trusted) throw new Error("trusted_projection_invocation_required");
  if (!projection?.firebaseUid || !projection?.accountId) throw new Error("invalid_authorization_projection");
  if (dryRun) return { written: false, dryRun: true, projection };
  if (!db) throw new Error("projection_database_required");
  await db.collection("account_authorization").doc(projection.firebaseUid).set(projection, { merge: false });
  return { written: true, dryRun: false, projection };
}
