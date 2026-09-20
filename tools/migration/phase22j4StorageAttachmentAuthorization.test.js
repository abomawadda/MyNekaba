import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PERMISSIONS,
  ROLE_PERMISSION_MATRIX,
  hasPermission,
  validateSecureAttachment,
} from "../../src/security/permissions.js";
import {
  buildEmployeeAttachmentPath,
  buildGeneralAttachmentPath,
  buildSettlementAttachmentPath,
  getStableAttachmentOwnerIds,
  hasStoragePermissions,
  isManagedAttachmentPath,
  isOwnAttachmentTarget,
  requireSafeStorageId,
  requireStoragePermissions,
} from "../../src/security/storageAuthorization.js";

const read = (path) => readFileSync(path, "utf8");
const employeeFormSource = read("src/modules/employees/EmployeeForm.jsx");
const employeeDashboardSource = read("src/modules/employees/EmployeeDashboard.jsx");
const employeeProfileSource = read("src/modules/employees/EmployeeProfile.jsx");
const employeeProfileFundSource = read("src/modules/employees/EmployeeProfileFund.jsx");
const treasuryUploadSource = read("src/modules/treasury/FileUpload.jsx");
const treasuryFormSource = read("src/modules/treasury/TreasuryForm.jsx");
const treasuryServiceSource = read("src/modules/treasury/services/treasuryService.js");
const attachmentMigrationSource = read("src/modules/treasury/attachmentMigration.js");
const settlementSource = read("src/modules/settlements/SettlementTab.jsx");
const genericUploadSource = read("src/ui/inputs/FileUpload.jsx");
const storageRulesSource = read("storage.rules");
const firebaseConfigSource = read("firebase.json");
const packageSource = read("package.json");

const canFrom = (permissions = []) => {
  const allowed = new Set(permissions);
  return (permission) => allowed.has(permission);
};

test("phase 22j.4 attachment capabilities retain the reviewed six-role mapping", () => {
  const expected = {
    admin: [true, true, true],
    treasurer: [true, true, true],
    dataEntry: [true, true, false],
    auditor: [true, false, false],
    viewer: [true, false, false],
    member: [false, false, false],
  };
  for (const [role, result] of Object.entries(expected)) {
    const user = { role };
    assert.deepEqual([
      hasPermission(user, PERMISSIONS.attachmentsView),
      hasPermission(user, PERMISSIONS.attachmentsUpload),
      hasPermission(user, PERMISSIONS.attachmentsDelete),
    ], result);
  }
  assert.deepEqual(Object.keys(ROLE_PERMISSION_MATRIX).sort(), Object.keys(expected).sort());
});

test("phase 22j.4 storage permission checks require every capability", () => {
  const permissions = [PERMISSIONS.treasurySettle, PERMISSIONS.attachmentsUpload];
  assert.equal(hasStoragePermissions(canFrom(permissions), permissions), true);
  assert.equal(hasStoragePermissions(canFrom([PERMISSIONS.attachmentsUpload]), permissions), false);
});

test("phase 22j.4 missing or malformed permission resolvers fail closed", () => {
  assert.equal(hasStoragePermissions(null, [PERMISSIONS.attachmentsView]), false);
  assert.equal(hasStoragePermissions(() => "yes", [PERMISSIONS.attachmentsView]), false);
  assert.equal(requireStoragePermissions(undefined, [PERMISSIONS.attachmentsView]), false);
});

test("phase 22j.4 unauthorized upload reaches zero storage attempts", () => {
  let attempts = 0;
  if (requireStoragePermissions(canFrom([]), [PERMISSIONS.attachmentsUpload])) attempts += 1;
  assert.equal(attempts, 0);
});

test("phase 22j.4 unauthorized delete reaches zero storage attempts", () => {
  let attempts = 0;
  if (requireStoragePermissions(canFrom([]), [PERMISSIONS.attachmentsDelete])) attempts += 1;
  assert.equal(attempts, 0);
});

test("phase 22j.4 unauthorized replace reaches zero storage writes", () => {
  let writes = 0;
  const required = [PERMISSIONS.attachmentsDelete, PERMISSIONS.attachmentsUpload];
  if (requireStoragePermissions(canFrom([PERMISSIONS.attachmentsUpload]), required)) writes += 2;
  assert.equal(writes, 0);
});

test("phase 22j.4 capability-granted caller reaches the intended boundary", () => {
  let attempts = 0;
  const required = [PERMISSIONS.treasurySettle, PERMISSIONS.attachmentsUpload];
  if (requireStoragePermissions(canFrom(required), required)) attempts += 1;
  assert.equal(attempts, 1);
});

