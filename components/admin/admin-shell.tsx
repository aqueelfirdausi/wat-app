"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutUser } from "@/lib/firebase/auth";
import { useAuth } from "@/components/providers/auth-provider";
import { canAccessAdminPath } from "@/lib/admin-roles";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/stock", label: "Quick Stock" },
  { href: "/admin/products/new", label: "Add Product" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/logs", label: "Activity Log" }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role, user } = useAuth();
  const visibleLinks = links.filter((link) => canAccessAdminPath(role, link.href));
  const isProductEditor = role === "product_editor";

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <p className="sidebar-eyebrow">WAT App Admin</p>
          <h2>{isProductEditor ? "Products" : "WAT App"}</h2>
        </div>
        <nav className="admin-nav">
          {visibleLinks.map((link) => (
            <Link key={link.href} href={link.href} className={pathname === link.href ? "admin-nav-link active" : "admin-nav-link"}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="admin-user-card">
          <p>{user?.displayName || user?.email || "Signed in admin"}</p>
          <button className="secondary-button" onClick={() => logoutUser()}>
            Log out
          </button>
        </div>
      </aside>
      <div className="admin-content">{children}</div>
    </div>
  );
}
