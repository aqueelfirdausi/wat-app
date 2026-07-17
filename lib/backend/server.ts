import "server-only";

import { BackendConfigurationError, parseBackendMode } from "@/lib/backend/mode";

export function getServerBackendMode(
  environment: Record<string, string | undefined> = process.env
) {
  const mode = parseBackendMode(environment.WAT_BACKEND);
  if (mode === "appwrite") {
    const names = [
      "APPWRITE_ENDPOINT",
      "APPWRITE_PROJECT_ID",
      "APPWRITE_DATA_API_KEY",
      "APPWRITE_AUTH_API_KEY"
    ] as const;
    const missing = names.filter((name) => !environment[name]);
    if (missing.length) {
      throw new BackendConfigurationError(
        `Selected backend configuration is incomplete. Missing: ${missing.join(", ")}.`
      );
    }
  }
  return mode;
}

export function isServerFirebaseMode() {
  try {
    return getServerBackendMode() === "firebase";
  } catch {
    return false;
  }
}

export function isServerAppwriteSelected() {
  return process.env.WAT_BACKEND === "appwrite";
}
