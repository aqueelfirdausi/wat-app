import { redirect } from "next/navigation";
import { AppwriteAdminShell } from "@/components/admin/appwrite-admin-shell";
import { resolveAppwriteStaffIdentity } from "@/lib/appwrite/auth/runtime";
import { readAppwriteSessionCookie } from "@/lib/appwrite/auth/session-cookie";
import { getServerBackendMode } from "@/lib/backend/server";
import { isMutationEnabled } from "@/lib/server/mutation-gate";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const backend = getServerBackendMode();
  if (backend === "firebase") {
    if (!isMutationEnabled()) {
      return (
        <main className="admin-login-shell">
          <section className="panel-card">
            <p className="eyebrow">Temporarily unavailable</p>
            <h1>Admin mutations are disabled</h1>
            <p>
              This deployment is read-only. Use the approved production environment for
              catalogue changes.
            </p>
          </section>
        </main>
      );
    }
    const { AdminLayoutClient } = await import(
      "@/components/admin/admin-layout-client"
    );
    return <AdminLayoutClient>{children}</AdminLayoutClient>;
  }

  const authorization = await resolveAppwriteStaffIdentity(
    await readAppwriteSessionCookie()
  );
  if (!authorization.ok) {
    if (authorization.code === "no_session") {
      redirect("/admin/login");
    }
    redirect("/api/auth/clear-session");
  }

  return <AppwriteAdminShell identity={authorization.identity} />;
}
