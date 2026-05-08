"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeToProducts, updateProductStockStatus } from "@/lib/firebase/firestore";
import { STOCK_STATUSES } from "@/lib/constants";
import { AdminRole } from "@/lib/admin-roles";
import { Product } from "@/lib/types";
import { getStockStatusLabel, normalizeStockStatus } from "@/lib/utils";

type Actor = {
  uid: string;
  name: string;
  email: string;
  role: AdminRole | null;
};

type Props = {
  actor: Actor;
};

const STATUS_BUTTON_LABELS: Record<string, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  sold_out: "Sold Out"
};

export function QuickStockPanel({ actor }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const feedbackTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    return subscribeToProducts(setProducts);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = feedbackTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.categoryName.toLowerCase().includes(query)
      )
    : products;

  async function handleStockTap(product: Product, status: Product["stockStatus"]) {
    if (saving[product.id]) return;
    setSaving((prev) => ({ ...prev, [product.id]: true }));

    try {
      await updateProductStockStatus(product, status, actor);
      const label = STATUS_BUTTON_LABELS[status] ?? getStockStatusLabel(status);
      setFeedback((prev) => ({ ...prev, [product.id]: `${label} saved.` }));

      if (feedbackTimers.current[product.id]) {
        clearTimeout(feedbackTimers.current[product.id]);
      }
      feedbackTimers.current[product.id] = setTimeout(() => {
        setFeedback((prev) => {
          const next = { ...prev };
          delete next[product.id];
          return next;
        });
      }, 2000);
    } catch {
      setFeedback((prev) => ({ ...prev, [product.id]: "Failed to save." }));
    } finally {
      setSaving((prev) => ({ ...prev, [product.id]: false }));
    }
  }

  return (
    <div className="quick-stock-page">
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h1>Quick Stock Update</h1>
            <p className="sidebar-copy">Tap a button to update stock status instantly.</p>
          </div>
        </div>
        <label className="quick-stock-search">
          <span>Search products</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or category"
          />
        </label>
      </div>

      <ul className="quick-stock-list">
        {filtered.map((product) => {
          const currentStatus = normalizeStockStatus(product.stockStatus);
          return (
            <li key={product.id} className="quick-stock-card panel-card">
              <div className="quick-stock-card-info">
                <span className="quick-stock-card-name">{product.name}</span>
                <span className="quick-stock-card-category">{product.categoryName}</span>
              </div>
              <div className="quick-stock-card-actions">
                {STOCK_STATUSES.map((status) => {
                  const isActive = currentStatus === status;
                  const btnClass = `quick-stock-btn quick-stock-btn-${status.replace("_", "-")}${isActive ? " active" : ""}`;
                  return (
                    <button
                      key={status}
                      className={btnClass}
                      onClick={() => handleStockTap(product, status)}
                      disabled={saving[product.id]}
                      aria-pressed={isActive}
                    >
                      {STATUS_BUTTON_LABELS[status]}
                    </button>
                  );
                })}
              </div>
              {feedback[product.id] ? (
                <p className="quick-stock-feedback">{feedback[product.id]}</p>
              ) : null}
            </li>
          );
        })}

        {filtered.length === 0 && (
          <li className="panel-card quick-stock-empty">
            {search.trim() ? "No products match your search." : "No products found."}
          </li>
        )}
      </ul>
    </div>
  );
}
