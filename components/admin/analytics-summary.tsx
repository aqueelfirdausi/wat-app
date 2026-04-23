"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeToAnalyticsEvents, subscribeToProducts } from "@/lib/firebase/firestore";
import { AnalyticsEvent, AnalyticsEventName, Product } from "@/lib/types";

type DateScope = "today" | "last7";

type RankedProduct = {
  key: string;
  name: string;
  slug?: string;
  category?: string;
  count: number;
};

const SUMMARY_EVENTS: Array<{ eventName: AnalyticsEventName; label: string }> = [
  { eventName: "storefront_visit", label: "Visits" },
  { eventName: "feed_view", label: "Feed views" },
  { eventName: "product_view", label: "Product views" },
  { eventName: "whatsapp_click", label: "WhatsApp clicks" }
];

function getScopeStart(scope: DateScope) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  if (scope === "last7") {
    start.setDate(start.getDate() - 6);
  }

  return start;
}

function getProductLabel(event: AnalyticsEvent, products: Product[]) {
  const product =
    products.find((item) => item.id === event.productId) ||
    products.find((item) => item.slug === event.productSlug);

  return {
    key: event.productId || event.productSlug || "unknown-product",
    name: product?.name || event.productSlug || "Unknown product",
    slug: product?.slug || event.productSlug,
    category: product?.categoryName || event.category
  };
}

function rankProducts(events: AnalyticsEvent[], products: Product[], eventName: AnalyticsEventName): RankedProduct[] {
  const ranked = new Map<string, RankedProduct>();

  events
    .filter((event) => event.eventName === eventName && (event.productId || event.productSlug))
    .forEach((event) => {
      const label = getProductLabel(event, products);
      const existing = ranked.get(label.key);

      ranked.set(label.key, {
        ...label,
        count: existing ? existing.count + 1 : 1
      });
    });

  return Array.from(ranked.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function RankedList({ items, emptyLabel }: { items: RankedProduct[]; emptyLabel: string }) {
  return (
    <div className="analytics-ranked-list">
      {items.map((item, index) => (
        <article key={item.key} className="analytics-ranked-item">
          <span className="analytics-rank">{index + 1}</span>
          <div className="analytics-ranked-copy">
            <strong>{item.name}</strong>
            <span>{item.category || item.slug || "Product activity"}</span>
          </div>
          <strong className="analytics-ranked-count">{item.count}</strong>
        </article>
      ))}
      {!items.length ? <div className="empty-state">{emptyLabel}</div> : null}
    </div>
  );
}

export function AnalyticsSummary() {
  const [scope, setScope] = useState<DateScope>("today");
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");

    let analyticsUnsubscribe: undefined | (() => void);
    let productsUnsubscribe: undefined | (() => void);

    try {
      analyticsUnsubscribe = subscribeToAnalyticsEvents(getScopeStart(scope), setEvents);
      productsUnsubscribe = subscribeToProducts(setProducts);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load analytics summary.";
      setError(message);
    }

    return () => {
      analyticsUnsubscribe?.();
      productsUnsubscribe?.();
    };
  }, [scope]);

  const stats = useMemo(
    () =>
      SUMMARY_EVENTS.map((summaryEvent) => ({
        label: summaryEvent.label,
        value: events.filter((event) => event.eventName === summaryEvent.eventName).length
      })),
    [events]
  );

  const topViewedProducts = useMemo(() => rankProducts(events, products, "product_view"), [events, products]);
  const topClickedProducts = useMemo(() => rankProducts(events, products, "whatsapp_click"), [events, products]);
  const scopeLabel = scope === "today" ? "today" : "last 7 days";

  return (
    <div className="dashboard-stack">
      <section className="panel-card">
        <div className="panel-header analytics-header">
          <div>
            <p className="eyebrow">Testing insights</p>
            <h1>Analytics summary</h1>
            <p className="form-intro">A quiet internal readout of visits, browsing, and WhatsApp intent from the public storefront.</p>
          </div>
          <div className="analytics-scope-toggle" aria-label="Analytics date scope">
            <button type="button" className={scope === "today" ? "active" : ""} onClick={() => setScope("today")}>
              Today
            </button>
            <button type="button" className={scope === "last7" ? "active" : ""} onClick={() => setScope("last7")}>
              Last 7 days
            </button>
          </div>
        </div>

        {error ? <div className="inline-error">{error}</div> : null}

        <div className="stats-grid analytics-stats">
          {stats.map((stat) => (
            <article key={stat.label} className="stat-card">
              <strong>{stat.value}</strong>
              <span>{stat.label} {scopeLabel}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="analytics-grid">
        <div className="panel-card analytics-list-panel">
          <div className="analytics-list-head">
            <p className="eyebrow">Product interest</p>
            <h2>Top viewed products</h2>
          </div>
          <RankedList items={topViewedProducts} emptyLabel={`Product views for ${scopeLabel} will appear here.`} />
        </div>

        <div className="panel-card analytics-list-panel">
          <div className="analytics-list-head">
            <p className="eyebrow">WhatsApp intent</p>
            <h2>Top WhatsApp-clicked products</h2>
          </div>
          <RankedList items={topClickedProducts} emptyLabel={`WhatsApp clicks for ${scopeLabel} will appear here.`} />
        </div>
      </section>
    </div>
  );
}
