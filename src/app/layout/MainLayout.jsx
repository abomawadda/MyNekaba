import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import HeaderAuth from "./HeaderAuth";
import { Alert } from "../../ui/enterprise";
import { useAuth } from "../providers/AuthProvider";
import { useT } from "../providers/ThemeProvider";

const COLLAPSE_KEY = "nekaba_shell_sidebar_collapsed";

function readCollapsedPreference() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COLLAPSE_KEY) === "true";
}

export default function MainLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readCollapsedPreference);
  const location = useLocation();
  const { isReadOnly, sessionIntegrity } = useAuth();
  const T = useT();

  useEffect(() => {
    const closeTimer = window.setTimeout(() => {
      setIsMobileMenuOpen(false);
    }, 0);

    return () => window.clearTimeout(closeTimer);
  }, [location.pathname]);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <div className={`flex h-screen w-full overflow-hidden ${T.page}`} dir="rtl">
      {isMobileMenuOpen && (
        <button
          type="button"
          aria-label="إغلاق القائمة"
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <Sidebar
        isOpen={isMobileMenuOpen}
        setIsOpen={setIsMobileMenuOpen}
        collapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)}
      />

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <HeaderAuth toggleSidebar={() => setIsMobileMenuOpen(true)} />

        <main
          className="relative flex-1 overflow-y-auto overflow-x-hidden bg-slate-50/80 p-3 sm:p-4 lg:p-6 dark:bg-slate-950 print:overflow-visible print:bg-white print:p-0"
          data-readonly={isReadOnly ? "true" : "false"}
        >
          <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-4 print:max-w-none print:gap-0">
            {sessionIntegrity.reason && !sessionIntegrity.valid && (
              <Alert
                tone="warning"
                title="تم إنهاء الجلسة السابقة"
                description={`السبب: ${sessionIntegrity.reason}`}
                className="print:hidden"
              />
            )}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
