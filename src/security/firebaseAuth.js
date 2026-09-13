import {
  createUserWithEmailAndPassword,
  getIdTokenResult,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../app/providers/FirebaseProvider";

export const isFirebaseAuthConfigured = () => Boolean(auth?.app);

const translateFirebaseError = (error) => {
  const code = error?.code || "";
  if (code.includes("operation-not-allowed")) {
    return "تسجيل الدخول بالبريد غير مفعل في Firebase Console — فعّل Email/Password أولاً.";
  }
  if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) {
    return "بيانات الدخول غير صحيحة.";
  }
  if (code.includes("email-already-in-use")) {
    return "هذا البريد مسجل بالفعل في Firebase.";
  }
  if (code.includes("network-request-failed")) {
    return "تعذر الاتصال بخدمة المصادقة — تحقق من الإنترنت.";
  }
  if (code.includes("too-many-requests")) {
    return "محاولات كثيرة — انتظر قليلاً ثم حاول مجدداً.";
  }
  return error?.message || "تعذر تسجيل الدخول عبر Firebase.";
};

export async function firebaseSignIn(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, String(email).trim(), password);
    return { uid: credential.user.uid, email: credential.user.email || "" };
  } catch (error) {
    throw new Error(translateFirebaseError(error));
  }
}

export async function firebaseSignUp(email, password) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, String(email).trim(), password);
    return { uid: credential.user.uid, email: credential.user.email || "" };
  } catch (error) {
    throw new Error(translateFirebaseError(error));
  }
}

export async function firebaseSignInWithCustomToken(customToken) {
  try {
    const credential = await signInWithCustomToken(auth, customToken);
    const tokenResult = await getIdTokenResult(credential.user, true);
    return {
      uid: credential.user.uid,
      email: credential.user.email || "",
      claims: tokenResult.claims || {},
    };
  } catch (error) {
    throw new Error(translateFirebaseError(error));
  }
}

export async function firebaseSignOut() {
  try {
    await signOut(auth);
  } catch {
    // no-op
  }
}

export const getFirebaseUid = () => auth?.currentUser?.uid || "";
