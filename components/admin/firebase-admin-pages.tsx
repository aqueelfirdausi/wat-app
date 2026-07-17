"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { NotificationsPanel } from "@/components/admin/notifications-panel";
import { ProductForm } from "@/components/admin/product-form";
import { ProductManager } from "@/components/admin/product-manager";
import { QuickStockPanel } from "@/components/admin/quick-stock-panel";
import { useAuth } from "@/components/providers/auth-provider";
import { canDeleteProducts } from "@/lib/admin-roles";
import { fetchProducts } from "@/lib/firebase/firestore";
import type { Product } from "@/lib/types";

function actorFor(user: NonNullable<ReturnType<typeof useAuth>["user"]>, role: ReturnType<typeof useAuth>["role"]) {
  return {
    uid: user.uid,
    name: user.displayName || user.email || "Team Member",
    email: user.email || "",
    role
  };
}

export function FirebaseProductsPage() {
  const { role, user } = useAuth();
  if (!user) return null;
  return (
    <ProductManager
      actor={actorFor(user, role)}
      canDelete={canDeleteProducts(role)}
    />
  );
}

export function FirebaseNewProductPage() {
  const { role, user } = useAuth();
  if (!user) return null;
  return <ProductForm mode="create" actor={actorFor(user, role)} />;
}

export function FirebaseEditProductPage() {
  const { id } = useParams<{ id: string }>();
  const { role, user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProducts()
      .then((items) => setProduct(items.find((item) => item.id === id) ?? null))
      .catch((failure: Error) => setError(failure.message));
  }, [id]);

  if (!user) return null;
  if (error) return <div className="panel-card inline-error">{error}</div>;
  if (!product) return <div className="panel-card">Loading product...</div>;
  return (
    <ProductForm
      mode="edit"
      initialProduct={product}
      actor={actorFor(user, role)}
    />
  );
}

export function FirebaseStockPage() {
  const { role, user } = useAuth();
  if (!user) return null;
  return <QuickStockPanel actor={actorFor(user, role)} />;
}

export function FirebaseNotificationsPage() {
  const { role } = useAuth();
  if (role !== "admin") {
    return <div className="panel-card">Access denied. This page is for owners only.</div>;
  }
  return <NotificationsPanel />;
}
