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

export function getAppwriteSessionCookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(expires ? { expires } : {})
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
  (await cookies()).set(getAppwriteSessionCookieName(), "", {
    ...getAppwriteSessionCookieOptions(new Date(0)),
    maxAge: 0
  });
}
