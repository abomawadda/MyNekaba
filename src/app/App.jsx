import React from "react";
import { BrowserRouter } from "react-router-dom";
import Router from "./router";
import SupabaseRouter from "./SupabaseRouter";
import { ThemeProvider } from "./providers/ThemeProvider";
import { FirebaseProvider } from "./providers/FirebaseProvider";
import { AlertProvider } from "./providers/AlertProvider";
import { AuthProvider } from "./providers/AuthProvider";
import { SupabaseAuthProvider } from "./providers/SupabaseAuthProvider";
import ArabicTextRepairProvider from "./providers/ArabicTextRepairProvider";
import { GlobalEmployeeModalProvider } from "./providers/GlobalEmployeeModal";
import { USE_SUPABASE, supabaseConfigError } from "../lib/backend";

function SupabaseApp() {
  if (supabaseConfigError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white" dir="rtl">
        <p className="rounded-2xl border border-amber-300/30 bg-white/10 p-6 text-sm font-bold">إعدادات Supabase غير مكتملة: {supabaseConfigError}</p>
      </main>
    );
  }
  return (
    <ThemeProvider>
      <SupabaseAuthProvider>
        <BrowserRouter>
          <SupabaseRouter />
        </BrowserRouter>
      </SupabaseAuthProvider>
    </ThemeProvider>
  );
}

export default function App() {
  if (USE_SUPABASE) return <SupabaseApp />;
  return (
    <ThemeProvider>
      <FirebaseProvider>
        <AlertProvider>
          <AuthProvider>
            <BrowserRouter>
              <ArabicTextRepairProvider>
                <GlobalEmployeeModalProvider>
                  <Router />
                </GlobalEmployeeModalProvider>
              </ArabicTextRepairProvider>
            </BrowserRouter>
          </AuthProvider>
        </AlertProvider>
      </FirebaseProvider>
    </ThemeProvider>
  );
}
