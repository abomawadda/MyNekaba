/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./FirebaseProvider";
import { logAuditEvent } from "../../utils/auditLog";
import {
  PERMISSIONS,
  canAccessRoute,
  getRolePermissions,
  hasPermission,
  normalizeRole,
} from "../../security/permissions";
import { validatePasswordPolicy } from "../../security/passwordPolicy";
import {
  FIREBASE_AUTH_REASON,
  firebaseSendPasswordResetEmail,
  firebaseSignIn,
  firebaseSignOut,
  firebaseSignUp,
  isConfirmedInvalidCredentialError,
} from "../../security/firebaseAuth";
import { establishJitFirebaseSession, JIT_SESSION_STATE } from "../../security/jitSessionBridge";
import {
  getAccountIdentityMigrationState,
  getAuthModeForAccount,
  getCurrentFirebaseUid,
  IDENTITY_MIGRATION_STATE,
} from "../../security/identityMapping";
import {
  changeAccountPassword,
} from "../../security/memberAccountService";
import {
  SESSION_DURATION_MS,
  MAX_LOGIN_ATTEMPTS,
  LOGIN_LOCK_MINUTES,
  buildDeviceFingerprint,
  buildSessionIntegrity,
  clearStoredSession,
  hashValue,
  isSessionExpired,
  normalizeLoginIdentifier,
  randomToken,
  readLoginAttempts,
  readStoredSession,
  writeLoginAttempts,
  writeStoredSession,
} from "../../security/session";

const ACCOUNTS_COLLECTION = "user_accounts";
const SESSIONS_COLLECTION = "auth_sessions";
const ACCOUNT_STATUS_PENDING = "pending_approval";
const LEGACY_FIREBASE_EMAIL_FALLBACK_ENABLED = false;

const FALLBACK_ADMIN = {
  id: "system-admin",
  username: "mahmoud.eleraky",
  passwordSalt: import.meta.env.VITE_LEGACY_FALLBACK_ADMIN_SALT || "",
  passwordHash: import.meta.env.VITE_LEGACY_FALLBACK_ADMIN_HASH || "",
  fullName: "محمود العراقي",
  role: "admin",
  title: "مدير النظام",
  membershipStatus: "إدارة النظام",
  accountStatus: "active",
};

const LEGACY_FALLBACK_ADMIN_ENABLED =
  import.meta.env.DEV &&
  import.meta.env.VITE_ENABLE_LEGACY_FALLBACK_ADMIN === "true" &&
  Boolean(FALLBACK_ADMIN.passwordSalt && FALLBACK_ADMIN.passwordHash);

const getRoleTitle = (role = "viewer") => {
  switch (normalizeRole(role)) {
    case "treasurer":
      return "أمين الصندوق";
    case "admin":
      return "مدير النظام";
    case "auditor":
      return "مراجع مالي";
    case "dataEntry":
      return "مدخل بيانات";
    case "member":
      return "عضو";
    default:
      return "مشاهد";
  }
};

const AuthContext = createContext(null);

const normalizeDigits = (value = "") =>
  String(value)
    .replace(/[\u0660-\u0669]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    .replace(/\D/g, "");

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function buildPasswordHash(password, salt) {
  return hashValue(`${salt}::${password}`);
}

function getAttemptState(identifier) {
  const state = readLoginAttempts();
  const key = normalizeLoginIdentifier(identifier);
  const current = state[key];
  const lockedUntil = current?.lockedUntil || "";
  const isLocked = lockedUntil && new Date(lockedUntil).getTime() > Date.now();

  return {
    key,
    state,
    current: isLocked ? current : { count: current?.count || 0, lockedUntil: "" },
    isLocked,
  };
}

function recordFailedAttempt(identifier) {
  const { key, state, current } = getAttemptState(identifier);
  const count = Number(current?.count || 0) + 1;
  const lockedUntil =
    count >= MAX_LOGIN_ATTEMPTS
      ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000).toISOString()
      : "";

  const nextState = {
    ...state,
    [key]: { count, lockedUntil },
  };
  writeLoginAttempts(nextState);

  return { count, lockedUntil };
}

function clearFailedAttempts(identifier) {
  const { key, state } = getAttemptState(identifier);
  if (!state[key]) return;
  const nextState = { ...state };
  delete nextState[key];
  writeLoginAttempts(nextState);
}

