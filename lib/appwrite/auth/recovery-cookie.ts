import "server-only";

import { cookies } from "next/headers";

const RECOVERY_COOKIE_NAME = "wat-appwrite-recovery";
const RECOVERY_COOKIE_PATH = "/api/auth/recovery/complete";
const RECOVERY_MAX_AGE_SECONDS = 60 * 60;

export type AppwriteRecoveryState = {
  userId: string;
  secret: string;
};

function options() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: RECOVERY_COOKIE_PATH,
    maxAge: RECOVERY_MAX_AGE_SECONDS
  };
}

export async function writeAppwriteRecoveryCookie(state: AppwriteRecoveryState) {
  const value = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  (await cookies()).set(RECOVERY_COOKIE_NAME, value, options());
}

export async function readAppwriteRecoveryCookie(): Promise<AppwriteRecoveryState | null> {
  const value = (await cookies()).get(RECOVERY_COOKIE_NAME)?.value;
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as AppwriteRecoveryState).userId !== "string" ||
      typeof (parsed as AppwriteRecoveryState).secret !== "string"
    ) {
      return null;
    }
    return parsed as AppwriteRecoveryState;
  } catch {
    return null;
  }
}

export async function clearAppwriteRecoveryCookie() {
  (await cookies()).set(RECOVERY_COOKIE_NAME, "", {
    ...options(),
    expires: new Date(0),
    maxAge: 0
  });
}
