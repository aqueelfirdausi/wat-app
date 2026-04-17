"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !isAdmin) && pathname !== "/admin/login") {
      router.replace("/admin/login");
    }
  }, [isAdmin, loading, pathname, router, user]);

  if (loading) {
    return <div className="panel-card">Checking admin access...</div>;
  }

  if ((!user || !isAdmin) && pathname !== "/admin/login") {
    return <div className="panel-card">Redirecting to sign-in...</div>;
  }

  return <>{children}</>;
}
