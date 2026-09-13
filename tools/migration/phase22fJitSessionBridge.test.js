/* global process */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  JIT_FIREBASE_LINKED,
  JIT_LEGACY_ONLY,
  assertClaimMatchesAccount,
  buildLegacyPasswordHash,
  buildMinimalAccountMetadata,
  classifyJitAccount,
  findAccountByIdentifier,
  normalizePrivateKey,
  validateJitServerEnv,
  verifyLegacyPassword,
} from "../../api/_lib/jitAuthCore.js";

test("phase 22f rejects invalid legacy credentials server-side", () => {
  const passwordHash = buildLegacyPasswordHash("correct", "salt");
  assert.equal(verifyLegacyPassword({ password: "wrong", passwordSalt: "salt", passwordHash }), false);
});

test("phase 22f accepts valid legacy credentials server-side", () => {
  const passwordHash = buildLegacyPasswordHash("correct", "salt");
  assert.equal(verifyLegacyPassword({ password: "correct", passwordSalt: "salt", passwordHash }), true);
});

test("phase 22f rejects inactive accounts before token creation", () => {
  assert.equal(
    classifyJitAccount({
      id: "acc1",
      accountStatus: "disabled",
      passwordHash: "hash",
      passwordSalt: "salt",
      firebaseUid: "uid1",
    }),
    "inactive"
  );
});

test("phase 22f selects the exact accountId from username, not client-provided account ids", () => {
  const accounts = [
    { id: "real-account", username: "admin", email: "admin@example.com" },
    { id: "other-account", username: "viewer", email: "viewer@example.com" },
  ];

  const result = findAccountByIdentifier(accounts, "admin");
  assert.equal(result.account.id, "real-account");
  assert.equal(buildMinimalAccountMetadata(result.account).accountId, "real-account");
});

test("phase 22f detects ambiguous login identifiers", () => {
  const result = findAccountByIdentifier(
    [
      { id: "a", username: "same" },
      { id: "b", email: "same" },
    ],
    "same"
  );

  assert.equal(result.account, null);
  assert.equal(result.ambiguous, true);
});

test("phase 22f reuses linked Firebase users and supports legacy-only compatibility", () => {
  assert.equal(
    classifyJitAccount({
      id: "linked",
      accountStatus: "active",
      passwordHash: "hash",
      passwordSalt: "salt",
      firebaseUid: "uid1",
    }),
    JIT_FIREBASE_LINKED
  );
  assert.equal(
    classifyJitAccount({
      id: "legacy",
      accountStatus: "active",
      passwordHash: "hash",
      passwordSalt: "salt",
    }),
    JIT_LEGACY_ONLY
  );
});

test("phase 22f custom claim must match the account document id", () => {
  assert.equal(
    assertClaimMatchesAccount({ customClaims: { accountId: "acc1" } }, { id: "acc1" }),
    true
  );
  assert.equal(
    assertClaimMatchesAccount({ customClaims: { accountId: "spoofed" } }, { id: "acc1" }),
    false
  );
});

test("phase 22f does not place Firebase Admin SDK in frontend source", () => {
  const authProvider = readFileSync(join(process.cwd(), "src/app/providers/AuthProvider.jsx"), "utf8");
  const firebaseAuth = readFileSync(join(process.cwd(), "src/security/firebaseAuth.js"), "utf8");
  const jitBridge = readFileSync(join(process.cwd(), "src/security/jitSessionBridge.js"), "utf8");

  assert.equal(/firebase-admin/.test(authProvider), false);
  assert.equal(/firebase-admin/.test(firebaseAuth), false);
  assert.equal(/firebase-admin/.test(jitBridge), false);
});

test("phase 22f server secrets are not documented as VITE variables", () => {
  const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");
  assert.equal(/VITE_FIREBASE_PRIVATE_KEY/.test(envExample), false);
  assert.equal(/VITE_FIREBASE_CLIENT_EMAIL/.test(envExample), false);
});

test("phase 22f.1 preflight validates server env names without exposing values", () => {
  const result = validateJitServerEnv({
    FIREBASE_PROJECT_ID: "nekaba2026",
    FIREBASE_CLIENT_EMAIL: "service@example.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
    JIT_AUTH_ALLOWED_ORIGINS: "https://mynekaba.vercel.app",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.equal(result.required.includes("FIREBASE_PRIVATE_KEY"), true);
});

test("phase 22f.1 private key escaped newlines are normalized", () => {
  assert.equal(normalizePrivateKey("a\\nb").includes("\n"), true);
});

test("phase 22f.1 preflight rejects wildcard origins", () => {
  const result = validateJitServerEnv({
    FIREBASE_PROJECT_ID: "nekaba2026",
    FIREBASE_CLIENT_EMAIL: "service@example.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
    JIT_AUTH_ALLOWED_ORIGINS: "*",
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.includes("wildcard_origin_not_allowed"), true);
});
