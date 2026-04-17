"use client";

import { ProductManager } from "@/components/admin/product-manager";
import { useAuth } from "@/components/providers/auth-provider";

export default function AdminProductsPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <ProductManager
      actor={{
        uid: user.uid,
        name: user.displayName || user.email || "Team Member",
        email: user.email || ""
      }}
    />
  );
}
