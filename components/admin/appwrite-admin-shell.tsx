import Link from "next/link";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";

export function AppwriteAdminShell({
  identity,
  children
}: {
  identity: AuthenticatedStaffIdentity;
  children: React.ReactNode;
}) {
  const productEditor = identity.role === "product_editor";
  const links = [
    { href: "/admin", label: "Catalogue overview" },
    { href: "/admin/products", label: "Products" },
    ...(!productEditor ? [{ href: "/admin/logs", label: "Activity log" }] : [])
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
        {children}
      </main>
    </div>
  );
}
