import { NextResponse } from "next/server";
import { createAppwriteAuthenticationService } from "@/lib/appwrite/auth/runtime";
import {
  classifyLoginFailure,
  handleAppwriteLogin,
  logLoginDiagnostic
} from "@/lib/appwrite/auth/handlers";
import { writeAppwriteSessionCookie } from "@/lib/appwrite/auth/session-cookie";
import { GENERIC_LOGIN_ERROR } from "@/lib/appwrite/auth/validation";
import { getServerBackendMode } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (getServerBackendMode() !== "appwrite") {
    return NextResponse.json({ error: "Authentication path unavailable." }, { status: 404 });
  }

  const service = createAppwriteAuthenticationService();
  const result = await handleAppwriteLogin(request, service);
  if (result.session) {
    try {
      await writeAppwriteSessionCookie(
        result.session.sessionSecret,
        new Date(result.session.expiresAt)
      );
    } catch (error) {
      logLoginDiagnostic(
        classifyLoginFailure("session_cookie_write", error, "cookie_write_failure")
      );
      try {
        await service.deleteCurrentSession(result.session.sessionSecret);
      } catch {
        // The browser never received the cookie, so remote cleanup is best effort.
      }
      return NextResponse.json(
        { ok: false, error: GENERIC_LOGIN_ERROR },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    logLoginDiagnostic({
      event: "appwrite_admin_login_diagnostic",
      stage: "authenticated_redirect",
      outcome: "success",
      category: "login_session_created"
    });
  }
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" }
  });
}
