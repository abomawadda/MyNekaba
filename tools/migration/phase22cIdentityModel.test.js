import test from "node:test";
import assert from "node:assert/strict";

function rulesLookupCompatible({ docId = "", firebaseUid = "", accountIdClaim = "" } = {}) {
  return Boolean((accountIdClaim && accountIdClaim === docId) || (firebaseUid && firebaseUid === docId));
}

test("rules lookup is compatible when Firebase UID equals account document id", () => {
  assert.equal(rulesLookupCompatible({ docId: "acc_1", firebaseUid: "acc_1" }), true);
});

test("rules lookup is compatible when accountId custom claim points to account document", () => {
  assert.equal(
    rulesLookupCompatible({ docId: "acc_1", firebaseUid: "firebase_uid_9", accountIdClaim: "acc_1" }),
    true
  );
});

test("legacy firebaseUid field alone is not enough for Phase 22B rules lookup", () => {
  assert.equal(rulesLookupCompatible({ docId: "acc_1", firebaseUid: "firebase_uid_9" }), false);
});

test("local legacy account with no Firebase uid or accountId claim is safely incompatible", () => {
  assert.equal(rulesLookupCompatible({ docId: "acc_1" }), false);
});
