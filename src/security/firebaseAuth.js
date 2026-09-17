import {
  createUserWithEmailAndPassword,
  getIdTokenResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../app/providers/FirebaseProvider";

export const isFirebaseAuthConfigured = () => Boolean(auth?.app);

export const FIREBASE_AUTH_REASON = {
  invalidCredential: "INVALID_CREDENTIAL",
  providerDisabled: "FIREBASE_PROVIDER_DISABLED",
  network: "NETWORK_ERROR",
  tooManyRequests: "FIREBASE_TOO_MANY_REQUESTS",
  userDisabled: "FIREBASE_USER_DISABLED",
  emailExists: "EMAIL_ALREADY_EXISTS",
  providerError: "FIREBASE_PROVIDER_ERROR",
};

export function getFirebaseAuthReason(error) {
  const code = error?.code || "";
  if (code.includes("operation-not-allowed")) return FIREBASE_AUTH_REASON.providerDisabled;
  if (code.includes("user-disabled")) return FIREBASE_AUTH_REASON.userDisabled;
  if (code.includes("network-request-failed")) return FIREBASE_AUTH_REASON.network;
  if (code.includes("too-many-requests")) return FIREBASE_AUTH_REASON.tooManyRequests;
  if (code.includes("email-already-in-use")) return FIREBASE_AUTH_REASON.emailExists;
  if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) {
    return FIREBASE_AUTH_REASON.invalidCredential;
  }
  return FIREBASE_AUTH_REASON.providerError;
}

export function isConfirmedInvalidCredentialError(error) {
  return error?.reason === FIREBASE_AUTH_REASON.invalidCredential;
}

const translateFirebaseError = (error) => {
  const reason = getFirebaseAuthReason(error);
  if (reason === FIREBASE_AUTH_REASON.providerDisabled) {
    return "تسجيل الدخول بالبريد غير مفعل في Firebase Console. فعّل Email/Password أولا.";
  }
  if (reason === FIREBASE_AUTH_REASON.invalidCredential) {
    return "بيانات الدخول غير صحيحة.";
  }
  if (reason === FIREBASE_AUTH_REASON.emailExists) {
    return "هذا البريد مسجل بالفعل في Firebase.";
  }
  if (reason === FIREBASE_AUTH_REASON.network) {
    return "تعذر الاتصال بخدمة المصادقة. تحقق من الإنترنت.";
  }
  if (reason === FIREBASE_AUTH_REASON.tooManyRequests) {
    return "محاولات كثيرة. انتظر قليلا ثم حاول مجددا.";
  }
  if (reason === FIREBASE_AUTH_REASON.userDisabled) {
    return "حساب Firebase معطل حاليا. راجع إدارة النظام.";
  }
  return error?.message || "تعذر تسجيل الدخول عبر Firebase.";
};

function wrapFirebaseError(error) {
  const wrapped = new Error(translateFirebaseError(error));
  wrapped.code = error?.code || "";
  wrapped.reason = getFirebaseAuthReason(error);
  return wrapped;
}

export async function firebaseSignIn(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, String(email).trim(), password);
    await credential.user.reload();
    return { uid: credential.user.uid, email: credential.user.email || "", emailVerified: Boolean(credential.user.emailVerified) };
  } catch (error) {
    throw wrapFirebaseError(error);
  }
}

export async function firebaseSignUp(email, password) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, String(email).trim(), password);
    return { uid: credential.user.uid, email: credential.user.email || "" };
  } catch (error) {
    throw wrapFirebaseError(error);
  }
}

export async function firebaseSignInWithCustomToken(customToken) {
  try {
    const credential = await signInWithCustomToken(auth, customToken);
    const tokenResult = await getIdTokenResult(credential.user, true);
    return {
      uid: credential.user.uid,
      email: credential.user.email || "",
      emailVerified: Boolean(credential.user.emailVerified),
      claims: tokenResult.claims || {},
    };
  } catch (error) {
    throw wrapFirebaseError(error);
  }
}

export async function firebaseSendCurrentUserEmailVerification() {
  if (!auth?.currentUser) throw new Error("لا توجد جلسة Firebase نشطة لإرسال تحقق البريد.");
  await sendEmailVerification(auth.currentUser, {
    url: `${window.location.origin}/login?emailVerified=1`,
    handleCodeInApp: false,
  });
}

export async function firebaseSendPasswordResetEmail(email) {
  try {
    await sendPasswordResetEmail(auth, String(email || "").trim().toLowerCase(), {
      url: `${window.location.origin}/login?resetComplete=1`,
      handleCodeInApp: false,
    });
  } catch (error) {
    throw wrapFirebaseError(error);
  }
}

export async function getFirebaseIdToken(forceRefresh = false) {
  if (!auth?.currentUser) return "";
  return auth.currentUser.getIdToken(forceRefresh);
}

export async function firebaseSignOut() {
  try {
    await signOut(auth);
  } catch {
    // no-op
  }
}

export const getFirebaseUid = () => auth?.currentUser?.uid || "";
