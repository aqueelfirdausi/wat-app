"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchProducts } from "@/lib/firebase/firestore";
import { Product } from "@/lib/types";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProducts()
      .then((items) => setProduct(items.find((item) => item.id === id) ?? null))
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (!user) {
    return null;
  }

  if (error) {
    return <div className="panel-card inline-error">{error}</div>;
  }

  if (!product) {
    return <div className="panel-card">Loading product...</div>;
  }

  return (
    <ProductForm
      mode="edit"
      initialProduct={product}
      actor={{
        uid: user.uid,
        name: user.displayName || user.email || "Team Member",
        email: user.email || ""
      }}
    />
  );
}
