"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { subscribeToProducts } from "@/lib/firebase/firestore";
import { Product } from "@/lib/types";

export function DashboardOverview() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      return subscribeToProducts(setProducts);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load dashboard stats.";
      setError(message);
      return () => undefined;
    }
  }, []);

  const stats = useMemo(
    () => [
      { label: "Total products", value: products.length },
      { label: "Featured", value: products.filter((product) => product.featured).length },
      { label: "In stock", value: products.filter((product) => product.stockStatus === "In Stock").length },
      { label: "Low stock", value: products.filter((product) => product.stockStatus === "Low Stock").length }
    ],
    [products]
  );

  return (
    <div className="dashboard-stack">
      <section className="panel-card">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Overview</p>
            <h1>Owner dashboard</h1>
          </div>
          <Link href="/admin/products/new" className="primary-link">
            Add today&apos;s stock
          </Link>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="stats-grid">
          {stats.map((stat) => (
            <article key={stat.label} className="stat-card">
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-card quick-actions">
        <h2>Quick actions</h2>
        <div className="quick-links">
          <Link href="/admin/products" className="secondary-link">
            Review products
          </Link>
          <Link href="/admin/logs" className="secondary-link">
            Review activity
          </Link>
          <Link href="/" className="secondary-link">
            Preview storefront
          </Link>
        </div>
      </section>
    </div>
  );
}