test("phase 22j.4 owner matching uses stable identifiers", () => {
  const user = {
    firebaseUid: "firebase-1",
    accountId: "account-1",
    employeeId: "employee-1",
    employeeCode: "E-101",
    id: "local-1",
    phone: "01000000000",
    fullName: "Display Name",
  };
  assert.equal(isOwnAttachmentTarget(user, "employee-1"), true);
  assert.equal(isOwnAttachmentTarget(user, "someone-else"), false);
  assert.doesNotMatch(getStableAttachmentOwnerIds(user).join("|"), /01000000000|Display Name/);
});

test("phase 22j.4 owner cannot target another owner's path", () => {
  const user = { employeeId: "employee-1" };
  assert.equal(isOwnAttachmentTarget(user, "employee-2"), false);
});

test("phase 22j.4 path builders produce known contained families", () => {
  const employeePath = buildEmployeeAttachmentPath({
    employeeId: "emp-1",
    attachmentId: "att-1",
    fileName: "identity card.pdf",
  });
  const settlementPath = buildSettlementAttachmentPath({
    contextId: "issued_checks_doc1",
    attachmentId: "att-2",
    fileName: "invoice.pdf",
  });
  const generalPath = buildGeneralAttachmentPath({
    contextId: "finance",
    attachmentId: "att-3",
    fileName: "receipt.png",
  });
  assert.equal(employeePath, "employees/emp-1/attachments/att-1_identity_card.pdf");
  assert.equal(isManagedAttachmentPath(employeePath), true);
  assert.equal(isManagedAttachmentPath(settlementPath), true);
  assert.equal(isManagedAttachmentPath(generalPath), true);
});

test("phase 22j.4 unsafe path identifiers are rejected", () => {
  for (const value of ["../other", "employee/other", "employee\\other", "", ".hidden"]) {
    assert.throws(() => requireSafeStorageId(value));
  }
  assert.equal(isManagedAttachmentPath("../../private/file.pdf"), false);
  assert.equal(isManagedAttachmentPath("public/logo.png"), false);
});

test("phase 22j.4 valid MIME, extension, and size remain accepted", () => {
  assert.equal(validateSecureAttachment({ name: "evidence.pdf", type: "application/pdf", size: 1024 }), "");
  assert.equal(validateSecureAttachment({ name: "photo.JPG", type: "image/jpeg", size: 1024 }), "");
});

test("phase 22j.4 dangerous, spoofed, empty, and oversized files are rejected", () => {
  assert.notEqual(validateSecureAttachment({ name: "page.html", type: "text/html", size: 100 }), "");
  assert.notEqual(validateSecureAttachment({ name: "page.svg", type: "image/svg+xml", size: 100 }), "");
  assert.notEqual(validateSecureAttachment({ name: "page.pdf", type: "text/html", size: 100 }), "");
  assert.notEqual(validateSecureAttachment({ name: "page.pdf", type: "", size: 100 }), "");
  assert.notEqual(validateSecureAttachment({ name: "page.pdf", type: "application/pdf", size: 0 }), "");
  assert.notEqual(validateSecureAttachment({ name: "page.pdf", type: "application/pdf", size: 6 * 1024 * 1024 }), "");
});

test("phase 22j.4 employee upload and delete handlers authorize before Storage", () => {
  const authorizationIndex = employeeFormSource.indexOf("requireStoragePermissions(can");
  const uploadIndex = employeeFormSource.indexOf("await uploadBytes(");
  const deleteIndex = employeeFormSource.indexOf("await deleteObject(");
  assert.ok(authorizationIndex >= 0 && authorizationIndex < uploadIndex);
  assert.ok(employeeFormSource.lastIndexOf("requireStoragePermissions(can", deleteIndex) < deleteIndex);
  assert.match(employeeFormSource, /buildEmployeeAttachmentPath/);
  assert.match(employeeFormSource, /canDeleteAttachments && <button/);
});

test("phase 22j.4 employee profiles do not render attachment metadata without view capability", () => {
  for (const source of [employeeProfileSource, employeeProfileFundSource]) {
    assert.match(source, /canViewAttachments && activeTab === "attachments"/);
    assert.match(source, /PERMISSIONS\.attachmentsView/);
  }
});

test("phase 22j.4 owner-scoped employee reads do not subscribe to every employee", () => {
  assert.match(employeeDashboardSource, /const scope = getDataScope\(user, "employees"\)/);
  assert.match(employeeDashboardSource, /where\(documentId\(\), "in", ownerIds\)/);
  assert.match(employeeDashboardSource, /where\("jobId", "in", ownerIds\)/);
  assert.match(employeeDashboardSource, /where\("employeeCode", "in", ownerIds\)/);
});

