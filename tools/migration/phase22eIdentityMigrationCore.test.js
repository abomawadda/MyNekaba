import test from "node:test";
import assert from "node:assert/strict";
import {
  PHASE22E_EXECUTE_CONFIRM,
  assertExecutionSafeguards,
  assertSingleAccountId,
  buildCanaryDryRunResult,
  countProductionWrites,
  selectCanaryAccount,
} from "./phase22eIdentityMigrationCore.js";

test("phase 22e execute requires explicit confirmation", () => {
  assert.throws(
    () => assertExecutionSafeguards({ execute: true, accountId: "acc1", confirm: "WRONG" }),
    /MIGRATE_ONE_CANARY/
  );

  assert.doesNotThrow(() =>
    assertExecutionSafeguards({
      execute: true,
      accountId: "acc1",
      confirm: PHASE22E_EXECUTE_CONFIRM,
    })
  );
});

test("phase 22e enforces one-account-only execution", () => {
  assert.throws(() => assertSingleAccountId("acc1,acc2"), /exactly one account/);
  assert.throws(() => assertSingleAccountId("acc1 acc2"), /exactly one account/);
  assert.equal(assertSingleAccountId("acc1"), "acc1");
});

test("phase 22e dry-run selects an active admin canary and writes nothing", () => {
  const result = buildCanaryDryRunResult(
    [
      { id: "viewer1", username: "view", role: "viewer", accountStatus: "active", passwordHash: "hash" },
      { id: "admin1", username: "admin", role: "admin", accountStatus: "active", passwordHash: "hash" },
    ],
    []
  );

  assert.equal(result.dryRun, true);
  assert.equal(result.writesPerformed, 0);
  assert.equal(result.selected.account, "ad***n1");
  assert.equal(result.summary.adminCandidates, 1);
});

test("phase 22e canary selection rejects non-admin account execution", () => {
  const selection = selectCanaryAccount(
    [{ id: "viewer1", username: "view", role: "viewer", accountStatus: "active", passwordHash: "hash" }],
    [],
    { accountId: "viewer1" }
  );

  assert.equal(selection.selected, null);
  assert.equal(selection.candidateCount, 0);
});

test("phase 22e duplicate prevention keeps conflicted accounts out of canary selection", () => {
  const selection = selectCanaryAccount(
    [
      { id: "admin1", username: "same", role: "admin", accountStatus: "active", passwordHash: "hash" },
      { id: "admin2", username: "same", role: "admin", accountStatus: "active", passwordHash: "hash" },
    ],
    []
  );

  assert.equal(selection.selected, null);
  assert.equal(selection.plan.summary.manualReview, 2);
});

test("phase 22e write accounting is explicit", () => {
  assert.deepEqual(
    countProductionWrites({
      authUsersCreated: 1,
      customClaimsWritten: 1,
      firestoreDocumentsUpdated: 1,
      accountsAffected: 1,
    }),
    {
      authUsersCreated: 1,
      customClaimsWritten: 1,
      firestoreDocumentsUpdated: 1,
      accountsAffected: 1,
      total: 3,
    }
  );
});
