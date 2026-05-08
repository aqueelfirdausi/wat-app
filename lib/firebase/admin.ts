// Firebase Admin SDK — server-side only. Never import this in client components.
// On Firebase App Hosting / Cloud Run, Application Default Credentials (ADC)
// are available automatically — no service account file needed.
// For local development, set GOOGLE_APPLICATION_CREDENTIALS to a service account key path.
import { App, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const FIRESTORE_DATABASE_ID = "watapp";

function getOrInitAdminApp(): App {
  const apps = getApps();
  return apps.length ? apps[0] : initializeApp();
}

export function adminAuth() {
  return getAuth(getOrInitAdminApp());
}

export function adminDb() {
  return getFirestore(getOrInitAdminApp(), FIRESTORE_DATABASE_ID);
}

export function adminMessaging() {
  return getMessaging(getOrInitAdminApp());
}
