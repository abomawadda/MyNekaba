/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext } from "react";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const FirebaseContext = createContext(null);

const ENV_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const DEV_FALLBACK_CONFIG = {
  apiKey: "AIzaSyDZjHYgoQRSto9-Sb1nEVeWkDgD0G4NWTw",
  authDomain: "nekaba2026.firebaseapp.com",
  projectId: "nekaba2026",
  storageBucket: "nekaba2026.firebasestorage.app",
  messagingSenderId: "605500549585",
  appId: "1:605500549585:web:307bd9ca2fb21f96f218f0",
};

function getFirebaseConfig() {
  const requiredKeys = Object.keys(ENV_CONFIG);
  const missingKeys = requiredKeys.filter((key) => !ENV_CONFIG[key]);

  if (import.meta.env.PROD && missingKeys.length > 0) {
    throw new Error(
      `Missing Firebase environment configuration: ${missingKeys
        .map((key) => `VITE_FIREBASE_${key === "messagingSenderId" ? "SENDER_ID" : key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`)
        .join(", ")}`
    );
  }

  return missingKeys.length > 0
    ? { ...DEV_FALLBACK_CONFIG, ...Object.fromEntries(Object.entries(ENV_CONFIG).filter(([, value]) => value)) }
    : ENV_CONFIG;
}

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

export function FirebaseProvider({ children }) {
  return (
    <FirebaseContext.Provider value={{ app, db, storage }}>
      {children}
    </FirebaseContext.Provider>
  );
}

// أداة الاستدعاء
export const useFirebase = () => useContext(FirebaseContext);
