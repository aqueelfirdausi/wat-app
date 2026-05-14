"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchProducts } from "@/lib/firebase/firestore";
import type { Product } from "@/lib/types";

type SendStatus =
  | { type: "idle" }
  | { type: "sending" }
  | { type: "success"; sent: number }
  | { type: "error"; message: string };

export function NotificationsPanel() {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<SendStatus>({ type: "idle" });
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((all) => {
        if (cancelled) return;
        const live = all
          .filter((p) => p.storefrontVisible === true)
          .sort((a, b) => a.name.localeCompare(b.name));
        setProducts(live);
      })
      .catch(() => {
        // silent — picker just stays empty, admin can still send without a product
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !user) return;
    setStatus({ type: "sending" });

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          ...(selectedProductId ? { productId: selectedProductId } : {}),
        }),
      });
      const data = (await res.json()) as { sent?: number; message?: string; error?: string };
      if (!res.ok) {
        setStatus({ type: "error", message: data.error ?? "Failed to send." });
        return;
      }
      setStatus({ type: "success", sent: data.sent ?? 0 });
      setTitle("");
      setBody("");
      setSelectedProductId("");
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Unexpected error.",
      });
    }
  }

  return (
    <div className="dashboard-stack">
      <section className="panel-card">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Owner only</p>
            <h1>Send broadcast</h1>
          </div>
        </div>
        <p className="notification-panel-hint">
          Sends a broadcast to all subscribers. Use only when fresh stock is ready. Maximum one per day.
        </p>
        <form className="notification-form" onSubmit={handleSend}>
          <div className="notification-form-field">
            <label className="notification-form-label" htmlFor="notif-title">
              Title
            </label>
            <input
              id="notif-title"
              type="text"
              className="notification-form-input"
              placeholder="e.g. Fresh stock just dropped"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              required
              disabled={status.type === "sending"}
            />
          </div>
          <div className="notification-form-field">
            <label className="notification-form-label" htmlFor="notif-body">
              Body <span className="notification-form-optional">(optional)</span>
            </label>
            <textarea
              id="notif-body"
              className="notification-form-input notification-form-textarea"
              placeholder="e.g. New fragrances and accessories available now."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={200}
              rows={3}
              disabled={status.type === "sending"}
            />
          </div>
          <div className="notification-form-field">
            <label className="notification-form-label" htmlFor="notif-product">
              Attach product <span className="notification-form-optional">(optional)</span>
            </label>
            <select
              id="notif-product"
              className="notification-form-input"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              disabled={productsLoading || status.type === "sending"}
            >
              <option value="">— None —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {selectedProductId && (() => {
              const picked = products.find((p) => p.id === selectedProductId);
              if (!picked) return null;
              return (
                <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:8 }}>
                  <div style={{ width:48, height:48, borderRadius:8, overflow:"hidden", flexShrink:0, background:"#f5f5f2", position:"relative" }}>
                    <Image
                      src={picked.imageUrl}
                      alt=""
                      width={48}
                      height={48}
                      style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
                      unoptimized
                    />
                  </div>
                  <div style={{ flex:1, fontSize:13, color:"#666" }}>{picked.name}</div>
                  <button
                    type="button"
                    onClick={() => setSelectedProductId("")}
                    aria-label="Remove product"
                    disabled={status.type === "sending"}
                  >
                    ✕
                  </button>
                </div>
              );
            })()}
          </div>
          {status.type === "error" && <div className="inline-error">{status.message}</div>}
          {status.type === "success" && (
            <div className="notice-banner notice-banner-success">
              Sent to {status.sent} subscriber{status.sent !== 1 ? "s" : ""}.
            </div>
          )}
          <button
            type="submit"
            className="primary-button notification-form-submit"
            disabled={!title.trim() || status.type === "sending"}
          >
            {status.type === "sending" ? "Sending…" : "Send broadcast"}
          </button>
        </form>
      </section>
    </div>
  );
}
