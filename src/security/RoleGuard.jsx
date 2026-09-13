import React from "react";
import { useAuth } from "../app/providers/AuthProvider";
import AccessDenied from "./AccessDenied";

export default function RoleGuard({ permission, fallback = null, children }) {
  const { can } = useAuth();
  if (can(permission)) return children;
  return fallback ?? <AccessDenied message="تم إخفاء هذا الجزء لأن دورك الحالي لا يسمح بتنفيذ هذا الإجراء." />;
}
