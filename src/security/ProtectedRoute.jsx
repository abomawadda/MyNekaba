import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../app/providers/AuthProvider";
import AccessDenied from "./AccessDenied";

function LoaderMessage() {
  return (
    <div className="p-20 flex items-center justify-center min-h-screen text-slate-400 font-black" dir="rtl">
      جارٍ التحقق من الجلسة الآمنة...
    </div>
  );
}

export default function ProtectedRoute({ children, permission, allowPublic = false }) {
  const location = useLocation();
  const { isAuthenticated, loading, can } = useAuth();

  if (loading) return <LoaderMessage />;
  if (!isAuthenticated && !allowPublic) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  const requiredPermissions = Array.isArray(permission) ? permission : [permission].filter(Boolean);
  if (requiredPermissions.some((requiredPermission) => !can(requiredPermission))) {
    return <AccessDenied />;
  }
  return children;
}
