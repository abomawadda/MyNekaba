import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PERMISSIONS,
  ROLE_PERMISSION_MATRIX,
  canAccessRoute,
  hasPermission,
} from "../../src/security/permissions.js";

const read = (path) => readFileSync(path, "utf8");
const navigationSource = read("src/app/layout/shellNavigation.js");
const dashboardSource = read("src/modules/dashboard/DashboardPage.jsx");
const routerSource = read("src/app/router.jsx");
const protectedRouteSource = read("src/security/ProtectedRoute.jsx");
const permissionsSource = read("src/security/permissions.js");
const checkbooksSource = read("src/modules/treasury/checkbooks/CheckbooksPage.jsx");
const checksSource = read("src/modules/treasury/checkbooks/ChecksPage.jsx");
const checkReportsSource = read("src/modules/treasury/checkbooks/CheckbookReports.jsx");
const treasurySource = read("src/modules/treasury/TreasuryPage.jsx");
const ledgerSource = read("src/modules/treasury/TreasuryLedger.jsx");
const collectionsSource = read("src/modules/treasury/CollectionsPage.jsx");
const settlementSource = read("src/modules/settlements/SettlementTab.jsx");
const settlementTabsSource = read("src/modules/settlements/components/SettlementWorkspaceTabs.jsx");
const settlementArchiveSource = read("src/modules/settlements/components/SettlementArchiveTable.jsx");
const settlementDraftSource = read("src/modules/settlements/components/SettlementDraftSection.jsx");
const settlementFiltersSource = read("src/modules/settlements/components/SettlementArchiveFilters.jsx");
const settlementAuthorizationSource = read("src/modules/settlements/settlementAuthorization.js");

const roleExpectations = [
  ["admin", true, true, true, true, true],
  ["treasurer", true, true, true, true, true],
  ["dataEntry", true, true, false, false, false],
  ["auditor", true, false, false, false, true],
  ["viewer", false, false, false, false, false],
  ["member", false, false, false, false, false],
];

for (const [role, view, create, settle, migrate, exportReports] of roleExpectations) {
  test(`phase 22j.3 ${role} finance behavior follows canonical capabilities`, () => {
    const user = { role };
    assert.equal(hasPermission(user, PERMISSIONS.treasuryView), view);
    assert.equal(hasPermission(user, PERMISSIONS.treasuryCreate), create);
    assert.equal(hasPermission(user, PERMISSIONS.treasurySettle), settle);
    assert.equal(hasPermission(user, PERMISSIONS.treasuryMigrate), migrate);
    assert.equal(hasPermission(user, PERMISSIONS.reportsExport), exportReports);
    assert.equal(canAccessRoute(user, "/treasury/checkbooks"), view);
    assert.equal(
      canAccessRoute(user, "/treasury/check-reports"),
      view && hasPermission(user, PERMISSIONS.reportsView)
    );
  });
}

test("phase 22j.3 viewer cannot directly reach Checkbooks or Check Reports", () => {
  const viewer = { role: "viewer" };
  assert.equal(canAccessRoute(viewer, "/treasury/checkbooks"), false);
  assert.equal(canAccessRoute(viewer, "/treasury/check-reports"), false);
});

test("phase 22j.3 auditor keeps read routes without create or settle actions", () => {
  const auditor = { role: "auditor" };
  assert.equal(canAccessRoute(auditor, "/treasury/admin"), true);
  assert.equal(canAccessRoute(auditor, "/treasury/checks"), true);
  assert.equal(hasPermission(auditor, PERMISSIONS.treasuryCreate), false);
  assert.equal(hasPermission(auditor, PERMISSIONS.treasurySettle), false);
});

test("phase 22j.3 check report route requires finance view and report view", () => {
  assert.match(permissionsSource, /"\/treasury\/check-reports": \[PERMISSIONS\.treasuryView, PERMISSIONS\.reportsView\]/);
  assert.match(routerSource, /path="\/treasury\/check-reports"[\s\S]*?permission=\{\[PERMISSIONS\.treasuryView, PERMISSIONS\.reportsView\]\}/);
  assert.match(protectedRouteSource, /Array\.isArray\(permission\)[\s\S]*?requiredPermissions\.some/);
});

