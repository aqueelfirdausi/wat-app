import { NextResponse } from "next/server";
import { resolveAppwriteStaffIdentity } from "@/lib/appwrite/auth/runtime";
import { readAppwriteSessionCookie } from "@/lib/appwrite/auth/session-cookie";
import { handleProductImageRequest } from "@/lib/appwrite/product-lifecycle-handlers";
import { createAppwriteProductLifecycleService } from "@/lib/appwrite/product-lifecycle";
import { getServerBackendMode } from "@/lib/backend/server";
import { isMutationEnabled, mutationDisabledResponse } from "@/lib/server/mutation-gate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (getServerBackendMode() !== "appwrite") {
    return NextResponse.json(
      { ok: false, code: "NOT_FOUND", error: "Image mutation path unavailable." },
      { status: 404 }
    );
  }
  if (!isMutationEnabled()) return mutationDisabledResponse();
  const result = await handleProductImageRequest(request, {
    resolveIdentity: async () =>
      resolveAppwriteStaffIdentity(await readAppwriteSessionCookie()),
    service: createAppwriteProductLifecycleService()
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" }
  });
}
