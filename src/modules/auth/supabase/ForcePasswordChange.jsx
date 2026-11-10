import React from "react";
import { useAuth } from "../../../app/providers/AuthProvider";
import { ChangePasswordCard } from "../ResetPasswordPage";
import { AuthShell, Notice } from "./AuthShell";

/** Blocks the app until a user holding a temporary password sets their own. */
export default function ForcePasswordChange({ children }) {
  const { user, logout } = useAuth();
  if (!user?.mustChangePassword) return children;
  return (
    <AuthShell
      eyebrow="خطوة أمان مطلوبة"
      title="عيّن كلمة مرور جديدة"
      subtitle="دخلت بكلمة مرور مؤقتة من الإدارة. اختر كلمة مرور خاصة بك للمتابعة."
      footer={<button onClick={() => logout()} className="font-black text-slate-500 hover:underline">تسجيل الخروج</button>}
    >
      <div className="mb-4"><Notice tone="brand">أدخل كلمة المرور المؤقتة في خانة «كلمة المرور الحالية».</Notice></div>
      <ChangePasswordCard />
    </AuthShell>
  );
}
