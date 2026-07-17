"use client";

import { BackendConfigurationError, parseBackendMode } from "@/lib/backend/mode";

export function getBrowserBackendMode() {
  const mode = parseBackendMode(process.env.NEXT_PUBLIC_WAT_BACKEND);
  if (mode === "appwrite") {
    const missing = [
      !process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT && "NEXT_PUBLIC_APPWRITE_ENDPOINT",
      !process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID && "NEXT_PUBLIC_APPWRITE_PROJECT_ID"
    ].filter(Boolean);
    if (missing.length) {
      throw new BackendConfigurationError(
        `Selected backend configuration is incomplete. Missing: ${missing.join(", ")}.`
      );
    }
  }
  return mode;
}

export function isBrowserFirebaseMode() {
  try {
    return getBrowserBackendMode() === "firebase";
  } catch {
    return false;
  }
}
