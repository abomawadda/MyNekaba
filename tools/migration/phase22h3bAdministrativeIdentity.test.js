import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  IDENTITY_CLASSIFICATION_ERROR,
  IDENTITY_TYPE,
  containsIdentityClassificationWrite,
  effectiveIdentityType,
  validateIdentityClassification,
  validateIdentityTypeAssignment,
} from "../../api/_lib/identityClassification.js";
import { validateGenericActiveTransition } from "../../api/_lib/accountLifecycle.js";
import { classifyJitAccount, JIT_FIREBASE_LINKED } from "../../api/_lib/jitAuthCore.js";
import { recoveryAuthMode } from "../../api/_lib/recoveryWorkflow.js";
import {
  buildClassificationPatch,
  buildSafePreWriteSnapshot,
  findPotentialEmployeeMatches,
  selectAdministrativeJitCandidate,
  verifyHoldIdentities,
} from "./phase22h3bIdentityCore.js";

const employee = { id: "EmployeeCase", jobId: "1042", nationalId: "29001011234567", name: "Member One" };
const employeeAccount = {
  id: "AccountCase",
  identityType: "employee",
  employeeId: "EmployeeCase",
  employeeCode: "1042",
  nationalId: "29001011234567",
  role: "member",
};

test("phase 22h.3b explicit employee identity requires an employee mapping", () => {
  const result = validateIdentityClassification({
    account: { id: "a", identityType: IDENTITY_TYPE.employee },
    employees: [],
    accounts: [],
  });
  assert.equal(result.valid, false);
  assert.equal(result.error, IDENTITY_CLASSIFICATION_ERROR.employeeMappingMissing);
});

test("phase 22h.3b explicit administrative identity does not require employee mapping", () => {
  const result = validateIdentityClassification({
    account: { id: "admin", identityType: IDENTITY_TYPE.administrative, role: "viewer" },
    employees: [],
    accounts: [],
  });
  assert.equal(result.valid, true);
  assert.equal(result.identityType, IDENTITY_TYPE.administrative);
});

test("phase 22h.3b admin role alone does not imply administrative identity", () => {
  const account = { id: "admin", role: "admin" };
  assert.equal(effectiveIdentityType(account), IDENTITY_TYPE.employee);
  assert.equal(validateIdentityClassification({ account }).valid, false);
});

test("phase 22h.3b untrusted caller cannot assign administrative identity", () => {
  const result = validateIdentityTypeAssignment(IDENTITY_TYPE.administrative, { trusted: false });
  assert.equal(result.valid, false);
  assert.equal(result.error, IDENTITY_CLASSIFICATION_ERROR.trustedPathRequired);
});

test("phase 22h.3b registration endpoint fixes identityType to employee and ignores client identityType", () => {
  const source = readFileSync("api/auth/register-complete.js", "utf8");
  assert.match(source, /identityType:\s*IDENTITY_TYPE\.employee/);
  assert.doesNotMatch(source, /body\.identityType|\.\.\.body/);
  assert.match(source, /validateIdentityClassification/);
});

test("phase 22h.3b client account update rejects identity classification fields", () => {
  const source = readFileSync("src/app/providers/AuthProvider.jsx", "utf8");
  assert.match(source, /key\.startsWith\("identityType"\)/);
  assert.equal(containsIdentityClassificationWrite({ identityType: "administrative" }), true);
  assert.equal(containsIdentityClassificationWrite({ role: "admin" }), false);
});

test("phase 22h.3b administrative identity retains JIT login classification", () => {
  const account = {
    id: "CaseSensitiveAccount",
    identityType: "administrative",
    accountStatus: "active",
    passwordHash: "hash",
    passwordSalt: "salt",
    firebaseUid: "uid",
  };
  assert.equal(classifyJitAccount(account), JIT_FIREBASE_LINKED);
});

test("phase 22h.3b employee identity without mapping fails closed", () => {
  const result = validateIdentityClassification({ account: { ...employeeAccount, employeeId: "missing" }, employees: [employee] });
  assert.equal(result.valid, false);
  assert.equal(result.error, IDENTITY_CLASSIFICATION_ERROR.employeeMappingConflict);
});

test("phase 22h.3b employee identity with exact mapping passes", () => {
  const result = validateIdentityClassification({ account: employeeAccount, employees: [employee], accounts: [employeeAccount] });
  assert.equal(result.valid, true);
  assert.equal(result.employee.id, "EmployeeCase");
});

test("phase 22h.3b duplicate employee account mapping fails", () => {
  const duplicate = { ...employeeAccount, id: "OtherAccount" };
  const result = validateIdentityClassification({
    account: employeeAccount,
    employees: [employee],
    accounts: [employeeAccount, duplicate],
  });
  assert.equal(result.valid, false);
  assert.equal(result.error, IDENTITY_CLASSIFICATION_ERROR.duplicateEmployeeMapping);
});

test("phase 22h.3b account and employee identifiers remain case preserving", () => {
  const result = validateIdentityClassification({ account: employeeAccount, employees: [employee], accounts: [] });
  assert.equal(result.valid, true);
  const wrongCase = validateIdentityClassification({
    account: { ...employeeAccount, employeeId: "employeecase" },
    employees: [employee],
    accounts: [],
  });
  assert.equal(wrongCase.valid, false);
});

