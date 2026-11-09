import test from "node:test";
import assert from "node:assert/strict";
import { resolveMemberAccess } from "./memberAccess.js";

const activeUser = { id: "u1", role: "member", accountStatus: "active" };

test("blocks pending accounts", () => {
  const r = resolveMemberAccess({ user: { ...activeUser, accountStatus: "pending_approval" }, employee: { name: "x" } });
  assert.equal(r.canBook, false);
});

test("blocks accounts not linked to a member record", () => {
  assert.equal(resolveMemberAccess({ user: activeUser, employee: null }).canBook, false);
});

test("blocks independent-union members", () => {
  const r = resolveMemberAccess({ user: activeUser, employee: { name: "x", membershipStatus: "نقابة مستقلة" } });
  assert.equal(r.canBook, false);
});

test("allows active assembly members", () => {
  const r = resolveMemberAccess({ user: activeUser, employee: { name: "x", membershipStatus: "عضو جمعية عمومية" } });
  assert.equal(r.canBook, true);
});
