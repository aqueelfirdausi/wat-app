import { NextResponse } from "next/server";
import { createAppwriteAuthenticationService } from "@/lib/appwrite/auth/runtime";
import {
  clearAppwriteSessionCookie,
  readAppwriteSessionCookie
} from "@/lib/appwrite/auth/session-cookie";
import { isSameOriginRequest } from "@/lib/appwrite/auth/validation";
import { isServerAppwriteSelected } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isServerAppwriteSelected() || !isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Authentication path unavailable." }, { status: 403 });
  }

  const sessionSecret = await readAppwriteSessionCookie();
  if (sessionSecret) {
    try {
      await createAppwriteAuthenticationService().deleteCurrentSession(sessionSecret);
    } catch {
      // Invalid and already-deleted sessions are safe logout states.
    }
  }
  await clearAppwriteSessionCookie();
  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}
