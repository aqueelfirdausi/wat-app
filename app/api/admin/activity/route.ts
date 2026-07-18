import { NextResponse } from "next/server";
import { listAppwriteActivityLogs } from "@/lib/appwrite/activity-logs";
import { resolveAppwriteStaffIdentity } from "@/lib/appwrite/auth/runtime";
import { readAppwriteSessionCookie } from "@/lib/appwrite/auth/session-cookie";
import { MutationContractError } from "@/lib/appwrite/mutation-design";
import { getServerBackendMode } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (getServerBackendMode() !== "appwrite") {
    return NextResponse.json(
      { ok: false, code: "NOT_FOUND", error: "Activity path unavailable." },
      { status: 404 }
    );
  }
  const authorization = await resolveAppwriteStaffIdentity(
    await readAppwriteSessionCookie()
  );
  if (!authorization.ok || authorization.identity.role !== "admin") {
    return NextResponse.json(
      { ok: false, code: "AUTHORIZATION_FAILED", error: "Activity access denied." },
      {
        status: authorization.ok || authorization.code !== "no_session" ? 403 : 401,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }
  const url = new URL(request.url);
  try {
    const page = await listAppwriteActivityLogs({
      identity: authorization.identity,
      page: url.searchParams.has("page")
        ? Number(url.searchParams.get("page"))
        : undefined,
      pageSize: url.searchParams.has("pageSize")
        ? Number(url.searchParams.get("pageSize"))
        : undefined,
      entityType: url.searchParams.get("entityType") ?? undefined,
      entityId: url.searchParams.get("entityId") ?? undefined,
      eventType: url.searchParams.get("eventType") ?? undefined,
      result: url.searchParams.get("result") ?? undefined
    });
    return NextResponse.json(
      { ok: true, data: page },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof MutationContractError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        {
          status: error.code === "AUTHORIZATION_FAILED" ? 403 : 400,
          headers: { "Cache-Control": "no-store" }
        }
      );
    }
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", error: "Activity read failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