function buildUserFromAccount(account = {}) {
  const role = normalizeRole(account.role);
  const currentFirebaseUid = getCurrentFirebaseUid();
  const identityMigrationState = getAccountIdentityMigrationState(account, currentFirebaseUid);
  return {
    id: account.id,
    accountId: account.id,
    employeeId: account.employeeId || "",
    employeeCode: account.employeeCode || account.jobId || "",
    fullName: account.fullName || account.displayName || "مستخدم النظام",
    displayName: account.fullName || account.displayName || "مستخدم النظام",
    phone: account.phone || "",
    email: account.email || "",
    role,
    title: account.title || "",
    membershipStatus: account.membershipStatus || account.title || "",
    profileImage: account.profileImage || "",
    accountStatus: account.accountStatus || "active",
    loginMode: "password",
    firebaseUid: account.firebaseUid || "",
    firebaseLinked: Boolean(account.firebaseUid),
    authMode: getAuthModeForAccount(account, currentFirebaseUid),
    identityMigrationState,
    permissionOverrides: Array.isArray(account.permissionOverrides)
      ? account.permissionOverrides
      : [],
  };
}

function buildQuickEmployeeUser(employee = {}) {
  return {
    id: employee.id,
    employeeId: employee.jobId || employee.id,
    employeeCode: employee.jobId || employee.employeeCode || "",
    fullName: employee.name || "عضو",
    displayName: employee.name || "عضو",
    phone: employee.phone || "",
    email: employee.email || "",
    role: "viewer",
    title: employee.membershipStatus || "عضو",
    membershipStatus: employee.membershipStatus || "عضو جمعية عمومية",
    profileImage: employee.photo || "",
    accountStatus: "active",
    loginMode: "employee_quick",
    authMode: "legacy",
    identityMigrationState: IDENTITY_MIGRATION_STATE.unlinked,
    permissionOverrides: [],
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionIntegrity, setSessionIntegrity] = useState({
    valid: true,
    hasOtherActiveSessions: false,
    reason: "",
  });
  const heartbeatRef = useRef(null);

  const fetchAccounts = useCallback(async () => {
    const snapshot = await getDocs(collection(db, ACCOUNTS_COLLECTION));
    return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  }, []);

  const getAccountByIdentifier = useCallback(
    async (identifier) => {
      const normalized = normalizeLoginIdentifier(identifier);
      if (!normalized) return null;

      const accounts = await fetchAccounts();
      return (
        accounts.find((account) =>
          [account.username, account.email, account.phone]
            .filter(Boolean)
            .map((value) => normalizeLoginIdentifier(value))
            .includes(normalized)
        ) || null
      );
    },
    [fetchAccounts]
  );

  const persistAuthenticatedUser = useCallback(
    async (nextUser, options = {}) => {
      const sessionId = options.sessionId || `sess_${randomToken(12)}`;
      const token = options.token || randomToken(24);
      const fingerprint = buildDeviceFingerprint();
      const expiresAt =
        options.expiresAt || new Date(Date.now() + SESSION_DURATION_MS).toISOString();
      const tokenHash = await hashValue(token);
      const integrityHash = await buildSessionIntegrity({
        sessionId,
        userId: nextUser.id,
        token,
        fingerprint,
        expiresAt,
      });

      const sessionPayload = {
        sessionId,
        userId: nextUser.id,
        role: nextUser.role,
        tokenHash,
        fingerprint,
        status: "active",
        loginMode: nextUser.loginMode,
        authMode: nextUser.authMode || "legacy",
        createdAt: serverTimestamp(),
        createdAtIso: new Date().toISOString(),
        lastSeenAt: serverTimestamp(),
        lastSeenAtIso: new Date().toISOString(),
        expiresAt,
        userSnapshot: nextUser,
      };

      await setDoc(doc(db, SESSIONS_COLLECTION, sessionId), sessionPayload, { merge: true });

      const localSession = {
        sessionId,
        token,
        fingerprint,
        expiresAt,
        integrityHash,
        loginMode: nextUser.loginMode,
        user: nextUser,
      };

      writeStoredSession(localSession);
      setUser(nextUser);
      setSession(localSession);

      return localSession;
    },
    []
  );

  const syncSessionIntegrity = useCallback(async (nextUser, nextSession) => {
    if (!nextUser?.id || !nextSession?.sessionId) {
      setSessionIntegrity({ valid: true, hasOtherActiveSessions: false, reason: "" });
      return;
    }

    const otherSessionsQuery = query(
      collection(db, SESSIONS_COLLECTION),
      where("userId", "==", nextUser.id),
      where("status", "==", "active"),
      limit(10)
    );

    const snapshot = await getDocs(otherSessionsQuery);
    const hasOtherActiveSessions = snapshot.docs.some(
      (docSnap) => docSnap.id !== nextSession.sessionId
    );

    setSessionIntegrity({
      valid: true,
      hasOtherActiveSessions,
      reason: "",
    });
  }, []);

  const terminateSession = useCallback(async (reason = "logout", allDevices = false) => {
    const currentSession = readStoredSession();
    clearStoredSession();
    setUser(null);
    setSession(null);
    setSessionIntegrity({ valid: true, hasOtherActiveSessions: false, reason });

    try {
      await firebaseSignOut();
    } catch {
      // no-op
    }

    if (!currentSession?.sessionId) return;

    try {
      if (allDevices && currentSession?.user?.id) {
        const activeSessions = await getDocs(
          query(
            collection(db, SESSIONS_COLLECTION),
            where("userId", "==", currentSession.user.id),
            where("status", "==", "active"),
            limit(30)
          )
        );

        await Promise.all(
          activeSessions.docs.map((docSnap) =>
            updateDoc(doc(db, SESSIONS_COLLECTION, docSnap.id), {
              status: "revoked",
              revokedReason: reason,
              revokedAt: serverTimestamp(),
              revokedAtIso: new Date().toISOString(),
            })
          )
        );
      } else {
        await updateDoc(doc(db, SESSIONS_COLLECTION, currentSession.sessionId), {
          status: reason === "logout" ? "logged_out" : "revoked",
          revokedReason: reason,
          revokedAt: serverTimestamp(),
          revokedAtIso: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("تعذر إنهاء الجلسة:", error);
    }
  }, []);

  const restoreSession = useCallback(async () => {
    const savedSession = readStoredSession();

    if (!savedSession) {
      setLoading(false);
      return;
    }

    // 1. التحقق المحلي — إلزامي
    let localValid = true;
    let localError = "";

    if (savedSession.fingerprint !== buildDeviceFingerprint()) {
      localValid = false;
      localError = "تم اكتشاف تغيير في بصمة الجهاز.";
    } else if (isSessionExpired(savedSession.expiresAt)) {
      localValid = false;
      localError = "انتهت صلاحية الجلسة.";
    } else {
      try {
        const expectedIntegrity = await buildSessionIntegrity({
          sessionId: savedSession.sessionId,
          userId: savedSession.user?.id,
          token: savedSession.token,
          fingerprint: savedSession.fingerprint,
          expiresAt: savedSession.expiresAt,
        });
        if (expectedIntegrity !== savedSession.integrityHash) {
          localValid = false;
          localError = "فشل التحقق من سلامة الجلسة.";
        }
      } catch {
        localValid = false;
        localError = "فشل حساب integrity hash.";
      }
    }

    if (!localValid) {
      console.error("الجلسة المحلية غير صالحة:", localError);
      await terminateSession(localError);
      setSessionIntegrity({ valid: false, hasOtherActiveSessions: false, reason: localError });
      setLoading(false);
      return;
    }

    // 2. Server verification is required before restoring privileged UI state.
    let nextUser = null;

    try {
      const sessionDoc = await getDoc(doc(db, SESSIONS_COLLECTION, savedSession.sessionId));
      if (!sessionDoc.exists()) {
        throw new Error("session_not_found");
      }

      const sessionData = sessionDoc.data();
      const tokenHash = await hashValue(savedSession.token);

      if (sessionData.status !== "active") {
        throw new Error("session_not_active");
      }

      if (sessionData.tokenHash !== tokenHash || isSessionExpired(sessionData.expiresAt)) {
        throw new Error("session_verification_failed");
      }

      nextUser = sessionData.userSnapshot || savedSession.user;

      if (savedSession.user?.loginMode === "password" && savedSession.user?.accountId) {
        const accountDoc = await getDoc(doc(db, ACCOUNTS_COLLECTION, savedSession.user.accountId));
        if (!accountDoc.exists()) {
          throw new Error("account_not_found");
        }

        const account = { id: accountDoc.id, ...accountDoc.data() };
        if (account.accountStatus !== "active") {
          throw new Error("account_not_active");
        }
        nextUser = buildUserFromAccount(account);
      }

      if (!nextUser?.id) {
        throw new Error("session_user_missing");
      }
    } catch (error) {
      console.warn("تعذر التحقق من الجلسة في Firestore؛ سيتم إنهاء الجلسة المحلية:", error.message);
      await terminateSession("session_server_verification_failed");
      setSessionIntegrity({
        valid: false,
        hasOtherActiveSessions: false,
        reason: "session_server_verification_failed",
      });
      setLoading(false);
      return;
    }

    const verifiedSession = { ...savedSession, verified: true };
    setUser(nextUser);
    setSession(verifiedSession);
    await syncSessionIntegrity(nextUser, verifiedSession);
    setLoading(false);
  }, [syncSessionIntegrity, terminateSession]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (!session?.sessionId || !user?.id) return undefined;

    heartbeatRef.current = window.setInterval(async () => {
      try {
        const nextExpiry = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
        const nextLocalSession = {
          ...readStoredSession(),
          expiresAt: nextExpiry,
        };

        if (nextLocalSession?.sessionId) {
          nextLocalSession.integrityHash = await buildSessionIntegrity({
            sessionId: nextLocalSession.sessionId,
            userId: user.id,
            token: nextLocalSession.token,
            fingerprint: nextLocalSession.fingerprint,
            expiresAt: nextExpiry,
          });
          writeStoredSession(nextLocalSession);
          setSession(nextLocalSession);
        }

        await updateDoc(doc(db, SESSIONS_COLLECTION, session.sessionId), {
          lastSeenAt: serverTimestamp(),
          lastSeenAtIso: new Date().toISOString(),
          expiresAt: nextExpiry,
        });

        await syncSessionIntegrity(user, nextLocalSession);
      } catch (error) {
        console.error("فشل تحديث نبضة الجلسة:", error);
      }
    }, 1000 * 60 * 5);

    return () => {
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    };
  }, [session, user, syncSessionIntegrity]);

  const loginWithPassword = useCallback(
    async ({ identifier, password }) => {
      const normalizedIdentifier = normalizeLoginIdentifier(identifier);
      const invalidCredentialsMessage = "بيانات الدخول غير صحيحة.";

      if (!normalizedIdentifier || !password) {
        throw new Error("أدخل رقم الهاتف أو البريد الإلكتروني أو اسم المستخدم وكلمة المرور.");
      }

      const attemptState = getAttemptState(normalizedIdentifier);
      if (attemptState.isLocked) {
        throw new Error(
          `تم قفل الحساب مؤقتًا بعد ${MAX_LOGIN_ATTEMPTS} محاولات. حاول مرة أخرى لاحقًا.`
        );
      }

      let account = await getAccountByIdentifier(normalizedIdentifier);

      if (
        !account &&
        LEGACY_FALLBACK_ADMIN_ENABLED &&
        normalizedIdentifier === FALLBACK_ADMIN.username
      ) {
        const fallbackPasswordHash = await buildPasswordHash(password, FALLBACK_ADMIN.passwordSalt);
        if (fallbackPasswordHash !== FALLBACK_ADMIN.passwordHash) {
          const attempt = recordFailedAttempt(normalizedIdentifier);
          await logAuditEvent("auth.login_failed", {
            identifier: normalizedIdentifier,
            failedAttempts: attempt.count,
            riskLevel: attempt.lockedUntil ? "high" : "medium",
          });
          throw new Error(invalidCredentialsMessage);
        }

        clearFailedAttempts(normalizedIdentifier);
        const fallbackUser = buildUserFromAccount(FALLBACK_ADMIN);
        const nextSession = await persistAuthenticatedUser(fallbackUser);
        await logAuditEvent("auth.login_success", {
          loginMode: "fallback_admin",
          userId: fallbackUser.id,
          sessionId: nextSession.sessionId,
          riskLevel: "medium",
        });
        await syncSessionIntegrity(fallbackUser, nextSession);
        return fallbackUser;
      }

      if (!account) {
        const attempt = recordFailedAttempt(normalizedIdentifier);
        await logAuditEvent("auth.login_failed", {
          identifier: normalizedIdentifier,
          failedAttempts: attempt.count,
          riskLevel: attempt.lockedUntil ? "high" : "medium",
        });
        throw new Error(invalidCredentialsMessage);
      }

      if (account.accountStatus && account.accountStatus !== "active") {
        if (account.accountStatus === ACCOUNT_STATUS_PENDING) {
          throw new Error("الحساب قيد المراجعة. سيتم تفعيله بواسطة الإدارة بعد تحديد الصلاحية.");
        }
        throw new Error("الحساب غير مفعل أو موقوف حاليا.");
      }

      const accountAuthMode = getAuthModeForAccount(account, "");
      const isFirebaseNativeAccount =
        accountAuthMode === "firebase-native" || (account.firebaseUid && account.email && !account.passwordSalt);

      if (isFirebaseNativeAccount) {
        try {
          const fb = await firebaseSignIn(account.email, password);
          if (fb.uid !== account.firebaseUid) {
            await logAuditEvent("auth.firebase_uid_mismatch", {
              userId: account.id,
              accountFirebaseUid: account.firebaseUid,
              firebaseUid: fb.uid,
              riskLevel: "high",
            });
            throw new Error(invalidCredentialsMessage);
          }
          if (!fb.emailVerified && !account.emailVerificationOverride) {
            await logAuditEvent("auth.firebase_email_unverified_blocked", {
              userId: account.id,
              riskLevel: "medium",
              page: "/login",
            });
            throw new Error("تم اعتماد حسابك إداريا، ولكن يجب التحقق من البريد الإلكتروني قبل الدخول.");
          }
          clearFailedAttempts(normalizedIdentifier);
          const nextUser = buildUserFromAccount(account);
          const nextSession = await persistAuthenticatedUser(nextUser);
          await logAuditEvent("auth.firebase_native_login", {
            userId: nextUser.id,
            sessionId: nextSession.sessionId,
            page: "/login",
            riskLevel: "low",
          });
          await syncSessionIntegrity(nextUser, nextSession);
          return nextUser;
        } catch (error) {
          if (!isConfirmedInvalidCredentialError(error)) {
            await logAuditEvent("auth.login_denied", {
              identifier: normalizedIdentifier,
              userId: account.id,
              reason: error?.reason || error?.message || "firebase_native_denied",
              riskLevel: "medium",
            });
            throw new Error(error?.message || "تعذر تسجيل الدخول. حاول مرة أخرى.");
          }

          const attempt = recordFailedAttempt(normalizedIdentifier);
          await logAuditEvent("auth.login_failed", {
            identifier: normalizedIdentifier,
            userId: account.id,
            reason: "INVALID_CREDENTIAL",
            failedAttempts: attempt.count,
            riskLevel: attempt.lockedUntil ? "high" : "medium",
          });
          throw new Error(
            attempt.lockedUntil
              ? `تم إيقاف محاولات تسجيل الدخول مؤقتا لمدة ${LOGIN_LOCK_MINUTES} دقيقة.`
              : invalidCredentialsMessage
          );
        }
      }

      if (!account.passwordHash) {
        throw new Error(invalidCredentialsMessage);
      }

      const passwordHash = await buildPasswordHash(password, account.passwordSalt);
      if (passwordHash !== account.passwordHash) {
        const attempt = recordFailedAttempt(normalizedIdentifier);
        await logAuditEvent("auth.login_failed", {
          identifier: normalizedIdentifier,
          userId: account.id,
          failedAttempts: attempt.count,
          riskLevel: attempt.lockedUntil ? "high" : "medium",
        });
        throw new Error(
          attempt.lockedUntil
            ? "تم قفل الحساب مؤقتًا بعد 5 محاولات فاشلة."
            : invalidCredentialsMessage
        );
      }

      if (account.accountStatus && account.accountStatus !== "active") {
        if (account.accountStatus === ACCOUNT_STATUS_PENDING) {
          throw new Error("الحساب قيد المراجعة. سيتم تفعيله بواسطة الأدمن بعد تحديد الصلاحية.");
        }
        throw new Error("الحساب غير مفعل أو موقوف حاليًا.");
      }

      clearFailedAttempts(normalizedIdentifier);

      if (account.firebaseUid) {
        try {
          const fb = await establishJitFirebaseSession({
            identifier: normalizedIdentifier,
            password,
            expectedAccountId: account.id,
            expectedFirebaseUid: account.firebaseUid,
          });
          const migrationState = getAccountIdentityMigrationState(account, fb.uid);
          if (migrationState === IDENTITY_MIGRATION_STATE.mismatch) {
            await logAuditEvent("auth.firebase_uid_mismatch", {
              userId: account.id,
              accountFirebaseUid: account.firebaseUid,
              firebaseUid: fb.uid,
              riskLevel: "high",
            });
          } else if (fb.state === JIT_SESSION_STATE.linked) {
            await logAuditEvent("auth.firebase_jit_session", {
              userId: account.id,
              riskLevel: "low",
              page: "/login",
            });
          }
        } catch (error) {
          await logAuditEvent("auth.firebase_jit_session_failed", {
            userId: account.id,
            riskLevel: "medium",
            reason: error?.message || "jit_session_failed",
          });
        }
      }

      if (LEGACY_FIREBASE_EMAIL_FALLBACK_ENABLED && account.firebaseUid && account.email) {
        try {
          const fb = await firebaseSignIn(account.email, password);
          const migrationState = getAccountIdentityMigrationState(account, fb.uid);
          if (migrationState === IDENTITY_MIGRATION_STATE.mismatch) {
            await logAuditEvent("auth.firebase_uid_mismatch", {
              userId: account.id,
              accountFirebaseUid: account.firebaseUid,
              firebaseUid: fb.uid,
              riskLevel: "high",
            });
          }
        } catch {
          // Firebase best-effort — user_accounts يظل المرجع الأساسي
        }
      } else if (LEGACY_FIREBASE_EMAIL_FALLBACK_ENABLED && account.email && password) {
        try {
          const fb = await firebaseSignUp(account.email, password);
          const migrationState = getAccountIdentityMigrationState(account, fb.uid);
          if (migrationState !== IDENTITY_MIGRATION_STATE.mismatch) {
            await updateDoc(doc(db, ACCOUNTS_COLLECTION, account.id), { firebaseUid: fb.uid });
            account = { ...account, firebaseUid: fb.uid };
          }
        } catch {
          try {
            const fb = await firebaseSignIn(account.email, password);
            const migrationState = getAccountIdentityMigrationState(account, fb.uid);
            if (migrationState !== IDENTITY_MIGRATION_STATE.mismatch) {
              await updateDoc(doc(db, ACCOUNTS_COLLECTION, account.id), { firebaseUid: fb.uid });
              account = { ...account, firebaseUid: fb.uid };
            }
          } catch {
            // best-effort — يستمر الدخول المحلي
          }
        }
      }

      const nextUser = buildUserFromAccount(account);
      const nextSession = await persistAuthenticatedUser(nextUser);

      await logAuditEvent("auth.login_success", {
        userId: nextUser.id,
        sessionId: nextSession.sessionId,
        page: "/login",
        riskLevel: "low",
      });

      await syncSessionIntegrity(nextUser, nextSession);
      return nextUser;
    },
    [getAccountByIdentifier, persistAuthenticatedUser, syncSessionIntegrity]
  );

  const registerAccount = useCallback(async (payload) => {
    const {
      fullName,
      phone,
      email,
      password,
      confirmPassword,
      profileFile,
    } = payload || {};

    if (!String(fullName || "").trim()) throw new Error("الاسم الكامل مطلوب.");
    if (!normalizeDigits(phone)) throw new Error("رقم الهاتف مطلوب.");
    if (password !== confirmPassword) throw new Error("تأكيد كلمة المرور غير مطابق.");

    const policy = validatePasswordPolicy(password, {
      fullName,
      phone,
      email,
    });
    if (!policy.valid) {
      throw new Error(policy.errors[0]);
    }

    const normalizedPhone = normalizeDigits(phone);
    const normalizedEmail = normalizeLoginIdentifier(email);
    const accounts = await fetchAccounts();

    const duplicate = accounts.find(
      (account) =>
        normalizeDigits(account.phone) === normalizedPhone ||
        (normalizedEmail && normalizeLoginIdentifier(account.email) === normalizedEmail)
    );

    if (duplicate) {
      throw new Error("يوجد حساب مسجل مسبقًا بنفس الهاتف أو البريد الإلكتروني.");
    }

    const accountId = doc(collection(db, ACCOUNTS_COLLECTION)).id;
    const passwordSalt = randomToken(8);
    const passwordHash = await buildPasswordHash(password, passwordSalt);
    const normalizedRole = "viewer";
    const username = `user_${normalizedPhone.slice(-6) || randomToken(3)}`;

    const profileImage =
      profileFile instanceof File ? await readFileAsDataUrl(profileFile) : "";

    const accountPayload = {
      id: accountId,
      fullName: String(fullName).trim(),
      phone: normalizedPhone,
      email: normalizedEmail || "",
      username,
      role: normalizedRole,
      title: "بانتظار التفعيل",
      membershipStatus: "طلب حساب جديد",
      accountStatus: ACCOUNT_STATUS_PENDING,
      passwordSalt,
      passwordHash,
      profileImage,
      termsAccepted: true,
      termsAcceptedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      createdAtIso: new Date().toISOString(),
      permissionOverrides: [],
    };

    await setDoc(doc(db, ACCOUNTS_COLLECTION, accountId), accountPayload);

    if (normalizedEmail && password) {
      try {
        const fb = await firebaseSignUp(normalizedEmail, password);
        await updateDoc(doc(db, ACCOUNTS_COLLECTION, accountId), { firebaseUid: fb.uid });
      } catch {
        // best-effort — يعمل الحساب محلياً لحين تفعيل Firebase
      }
    }

    await logAuditEvent("auth.register_account", {
      userId: accountId,
      role: normalizedRole,
      page: "/register",
      accountStatus: ACCOUNT_STATUS_PENDING,
      riskLevel: "medium",
    });

    return {
      accountId,
      username,
    };
  }, [fetchAccounts]);

  const loginEmployee = useCallback(
    async ({ jobId, phone, nationalIdLast4 }) => {
      const normalizedJobId = normalizeDigits(jobId);
      const normalizedPhone = normalizeDigits(phone);
      const normalizedNationalIdLast4 = normalizeDigits(nationalIdLast4).slice(-4);

      if (!normalizedJobId || !normalizedPhone || normalizedNationalIdLast4.length !== 4) {
        throw new Error("برجاء استكمال بيانات دخول الأعضاء بشكل صحيح.");
      }

      const snapshot = await getDocs(query(collection(db, "employees")));
      const employees = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      const matchedEmployee = employees.find((employee) => {
        const employeeJobId = normalizeDigits(employee.jobId);
        const employeePhone = normalizeDigits(employee.phone);
        const employeeNationalId = normalizeDigits(employee.nationalId);

        return (
          employeeJobId === normalizedJobId &&
          employeePhone === normalizedPhone &&
          employeeNationalId.slice(-4) === normalizedNationalIdLast4
        );
      });

      if (!matchedEmployee) {
        await logAuditEvent("auth.employee_login_failed", {
          employeeId: normalizedJobId,
          phone: normalizedPhone,
          riskLevel: "medium",
        });
        throw new Error("تعذر مطابقة بيانات الدخول مع سجلات الأعضاء.");
      }

      const nextUser = buildQuickEmployeeUser(matchedEmployee);
      const nextSession = await persistAuthenticatedUser(nextUser);

      await logAuditEvent("auth.employee_login_success", {
        userId: nextUser.id,
        sessionId: nextSession.sessionId,
        riskLevel: "low",
      });

      await syncSessionIntegrity(nextUser, nextSession);
      return nextUser;
    },
    [persistAuthenticatedUser, syncSessionIntegrity]
  );

  const changePassword = useCallback(
    async ({ currentPassword, password, confirmPassword }) => {
      if (!user?.id) throw new Error("سجل الدخول أولاً.");
      await changeAccountPassword({
        accountId: user.accountId || user.id,
        currentPassword,
        password,
        confirmPassword,
        userFullName: user.fullName || user.displayName,
      });
      await terminateSession("password_changed", true);
    },
    [terminateSession, user]
  );

  const requestPasswordReset = useCallback(async (payload) => {
    const identifier = normalizeLoginIdentifier(payload?.identifier || payload?.email || "");
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);

    if (!looksLikeEmail) {
      const error = new Error("يرجى إدخال بريد إلكتروني بصيغة صحيحة.");
      error.reason = FIREBASE_AUTH_REASON.invalidEmail;
      throw error;
    }

    try {
      await firebaseSendPasswordResetEmail(identifier);
    } catch (error) {
      try {
        await logAuditEvent("auth.password_reset_requested", {
          identifierHash: await hashValue(identifier),
          delivery: "firebase_email",
          reason: error?.reason || "RESET_DELIVERY_ERROR",
          riskLevel: "medium",
        });
      } catch {
        // Audit availability must not expose account state or replace the safe reset response.
      }
      if (error?.reason !== FIREBASE_AUTH_REASON.invalidCredential) throw error;
      return;
    }

    try {
      await logAuditEvent("auth.password_reset_requested", {
        identifierHash: await hashValue(identifier),
        delivery: "firebase_email",
        riskLevel: "medium",
      });
    } catch {
      // The reset request was already accepted by Firebase.
    }
  }, []);

  const logout = useCallback(
    async (options = {}) => {
      const allDevices = Boolean(options?.allDevices);
      await logAuditEvent("auth.logout", {
        userId: user?.id,
        allDevices,
        riskLevel: allDevices ? "high" : "low",
      });
      await terminateSession(allDevices ? "logout_all_devices" : "logout", allDevices);
    },
    [terminateSession, user]
  );

  const updateAccountAccess = useCallback(async (accountId, updates = {}) => {
    if (!accountId) throw new Error("معرف الحساب مطلوب.");
    if (!hasPermission(user, PERMISSIONS.securityManageAccounts)) {
      throw new Error("لا تملك صلاحية إدارة الحسابات.");
    }

    const nextRole = updates.role ? normalizeRole(updates.role) : undefined;
    const nextTitle = nextRole ? getRoleTitle(nextRole) : undefined;
    const payload = {
      ...(nextRole
        ? {
            role: nextRole,
            title: nextTitle,
            membershipStatus: "حساب نظام",
          }
        : {}),
      ...(updates.accountStatus ? { accountStatus: updates.accountStatus } : {}),
      ...(Array.isArray(updates.permissionOverrides)
        ? { permissionOverrides: updates.permissionOverrides }
        : {}),
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    };

    await updateDoc(doc(db, ACCOUNTS_COLLECTION, accountId), payload);
    await logAuditEvent("security.account_updated", {
      targetId: accountId,
      after: payload,
      riskLevel: nextRole && ["admin", "treasurer"].includes(nextRole) ? "high" : "medium",
      page: "/security",
    });
  }, [user]);

  const revokeUserSessions = useCallback(async (userId) => {
    if (!userId) return;
    const isOwnSessionSet = String(userId) === String(user?.id);
    const canManageSessions = isOwnSessionSet
      ? hasPermission(user, PERMISSIONS.sessionManageOwn)
      : hasPermission(user, PERMISSIONS.sessionManageAll);

    if (!canManageSessions) {
      throw new Error("لا تملك صلاحية إنهاء هذه الجلسات.");
    }

    const sessionsSnapshot = await getDocs(
      query(
        collection(db, SESSIONS_COLLECTION),
        where("userId", "==", userId),
        where("status", "==", "active"),
        limit(50)
      )
    );

    await Promise.all(
      sessionsSnapshot.docs.map((docSnap) =>
        updateDoc(doc(db, SESSIONS_COLLECTION, docSnap.id), {
          status: "revoked",
          revokedReason: "manual_revoke",
          revokedAt: serverTimestamp(),
          revokedAtIso: new Date().toISOString(),
        })
      )
    );

    await logAuditEvent("security.sessions_revoked", {
      targetId: userId,
      riskLevel: "high",
      page: "/security",
    });
  }, [user]);

  const can = useCallback(
    (permissionOrPath) => {
      if (!user) return false;
      if (permissionOrPath?.startsWith?.("/")) return canAccessRoute(user, permissionOrPath);
      return hasPermission(user, permissionOrPath);
    },
    [user]
  );

  const value = useMemo(() => {
    const rolePermissions = user ? getRolePermissions(user.role) : [];
    const effectivePermissions = user
      ? Array.from(
          new Set([
            ...rolePermissions,
            ...(Array.isArray(user.permissionOverrides) ? user.permissionOverrides : []),
          ])
        )
      : [];
    const hasFinancialPrivileges = effectivePermissions.some((permission) =>
      [
        PERMISSIONS.treasuryCreate,
        PERMISSIONS.treasuryEdit,
        PERMISSIONS.treasuryDelete,
        PERMISSIONS.treasuryApprove,
        PERMISSIONS.treasuryPost,
        PERMISSIONS.treasurySettle,
      ].includes(permission)
    );

    return {
      user,
      session,
      loading,
      sessionIntegrity,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === "admin",
      isReadOnly: Boolean(user) && !hasFinancialPrivileges && !can(PERMISSIONS.employeesEdit),
      userRole: user?.role || "viewer",
      permissions: effectivePermissions,
      can,
      loginWithPassword,
      loginAdmin: loginWithPassword,
      loginEmployee,
      registerAccount,
      changePassword,
      requestPasswordReset,
      logout,
      updateAccountAccess,
      revokeUserSessions,
    };
  }, [
    user,
    session,
    loading,
    sessionIntegrity,
    can,
    loginWithPassword,
    loginEmployee,
    registerAccount,
    changePassword,
    requestPasswordReset,
    logout,
    updateAccountAccess,
    revokeUserSessions,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
