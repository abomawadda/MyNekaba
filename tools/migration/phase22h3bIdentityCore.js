import { createHash } from "node:crypto";
import {
  IDENTITY_TYPE,
  validateIdentityClassification,
  validateIdentityTypeAssignment,
} from "../../api/_lib/identityClassification.js";
import { classifyJitAccount, JIT_FIREBASE_LINKED } from "../../api/_lib/jitAuthCore.js";
import { syntheticEmailForAccount } from "./phase22dIdentityMigrationCore.js";
import { maskReference, stableChecksum } from "./phase22h2RepairCore.js";

export const PHASE22H3B_EXECUTE_CONFIRM = "CLASSIFY_PHASE_22H3B";
export const EXPECTED_JIT_ACCOUNT_REFERENCE = "ref_133eb705";
export const EXPECTED_JIT_AUTH_REFERENCE = "ref_81760dc7";
export const OPERATOR_DECISION_REFERENCE = "Phase-22H.3B-operator-approved-independent-administrator";
export const EXPECTED_HOLD_IDENTITIES = Object.freeze([
  { auth: "ref_1e5ea206", account: "ref_817e71e2", request: "ref_a806bd24" },
  { auth: "ref_83f7e311", account: "ref_86a0aee6", request: "ref_fcbb0f12" },
  { auth: "ref_2e45e5e2", account: "ref_2d6d8475", request: "ref_6916952d" },
]);

function text(value) {
  return String(value ?? "").trim();
}

function digits(value) {
  return text(value).replace(/\D/g, "");
}

function email(value) {
  return text(value).toLowerCase();
}

function name(value) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function phoneValues(source = {}) {
  return [source.phone, source.phone2, source.mobile, source.mobileNumber]
    .map(digits)
    .filter(Boolean);
}

export function findPotentialEmployeeMatches(account = {}, employees = []) {
  const accountIds = [account.employeeId].map(text).filter(Boolean);
  const accountCodes = [account.employeeCode, account.jobId, account.jobCode].map(digits).filter(Boolean);
  const accountNationalIds = [account.nationalId, account.nationalID].map(digits).filter(Boolean);
  const accountPhones = phoneValues(account);
  const accountEmails = [account.email].map(email).filter(Boolean);
  const accountNames = [account.fullName, account.displayName].map(name).filter(Boolean);

  const matches = employees.flatMap((employee) => {
    const criteria = [];
    if (accountIds.includes(text(employee.id))) criteria.push("employeeId");
    if (accountCodes.includes(digits(employee.employeeCode || employee.jobId || employee.jobCode))) criteria.push("employeeCode");
    if (accountNationalIds.includes(digits(employee.nationalId || employee.nationalID))) criteria.push("nationalId");
    if (phoneValues(employee).some((value) => accountPhones.includes(value))) criteria.push("phone");
    if (accountEmails.includes(email(employee.email))) criteria.push("email");
    if (accountNames.includes(name(employee.name || employee.fullName))) criteria.push("name");
    return criteria.length ? [{ employee, criteria }] : [];
  });

  return {
    matches,
    counts: ["employeeId", "employeeCode", "nationalId", "phone", "email", "name"].reduce(
      (result, criterion) => ({
        ...result,
        [criterion]: matches.filter((item) => item.criteria.includes(criterion)).length,
      }),
      {}
    ),
  };
}

export function selectAdministrativeJitCandidate(accounts = []) {
  const candidates = accounts.filter(
    (account) =>
      text(account.role) === "admin" &&
      text(account.accountStatus) === "active" &&
      Boolean(account.firebaseUid && account.passwordHash && account.passwordSalt) &&
      classifyJitAccount(account) === JIT_FIREBASE_LINKED
  );
  return { candidate: candidates.length === 1 ? candidates[0] : null, count: candidates.length };
}

export function assertProductionPreconditions({
  projectId,
  connectedProjectId,
  account,
  authUser,
  accounts = [],
  employees = [],
  execute = false,
  confirm = "",
} = {}) {
  if (projectId !== "nekaba2026" || connectedProjectId !== "nekaba2026") {
    throw new Error("PROJECT_MISMATCH");
  }
  if (execute && confirm !== PHASE22H3B_EXECUTE_CONFIRM) throw new Error("EXECUTION_CONFIRMATION_REQUIRED");
  if (!account || maskReference(account.id) !== EXPECTED_JIT_ACCOUNT_REFERENCE) throw new Error("TARGET_ACCOUNT_MISMATCH");
  if (!authUser || maskReference(authUser.uid) !== EXPECTED_JIT_AUTH_REFERENCE) throw new Error("TARGET_AUTH_MISMATCH");
  if (text(account.firebaseUid) !== text(authUser.uid)) throw new Error("FIREBASE_UID_MISMATCH");
  if (text(account.role) !== "admin" || text(account.accountStatus) !== "active") throw new Error("TARGET_STATE_MISMATCH");
  if (classifyJitAccount(account) !== JIT_FIREBASE_LINKED) throw new Error("JIT_MODE_MISMATCH");
  if (authUser.disabled) throw new Error("AUTH_USER_DISABLED");
  if (text(authUser.customClaims?.accountId) !== text(account.id)) throw new Error("ACCOUNT_CLAIM_MISMATCH");
  if (email(authUser.email) !== email(syntheticEmailForAccount(account))) throw new Error("SYNTHETIC_EMAIL_MISMATCH");

  const explicitType = text(account.identityType);
  if (explicitType && explicitType !== IDENTITY_TYPE.administrative) throw new Error("IDENTITY_TYPE_CONFLICT");
  if (execute && explicitType === IDENTITY_TYPE.administrative) throw new Error("ALREADY_CLASSIFIED");
  const otherAdministrative = accounts.filter(
    (candidate) => candidate.id !== account.id && text(candidate.identityType) === IDENTITY_TYPE.administrative
  );
  if (otherAdministrative.length) throw new Error("UNEXPECTED_ADMINISTRATIVE_IDENTITY");

  const employeeEvidence = findPotentialEmployeeMatches(account, employees);
  if (employeeEvidence.matches.length) throw new Error("EMPLOYEE_MAPPING_APPEARED");

  const assignment = validateIdentityTypeAssignment(IDENTITY_TYPE.administrative, { trusted: true });
  const classification = validateIdentityClassification({
    account: { ...account, identityType: IDENTITY_TYPE.administrative },
    employees,
    accounts,
  });
  if (!assignment.valid || !classification.valid) throw new Error(classification.error || assignment.error);

  return { employeeEvidence, classification };
}

