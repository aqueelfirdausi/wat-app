import "server-only";

import { cookies } from "next/headers";
import { BackendConfigurationError } from "@/lib/backend/mode";

const DEFAULT_COOKIE_NAME = "wat-appwrite-session";

export function getAppwriteSessionCookieName() {
  const name = process.env.APPWRITE_SESSION_COOKIE_NAME ?? DEFAULT_COOKIE_NAME;

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
    throw new BackendConfigurationError("APPWRITE_SESSION_COOKIE_NAME is invalid.");
  }

  return name;
}

export function getAppwriteSessionCookieOptions(
  expires?: Date,
  environment: Record<string, string | undefined> = process.env,
  now = new Date()
) {
  if (expires && (!Number.isFinite(expires.getTime()) || expires <= now)) {
    throw new BackendConfigurationError("Appwrite session expiration is invalid.");
  }
  return {
    httpOnly: true,
    secure: environment.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(expires
      ? {
          expires,
          maxAge: Math.max(1, Math.floor((expires.getTime() - now.getTime()) / 1000))
        }
      : {})
  };
}

export function getAppwriteSessionCookieClearOptions(
  environment: Record<string, string | undefined> = process.env
) {
  return {
    ...getAppwriteSessionCookieOptions(undefined, environment),
    expires: new Date(0),
    maxAge: 0
  };
}

export async function readAppwriteSessionCookie() {
  return (await cookies()).get(getAppwriteSessionCookieName())?.value ?? null;
}

export async function writeAppwriteSessionCookie(sessionSecret: string, expires?: Date) {
  if (!sessionSecret) {
    throw new BackendConfigurationError("Cannot store an empty Appwrite session.");
  }

  (await cookies()).set(
    getAppwriteSessionCookieName(),
    sessionSecret,
    getAppwriteSessionCookieOptions(expires)
  );
}

export async function clearAppwriteSessionCookie() {
  (await cookies()).set(
    getAppwriteSessionCookieName(),
    "",
    getAppwriteSessionCookieClearOptions()
  );
}