test("phase 22j.3 compound route permissions fail closed when one capability is absent", () => {
  const reportsOnly = { role: "member", permissionOverrides: [PERMISSIONS.reportsView] };
  const treasuryOnly = { role: "member", permissionOverrides: [PERMISSIONS.treasuryView] };
  const both = { role: "member", permissionOverrides: [PERMISSIONS.treasuryView, PERMISSIONS.reportsView] };
  assert.equal(canAccessRoute(reportsOnly, "/treasury/check-reports"), false);
  assert.equal(canAccessRoute(treasuryOnly, "/treasury/check-reports"), false);
  assert.equal(canAccessRoute(both, "/treasury/check-reports"), true);
});

test("phase 22j.3 Checkbooks navigation uses treasury view and not reports view alone", () => {
  assert.match(navigationSource, /allowed\(can, "\/treasury\/checkbooks", "دفاتر الشيكات"\)/);
  assert.doesNotMatch(navigationSource, /"\/treasury\/checkbooks"[\s\S]{0,100}?reportsView/);
});

test("phase 22j.3 issue navigation requires both route view and create capability", () => {
  for (const label of ["إصدار السندات", "شيك رعاية", "شيك سلفة", "شيك رحلة", "خصم مباشر"]) {
    const line = navigationSource.split("\n").find((entry) => entry.includes(`"${label}"`));
    assert.ok(line, `${label} navigation entry is present`);
    assert.match(line, /PERMISSIONS\.treasuryView/);
    assert.match(line, /PERMISSIONS\.treasuryCreate/);
  }
});

test("phase 22j.3 read-only check navigation uses a factual label", () => {
  assert.match(navigationSource, /allowed\(can, "\/treasury\/checks", "سجل الشيكات"\)/);
  assert.doesNotMatch(navigationSource, /allowed\(can, "\/treasury\/checks", "إدارة الشيكات"\)/);
});

test("phase 22j.3 Check Reports navigation requires treasury and reports view", () => {
  assert.match(navigationSource, /"\/treasury\/check-reports"[\s\S]{0,180}?PERMISSIONS\.treasuryView[\s\S]{0,80}?PERMISSIONS\.reportsView/);
});

