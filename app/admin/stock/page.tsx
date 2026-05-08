"use client";

import { QuickStockPanel } from "@/components/admin/quick-stock-panel";
import { useAuth } from "@/components/providers/auth-provider";

export default function AdminStockPage() {
  const { role, user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <QuickStockPanel
      actor={{
        uid: user.uid,
        name: user.displayName || user.email || "Team Member",
        email: user.email || "",
        role
      }}
    />
  );
}
