"use client";

import { getApps } from "firebase/app";
import { collection, addDoc, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { db } from "@/lib/firebase/client";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const FCM_SW_PATH = "/api/fcm-sw";

function getFirebaseApp() {
  const apps = getApps();
  return apps.length ? apps[0] : null;
}

export async function requestNotificationPermission(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }

  const app = getFirebaseApp();
  if (!app || !VAPID_KEY || !db) return "unsupported";

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") return "denied";

  try {
    const registration = await navigator.serviceWorker.register(FCM_SW_PATH);
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (token) {
      await saveFcmToken(token);
    }
    return "granted";
  } catch (err) {
    console.error("[FCM] Token registration failed:", err);
    return "denied";
  }
}

async function saveFcmToken(token: string): Promise<void> {
  if (!db) return;
  const tokensRef = collection(db, "fcm_tokens");
  const snap = await getDocs(query(tokensRef, where("token", "==", token)));
  if (!snap.empty) return;
  const ua = navigator.userAgent;
  const platform = /android/i.test(ua) ? "android" : /iphone|ipad|ipod/i.test(ua) ? "ios" : "web";
  await addDoc(tokensRef, {
    token,
    createdAt: serverTimestamp(),
    platform,
  });
}

export function subscribeForegroundMessages(callback: (payload: unknown) => void): () => void {
  const app = getFirebaseApp();
  if (!app) return () => undefined;
  try {
    const messaging = getMessaging(app);
    return onMessage(messaging, callback);
  } catch {
    return () => undefined;
  }
}
