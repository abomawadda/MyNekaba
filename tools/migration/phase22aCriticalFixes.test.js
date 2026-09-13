import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFirebaseConfig, REQUIRED_FIREBASE_ENV } from "../../src/app/providers/firebaseConfig.js";
import { buildMemberPortalIdentity } from "../../src/modules/portal/memberPortalIdentity.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDir = path.join(rootDir, "src");
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const allowedMojibakeUtility = path.normalize("src/utils/arabicMojibake.js");

const decoder1256 = new TextDecoder("windows-1256");
const decoderUtf8 = new TextDecoder("utf-8", { fatal: true });
const charTo1256Byte = new Map();

for (let i = 0; i < 256; i += 1) {
  const ch = decoder1256.decode(Uint8Array.from([i]));
  if (!charTo1256Byte.has(ch)) charTo1256Byte.set(ch, i);
}

function mojibakeScore(text = "") {
  return (
    text.match(
      /(?:\u0637[\u00a1-\u00ff\u060c\u061b\u061f]|\u0638[\u0080-\u00ff\u060c\u061b\u061f\u0679-\u06d2]|\u00e2[\u0080-\u00ff]|\u00c2[\u0080-\u00ff]|\u0622[\u00b7\u00ab\u00bb]|\u063a[\u00b0-\u00b9])/g
    ) || []
  ).length;
}

function decodeMojibakeCandidate(text = "") {
  const bytes = [];
  for (const ch of text) {
    const byteValue = charTo1256Byte.get(ch);
    if (byteValue === undefined) return null;
    bytes.push(byteValue);
  }

  try {
    return decoderUtf8.decode(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}

function walkFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

test("source files do not contain recoverable Arabic mojibake", () => {
  const findings = [];

  for (const fullPath of walkFiles(sourceDir)) {
    const relativePath = path.relative(rootDir, fullPath);
    if (path.normalize(relativePath) === allowedMojibakeUtility) continue;

    const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const score = mojibakeScore(line);
      if (score === 0) return;

      const decoded = decodeMojibakeCandidate(line);
      if (!decoded || decoded === line || !/[\u0600-\u06ff]/.test(decoded)) return;
      if (mojibakeScore(decoded) < score) findings.push(`${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(findings, []);
});

test("production Firebase config never falls back silently when env is incomplete", () => {
  const state = resolveFirebaseConfig(
    {
      VITE_FIREBASE_API_KEY: "api",
      VITE_FIREBASE_PROJECT_ID: "project",
    },
    { isProduction: true }
  );

  assert.equal(state.config, null);
  assert.equal(state.error, "missing-production-firebase-config");
  assert.equal(state.usesDevelopmentFallback, false);
  assert.ok(state.missingKeys.includes("VITE_FIREBASE_AUTH_DOMAIN"));
});

test("development Firebase config may use the explicit development fallback", () => {
  const state = resolveFirebaseConfig({}, { isProduction: false });

  assert.equal(state.error, null);
  assert.equal(state.usesDevelopmentFallback, true);
  assert.equal(state.missingKeys.length, REQUIRED_FIREBASE_ENV.length);
  assert.equal(state.config.projectId, "nekaba2026");
});

test("complete Firebase env wins over development fallback", () => {
  const env = Object.fromEntries(REQUIRED_FIREBASE_ENV.map((key) => [key, `${key}-value`]));
  const state = resolveFirebaseConfig(env, { isProduction: true });

  assert.equal(state.error, null);
  assert.equal(state.usesDevelopmentFallback, false);
  assert.equal(state.config.projectId, "VITE_FIREBASE_PROJECT_ID-value");
});

test("member portal identity prefers employee document id and scoped member ids", () => {
  const identity = buildMemberPortalIdentity(
    {
      id: "account-1",
      employeeId: "employee-doc-7",
      employeeCode: "7788",
      phone: "01000000000",
    },
    {
      id: "employee-doc-7",
      jobId: "7788",
      phone: "01000000000",
    }
  );

  assert.equal(identity.employeeDocId, "employee-doc-7");
  assert.equal(identity.jobCode, "7788");
  assert.deepEqual(identity.memberIdKeys, ["7788", "employee-doc-7"]);
  assert.ok(identity.employeeLookupKeys.includes("employee-doc-7"));
});
