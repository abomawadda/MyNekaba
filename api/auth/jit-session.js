/* global process, Buffer */
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  JIT_FIREBASE_LINKED,
  JIT_LEGACY_ONLY,
  JIT_LOGIN_ERROR,
  assertClaimMatchesAccount,
  buildMinimalAccountMetadata,
  classifyJitAccount,
  findAccountByIdentifier,
  normalizePrivateKey,
  verifyLegacyPassword,
} from "../_lib/jitAuthCore.js";

const ACCOUNTS_COLLECTION = "user_accounts";
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const attempts = new Map();

function getProjectId() {
  return process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "";
}

function getCredential() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  const projectId = getProjectId();

  if (clientEmail && privateKey && projectId) {
    return cert({ projectId, clientEmail, privateKey });
  }

  return applicationDefault();
}

function getAdminContext() {
  const projectId = getProjectId();
  if (!projectId) throw new Error("missing_project_id");

  const app =
    getApps()[0] ||
    initializeApp({
      credential: getCredential(),
      projectId,
    });

  return {
    projectId,
    auth: getAuth(app),
    db: getFirestore(app),
  };
}

function getAllowedOrigins(req) {
  const configured = String(process.env.JIT_AUTH_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const host = req.headers.host ? `https://${req.headers.host}` : "";
  return new Set([...configured, host].filter(Boolean));
}

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowedOrigins = getAllowedOrigins(req);
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function clientKey(req, identifier = "") {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return `${forwarded || req.socket?.remoteAddress || "unknown"}:${String(identifier).toLowerCase()}`;
}

function isRateLimited(req, identifier = "") {
  const key = clientKey(req, identifier);
  const now = Date.now();
  const current = attempts.get(key) || { count: 0, firstAt: now };
  const fresh = now - current.firstAt > RATE_LIMIT_WINDOW_MS ? { count: 0, firstAt: now } : current;
  fresh.count += 1;
  attempts.set(key, fresh);
  return fresh.count > RATE_LIMIT_MAX_ATTEMPTS;
}

function clearRateLimit(req, identifier = "") {
  attempts.delete(clientKey(req, identifier));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function readAccounts(db) {
  const snapshot = await db.collection(ACCOUNTS_COLLECTION).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function ensureLinkedAuthState(auth, account) {
  const authUser = await auth.getUser(account.firebaseUid);
  if (authUser.disabled) throw new Error("auth_user_disabled");

  if (!assertClaimMatchesAccount(authUser, account)) {
    await auth.setCustomUserClaims(authUser.uid, {
      ...(authUser.customClaims || {}),
      accountId: account.id,
    });
  }

  const verified = await auth.getUser(authUser.uid);
  if (!assertClaimMatchesAccount(verified, account)) {
    throw new Error("claim_verification_failed");
  }

  return verified;
}

function sendInvalid(res, status = 401) {
  return res.status(status).json({ success: false, error: JIT_LOGIN_ERROR });
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: JIT_LOGIN_ERROR });
  }

  let identifier = "";
  try {
    const body = await readJsonBody(req);
    identifier = String(body.identifier || "").trim();
    const password = String(body.password || "");

    if (!identifier || !password || isRateLimited(req, identifier)) {
      return sendInvalid(res);
    }

    const { auth, db } = getAdminContext();
    const accounts = await readAccounts(db);
    const { account, ambiguous } = findAccountByIdentifier(accounts, identifier);
    if (ambiguous || !account) return sendInvalid(res);

    const accountState = classifyJitAccount(account);
    if (accountState === "inactive" || accountState === "missing-legacy-credential") {
      return sendInvalid(res);
    }

    if (!verifyLegacyPassword({
      password,
      passwordSalt: account.passwordSalt,
      passwordHash: account.passwordHash,
    })) {
      return sendInvalid(res);
    }

    clearRateLimit(req, identifier);

    if (accountState === JIT_LEGACY_ONLY) {
      return res.status(200).json({
        success: true,
        firebaseSession: JIT_LEGACY_ONLY,
        account: buildMinimalAccountMetadata(account),
      });
    }

    if (accountState !== JIT_FIREBASE_LINKED) {
      return sendInvalid(res);
    }

    const authUser = await ensureLinkedAuthState(auth, account);
    const customToken = await auth.createCustomToken(authUser.uid, { accountId: account.id });

    return res.status(200).json({
      success: true,
      firebaseSession: JIT_FIREBASE_LINKED,
      customToken,
      account: buildMinimalAccountMetadata(account),
    });
  } catch (error) {
    console.error("jit_session_failed", {
      reason: error?.message || "unknown",
      identifierPresent: Boolean(identifier),
    });
    return sendInvalid(res);
  }
}
