import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EVENT_MANAGEMENT_DENIED_MESSAGE,
  EVENT_MANAGEMENT_PERMISSION,
  canManageActivities,
  hasEventManagementPermission,
  requireEventManagementPermission,
} from "../../src/modules/activities/activityAuthorization.js";
import { PERMISSIONS } from "../../src/security/permissions.js";

const read = (path) => readFileSync(path, "utf8");
const eventsSource = read("src/modules/activities/EventsMaster.jsx");
const routerSource = read("src/app/router.jsx");
const unionSource = read("src/modules/activities/union/UnionActivityPage.jsx");

const roleCases = [
  ["admin", true],
  ["treasurer", false],
  ["dataEntry", false],
  ["auditor", false],
  ["viewer", false],
  ["member", false],
];

for (const [role, expected] of roleCases) {
  test(`phase 22j.2a ${role} event management follows activities.manage`, () => {
    assert.equal(hasEventManagementPermission({ role }), expected);
  });
}

test("phase 22j.2a uses the canonical activities.manage permission", () => {
  assert.equal(EVENT_MANAGEMENT_PERMISSION, PERMISSIONS.activitiesManage);
});

test("phase 22j.2a preserves canonical permission override behavior", () => {
  assert.equal(
    hasEventManagementPermission({ role: "member", permissionOverrides: [PERMISSIONS.activitiesManage] }),
    true
  );
});

test("phase 22j.2a event management predicate fails closed", () => {
  assert.equal(canManageActivities(), false);
  assert.equal(canManageActivities(null), false);
  assert.equal(canManageActivities(() => undefined), false);
  assert.equal(canManageActivities(() => "true"), false);
});

test("phase 22j.2a denial is stable and does not expose internals", () => {
  let denial = "";
  const allowed = requireEventManagementPermission(
    () => false,
    (message) => { denial = message; }
  );
  assert.equal(allowed, false);
  assert.equal(denial, EVENT_MANAGEMENT_DENIED_MESSAGE);
  assert.doesNotMatch(denial, /firebase|firestore|permissionOverrides/i);
});

for (const action of ["create", "edit", "delete"]) {
  test(`phase 22j.2a unauthorized ${action} reaches zero mocked Firestore writes`, async () => {
    let writes = 0;
    const mockedWrite = async () => { writes += 1; };
    if (requireEventManagementPermission(() => false)) await mockedWrite();
    assert.equal(writes, 0);
  });
}

test("phase 22j.2a authorized caller reaches the original mocked write boundary", async () => {
  let writes = 0;
  const mockedWrite = async () => { writes += 1; };
  if (requireEventManagementPermission(() => true)) await mockedWrite();
  assert.equal(writes, 1);
});

test("phase 22j.2a route remains view-accessible", () => {
  assert.match(
    routerSource,
    /path="\/activities\/master"[\s\S]*?permission=\{PERMISSIONS\.activitiesView\}/
  );
  assert.doesNotMatch(
    routerSource,
    /path="\/activities\/master"[\s\S]{0,220}?permission=\{PERMISSIONS\.activitiesManage\}/
  );
});

test("phase 22j.2a EventsMaster resolves management from authenticated context", () => {
  assert.match(eventsSource, /const \{ can \} = useAuth\(\)/);
  assert.match(eventsSource, /const canManageEvents = canManageActivities\(can\)/);
});

