import Link from "next/link";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";

export function AppwriteAdminShell({
  identity
}: {
  identity: AuthenticatedStaffIdentity;
}) {
  const productEditor = identity.role === "product_editor";
  const links = productEditor
    ? [
        { href: "/admin/products", label: "Products" },
        { href: "/admin/stock", label: "Quick Stock" }
      ]
    : [
        { href: "/admin", label: "Dashboard" },
        { href: "/admin/products", label: "Products" },
        { href: "/admin/stock", label: "Quick Stock" }
      ];

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <p className="sidebar-eyebrow">WAT App Admin</p>
          <h2>{productEditor ? "Products" : "WAT App"}</h2>
        </div>
        <nav className="admin-nav" aria-label="Admin navigation">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="admin-nav-link">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="admin-user-card">
          <p>{identity.name || identity.email}</p>
          <span>{identity.email}</span>
          <span>{identity.role === "admin" ? "Admin" : "Product editor"}</span>
          <form action="/api/auth/logout" method="post">
            <button className="secondary-button" type="submit">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <main className="admin-content">
        <section className="panel-card">
          <p className="eyebrow">Read-only migration</p>
          <h1>Admin access verified</h1>
          <p>
            Your Appwrite session and staff role are valid. Catalogue mutations remain
            disabled during migration verification.
          </p>
        </section>
      </main>
    </div>
  );
}
