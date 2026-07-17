import { NextResponse } from "next/server";
import { handleRecoveryCompletion } from "@/lib/appwrite/auth/handlers";
import {
  clearAppwriteRecoveryCookie,
  readAppwriteRecoveryCookie
} from "@/lib/appwrite/auth/recovery-cookie";
import { createAppwriteAuthenticationService } from "@/lib/appwrite/auth/runtime";
import { GENERIC_RECOVERY_ERROR } from "@/lib/appwrite/auth/validation";
import { getServerBackendMode } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (getServerBackendMode() !== "appwrite") {
    return NextResponse.json({ error: "Authentication path unavailable." }, { status: 404 });
  }
  const result = await handleRecoveryCompletion(
    request,
    await readAppwriteRecoveryCookie(),
    createAppwriteAuthenticationService()
  );
  if (result.status === 200 || result.body.error === GENERIC_RECOVERY_ERROR) {
    await clearAppwriteRecoveryCookie();
  }
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" }
  });
}
