import { NextResponse } from "next/server";
import { createAppwriteAuthenticationService } from "@/lib/appwrite/auth/runtime";
import {
  clearAppwriteSessionCookie,
  readAppwriteSessionCookie
} from "@/lib/appwrite/auth/session-cookie";
import { isServerAppwriteSelected } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isServerAppwriteSelected()) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 303);
  }
  const sessionSecret = await readAppwriteSessionCookie();
  if (sessionSecret) {
    try {
      await createAppwriteAuthenticationService().deleteCurrentSession(sessionSecret);
    } catch {
      // Cleanup remains successful when the remote session is already invalid.
    }
  }
  await clearAppwriteSessionCookie();
  return NextResponse.redirect(new URL("/admin/login?session=cleared", request.url), 303);
}
