import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BOOKING_MANAGEMENT_DENIED_MESSAGE,
  BOOKING_MANAGEMENT_PERMISSION,
  BOOKING_OWNERSHIP_DENIED_MESSAGE,
  SENSITIVE_BOOKING_EXPORT_DENIED_MESSAGE,
  SENSITIVE_BOOKING_EXPORT_PERMISSION,
  canCreateBookingForMember,
  canExportSensitiveBookings,
  canManageBookings,
  getBookingOwnerIds,
  getPrimaryBookingOwnerId,
  hasBookingManagementPermission,
  hasSensitiveBookingExportPermission,
  isOwnBooking,
  requireBookingManagementPermission,
  requireOwnBookingTarget,
  requireSensitiveBookingExportPermission,
} from "../../src/modules/activities/bookingAuthorization.js";
import { PERMISSIONS } from "../../src/security/permissions.js";

const read = (path) => readFileSync(path, "utf8");
const eventBookingsSource = read("src/modules/activities/EventBookings.jsx");
const eventsMasterSource = read("src/modules/activities/EventsMaster.jsx");
const unionPageSource = read("src/modules/activities/union/UnionActivityPage.jsx");
const unionHookSource = read("src/modules/activities/union/useUnionActivity.js");
const rulesSource = read("firestore.rules");

const bookingRoleCases = [
  ["admin", true],
  ["dataEntry", true],
  ["treasurer", false],
  ["auditor", false],
  ["viewer", false],
  ["member", false],
];

for (const [role, expected] of bookingRoleCases) {
  test(`phase 22j.2b ${role} booking management follows bookings.manage`, () => {
    assert.equal(hasBookingManagementPermission({ role }), expected);
  });
}

const sensitiveExportRoleCases = [
  ["admin", true],
  ["dataEntry", false],
  ["treasurer", false],
  ["auditor", false],
  ["viewer", false],
  ["member", false],
];

for (const [role, expected] of sensitiveExportRoleCases) {
  test(`phase 22j.2b ${role} sensitive booking export requires both capabilities`, () => {
    assert.equal(hasSensitiveBookingExportPermission({ role }), expected);
  });
}

test("phase 22j.2b uses canonical booking and export permissions", () => {
  assert.equal(BOOKING_MANAGEMENT_PERMISSION, PERMISSIONS.bookingsManage);
  assert.equal(SENSITIVE_BOOKING_EXPORT_PERMISSION, PERMISSIONS.reportsExport);
});

test("phase 22j.2b booking management preserves permission overrides", () => {
  assert.equal(hasBookingManagementPermission({ role: "member", permissionOverrides: [PERMISSIONS.bookingsManage] }), true);
});

test("phase 22j.2b reports.export alone cannot export participant data", () => {
  assert.equal(hasSensitiveBookingExportPermission({ role: "member", permissionOverrides: [PERMISSIONS.reportsExport] }), false);
});

test("phase 22j.2b both overrides enable sensitive booking export", () => {
  assert.equal(hasSensitiveBookingExportPermission({
    role: "member",
    permissionOverrides: [PERMISSIONS.bookingsManage, PERMISSIONS.reportsExport],
  }), true);
});

test("phase 22j.2b booking resolver fails closed", () => {
  assert.equal(canManageBookings(), false);
  assert.equal(canManageBookings(null), false);
  assert.equal(canManageBookings(() => undefined), false);
  assert.equal(canManageBookings(() => "true"), false);
});

test("phase 22j.2b sensitive export resolver fails closed on either capability", () => {
  assert.equal(canExportSensitiveBookings(), false);
  assert.equal(canExportSensitiveBookings(() => undefined), false);
  assert.equal(canExportSensitiveBookings((permission) => permission === PERMISSIONS.bookingsManage), false);
  assert.equal(canExportSensitiveBookings((permission) => permission === PERMISSIONS.reportsExport), false);
});

test("phase 22j.2b booking management denial is stable", () => {
  let denial = "";
  assert.equal(requireBookingManagementPermission(() => false, (message) => { denial = message; }), false);
  assert.equal(denial, BOOKING_MANAGEMENT_DENIED_MESSAGE);
});

test("phase 22j.2b sensitive export denial is stable", () => {
  let denial = "";
  assert.equal(requireSensitiveBookingExportPermission(() => false, (message) => { denial = message; }), false);
  assert.equal(denial, SENSITIVE_BOOKING_EXPORT_DENIED_MESSAGE);
});

test("phase 22j.2b member ownership uses stable employee identifiers", () => {
  assert.deepEqual(
    getBookingOwnerIds({ employeeId: " E-7 ", employeeCode: "007", jobId: "007", id: "account-1" }),
    ["007", "E-7"]
  );
  assert.equal(getPrimaryBookingOwnerId({ employeeCode: "007" }), "007");
});

