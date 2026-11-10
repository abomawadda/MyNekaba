import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./AuthProvider";
import { callAccounts, loginIdentifierToEmail, supabase } from "../../lib/backend";
import { PERMISSIONS, getRolePermissions, hasPermission } from "../../security/permissions";

const ROLE_TITLES = {
  admin: "مدير النظام",
  treasurer: "أمين الصندوق",
  dataEntry: "مدخل بيانات",
  auditor: "مراجع مالي",
  viewer: "مشاهد",
  member: "عضو",
};

/** Shapes the `my_account()` row into the user object the rest of the app already consumes. */
function buildUser(account) {
  if (!account) return null;
  const overrides = account.permission_overrides;
  return {
    id: account.id,
    accountId: account.id,
    role: account.role,
    accountStatus: account.account_status,
    username: account.username || "",
    displayName: account.display_name || account.member?.name || account.username || "",
    title: account.title || ROLE_TITLES[account.role] || "",
    phone: account.phone || "",
    email: account.email || "",
    memberId: account.member_id || "",
    member: account.member || null,
    employeeId: account.member_id || "",
    employeeCode: account.member?.job_id || "",
    mustChangePassword: Boolean(account.must_change_password),
    permissionOverrides: Array.isArray(overrides) ? overrides : [],
    loginMode: "password",
  };
}

function translateAuthError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (/invalid login credentials|invalid_credentials/.test(message)) return "الكود أو كلمة المرور غير صحيحة.";
  if (/banned|suspended/.test(message)) return "الحساب موقوف. تواصل مع إدارة النقابة.";
  if (/rate limit|too many/.test(message)) return "محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.";
  if (/fetch|network/.test(message)) return "network: تعذر الاتصال بالخادم.";
  return "تعذر تسجيل الدخول. حاول مرة أخرى.";
}

export function SupabaseAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAccount = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_account");
    if (error || !data) return null;
    return buildUser(data);
  }, []);

  useEffect(() => {
    let active = true;
    const sync = async (session) => {
      if (!session) {
        if (active) {
          setUser(null);
          setLoading(false);
        }
        return;
      }
      const next = await loadAccount();
      if (!active) return;
      // Only active accounts get an app session; the database enforces the same rule via RLS.
      setUser(next && next.accountStatus === "active" ? next : null);
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => sync(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") sync(null);
      // Deferred: Supabase forbids awaiting other client calls inside this callback.
      else if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") setTimeout(() => sync(session), 0);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadAccount]);

  const loginWithPassword = useCallback(
    async ({ identifier, password }) => {
      const email = loginIdentifierToEmail(identifier);
      if (!email || !password) throw new Error("أدخل الكود الوظيفي أو اسم المستخدم وكلمة المرور.");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(translateAuthError(error));
      const next = await loadAccount();
      if (!next || next.accountStatus !== "active") {
        await supabase.auth.signOut();
        if (next?.accountStatus === "pending_approval") {
          throw new Error("الحساب قيد المراجعة. سيتم تفعيله بواسطة الإدارة.");
        }
        throw new Error("الحساب غير مفعل أو موقوف حالياً.");
      }
      setUser(next);
      return next;
    },
    [loadAccount]
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const changePassword = useCallback(
    async ({ currentPassword, password }) => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email;
      if (!email) throw new Error("انتهت الجلسة. سجل الدخول مرة أخرى.");
      // Re-authenticate so a stolen open session cannot change the password.
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (verifyError) throw new Error("كلمة المرور الحالية غير صحيحة.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        throw new Error(/different from the old/i.test(error.message) ? "اختر كلمة مرور مختلفة عن الحالية." : "تعذر تغيير كلمة المرور.");
      }
      await supabase.rpc("ack_password_changed");
      setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : prev));
    },
    []
  );

  const requestPasswordReset = useCallback((payload) => callAccounts("recover", payload), []);

  const can = useCallback((permission) => Boolean(user) && hasPermission(user, permission), [user]);

  const value = useMemo(() => {
    const permissions = user
      ? Array.from(new Set([...getRolePermissions(user.role), ...user.permissionOverrides]))
      : [];
    return {
      user,
      session: null,
      loading,
      sessionIntegrity: { valid: true, hasOtherActiveSessions: false },
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === "admin",
      isReadOnly: Boolean(user) && !can(PERMISSIONS.employeesEdit) && !can(PERMISSIONS.treasuryCreate),
      userRole: user?.role || "viewer",
      permissions,
      can,
      loginWithPassword,
      loginAdmin: loginWithPassword,
      changePassword,
      requestPasswordReset,
      logout,
    };
  }, [user, loading, can, loginWithPassword, changePassword, requestPasswordReset, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
