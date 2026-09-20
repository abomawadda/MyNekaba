/* global process */
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { normalizePrivateKey } from "./jitAuthCore.js";

function getProjectId() {
  return process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "";
}

function getCredential() {
  const projectId = getProjectId();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }

  return applicationDefault();
}

export function getAdminContext() {
  const projectId = getProjectId();
  if (!projectId) throw new Error("missing_project_id");

  const app =
    getApps()[0] ||
    initializeApp({
      credential: getCredential(),
      projectId,
    });

  return {
    app,
    projectId,
    auth: getAuth(app),
    db: getFirestore(app),
    storageBucketName: process.env.FIREBASE_STORAGE_BUCKET || "",
  };
}

export async function readCollection(db, collectionName) {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
