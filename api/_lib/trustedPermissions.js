import { createHash } from "node:crypto";
import { PERMISSIONS, ROLE_PERMISSION_MATRIX } from "../../src/security/permissions.js";

export const AUTHORIZATION_SCHEMA_VERSION = 1;

export const STORAGE_RELEVANT_PERMISSIONS = Object.freeze([
  PERMISSIONS.attachmentsView,
  PERMISSIONS.attachmentsUpload,
  PERMISSIONS.attachmentsDelete,
  PERMISSIONS.employeesView,
  PERMISSIONS.employeesCreate,
  PERMISSIONS.employeesEdit,
  PERMISSIONS.treasuryView,
  PERMISSIONS.treasuryCreate,
  PERMISSIONS.treasuryEdit,
  PERMISSIONS.treasuryDelete,
  PERMISSIONS.treasurySettle,
  PERMISSIONS.treasuryMigrate,
]);

const KNOWN_PERMISSIONS = new Set(Object.values(PERMISSIONS));

function text(value) {
  return String(value ?? "").trim();
}

export function normalizeAuthorizationVersion(value, fallback = 1) {
  const version = Number(value ?? fallback);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("invalid_authorization_version");
  }
  return version;
}

export function buildAuthzVersion(permissionsVersion, bindingVersion) {
  return `v${AUTHORIZATION_SCHEMA_VERSION}:p${normalizeAuthorizationVersion(permissionsVersion)}:b${normalizeAuthorizationVersion(bindingVersion)}`;
}

export function nextAuthorizationVersion(currentVersion, changed) {
  const current = normalizeAuthorizationVersion(currentVersion);
  return changed ? current + 1 : current;
}

export function compileEffectivePermissions(account = {}) {
  const role = text(account.role);
  if (!role || !Object.prototype.hasOwnProperty.call(ROLE_PERMISSION_MATRIX, role)) {
    throw new Error("invalid_account_role");
  }
  if (account.permissionOverrides != null && !Array.isArray(account.permissionOverrides)) {
    throw new Error("invalid_permission_overrides");
  }

  const requestedOverrides = (account.permissionOverrides || []).map(text).filter(Boolean);
  const validOverrides = requestedOverrides.filter((permission) => KNOWN_PERMISSIONS.has(permission));
  const unknownOverrides = [...new Set(requestedOverrides.filter((permission) => !KNOWN_PERMISSIONS.has(permission)))].sort();
  const effectivePermissions = [...new Set([
    ...ROLE_PERMISSION_MATRIX[role],
    ...validOverrides,
  ])].sort();
  const permissionsHash = createHash("sha256")
    .update(JSON.stringify(effectivePermissions))
    .digest("hex");
  const capabilities = Object.fromEntries(
    STORAGE_RELEVANT_PERMISSIONS.map((permission) => [permission, effectivePermissions.includes(permission)])
  );

  return {
    role,
    effectivePermissions,
    permissionsHash,
    capabilities,
    validOverrides: [...new Set(validOverrides)].sort(),
    unknownOverrides,
  };
}

export function hasEffectivePermissions(principal, requiredPermissions = [], options = {}) {
  const required = (Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions])
    .map(text)
    .filter(Boolean);
  if (required.length === 0 || !Array.isArray(principal?.effectivePermissions)) return false;
  const effective = new Set(principal.effectivePermissions);
  return options.any === true
    ? required.some((permission) => effective.has(permission))
    : required.every((permission) => effective.has(permission));
}

export function assertAuthorizationVersionMatch(decoded = {}, projection = {}) {
  const permissionsVersion = normalizeAuthorizationVersion(projection.permissionsVersion);
  const bindingVersion = normalizeAuthorizationVersion(projection.bindingVersion);
  const expectedAuthzVersion = buildAuthzVersion(permissionsVersion, bindingVersion);
  if (
    decoded.permissionsVersion !== permissionsVersion
    || decoded.bindingVersion !== bindingVersion
    || decoded.authzVersion !== expectedAuthzVersion
  ) {
    throw new Error("stale_authorization_token");
  }
  return true;
}
