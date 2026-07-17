import { NextResponse } from "next/server";
import { handleRecoveryRequest } from "@/lib/appwrite/auth/handlers";
import { createAppwriteAuthenticationService } from "@/lib/appwrite/auth/runtime";
import { getServerBackendMode } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

function recoveryUrl() {
  const value = process.env.APPWRITE_PASSWORD_RECOVERY_URL;
  if (!value) throw new Error("APPWRITE_PASSWORD_RECOVERY_URL is required.");
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && url.hostname === "localhost";
  if ((!localHttp && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("APPWRITE_PASSWORD_RECOVERY_URL is invalid.");
  }
  return url.toString();
}

export async function POST(request: Request) {
  if (getServerBackendMode() !== "appwrite") {
    return NextResponse.json({ error: "Authentication path unavailable." }, { status: 404 });
  }
  const result = await handleRecoveryRequest(
    request,
    recoveryUrl(),
    createAppwriteAuthenticationService()
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" }
  });
}
