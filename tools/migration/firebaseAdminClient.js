let adminApp;

async function loadAdminModules() {
  try {
    const [{ initializeApp, applicationDefault, getApps }, { getAuth }, { getFirestore }] =
      await Promise.all([
        import("firebase-admin/app"),
        import("firebase-admin/auth"),
        import("firebase-admin/firestore"),
      ]);
    return { initializeApp, applicationDefault, getApps, getAuth, getFirestore };
  } catch (error) {
    throw new Error(
      `Firebase Admin SDK is unavailable. Install firebase-admin and run with ADC/GOOGLE_APPLICATION_CREDENTIALS. Cause: ${error.message}`
    );
  }
}

export async function createAdminContext({ projectId }) {
  if (!projectId) {
    throw new Error("A Firebase project id is required. Pass --project=<id>.");
  }

  const { initializeApp, applicationDefault, getApps, getAuth, getFirestore } =
    await loadAdminModules();

  adminApp =
    adminApp ||
    getApps()[0] ||
    initializeApp({
      credential: applicationDefault(),
      projectId,
    });

  return {
    projectId,
    db: getFirestore(adminApp),
    auth: getAuth(adminApp),
  };
}

export async function readUserAccounts(db) {
  const snapshot = await db.collection("user_accounts").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function listAuthUsers(auth, maxUsers = 1000) {
  const users = [];
  let pageToken;

  do {
    const page = await auth.listUsers(maxUsers, pageToken);
    users.push(
      ...page.users.map((user) => ({
        uid: user.uid,
        email: user.email || "",
        disabled: Boolean(user.disabled),
        emailVerified: Boolean(user.emailVerified),
        creationTime: user.metadata?.creationTime || "",
        lastSignInTime: user.metadata?.lastSignInTime || "",
      }))
    );
    pageToken = page.pageToken;
  } while (pageToken);

  return users;
}
