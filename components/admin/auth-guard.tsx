"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { canAccessAdminPath } from "@/lib/admin-roles";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading, role, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !isAdmin) && pathname !== "/admin/login") {
      router.replace("/admin/login");
      return;
    }

    if (!loading && user && isAdmin && !canAccessAdminPath(role, pathname)) {
      router.replace(role === "product_editor" ? "/admin/products" : "/admin/login");
    }
  }, [isAdmin, loading, pathname, role, router, user]);

  if (loading) {
    return <div className="panel-card">Checking admin access...</div>;
  }

  if ((!user || !isAdmin) && pathname !== "/admin/login") {
    return <div className="panel-card">Redirecting to sign-in...</div>;
  }

  if (!canAccessAdminPath(role, pathname)) {
    return <div className="panel-card">Redirecting to an allowed admin area...</div>;
  }

  return <>{children}</>;
}