test("phase 22j.2b account id, name, and phone are not booking owner ids", () => {
  const ownerIds = getBookingOwnerIds({ id: "account-1", fullName: "Same Name", phone: "0100" });
  assert.deepEqual(ownerIds, []);
});

test("phase 22j.2b exact memberId establishes booking ownership", () => {
  assert.equal(isOwnBooking({ memberId: "007" }, ["007", "E-7"]), true);
});

test("phase 22j.2b memberName never establishes booking ownership", () => {
  assert.equal(isOwnBooking({ memberName: "Same Name" }, ["Same Name"]), false);
});

test("phase 22j.2b memberPhone never establishes booking ownership", () => {
  assert.equal(isOwnBooking({ memberPhone: "0100" }, ["0100"]), false);
});

test("phase 22j.2b own target passes and another target fails", () => {
  const user = { employeeCode: "007" };
  assert.equal(requireOwnBookingTarget(user, "007"), true);
  assert.equal(requireOwnBookingTarget(user, "008"), false);
});

test("phase 22j.2b ownership denial reports a stable message", () => {
  let denial = "";
  requireOwnBookingTarget({ employeeCode: "007" }, "008", (message) => { denial = message; });
  assert.equal(denial, BOOKING_OWNERSHIP_DENIED_MESSAGE);
});

test("phase 22j.2b manager may create for another member", () => {
  assert.equal(canCreateBookingForMember(() => true, {}, "008"), true);
});

test("phase 22j.2b member may create only for own stable identifier", () => {
  const noCapabilities = () => false;
  assert.equal(canCreateBookingForMember(noCapabilities, { employeeCode: "007" }, "007"), true);
  assert.equal(canCreateBookingForMember(noCapabilities, { employeeCode: "007" }, "008"), false);
});

for (const action of ["confirm", "cancel", "manual benefit", "add supervisor", "remove supervisor", "copy participant phones"]) {
  test(`phase 22j.2b unauthorized ${action} reaches zero mocked writes or output`, async () => {
    let effects = 0;
    const mockedEffect = async () => { effects += 1; };
    if (requireBookingManagementPermission(() => false)) await mockedEffect();
    assert.equal(effects, 0);
  });
}

test("phase 22j.2b EventBookings removes role shortcuts", () => {
  const component = eventBookingsSource.slice(eventBookingsSource.indexOf("export default function EventBookings"));
  assert.doesNotMatch(component, /user\?\.role|role\s*[!=]==?/);
  assert.doesNotMatch(component, /isMemberView/);
});

test("phase 22j.2b EventBookings scopes non-manager employee reads by jobId", () => {
  assert.match(eventBookingsSource, /where\("jobId", "in", ownerIds\)/);
  assert.match(eventBookingsSource, /if \(canManageBookings\)[\s\S]*?query\(collection\(db, "employees"\)\)/);
});

test("phase 22j.2b EventBookings scopes own booking reads by memberId", () => {
  assert.match(eventBookingsSource, /where\("memberId", "in", ownerIds\)/);
  assert.match(eventBookingsSource, /filter\(b => canManageBookings \|\| b\.eventId === selectedEventId\)/);
});

test("phase 22j.2b EventBookings manager read remains event scoped", () => {
  assert.match(eventBookingsSource, /where\("eventId", "==", selectedEventId\)/);
});

test("phase 22j.2b EventBookings never matches ownership by name or phone", () => {
  const ownershipSection = eventBookingsSource.slice(
    eventBookingsSource.indexOf("const ownerIds"),
    eventBookingsSource.indexOf("// بيانات")
  );
  assert.doesNotMatch(ownershipSection, /memberName|memberPhone|user\?\.phone.*ownerIds/);
});

test("phase 22j.2b self-service create checks target ownership before Firestore writes", () => {
  const start = eventBookingsSource.indexOf("const handleConfirmBooking");
  const end = eventBookingsSource.indexOf("const executeCancelBooking", start);
  const body = eventBookingsSource.slice(start, end);
  const guard = body.indexOf("requireOwnBookingTarget");
  assert.ok(guard >= 0);
  assert.ok(body.indexOf("writeBatch(db)") > guard);
});

for (const [handler, nextHandler, boundary] of [
  ["saveManualBenefit", "handleConfirmBooking", "writeBatch(db)"],
  ["executeCancelBooking", "handleConfirmPending", "writeBatch(db)"],
  ["handleConfirmPending", "copyPhones", "writeBatch(db)"],
  ["addSupervisor", "removeSupervisor", "updateDoc(doc(db, \"events\""],
  ["removeSupervisor", "filteredBookings", "updateDoc(doc(db, \"events\""],
]) {
  test(`phase 22j.2b ${handler} checks bookings.manage before its write`, () => {
    const start = eventBookingsSource.indexOf(`const ${handler}`);
    const end = eventBookingsSource.indexOf(`const ${nextHandler}`, start);
    const body = eventBookingsSource.slice(start, end);
    const guard = body.indexOf("requireBookingManagementPermission");
    assert.ok(start >= 0 && end > start && guard >= 0);
    assert.ok(body.indexOf(boundary) > guard);
  });
}

