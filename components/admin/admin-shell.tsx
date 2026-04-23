"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutUser } from "@/lib/firebase/auth";
import { useAuth } from "@/components/providers/auth-provider";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/products/new", label: "Add Product" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/logs", label: "Activity Log" }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <p className="sidebar-eyebrow">WAT App Admin</p>
          <h2>Owner workspace</h2>
          <p className="sidebar-copy">The owner manages uploads, pricing, stock, and platform control. Team members are customer-facing WhatsApp contacts.</p>
        </div>
        <nav className="admin-nav">
          {links.map((link) => (
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
