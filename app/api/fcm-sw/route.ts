import { NextResponse } from "next/server";
import { isServerAppwriteSelected } from "@/lib/backend/server";

// Serves the Firebase Messaging service worker with injected config.
// A separate SW file is required for FCM background message handling.
// Config values are NEXT_PUBLIC_* (safe to expose) injected server-side
// to avoid hardcoding in a static public/ file.
export const dynamic = "force-dynamic";

export async function GET() {
  if (isServerAppwriteSelected()) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };

  const sw = [
    "importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');",
    "importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');",
    "",
    `firebase.initializeApp(${JSON.stringify(config)});`,
    "var messaging = firebase.messaging();",
    "",
    "messaging.onBackgroundMessage(function(payload) {",
    "  var title = (payload.notification && payload.notification.title) ? payload.notification.title : 'WAT App';",
    "  var body = (payload.notification && payload.notification.body) ? payload.notification.body : '';",
    "  return self.registration.showNotification(title, {",
    "    body: body,",
    "    icon: '/icon-192.png',",
    "    badge: '/icon-192.png',",
    "    tag: 'wat-notification',",
    "  });",
    "});",
  ].join("\n");

  return new NextResponse(sw, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
