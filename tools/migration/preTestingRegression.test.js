import test from "node:test";
import assert from "node:assert/strict";
import {
  getCheckFinancialEffect,
  getCheckLifecycle,
  getCheckStatusLabel,
  LEGACY_CHECK_STATUS,
  LEGACY_CHECK_STATUS_LABEL,
} from "../../src/modules/treasury/checkbooks/checkbookConstants.js";
import { getCheckFinancialEffectAmount } from "../../src/modules/treasury/helpers/financeLedger.js";
import {
  buildSettlementBaseline,
  getSettlementRemainingAmount,
  getSettlementStatusKey,
} from "../../src/modules/settlements/settlementAudit.js";
import { sortByDateCheckEmployee } from "../../src/modules/reports/reportUtils.js";
import { sortBoardMembersUnified } from "../../src/modules/board/boardMembershipRules.js";

test("legacy checks without lifecycle remain financially effective cashed records", () => {
  const legacy = { amount: 1250 };

  assert.equal(getCheckLifecycle(legacy), LEGACY_CHECK_STATUS);
  assert.equal(getCheckLifecycle(legacy), "cashed");
  assert.equal(getCheckStatusLabel(legacy), LEGACY_CHECK_STATUS_LABEL);
  assert.equal(getCheckFinancialEffect(legacy, 1250), 1250);
  assert.equal(getCheckFinancialEffectAmount(legacy, 1250), 1250);
});

test("check lifecycle statuses keep current financial effect semantics", () => {
  const amount = 900;

  assert.equal(getCheckFinancialEffect({ checkStatus: "issued" }, amount), 0);
  assert.equal(getCheckFinancialEffect({ checkStatus: "delivered" }, amount), 0);
  assert.equal(getCheckFinancialEffect({ checkStatus: "cashed" }, amount), amount);
  assert.equal(getCheckFinancialEffect({ checkStatus: "cancelled" }, amount), 0);
  assert.equal(getCheckFinancialEffect({ checkStatus: "replaced" }, amount), 0);
});

test("settlement audit classifies open, partial, and completed records", () => {
  assert.equal(getSettlementStatusKey({ requiresSettlement: true }), "open");
  assert.equal(getSettlementStatusKey({ requiresSettlement: true, hasDraftSettlement: true }), "partial");
  assert.equal(getSettlementStatusKey({ requiresSettlement: true, isSettled: true }), "completed");
});

test("settlement baseline remaining amount is returned, deposited, or carried forward", () => {
  const baseline = buildSettlementBaseline([
    { id: "cash", requiresSettlement: true, amount: 100, returnedCashAmount: 10 },
    { id: "bank", requiresSettlement: true, amount: 100, bankDepositedAmount: 20 },
    { id: "returned", requiresSettlement: true, amount: 100, settlementReturned: 30 },
  ]);

  assert.equal(getSettlementRemainingAmount({ returnedCashAmount: 10 }), 10);
  assert.equal(getSettlementRemainingAmount({ bankDepositedAmount: 20 }), 20);
  assert.equal(getSettlementRemainingAmount({ settlementReturned: 30 }), 30);
  assert.equal(baseline.totalRemainingAmount, 60);
});

test("settlement baseline does not expose a cancelled settlement metric", () => {
  const baseline = buildSettlementBaseline([{ id: "open", requiresSettlement: true, amount: 100 }]);

  assert.equal(Object.hasOwn(baseline, "cancelledSettlements"), false);
  assert.equal(Object.hasOwn(baseline.statusCounts, "cancelled"), false);
});

test("general report rows sort by date, check/reference, then employee number", () => {
  const rows = [
    { id: "late", date: "2026-02-01", reference: "2", memberId: "10", party: "late" },
    { id: "employee-second", date: "2026-01-01", reference: "1", memberId: "20", party: "employee-second" },
    { id: "employee-first", date: "2026-01-01", reference: "1", memberId: "10", party: "employee-first" },
    { id: "check-first", date: "2026-01-01", reference: "0", memberId: "99", party: "check-first" },
  ];

  assert.deepEqual(
    sortByDateCheckEmployee(rows, "date", "reference", "memberId", "party").map((row) => row.id),
    ["check-first", "employee-first", "employee-second", "late"]
  );
});

test("board members sort executives before members, then by employee number", () => {
  const rows = [
    { id: "member-2", boardRoleTitle: "عضو مجلس", jobId: "2" },
    { id: "exec-5", boardRoleTitle: "رئيس المجلس", jobId: "5" },
    { id: "member-1", boardRoleTitle: "عضو مجلس", jobId: "1" },
    { id: "exec-3", boardRoleTitle: "الأمين العام", jobId: "3" },
  ];

  assert.deepEqual(
    sortBoardMembersUnified(rows).map((row) => row.id),
    ["exec-5", "exec-3", "member-1", "member-2"]
  );
});