test("phase 22j.4 treasury attachment UI gates view, upload, and delete independently", () => {
  assert.match(treasuryUploadSource, /PERMISSIONS\.attachmentsView/);
  assert.match(treasuryUploadSource, /PERMISSIONS\.attachmentsUpload/);
  assert.match(treasuryUploadSource, /PERMISSIONS\.attachmentsDelete/);
  assert.match(treasuryUploadSource, /requireStoragePermissions\(can, uploadPermissions/);
  assert.match(treasuryUploadSource, /canDelete && <button/);
  assert.match(treasuryFormSource, /businessPermission=\{isEdit \? PERMISSIONS\.treasuryEdit : PERMISSIONS\.treasuryCreate\}/);
});

test("phase 22j.4 settlement upload and migration require business plus attachment capabilities", () => {
  assert.match(settlementSource, /businessPermission=\{PERMISSIONS\.treasurySettle\}/);
  assert.match(settlementSource, /canMigrateAttachments = canMigrate && canUploadAttachments && canViewAttachments/);
  assert.match(settlementSource, /PERMISSIONS\.treasuryMigrate,[\s\S]*?PERMISSIONS\.attachmentsUpload,[\s\S]*?PERMISSIONS\.attachmentsView/);
});

test("phase 22j.4 storage wrappers fail closed before upload and URL resolution", () => {
  const authorizationIndex = attachmentMigrationSource.indexOf("requireStoragePermissions(can");
  const uploadIndex = attachmentMigrationSource.indexOf("await uploadBytes(");
  const urlIndex = attachmentMigrationSource.indexOf("await getDownloadURL(");
  assert.ok(authorizationIndex >= 0 && authorizationIndex < uploadIndex && uploadIndex < urlIndex);
  assert.match(attachmentMigrationSource, /buildSettlementAttachmentPath/);
});

test("phase 22j.4 treasury service guards upload and delete boundaries", () => {
  assert.match(treasuryServiceSource, /PERMISSIONS\.attachmentsUpload/);
  assert.match(treasuryServiceSource, /PERMISSIONS\.attachmentsDelete/);
  assert.match(treasuryServiceSource, /requireManagedAttachmentPath\(storagePath\)/);
  const uploadFunctionIndex = treasuryServiceSource.indexOf("async function uploadAttachment");
  const authorizationIndex = treasuryServiceSource.indexOf("requireStoragePermissions(can", uploadFunctionIndex);
  const uploadIndex = treasuryServiceSource.indexOf("uploadBytesResumable", uploadFunctionIndex);
  assert.ok(uploadFunctionIndex >= 0 && authorizationIndex > uploadFunctionIndex && authorizationIndex < uploadIndex);
});

test("phase 22j.4 inactive generic uploader requires an explicit business permission", () => {
  assert.match(genericUploadSource, /Boolean\(businessPermission\) && hasStoragePermissions/);
  assert.match(genericUploadSource, /requireStoragePermissions\(can, uploadPermissions/);
  assert.match(genericUploadSource, /buildGeneralAttachmentPath/);
  assert.doesNotMatch(genericUploadSource, /partyName\.replace|voucherNumber/);
});

test("phase 22j.4 no Firebase Storage list or metadata read is present", () => {
  const storageSources = [employeeFormSource, treasuryUploadSource, treasuryServiceSource, attachmentMigrationSource, genericUploadSource];
  for (const source of storageSources) {
    assert.doesNotMatch(source, /\blistAll\s*\(|\blist\s*\(|\bgetMetadata\s*\(|\bupdateMetadata\s*\(/);
  }
});

test("phase 22j.4 current Storage Rules broad-auth finding remains explicit and undeployed", () => {
  assert.match(storageRulesSource, /match \/attachments\/\{allPaths=\*\*\}[\s\S]*?allow read: if isSignedIn\(\)/);
  assert.match(storageRulesSource, /match \/\{allPaths=\*\*\}[\s\S]*?allow read, write: if false/);
  assert.match(firebaseConfigSource, /"storage"\s*:\s*\{\s*"rules"\s*:\s*"storage\.rules"/);
});

test("phase 22j.4 changed authorization code introduces no role-name checks", () => {
  const changedSources = [
    employeeFormSource,
    employeeDashboardSource,
    employeeProfileSource,
    employeeProfileFundSource,
    treasuryUploadSource,
    treasuryServiceSource,
    attachmentMigrationSource,
    settlementSource,
    genericUploadSource,
  ];
  for (const source of changedSources) {
    assert.doesNotMatch(source, /role\s*[!=]==?\s*["'](?:admin|treasurer|dataEntry|auditor|viewer|member)/);
  }
});

test("phase 22j.4 tests and reports contain no real download URL", () => {
  const testSource = read("tools/migration/phase22j4StorageAttachmentAuthorization.test.js");
  assert.doesNotMatch(testSource, /firebasestorage\.googleapis\.com|storage\.googleapis\.com\/[^"'\s]+/);
});

test("phase 22j.4 tests require no Production Storage mutation or Rules deployment", () => {
  const testSource = read("tools/migration/phase22j4StorageAttachmentAuthorization.test.js");
  const imports = testSource.split("\n").filter((line) => line.startsWith("import ")).join("\n");
  assert.doesNotMatch(imports, /firebase\/storage|firebase-admin/);
  assert.doesNotMatch(packageSource, /firebase\s+deploy|deploy --only/);
});
