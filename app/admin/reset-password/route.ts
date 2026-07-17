import { NextResponse } from "next/server";
import {
  clearAppwriteRecoveryCookie,
  writeAppwriteRecoveryCookie
} from "@/lib/appwrite/auth/recovery-cookie";
import { validateRecoveryCallback } from "@/lib/appwrite/auth/validation";
import { isServerAppwriteSelected } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  if (!isServerAppwriteSelected()) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 303);
  }
  const validated = validateRecoveryCallback(
    requestUrl.searchParams.get("userId"),
    requestUrl.searchParams.get("secret")
  );
  if (!validated.ok) {
    await clearAppwriteRecoveryCookie();
    return NextResponse.redirect(
      new URL("/admin/reset-password/complete?state=invalid", request.url),
      303
    );
  }
  await writeAppwriteRecoveryCookie(validated.value);
  return NextResponse.redirect(
    new URL("/admin/reset-password/complete?state=ready", request.url),
    303
  );
}
