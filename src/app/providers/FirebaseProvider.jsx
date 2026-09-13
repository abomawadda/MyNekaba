/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext } from "react";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { resolveFirebaseConfig } from "./firebaseConfig";

const FirebaseContext = createContext(null);

export const firebaseConfigState = resolveFirebaseConfig(import.meta.env, {
  isProduction: import.meta.env.PROD,
});

const app = firebaseConfigState.config ? initializeApp(firebaseConfigState.config) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
export const auth = app ? getAuth(app) : null;

function RuntimeConfigurationError({ missingKeys = [] }) {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4" dir="rtl">
      <section className="w-full max-w-2xl rounded-2xl border border-amber-300/30 bg-white/10 p-6 shadow-2xl">
        <p className="text-xs font-black text-amber-200">خطأ إعدادات التشغيل</p>
        <h1 className="mt-2 text-2xl font-black">إعدادات الاتصال بالخدمة غير مكتملة في بيئة التشغيل.</h1>
        <p className="mt-4 text-sm font-bold leading-8 text-slate-200">
          لم يتم تشغيل التطبيق على إعدادات Firebase احتياطية في الإنتاج. راجع إعدادات Vercel وأضف متغيرات Firebase المطلوبة ثم أعد النشر.
        </p>
        {missingKeys.length > 0 && (
          <div className="mt-5 rounded-xl border border-white/10 bg-slate-900/70 p-4">
            <p className="text-xs font-black text-slate-300">المتغيرات الناقصة</p>
            <ul className="mt-3 grid gap-2 text-left text-xs font-mono text-amber-100" dir="ltr">
              {missingKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}

export function FirebaseProvider({ children }) {
  if (firebaseConfigState.error) {
    return <RuntimeConfigurationError missingKeys={firebaseConfigState.missingKeys} />;
  }

  return (
    <FirebaseContext.Provider value={{ app, db, storage, configState: firebaseConfigState }}>
      {children}
    </FirebaseContext.Provider>
  );
}

export const useFirebase = () => useContext(FirebaseContext);
