export const REQUIRED_FIREBASE_ENV = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const CONFIG_KEYS = {
  VITE_FIREBASE_API_KEY: "apiKey",
  VITE_FIREBASE_AUTH_DOMAIN: "authDomain",
  VITE_FIREBASE_PROJECT_ID: "projectId",
  VITE_FIREBASE_STORAGE_BUCKET: "storageBucket",
  VITE_FIREBASE_SENDER_ID: "messagingSenderId",
  VITE_FIREBASE_APP_ID: "appId",
};

export const DEV_FALLBACK_CONFIG = {
  apiKey: "AIzaSyDZjHYgoQRSto9-Sb1nEVeWkDgD0G4NWTw",
  authDomain: "nekaba2026.firebaseapp.com",
  projectId: "nekaba2026",
  storageBucket: "nekaba2026.firebasestorage.app",
  messagingSenderId: "605500549585",
  appId: "1:605500549585:web:307bd9ca2fb21f96f218f0",
};

export function resolveFirebaseConfig(env = {}, { isProduction = false } = {}) {
  const missingKeys = REQUIRED_FIREBASE_ENV.filter((key) => !env[key]);
  const envConfig = Object.fromEntries(
    REQUIRED_FIREBASE_ENV
      .filter((key) => env[key])
      .map((key) => [CONFIG_KEYS[key], env[key]])
  );

  if (missingKeys.length === 0) {
    return {
      config: envConfig,
      missingKeys: [],
      usesDevelopmentFallback: false,
      error: null,
    };
  }

  if (isProduction) {
    return {
      config: null,
      missingKeys,
      usesDevelopmentFallback: false,
      error: "missing-production-firebase-config",
    };
  }

  return {
    config: { ...DEV_FALLBACK_CONFIG, ...envConfig },
    missingKeys,
    usesDevelopmentFallback: true,
    error: null,
  };
}