test("phase 22j.2a Add Event controls require management permission", () => {
  assert.match(eventsSource, /\{canManageEvents && <Button[^>]*onClick=\{openCreate\}>فعالية جديدة<\/Button>\}/);
  assert.match(eventsSource, /\{canManageEvents && \([\s\S]*?<button onClick=\{openCreate\}[\s\S]*?فعالية جديدة/);
});

test("phase 22j.2a Edit and Delete controls require management permission", () => {
  const controlsStart = eventsSource.indexOf("{canManageEvents && (", eventsSource.indexOf("printEventDetail(event, bks)"));
  const controlsEnd = eventsSource.indexOf("</>", controlsStart);
  const controls = eventsSource.slice(controlsStart, controlsEnd);
  assert.ok(controlsStart >= 0 && controlsEnd > controlsStart);
  assert.match(controls, /openEdit\(event\)/);
  assert.match(controls, /handleDelete\(event\)/);
});

test("phase 22j.2a management modal fails closed", () => {
  assert.match(eventsSource, /\{canManageEvents && isModalOpen && \(/);
});

test("phase 22j.2a create and edit writes are guarded before either Firestore boundary", () => {
  const start = eventsSource.indexOf("const handleSaveEvent");
  const end = eventsSource.indexOf("const handleDelete", start);
  const body = eventsSource.slice(start, end);
  const guard = body.indexOf("if (!requireEventManagement()) return;");
  assert.ok(start >= 0 && end > start);
  assert.ok(guard >= 0);
  assert.ok(body.indexOf("updateDoc(doc(db, \"events\", editId)") > guard);
  assert.ok(body.indexOf("addDoc(collection(db, \"events\")") > guard);
});

test("phase 22j.2a delete write is guarded before its Firestore boundary", () => {
  const start = eventsSource.indexOf("const handleDelete");
  const end = eventsSource.indexOf("const closeModal", start);
  const body = eventsSource.slice(start, end);
  const guard = body.indexOf("if (!requireEventManagement()) return;");
  assert.ok(start >= 0 && end > start);
  assert.ok(guard >= 0);
  assert.ok(body.indexOf("deleteDoc(doc(db, \"events\", ev.id))") > guard);
});

test("phase 22j.2a management-only modal entry points deny direct invocation", () => {
  for (const [startName, endName] of [["openCreate", "openEdit"], ["openEdit", "setField"]]) {
    const start = eventsSource.indexOf(`const ${startName}`);
    const end = eventsSource.indexOf(`const ${endName}`, start);
    const body = eventsSource.slice(start, end);
    assert.ok(start >= 0 && end > start);
    assert.match(body, /if \(!requireEventManagement\(\)\) return;/);
  }
});

test("phase 22j.2a introduces no event-management role hardcoding", () => {
  const componentStart = eventsSource.indexOf("export default function EventsMaster");
  const component = eventsSource.slice(componentStart);
  assert.doesNotMatch(component, /role\s*[!=]==?/);
  assert.doesNotMatch(component, /\b(admin|member|treasurer|auditor|dataEntry|viewer)\b\s*[!=]==?/);
});

test("phase 22j.2a preserves event payload and collection semantics", () => {
  assert.match(eventsSource, /updateDoc\(doc\(db, "events", editId\), eventData\)/);
  assert.match(eventsSource, /addDoc\(collection\(db, "events"\), \{ \.\.\.eventData, bookedCount: 0, status: "open", createdAt: serverTimestamp\(\) \}\)/);
  assert.match(eventsSource, /deleteDoc\(doc\(db, "events", ev\.id\)\)/);
  for (const field of [
    "title", "type", "date", "bookingStart", "bookingEnd", "location", "description",
    "notes", "capacity", "isFree", "memberPrice", "companionPrice", "memberSupportValue",
    "supervisors", "updatedAt",
  ]) {
    assert.match(eventsSource, new RegExp(`\\b${field}\\b`));
  }
});

test("phase 22j.2a event management does not introduce booking writes", () => {
  const saveStart = eventsSource.indexOf("const handleSaveEvent");
  const entryEnd = eventsSource.indexOf("const setField", saveStart);
  const mutationSource = eventsSource.slice(saveStart, entryEnd);
  assert.doesNotMatch(mutationSource, /event_bookings/);
});

test("phase 22j.2a keeps UnionActivity activities.manage semantics intact", () => {
  assert.match(unionSource, /const canManage = can\(PERMISSIONS\.activitiesManage\)/);
});