export function verifyHoldIdentities({ authUsers = [], accounts = [], requests = [] } = {}) {
  const results = EXPECTED_HOLD_IDENTITIES.map((expected) => {
    const authUser = authUsers.find((candidate) => maskReference(candidate.uid) === expected.auth);
    if (!authUser || authUser.disabled) throw new Error("HOLD_AUTH_STATE_CHANGED");
    const claimedAccountId = text(authUser.customClaims?.accountId);
    if (maskReference(claimedAccountId) !== expected.account) throw new Error("HOLD_CLAIM_CHANGED");
    if (accounts.some((account) => text(account.id) === claimedAccountId)) throw new Error("HOLD_ACCOUNT_RECREATED");
    const request = requests.find((candidate) => maskReference(candidate.id) === expected.request);
    if (!request || text(request.status) !== "email_pending_verification") {
      throw new Error("HOLD_REQUEST_STATE_CHANGED");
    }
    if (text(request.firebaseUid) !== text(authUser.uid) || text(request.accountId) !== claimedAccountId) {
      throw new Error("HOLD_REQUEST_LINK_CHANGED");
    }
    return {
      authReference: expected.auth,
      accountReference: expected.account,
      requestReference: expected.request,
      enabled: true,
      requestStatus: "email_pending_verification",
      applicationAccount: "missing",
    };
  });
  return { count: results.length, unchanged: true, identities: results };
}

export function classificationFieldsSnapshot(account = {}) {
  return [
    "identityType",
    "identityTypeSource",
    "identityTypeClassifiedAt",
    "identityTypeClassifiedAtIso",
    "identityTypeClassifiedBy",
    "identityTypeReason",
    "identityTypeClassificationId",
  ].reduce((result, field) => {
    result[field] = {
      present: Object.prototype.hasOwnProperty.call(account, field),
      value: account[field] ?? null,
    };
    return result;
  }, {});
}

export function buildClassificationPatch({ classificationId, timestampIso }) {
  return {
    identityType: IDENTITY_TYPE.administrative,
    identityTypeSource: "operator_approved",
    identityTypeClassifiedAtIso: timestampIso,
    identityTypeClassifiedBy: "phase22h3b_operator",
    identityTypeReason: "intentional_independent_administrative_identity",
    identityTypeClassificationId: classificationId,
  };
}

export function buildSafePreWriteSnapshot({
  projectId,
  classificationId,
  account,
  authUser,
  employeeEvidence,
  audits = [],
  holdVerification = null,
  capturedAtIso,
} = {}) {
  return {
    phase: "22H.3B",
    projectId,
    classificationId,
    capturedAtIso,
    operatorDecisionReference: OPERATOR_DECISION_REFERENCE,
    accountReference: maskReference(account.id),
    authReference: maskReference(authUser.uid),
    beforeStateHash: stableChecksum(account),
    account: {
      role: text(account.role),
      accountStatus: text(account.accountStatus),
      authMode: text(account.authMode),
      credentialAuthority: text(account.credentialAuthority),
      firebaseUidMatches: text(account.firebaseUid) === text(authUser.uid),
      hasLegacyPasswordHash: Boolean(account.passwordHash),
      hasLegacyPasswordSalt: Boolean(account.passwordSalt),
      identityClassificationFields: classificationFieldsSnapshot(account),
      employeeLinkFieldsPresent: Boolean(account.employeeId || account.employeeCode || account.jobId || account.nationalId),
    },
    auth: {
      disabled: Boolean(authUser.disabled),
      emailVerified: Boolean(authUser.emailVerified),
      syntheticEmailMatches: email(authUser.email) === email(syntheticEmailForAccount(account)),
      accountIdClaimMatches: text(authUser.customClaims?.accountId) === text(account.id),
      creationTime: text(authUser.metadata?.creationTime),
      lastSignInTime: text(authUser.metadata?.lastSignInTime),
    },
    employeeEvidence: {
      totalMatches: employeeEvidence.matches.length,
      criteriaCounts: employeeEvidence.counts,
    },
    relevantAuditHistory: audits.map((audit) => ({
      action: text(audit.action),
      createdAtIso: text(audit.createdAtIso),
      riskLevel: text(audit.riskLevel),
    })),
    holdVerification,
    rollback: {
      mode: "field_scoped",
      originalFields: classificationFieldsSnapshot(account),
    },
  };
}

export function hashSafeReference(value = "") {
  return createHash("sha256").update(text(value)).digest("hex").slice(0, 12);
}
