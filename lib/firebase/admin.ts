// Firebase Admin SDK — server-side only. Never import this in client components.
// Local dev:  set GOOGLE_APPLICATION_CREDENTIALS=./service-account.json in .env.local
// Production: Application Default Credentials (ADC) on Firebase App Hosting / Cloud Run
import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const FIRESTORE_DATABASE_ID = "watapp";

function getOrInitAdminApp(): App {
  const apps = getApps();
  if (apps.length) return apps[0];

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    // Local dev: explicitly load service account from file path
    return initializeApp({ credential: cert(credPath) });
  }

  // Production: use ADC (automatically available on Firebase App Hosting)
  return initializeApp();
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
