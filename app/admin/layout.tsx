import { AdminLayoutClient } from "@/components/admin/admin-layout-client";
import { isMutationEnabled } from "@/lib/server/mutation-gate";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!isMutationEnabled()) {
    return (
      <main className="admin-login-shell">
        <section className="panel-card">
          <p className="eyebrow">Temporarily unavailable</p>
          <h1>Admin mutations are disabled</h1>
          <p>This deployment is read-only. Use the approved production environment for catalogue changes.</p>
        </section>
      </main>
    );
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
