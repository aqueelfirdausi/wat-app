import "server-only";

import { redirect } from "next/navigation";
import { resolveAppwriteStaffIdentity } from "@/lib/appwrite/auth/runtime";
import { readAppwriteSessionCookie } from "@/lib/appwrite/auth/session-cookie";

export async function requireCurrentAppwriteStaffIdentity() {
  const authorization = await resolveAppwriteStaffIdentity(
    await readAppwriteSessionCookie()
  );
  if (!authorization.ok) {
    if (authorization.code === "no_session") redirect("/admin/login");
    redirect("/api/auth/clear-session");
  }
  return authorization.identity;
}
