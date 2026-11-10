import React from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./providers/AuthProvider";
import LoginPage from "../modules/auth/LoginPage";
import SupabaseRegistrationPage from "../modules/auth/supabase/RegistrationPage";
import SupabaseRecoveryPage from "../modules/auth/supabase/RecoveryPage";
import ForcePasswordChange from "../modules/auth/supabase/ForcePasswordChange";
import PublicHome from "../modules/portal/PublicHome";
import MemberPortal from "../modules/portal/MemberPortal";
import AccountsAdminPage from "../modules/accounts/AccountsAdminPage";

function Loading() {
  return <div className="flex min-h-screen items-center justify-center font-black text-slate-400" dir="rtl">جارٍ التحميل...</div>;
}

const homeFor = (user) => (user?.role === "member" ? "/portal" : user?.role === "admin" ? "/accounts" : "/workspace");

function PublicOnly({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <Loading />;
  return isAuthenticated ? <Navigate to={homeFor(user)} replace /> : children;
}

function Private({ roles, children }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <Loading />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return <ForcePasswordChange>{children}</ForcePasswordChange>;
}

/** Placeholder for staff modules that have not been migrated to Supabase yet. */
function Workspace() {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4" dir="rtl">
      <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-[11px] font-black text-brand-600">مرحباً {user?.displayName}</p>
        <h1 className="mt-2 text-xl font-black">وحدات العمل قيد الترحيل</h1>
        <p className="mt-3 text-xs font-semibold leading-6 text-slate-500">
          هذه نسخة تجريبية على المنظومة الجديدة. المتاح الآن: الموقع العام، حسابات الأعضاء وبوابة العضو، ومركز الحسابات للمدير. بقية الوحدات تُضاف تباعاً.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/" className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black">الموقع العام</Link>
          <button onClick={() => logout()} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white">خروج</button>
        </div>
      </div>
    </div>
  );
}

function Root() {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <Loading />;
  return isAuthenticated ? <Navigate to={homeFor(user)} replace /> : <PublicHome />;
}

/** Routes available when VITE_BACKEND=supabase (migrated modules only). */
export default function SupabaseRouter() {
  return (
    <Routes>
      <Route path="/" element={<Root />} />
      <Route path="/site" element={<PublicHome />} />
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><SupabaseRegistrationPage /></PublicOnly>} />
      <Route path="/reset-password" element={<PublicOnly><SupabaseRecoveryPage /></PublicOnly>} />
      <Route path="/portal" element={<Private roles={["member"]}><MemberPortal /></Private>} />
      <Route path="/accounts" element={<Private roles={["admin"]}><AccountsAdminPage /></Private>} />
      <Route path="/workspace" element={<Private><Workspace /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
