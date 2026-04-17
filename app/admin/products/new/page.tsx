"use client";

import { ProductForm } from "@/components/admin/product-form";
import { useAuth } from "@/components/providers/auth-provider";

export default function NewProductPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <ProductForm
      mode="create"
      actor={{
        uid: user.uid,
        name: user.displayName || user.email || "Team Member",
        email: user.email || ""
      }}
    />
  );
}
