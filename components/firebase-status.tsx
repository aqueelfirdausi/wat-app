"use client";

import { isFirebaseConfigured } from "@/lib/firebase/config";

export function FirebaseStatus() {
  if (isFirebaseConfigured()) {
    return null;
  }

  return (
    <div className="notice-banner">
      Firebase is not configured yet. Add the values from <code>.env.local</code> to enable live products, login,
      uploads, and logs.
    </div>
  );
}
