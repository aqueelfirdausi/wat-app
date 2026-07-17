"use client";

import { isFirebaseConfigured } from "@/lib/firebase/config";
import { getBrowserBackendMode } from "@/lib/backend/browser";

export function FirebaseStatus() {
  try {
    if (getBrowserBackendMode() === "appwrite") {
      return (
        <div className="notice-banner">
          Appwrite local mode is selected. Catalogue adapters are connected in the next migration phase.
        </div>
      );
    }
  } catch {
    return <div className="notice-banner">Backend selection is missing or invalid. The application is fail-closed.</div>;
  }

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