test("phase 22j.3 dashboard Issue Voucher quick action requires create capability", () => {
  assert.match(dashboardSource, /const canCreateFinance = canFinance && can\(PERMISSIONS\.treasuryCreate\)/);
  assert.match(dashboardSource, /canCreateFinance \? \{ to: "\/treasury\/admin", label: "إصدار سند"/);
  assert.doesNotMatch(dashboardSource, /canFinance \? \{ to: "\/treasury\/admin", label: "إصدار سند"/);
});

test("phase 22j.3 Checks issue control remains create-gated", () => {
  assert.match(checksSource, /const canCreate = can\("treasury\.create"\)/);
  assert.match(checksSource, /primaryAction=\{canCreate && \([\s\S]{0,160}?إصدار شيك/);
});

test("phase 22j.3 Checkbooks and Checks report links require reports view", () => {
  for (const source of [checkbooksSource, checksSource]) {
    assert.match(source, /const canViewReports = can\("reports\.view"\)/);
    assert.match(source, /\{canViewReports && <Button as="a" href="\/treasury\/check-reports"/);
  }
});

test("phase 22j.3 finance exports use reports.export", () => {
  assert.match(checkReportsSource, /const canExport = can\(PERMISSIONS\.reportsExport\)/);
  assert.match(treasurySource, /const canExportReports = can\(PERMISSIONS\.reportsExport\)/);
  assert.match(ledgerSource, /const canExportReports = can\(PERMISSIONS\.reportsExport\)/);
  assert.match(settlementSource, /const canExportReports = can\(PERMISSIONS\.reportsExport\)/);
});

test("phase 22j.3 export handlers fail closed before output", () => {
  assert.match(checkReportsSource, /const exportRows = async \(format\) => \{\s*if \(!canExport\) return;/);
  assert.match(checkReportsSource, /const print = \(\) => \{\s*if \(!canExport\) return;/);
  assert.match(treasurySource, /const handleExportExcel = async \(format\) => \{\s*if \(!canExportReports\) return;/);
  assert.match(treasurySource, /const handlePrintReport = \(\) => \{\s*if \(!canExportReports\) return;/);
  assert.match(ledgerSource, /const handlePrint = \(\) => \{\s*if \(!canExportReports\) return;/);
  assert.match(ledgerSource, /const handleExport = async \(format\) => \{\s*if \(!canExportReports\) return;/);
});

test("phase 22j.3 settlement mutation tabs require treasury.settle", () => {
  assert.match(settlementTabsSource, /const canSettle = can\(PERMISSIONS\.treasurySettle\)/);
  assert.match(settlementTabsSource, /\.\.\.\(canSettle \? \[\{/);
  assert.match(settlementSource, /diagnosticAuthorizedActiveTab === "current" && !canSettle[\s\S]{0,120}?"archive"/);
});

test("phase 22j.3 settlement archive actions separate manage and print capabilities", () => {
  assert.match(settlementArchiveSource, /canManage && <IconButton iconStart=\{Edit3\}/);
  assert.match(settlementArchiveSource, /canManage && <IconButton iconStart=\{RotateCcw\}/);
  assert.match(settlementArchiveSource, /canManage && <IconButton iconStart=\{Trash2\}/);
  assert.match(settlementArchiveSource, /canPrint && <IconButton iconStart=\{Printer\}/);
});

test("phase 22j.3 settlement drafts require settle capability for actions", () => {
  assert.match(settlementDraftSource, /canManage = false/);
  assert.match(settlementDraftSource, /\{canManage && \([\s\S]*?استكمال/);
  assert.match(settlementSource, /<SettlementDraftSection[\s\S]{0,260}?canManage=\{canSettle\}/);
});

test("phase 22j.3 attachment migration uses treasury.migrate", () => {
  assert.match(settlementSource, /const canMigrate = can\(PERMISSIONS\.treasuryMigrate\)/);
  assert.match(settlementSource, /const runAttachmentMigration = async \(\) => \{\s*if \(!canMigrate\) return;/);
  assert.match(settlementFiltersSource, /\{canMigrate && \(/);
  assert.match(settlementSource, /\{canMigrate && showMigration && \(/);
});

test("phase 22j.3 monthly snapshot write uses treasury.post", () => {
  assert.match(ledgerSource, /const canSaveMonthlyClose = can\(PERMISSIONS\.treasuryPost\)/);
  assert.match(ledgerSource, /const saveMonthlySnapshot = async \(close\) => \{\s*if \(!canSaveMonthlyClose\) return;/);
  assert.match(ledgerSource, /\{canSaveMonthlyClose && \([\s\S]{0,260}?saveMonthlySnapshot/);
});

test("phase 22j.3 Collections does not label a read-only link as a settlement action", () => {
  assert.match(collectionsSource, /const canSettle = can\(PERMISSIONS\.treasurySettle\)/);
  assert.match(collectionsSource, /\{canSettle \? "تسوية" : "عرض"\}/);
});

test("phase 22j.3 introduces no finance role hardcoding", () => {
  const financeChanges = [navigationSource, checksSource, checkbooksSource, checkReportsSource, treasurySource, ledgerSource, collectionsSource, settlementSource];
  for (const source of financeChanges) {
    assert.doesNotMatch(source, /user\?\.role\s*[!=]==?|role\s*[!=]==?\s*["'](?:admin|treasurer|dataEntry|auditor|viewer|member)/);
  }
});

test("phase 22j.3 preserves settlement diagnostic authorization", () => {
  assert.match(settlementAuthorizationSource, /SETTLEMENT_DIAGNOSTIC_PERMISSION = PERMISSIONS\.treasurySettle/);
  assert.match(settlementTabsSource, /canAccessSettlementDiagnostic\(can\)/);
  assert.match(settlementSource, /requireSettlementDiagnosticPermission/);
});

test("phase 22j.3 canonical role matrix remains unchanged for all six roles", () => {
  assert.deepEqual(Object.keys(ROLE_PERMISSION_MATRIX).sort(), ["admin", "auditor", "dataEntry", "member", "treasurer", "viewer"]);
});

test("phase 22j.3 tests require no Production write", () => {
  const testSource = read("tools/migration/phase22j3FinanceNavigationCapability.test.js");
  const importedModules = testSource.split("\n").filter((line) => line.startsWith("import ")).join("\n");
  assert.doesNotMatch(importedModules, /firebase/);
});
