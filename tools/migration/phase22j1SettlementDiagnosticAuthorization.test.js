import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SETTLEMENT_DIAGNOSTIC_DENIED_MESSAGE,
  SETTLEMENT_DIAGNOSTIC_PERMISSION,
  canAccessSettlementDiagnostic,
  hasSettlementDiagnosticPermission,
  requireSettlementDiagnosticPermission,
} from "../../src/modules/settlements/settlementAuthorization.js";
import { PERMISSIONS } from "../../src/security/permissions.js";

const read = (path) => readFileSync(path, "utf8");
const settlementSource = read("src/modules/settlements/SettlementTab.jsx");
const tabsSource = read("src/modules/settlements/components/SettlementWorkspaceTabs.jsx");
const routerSource = read("src/app/router.jsx");

const roleCases = [
  ["admin", true],
  ["treasurer", true],
  ["dataEntry", false],
  ["auditor", false],
  ["viewer", false],
  ["member", false],
];

for (const [role, expected] of roleCases) {
  test(`phase 22j.1 ${role} diagnostic authority follows treasury.settle`, () => {
    assert.equal(hasSettlementDiagnosticPermission({ role }), expected);
  });
}

test("phase 22j.1 uses the canonical treasury.settle permission", () => {
  assert.equal(SETTLEMENT_DIAGNOSTIC_PERMISSION, PERMISSIONS.treasurySettle);
});

test("phase 22j.1 preserves current permission override behavior without expanding it", () => {
  assert.equal(
    hasSettlementDiagnosticPermission({ role: "auditor", permissionOverrides: [PERMISSIONS.treasurySettle] }),
    true
  );
});

test("phase 22j.1 unauthorized direct invocation is denied before a simulated write", () => {
  let writes = 0;
  let denial = "";
  const allowed = requireSettlementDiagnosticPermission(
    () => false,
    (message) => { denial = message; }
  );
  if (allowed) writes += 1;

  assert.equal(allowed, false);
  assert.equal(writes, 0);
  assert.equal(denial, SETTLEMENT_DIAGNOSTIC_DENIED_MESSAGE);
});

test("phase 22j.1 authorized invocation reaches the original write boundary", () => {
  let writes = 0;
  const allowed = requireSettlementDiagnosticPermission(() => true);
  if (allowed) writes += 1;

  assert.equal(allowed, true);
  assert.equal(writes, 1);
});

test("phase 22j.1 diagnostic tab resolves permission from authenticated context", () => {
  assert.match(tabsSource, /const \{ can \} = useAuth\(\)/);
  assert.match(tabsSource, /canAccessSettlementDiagnostic\(can\)/);
  assert.match(tabsSource, /\.\.\.\(canUseDiagnostic \? \[\{/);
  assert.doesNotMatch(tabsSource, /role\s*[!=]==?/);
});

test("phase 22j.1 diagnostic panel render fails closed when permission is absent", () => {
  assert.match(settlementSource, /const canUseDiagnostic = canAccessSettlementDiagnostic\(can\)/);
  assert.match(settlementSource, /activeTab === "diagnostic" && !canUseDiagnostic \? "current" : activeTab/);
  assert.match(settlementSource, /authorizedActiveTab === "diagnostic" && canUseDiagnostic && <DiagnosticPanel/);
});

test("phase 22j.1 every diagnostic mutation checks permission before its first Firestore write", () => {
  const cases = [
    ["handleResetCheck", "handleFixState", "writeBatch(db)"],
    ["handleFixState", "handleEnableSettlement", "setDoc(doc(db, \"issued_checks\""],
    ["handleEnableSettlement", "const analysis", "setDoc(doc(db, \"issued_checks\""],
  ];

  for (const [startName, endName, writeToken] of cases) {
    const start = settlementSource.indexOf(`const ${startName}`);
    const end = settlementSource.indexOf(endName === "const analysis" ? endName : `const ${endName}`, start + 1);
    const body = settlementSource.slice(start, end);
    const permissionCheck = body.indexOf("if (!requireDiagnosticPermission()) return;");
    const firstWrite = body.indexOf(writeToken);
    assert.ok(start >= 0 && end > start, `${startName} body must be found`);
    assert.ok(permissionCheck >= 0, `${startName} must deny by default`);
    assert.ok(firstWrite > permissionCheck, `${startName} must authorize before Firestore write`);
  }
});

test("phase 22j.1 diagnostic authorization introduces no role hardcode", () => {
  const diagnosticStart = settlementSource.indexOf("function DiagnosticPanel");
  const diagnosticEnd = settlementSource.indexOf("export default function SettlementTab", diagnosticStart);
  const diagnosticSource = settlementSource.slice(diagnosticStart, diagnosticEnd);
  assert.doesNotMatch(diagnosticSource, /role\s*[!=]==?/);
  assert.match(diagnosticSource, /requireSettlementDiagnosticPermission/);
});

test("phase 22j.1 keeps the settlement route view-accessible", () => {
  assert.match(
    routerSource,
    /path="\/treasury\/settlements"[\s\S]*?permission=\{PERMISSIONS\.treasuryView\}/
  );
  assert.doesNotMatch(
    routerSource,
    /path="\/treasury\/settlements"[\s\S]{0,220}?permission=\{PERMISSIONS\.treasurySettle\}/
  );
});

test("phase 22j.1 leaves normal settlement permission boundaries in place", () => {
  assert.match(settlementSource, /handleSaveDraft[\s\S]*?requireSettlementPermission\(PERMISSIONS\.treasurySettle/);
  assert.match(settlementSource, /handleFinalSettle[\s\S]*?requireSettlementPermission\(PERMISSIONS\.treasurySettle/);
  assert.match(settlementSource, /executeRecovery[\s\S]*?requireSettlementPermission\(PERMISSIONS\.treasurySettle/);
  assert.match(settlementSource, /executeDeleteSettlement[\s\S]*?requireSettlementPermission\(PERMISSIONS\.treasuryDelete/);
});

test("phase 22j.1 access predicate fails closed for missing or malformed resolvers", () => {
  assert.equal(canAccessSettlementDiagnostic(), false);
  assert.equal(canAccessSettlementDiagnostic(null), false);
  assert.equal(canAccessSettlementDiagnostic(() => undefined), false);
});
