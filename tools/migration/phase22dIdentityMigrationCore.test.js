import test from "node:test";
import assert from "node:assert/strict";
import {
  PHASE22D_ACTIONS,
  buildPhase22dDryRunPlan,
  syntheticEmailForAccount,
} from "./phase22dIdentityMigrationCore.js";

test("phase 22d dry-run plans zero writes for active legacy accounts", () => {
  const plan = buildPhase22dDryRunPlan(
    [{ id: "acc1", username: "admin", role: "admin", accountStatus: "active", passwordHash: "hash" }],
    []
  );

  assert.equal(plan.summary.requiresFirebaseUserCreation, 1);
  assert.equal(plan.summary.requiresAccountIdClaim, 1);
  assert.equal(plan.rows[0].intendedAction, PHASE22D_ACTIONS.JIT_LINK_ON_LEGACY_LOGIN);
  assert.equal(plan.rows[0].writesPerformed, 0);
  assert.equal(plan.rows[0].dryRun, true);
});

test("phase 22d dry-run reuses existing auth user and plans missing claim", () => {
  const account = { id: "acc1", username: "member", role: "member", accountStatus: "active", passwordHash: "hash" };
  const plan = buildPhase22dDryRunPlan(
    [account],
    [{ uid: "uid1", email: syntheticEmailForAccount(account), customClaims: {} }]
  );

  assert.equal(plan.summary.canReuseExistingAuthUser, 1);
  assert.equal(plan.summary.requiresFirebaseUserCreation, 0);
  assert.equal(plan.summary.requiresAccountIdClaim, 1);
  assert.equal(plan.rows[0].intendedAction, PHASE22D_ACTIONS.REUSE_EXISTING_AUTH_USER);
});

test("phase 22d dry-run recognizes already compatible mapping", () => {
  const account = {
    id: "acc1",
    username: "member",
    role: "member",
    accountStatus: "active",
    passwordHash: "hash",
    firebaseUid: "uid1",
  };
  const plan = buildPhase22dDryRunPlan(
    [account],
    [{ uid: "uid1", email: syntheticEmailForAccount(account), customClaims: { accountId: "acc1" } }]
  );

  assert.equal(plan.summary.alreadyCompatible, 1);
  assert.equal(plan.rows[0].intendedAction, PHASE22D_ACTIONS.VERIFY_EXISTING_MAPPING);
  assert.equal(plan.rows[0].claimAction, "none");
  assert.equal(plan.rows[0].firebaseUidAction, "none");
});

test("phase 22d dry-run defers inactive accounts by default", () => {
  const plan = buildPhase22dDryRunPlan(
    [{ id: "acc1", username: "old", role: "viewer", accountStatus: "disabled", passwordHash: "hash" }],
    []
  );

  assert.equal(plan.summary.deferredInactive, 1);
  assert.equal(plan.rows[0].intendedAction, PHASE22D_ACTIONS.DEFER_INACTIVE);
});

test("phase 22d dry-run detects duplicate employee identifiers", () => {
  const plan = buildPhase22dDryRunPlan(
    [
      { id: "a", username: "a", role: "member", accountStatus: "active", passwordHash: "hash", employeeId: "e1", employeeCode: "10" },
      { id: "b", username: "b", role: "member", accountStatus: "active", passwordHash: "hash", employeeId: "e1", employeeCode: "10" },
    ],
    []
  );

  assert.equal(plan.summary.conflicts.duplicateEmployeeId, 2);
  assert.equal(plan.summary.conflicts.duplicateEmployeeCode, 2);
  assert.equal(plan.rows[0].intendedAction, PHASE22D_ACTIONS.MANUAL_REVIEW);
});
