"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { subscribeToProducts } from "@/lib/firebase/firestore";
import { Product } from "@/lib/types";
import { formatCurrency, normalizeStockStatus } from "@/lib/utils";

function getProductIssues(product: Product): string[] {
  const issues: string[] = [];
  if (!product.imageUrl?.trim()) issues.push("no image");
  if (!Number.isFinite(product.price) || product.price <= 0) issues.push("check price");
  if (!product.description?.trim()) issues.push("no description");
  return issues;
}

export function DashboardOverview() {
  const [products, setProducts] = useState<Product[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      return subscribeToProducts((next) => {
        setProducts(next);
        setHasLoaded(true);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load dashboard.";
      setError(message);
      setHasLoaded(true);
      return () => undefined;
    }
  }, []);

  const chosenProduct = useMemo(() => products.find((p) => p.chosenForToday) ?? null, [products]);

  const stockCounts = useMemo(() => ({
    total: products.length,
    inStock: products.filter((p) => normalizeStockStatus(p.stockStatus) === "in_stock").length,
    lowStock: products.filter((p) => normalizeStockStatus(p.stockStatus) === "low_stock").length,
    soldOut: products.filter((p) => normalizeStockStatus(p.stockStatus) === "sold_out").length,
    featured: products.filter((p) => p.featured).length,
  }), [products]);

  const needsAttention = useMemo(() =>
    products
      .map((p) => ({ product: p, issues: getProductIssues(p) }))
      .filter(({ issues }) => issues.length > 0)
      .slice(0, 6),
    [products]
  );

  return (
    <div className="dashboard-stack">
      <section className="panel-card">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Today</p>
            <h1>Daily overview</h1>
          </div>
          <Link href="/admin/products/new" className="primary-link">
            Add product
          </Link>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}

        <div className="dashboard-today-pick">
          <p className="dashboard-section-label">Today&apos;s pick</p>
          {chosenProduct ? (
            <div className="dashboard-chosen-card">
              <div className="dashboard-chosen-info">
                <strong>{chosenProduct.name}</strong>
                <span>{formatCurrency(chosenProduct.price, chosenProduct.currency)}</span>
              </div>
              <Link href={`/admin/products/${chosenProduct.id}`} className="secondary-link">
                Edit
              </Link>
            </div>
          ) : (
            <div className="dashboard-chosen-empty">
              <span>No product chosen for today</span>
              <Link href="/admin/products" className="secondary-link">
                Choose one →
              </Link>
            </div>
          )}
        </div>

        <div className="dashboard-stats">
          <div className="dashboard-stat">
            <strong>{stockCounts.total}</strong>
            <span>Total</span>
          </div>
          <div className="dashboard-stat dashboard-stat-good">
            <strong>{stockCounts.inStock}</strong>
            <span>In stock</span>
          </div>
          <div className="dashboard-stat dashboard-stat-warn">
            <strong>{stockCounts.lowStock}</strong>
            <span>Low stock</span>
          </div>
          <div className="dashboard-stat dashboard-stat-bad">
            <strong>{stockCounts.soldOut}</strong>
            <span>Sold out</span>
          </div>
          <div className="dashboard-stat">
            <strong>{stockCounts.featured}</strong>
            <span>Featured</span>
          </div>
        </div>
      </section>

      {hasLoaded && needsAttention.length > 0 ? (
        <section className="panel-card dashboard-attention">
          <div className="dashboard-attention-header">
            <div>
              <p className="eyebrow">Action needed</p>
              <h2>{needsAttention.length} product{needsAttention.length !== 1 ? "s" : ""} need attention</h2>
            </div>
            <Link href="/admin/products" className="secondary-link">
              View all →
            </Link>
          </div>
          <ul className="dashboard-attention-list">
            {needsAttention.map(({ product, issues }) => (
              <li key={product.id} className="dashboard-attention-item">
                <Link href={`/admin/products/${product.id}`} className="dashboard-attention-link">
                  <span className="dashboard-attention-name">{product.name}</span>
                  <span className="dashboard-attention-issues">{issues.join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel-card">
        <h2 className="dashboard-section-label">Quick actions</h2>
        <div className="quick-links">
          <Link href="/admin/stock" className="secondary-link">Quick stock update</Link>
          <Link href="/admin/products/new" className="secondary-link">Add product</Link>
          <Link href="/admin/logs" className="secondary-link">Activity log</Link>
          <Link href="/" className="secondary-link" target="_blank" rel="noreferrer">Preview storefront</Link>
        </div>
      </section>
    </div>
  );
}
