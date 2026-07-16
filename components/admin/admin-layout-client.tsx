"use client";

import { usePathname } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AuthGuard } from "@/components/admin/auth-guard";
import { AuthProvider } from "@/components/providers/auth-provider";

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return <AuthProvider>{children}</AuthProvider>;
  }

  return (
    <AuthProvider>
      <AuthGuard>
        <AdminShell>{children}</AdminShell>
      </AuthGuard>
    </AuthProvider>
  );
}