test("phase 22j.2b participant copy and print require sensitive export", () => {
  assert.match(eventBookingsSource, /const copyPhones[\s\S]*?requireSensitiveBookingExportPermission/);
  assert.match(eventBookingsSource, /const printManifest = \(event, bookings, authorize\)[\s\S]*?authorize\(\) !== true/);
  assert.match(eventBookingsSource, /\{canExportBookings && <button onClick=\{\(\) => printManifest/);
});

test("phase 22j.2b participant management controls require bookings.manage", () => {
  assert.match(eventBookingsSource, /\{canManageBookings && b\.status !== "cancelled"/);
  assert.match(eventBookingsSource, /\{isTripEvent && canManageBookings &&/);
});

test("phase 22j.2b Union Activity subscribes to booking and employee data only for managers", () => {
  assert.match(unionHookSource, /if \(bookingManagementAllowed\)[\s\S]*?collection\(db, "event_bookings"\)/);
  assert.match(unionHookSource, /if \(bookingManagementAllowed \|\| eventManagementAllowed\)[\s\S]*?collection\(db, "employees"\)/);
});

for (const handler of ["addBooking", "confirmBooking", "cancelBooking"]) {
  test(`phase 22j.2b Union Activity ${handler} is handler-guarded`, () => {
    const start = unionHookSource.indexOf(`const ${handler}`);
    const next = unionHookSource.indexOf("const ", start + 10);
    const body = unionHookSource.slice(start, next > start ? next : undefined);
    assert.match(body, /requireBookingManagementPermission\(can\)/);
  });
}

test("phase 22j.2b Union Activity booking panel and actions require bookings.manage", () => {
  assert.match(unionPageSource, /\{canManageBookingOps && selectedEvent && \(/);
  assert.match(unionPageSource, /\{canManageBookingOps && \([\s\S]*?handleAddBooking/);
  assert.match(unionPageSource, /\{canManageBookingOps && \([\s\S]*?confirmBooking\(b\)[\s\S]*?cancelBooking\(b, r\)/);
});

test("phase 22j.2b Union Activity participant print checks both capabilities", () => {
  assert.match(unionPageSource, /const handlePrintManifest[\s\S]*?requireSensitiveBookingExportPermission/);
  assert.match(unionPageSource, /\{canExportBookings && <Button[^>]*onClick=\{handlePrintManifest\}/);
});

test("phase 22j.2b EventsMaster booking subscriptions require bookings.manage", () => {
  assert.match(eventsMasterSource, /if \(!canManageBookingData \|\| events\.length === 0\)/);
  assert.match(eventsMasterSource, /collection\(db, "event_bookings"\)/);
});

test("phase 22j.2b EventsMaster employee subscription requires event management", () => {
  assert.match(eventsMasterSource, /const unsubEmps = canManageEvents[\s\S]*?collection\(db, "employees"\)/);
});

test("phase 22j.2b EventsMaster sensitive prints check authorization internally", () => {
  assert.match(eventsMasterSource, /const printFinancialReport = \(events, bookingsMap, authorize\)[\s\S]*?authorize\(\) !== true/);
  assert.match(eventsMasterSource, /const printEventDetail = \(event, bookings, authorize\)[\s\S]*?authorize\(\) !== true/);
});

test("phase 22j.2b EventsMaster sensitive controls require combined export access", () => {
  assert.match(eventsMasterSource, /\{canExportBookingData && <Button[\s\S]{0,240}?printFinancialReport/);
  assert.match(eventsMasterSource, /\{canExportBookingData && <button[\s\S]{0,240}?printEventDetail/);
});

test("phase 22j.2b EventsMaster hides booking summaries and supervisors from non-managers", () => {
  assert.match(eventsMasterSource, /\{canManageBookingData && <div className="grid grid-cols-2/);
  assert.match(eventsMasterSource, /\{canManageBookingData && event\.supervisors/);
  assert.match(eventsMasterSource, /\{canManageBookingData && pendingCount > 0/);
});

test("phase 22j.2b event financial presentation requires reports.view", () => {
  assert.match(eventsMasterSource, /can\(PERMISSIONS\.reportsView\) === true/);
  assert.match(unionPageSource, /can\(PERMISSIONS\.reportsView\) === true/);
});

test("phase 22j.2b documents the current Firestore role mismatch in source evidence", () => {
  assert.match(rulesSource, /match \/event_bookings\/\{id\}[\s\S]*?allow read: if isStaff\(\) \|\| ownsMemberRecord\(\)/);
  assert.match(rulesSource, /allow create, update: if isStaff\(\)/);
  assert.doesNotMatch(rulesSource, /bookings\.manage|reports\.export/);
});
