import { NextResponse } from "next/server";
import { createAppwriteAuthenticationService } from "@/lib/appwrite/auth/runtime";
import { handleAppwriteLogin } from "@/lib/appwrite/auth/handlers";
import { writeAppwriteSessionCookie } from "@/lib/appwrite/auth/session-cookie";
import { getServerBackendMode } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (getServerBackendMode() !== "appwrite") {
    return NextResponse.json({ error: "Authentication path unavailable." }, { status: 404 });
  }

  const result = await handleAppwriteLogin(request, createAppwriteAuthenticationService());
  if (result.session) {
    await writeAppwriteSessionCookie(
      result.session.sessionSecret,
      new Date(result.session.expiresAt)
    );
  }
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" }
  });
}
