"use client";

import { ProductManager } from "@/components/admin/product-manager";
import { useAuth } from "@/components/providers/auth-provider";
import { canDeleteProducts } from "@/lib/admin-roles";

export default function AdminProductsPage() {
  const { role, user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <ProductManager
      actor={{
        uid: user.uid,
        name: user.displayName || user.email || "Team Member",
        email: user.email || "",
        role
      }}
      canDelete={canDeleteProducts(role)}
    />
  );
}
