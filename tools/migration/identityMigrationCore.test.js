import test from "node:test";
import assert from "node:assert/strict";
import {
  MIGRATION_ACTIONS,
  MIGRATION_STATES,
  buildMigrationInventory,
  buildMigrationPlan,
  normalizeEmail,
} from "./identityMigrationCore.js";

test("normalizes email conservatively for comparison only", () => {
  assert.equal(normalizeEmail("  Admin@Example.COM "), "admin@example.com");
});

test("classifies linked, unlinked, and missing auth users", () => {
  const inventory = buildMigrationInventory(
    [
      {
        id: "linked",
        email: "linked@example.com",
        username: "linked",
        firebaseUid: "uid-1",
        accountStatus: "active",
        passwordHash: "legacy",
      },
      {
        id: "legacy",
        email: "legacy@example.com",
        username: "legacy",
        accountStatus: "active",
        passwordHash: "legacy",
      },
      {
        id: "missing-auth",
        email: "missing@example.com",
        username: "missing",
        firebaseUid: "uid-missing",
        accountStatus: "active",
        passwordHash: "legacy",
      },
    ],
    [{ uid: "uid-1", email: "linked@example.com", disabled: false }]
  );

  assert.equal(inventory.accounts[0].state, MIGRATION_STATES.LINKED_VALID);
  assert.equal(inventory.accounts[1].state, MIGRATION_STATES.LEGACY_UNLINKED);
  assert.equal(inventory.accounts[2].state, MIGRATION_STATES.UID_MISSING_IN_AUTH);
});

test("detects duplicate uid and email collisions without repairing them", () => {
  const inventory = buildMigrationInventory(
    [
      { id: "a", email: "Same@Example.com", username: "a", firebaseUid: "same-uid", passwordHash: "x" },
      { id: "b", email: " same@example.com ", username: "b", firebaseUid: "same-uid", passwordHash: "x" },
    ],
    [{ uid: "same-uid", email: "same@example.com", disabled: false }]
  );

  assert.equal(inventory.summary.conflicts.duplicateFirebaseUid, 2);
  assert.equal(inventory.summary.conflicts.duplicateEmail, 2);
  assert.equal(inventory.accounts[0].state, MIGRATION_STATES.UID_COLLISION);
  assert.equal(inventory.accounts[1].state, MIGRATION_STATES.UID_COLLISION);
});

test("builds a dry-run plan and never marks writes as required now", () => {
  const inventory = buildMigrationInventory(
    [{ id: "legacy", email: "legacy@example.com", username: "legacy", passwordHash: "x" }],
    []
  );
  const plan = buildMigrationPlan(inventory);

  assert.equal(plan[0].state, MIGRATION_STATES.LEGACY_UNLINKED);
  assert.equal(plan[0].proposedAction, MIGRATION_ACTIONS.CREATE_FIREBASE_IDENTITY);
  assert.equal(plan[0].dryRun, true);
  assert.equal(plan[0].writeRequiredNow, false);
});
