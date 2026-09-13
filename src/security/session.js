export const SESSION_STORAGE_KEY = "nekaba_secure_session_v2";
export const LOGIN_ATTEMPTS_STORAGE_KEY = "nekaba_login_attempts_v2";
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCK_MINUTES = 15;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

/**
 * SHA-256 fallback written in plain JavaScript.
 * It is used only when Web Crypto's SubtleCrypto is unavailable (for example
 * on some mobile browsers when a Vite dev server is opened through http://192.168.x.x).
 *
 * Keeping SHA-256 here is intentional so hashes remain compatible with
 * passwords/sessions that were created previously by crypto.subtle.digest().
 */
function sha256Fallback(value = "") {
  const text = String(value);
  const bytes = new TextEncoder().encode(text);
  const bitLength = bytes.length * 8;

  const withOne = bytes.length + 1;
  const zeroPadding = (64 - ((withOne + 8) % 64)) % 64;
  const totalLength = withOne + zeroPadding + 8;
  const message = new Uint8Array(totalLength);
  message.set(bytes);
  message[bytes.length] = 0x80;

  const view = new DataView(message.buffer);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  view.setUint32(totalLength - 8, high, false);
  view.setUint32(totalLength - 4, low, false);

  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }

    for (let i = 16; i < 64; i += 1) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[i] + w[i]) >>> 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
}

export async function hashValue(value = "") {
  const text = String(value);
  const webCrypto = globalThis.crypto;

  if (webCrypto?.subtle?.digest) {
    try {
      const content = new TextEncoder().encode(text);
      const buffer = await webCrypto.subtle.digest("SHA-256", content);
      return toHex(buffer);
    } catch (error) {
      // Some browsers expose crypto.subtle but reject it in the current context.
      console.warn("Web Crypto digest unavailable; using compatible SHA-256 fallback.", error);
    }
  }

  return sha256Fallback(text);
}

export function randomToken(length = 24) {
  const safeLength = Math.max(1, Math.min(1024, Number(length) || 24));
  const bytes = new Uint8Array(safeLength);
  const webCrypto = globalThis.crypto;

  if (!webCrypto?.getRandomValues) {
    throw new Error(
      "لا يدعم هذا المتصفح إنشاء رموز عشوائية آمنة. استخدم متصفحًا حديثًا أو افتح المنظومة عبر HTTPS."
    );
  }

  webCrypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildDeviceFingerprint() {
  if (typeof window === "undefined") return "server";

  // Sort screen dimensions so rotating a phone does not invalidate its session.
  const dimensions = [window.screen?.width || 0, window.screen?.height || 0]
    .map(Number)
    .sort((a, b) => a - b)
    .join("x");

  let timeZone = "tz";
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "tz";
  } catch {
    // Keep a stable fallback when Intl is unavailable.
  }

  return [
    navigator.userAgent || "ua",
    navigator.language || "lang",
    dimensions,
    timeZone,
  ].join("::");
}

export async function buildSessionIntegrity({ sessionId, userId, token, fingerprint, expiresAt }) {
  return hashValue([sessionId, userId, token, fingerprint, expiresAt].join("::"));
}

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredSession() {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("تعذر قراءة الجلسة المؤمنة:", error);
    try {
      storage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // no-op
    }
    return null;
  }
}

export function writeStoredSession(session) {
  const storage = getStorage();
  if (!storage) throw new Error("التخزين المحلي غير متاح في هذا المتصفح.");
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // no-op
  }
}

export function readLoginAttempts() {
  const storage = getStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(LOGIN_ATTEMPTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    try {
      storage.removeItem(LOGIN_ATTEMPTS_STORAGE_KEY);
    } catch {
      // no-op
    }
    return {};
  }
}

export function writeLoginAttempts(state) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(LOGIN_ATTEMPTS_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("تعذر حفظ محاولات تسجيل الدخول:", error);
  }
}

export function normalizeLoginIdentifier(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function isSessionExpired(expiresAt) {
  const time = new Date(expiresAt).getTime();
  return !expiresAt || !Number.isFinite(time) || time <= Date.now();
}
