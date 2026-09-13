import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rules = fs.readFileSync(path.join(rootDir, "firestore.rules"), "utf8");
const memberPortal = fs.readFileSync(path.join(rootDir, "src/modules/portal/MemberPortal.jsx"), "utf8");

function sectionFor(matchPath) {
  const marker = `match /${matchPath}/{id} {`;
  const start = rules.indexOf(marker);
  assert.notEqual(start, -1, `missing rules section for ${matchPath}`);
  const rest = rules.slice(start);
  const next = rest.indexOf("\n    match /", marker.length);
  return next === -1 ? rest : rest.slice(0, next);
}

test("member self-access rules use ownership helpers, not broad member reads", () => {
  assert.match(rules, /function isMember\(\)/);
  assert.match(rules, /function ownsEmployeeRecord\(employeeDocId\)/);
  assert.match(rules, /function ownsMemberRecord\(\)/);
  assert.doesNotMatch(rules, /allow read:\s*if\s+isMember\(\)\s*;/);
  assert.doesNotMatch(rules, /allow read:\s*if\s+request\.auth\s*!=\s*null\s*;/);
});

test("employees, bookings, and benefits allow member reads only through ownership", () => {
  assert.match(sectionFor("employees"), /allow read: if isStaff\(\) \|\| ownsEmployeeRecord\(id\);/);
  assert.match(sectionFor("event_bookings"), /allow read: if isStaff\(\) \|\| ownsMemberRecord\(\);/);
  assert.match(sectionFor("member_benefits"), /allow read: if isStaff\(\) \|\| ownsMemberRecord\(\);/);
});

test("member cannot rewrite identity or role mapping on own account", () => {
  const userAccounts = rules.slice(rules.indexOf("match /user_accounts/{uid}"));
  for (const protectedField of [
    "role",
    "accountStatus",
    "permissionOverrides",
    "employeeId",
    "employeeCode",
    "jobId",
    "nationalId",
    "phone",
    "email",
    "firebaseUid",
  ]) {
    assert.match(userAccounts, new RegExp(`'${protectedField}'`));
  }
});

test("member portal queries are equality-scoped and do not restore full collection reads", () => {
  assert.doesNotMatch(memberPortal, /where\("memberId",\s*"in"/);
  assert.doesNotMatch(memberPortal, /query\(collection\(db,\s*"employees"\)\)/);
  assert.doesNotMatch(memberPortal, /query\(collection\(db,\s*"event_bookings"\)\)/);
  assert.doesNotMatch(memberPortal, /query\(collection\(db,\s*"member_benefits"\)\)/);
  assert.match(memberPortal, /where\("memberId",\s*"=="/);
});