test("phase 22h.3b identity type does not grant or change an RBAC role", () => {
  const account = { id: "admin-principal", role: "viewer", identityType: "administrative" };
  const result = validateIdentityClassification({ account });
  assert.equal(result.valid, true);
  assert.equal(account.role, "viewer");
});

test("phase 22h.3b administrative type does not bypass account status controls", () => {
  const result = validateGenericActiveTransition({
    identityType: "administrative",
    role: "admin",
    accountStatus: "pending_approval",
  });
  assert.equal(result.allowed, false);
  assert.equal(result.error, "APPROVAL_FLOW_REQUIRED");
});

test("phase 22h.3b administrative type does not alter recovery mode", () => {
  const account = {
    identityType: "administrative",
    authMode: "jit-linked",
    firebaseUid: "uid",
    passwordHash: "hash",
    passwordSalt: "salt",
  };
  assert.equal(recoveryAuthMode(account), "jit-linked");
});

test("phase 22h.3b canonical approval validates employee classification", () => {
  const source = readFileSync("api/admin/accounts/approve.js", "utf8");
  assert.match(source, /validateIdentityClassification/);
  assert.match(source, /collection\("employees"\)/);
  assert.match(source, /EMPLOYEE_MAPPING_MISSING|employeeMappingMissing/);
  assert.match(source, /where\("employeeCode"/);
  assert.match(source, /where\("nationalId"/);
});

test("phase 22h.3b Firestore source protects identity classification even from admin client updates", () => {
  const source = readFileSync("firestore.rules", "utf8");
  assert.match(source, /changesIdentityClassification/);
  assert.match(source, /request\.resource\.data\.identityType != 'administrative'/);
  assert.match(source, /allow update: if !changesIdentityClassification\(\)/);
});

test("phase 22h.3b only the trusted migration path provisions administrative classification", () => {
  const source = readFileSync("tools/migration/phase22h3b-administrative-classification.js", "utf8");
  const core = readFileSync("tools/migration/phase22h3bIdentityCore.js", "utf8");
  assert.match(source, /--execute/);
  assert.match(core, /CLASSIFY_PHASE_22H3B/);
  assert.match(source, /identity\.administrative_classified/);
  assert.match(source, /runTransaction/);
});

test("phase 22h.3b selects exactly one active linked JIT admin without account hardcoding", () => {
  const candidate = {
    id: "ExactCase",
    role: "admin",
    accountStatus: "active",
    firebaseUid: "uid",
    passwordHash: "hash",
    passwordSalt: "salt",
  };
  assert.equal(selectAdministrativeJitCandidate([candidate]).candidate.id, "ExactCase");
  assert.equal(selectAdministrativeJitCandidate([candidate, { ...candidate, id: "second" }]).candidate, null);
});

test("phase 22h.3b administrative classification rejects employee-link conflicts", () => {
  const result = validateIdentityClassification({
    account: { identityType: "administrative", employeeId: "EmployeeCase" },
    employees: [employee],
  });
  assert.equal(result.valid, false);
  assert.equal(result.error, IDENTITY_CLASSIFICATION_ERROR.administrativeEmployeeConflict);
});

test("phase 22h.3b potential employee scan covers all authoritative criteria", () => {
  const result = findPotentialEmployeeMatches(
    { employeeId: "EmployeeCase", employeeCode: "1042", nationalId: employee.nationalId, phone: "01000000000", email: "member@example.com", fullName: "Member One" },
    [{ ...employee, phone: "01000000000", email: "member@example.com" }]
  );
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.matches[0].criteria, ["employeeId", "employeeCode", "nationalId", "phone", "email", "name"]);
});

test("phase 22h.3b patch and snapshot preserve scoped rollback evidence", () => {
  const patch = buildClassificationPatch({ classificationId: "phase22h3b-test", timestampIso: "2026-09-19T00:00:00.000Z" });
  assert.equal(patch.identityType, "administrative");
  assert.equal(Object.hasOwn(patch, "role"), false);
  assert.equal(Object.hasOwn(patch, "firebaseUid"), false);

  const snapshot = buildSafePreWriteSnapshot({
    projectId: "nekaba2026",
    classificationId: "phase22h3b-test",
    capturedAtIso: "2026-09-19T00:00:00.000Z",
    account: { id: "account", role: "admin", accountStatus: "active", passwordHash: "secret", passwordSalt: "secret" },
    authUser: { uid: "uid", customClaims: {}, metadata: {} },
    employeeEvidence: { matches: [], counts: {} },
    audits: [],
  });
  assert.equal(snapshot.rollback.mode, "field_scoped");
  assert.equal(JSON.stringify(snapshot).includes("secret"), false);
});

test("phase 22h.3b HOLD verification fails closed unless all three identities remain unchanged", () => {
  const definitions = [
    ["orphan-a", "missing-a", "request-a"],
    ["orphan-b", "missing-b", "request-b"],
    ["orphan-c", "missing-c", "request-c"],
  ];
  assert.throws(
    () => verifyHoldIdentities({ authUsers: definitions.map(([uid, accountId]) => ({ uid, customClaims: { accountId } })) }),
    /HOLD_AUTH_STATE_CHANGED/
  );
});
