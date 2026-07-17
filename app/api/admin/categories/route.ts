import { NextResponse } from "next/server";
import { resolveAppwriteStaffIdentity } from "@/lib/appwrite/auth/runtime";
import { readAppwriteSessionCookie } from "@/lib/appwrite/auth/session-cookie";
import { handleCategoryMutationRequest } from "@/lib/appwrite/category-mutation-handlers";
import { createAppwriteCategoryMutationService } from "@/lib/appwrite/category-mutations";
import { getServerBackendMode } from "@/lib/backend/server";
import { isMutationEnabled, mutationDisabledResponse } from "@/lib/server/mutation-gate";

export const dynamic = "force-dynamic";

function dependencies() {
  return {
    resolveIdentity: async () =>
      resolveAppwriteStaffIdentity(await readAppwriteSessionCookie()),
    service: createAppwriteCategoryMutationService()
  };
}

async function run(request: Request, operation: "create" | "update" | "delete") {
  if (getServerBackendMode() !== "appwrite") {
    return NextResponse.json(
      { ok: false, code: "NOT_FOUND", error: "Category mutation path unavailable." },
      { status: 404 }
    );
  }
  if (!isMutationEnabled()) return mutationDisabledResponse();
  const result = await handleCategoryMutationRequest(request, operation, dependencies());
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" }
  });
}

export function POST(request: Request) {
  return run(request, "create");
}

export function PATCH(request: Request) {
  return run(request, "update");
}

export function DELETE(request: Request) {
  return run(request, "delete");
}
