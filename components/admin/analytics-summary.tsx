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

type ProductInsight = RankedProduct & {
  views: number;
  clicks: number;
};

type InsightBucket = {
  eyebrow: string;
  title: string;
  description: string;
  items: ProductInsight[];
  emptyLabel: string;
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
    category: product?.categoryName || event.category || (!product && (event.productId || event.productSlug) ? "Removed product" : undefined)
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

function buildProductInsights(events: AnalyticsEvent[], products: Product[]) {
  const aggregated = new Map<string, ProductInsight>();

  events
    .filter((event) => (event.eventName === "product_view" || event.eventName === "whatsapp_click") && (event.productId || event.productSlug))
    .forEach((event) => {
      const label = getProductLabel(event, products);
      const existing = aggregated.get(label.key);
      const next: ProductInsight = existing || {
        ...label,
        count: 0,
        views: 0,
        clicks: 0
      };

      if (event.eventName === "product_view") {
        next.views += 1;
      }

      if (event.eventName === "whatsapp_click") {
        next.clicks += 1;
      }

      next.count = next.views + next.clicks;
      aggregated.set(label.key, next);
    });

  return Array.from(aggregated.values()).sort(
    (a, b) => b.views - a.views || b.clicks - a.clicks || a.name.localeCompare(b.name)
  );
}

function InsightList({ items, emptyLabel, metricLabel }: { items: ProductInsight[]; emptyLabel: string; metricLabel: string }) {
  if (!items.length) {
    return <div className="empty-state">{emptyLabel}</div>;
  }

  function formatCount(value: number, singular: string, plural: string) {
    return `${value} ${value === 1 ? singular : plural}`;
  }

  return (
    <div className="analytics-insight-list">
      {items.map((item) => (
        <article key={item.key} className="analytics-insight-item">
          <div className="analytics-insight-copy">
            <strong>{item.name}</strong>
            <span>{item.category || item.slug || "Product activity"}</span>
          </div>
          <div className="analytics-insight-metrics" aria-label={`${item.name} metrics`}>
            <span>{formatCount(item.views, "view", "views")}</span>
            <span>{formatCount(item.clicks, "WhatsApp click", "WhatsApp clicks")}</span>
            <strong>{metricLabel === "views" ? "Views leader in this list" : "WhatsApp leader in this list"}</strong>
          </div>
        </article>
      ))}
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
  const productInsights = useMemo(() => buildProductInsights(events, products), [events, products]);
  const scopeLabel = scope === "today" ? "today" : "last 7 days";
  const insights = useMemo<InsightBucket[]>(
    () => [
      {
        eyebrow: "High interest",
        title: "Most viewed products",
        description: `Products drawing the strongest detail-page interest ${scope === "today" ? "today" : "during the last 7 days"}.`,
        items: productInsights.filter((item) => item.views > 0).slice(0, 3),
        emptyLabel: `High-interest products will appear here once there is a little more activity ${scope === "today" ? "today" : "during the last 7 days"}.`
      },
      {
        eyebrow: "Strong WhatsApp intent",
        title: "Most clicked into WhatsApp",
        description: `Products creating the clearest contact intent ${scope === "today" ? "today" : "during the last 7 days"}.`,
        items: productInsights.filter((item) => item.clicks > 0).sort((a, b) => b.clicks - a.clicks || b.views - a.views || a.name.localeCompare(b.name)).slice(0, 3),
        emptyLabel: `WhatsApp intent will show here once shoppers begin reaching out ${scope === "today" ? "today" : "during the last 7 days"}.`
      },
      {
        eyebrow: "Needs attention",
        title: "Viewed but not moving to chat",
        description: `Products with at least 2 views but low follow-through to WhatsApp ${scope === "today" ? "today" : "during the last 7 days"}.`,
        items: productInsights
          .filter((item) => item.views >= 2 && (item.clicks === 0 || item.clicks / item.views < 0.2))
          .sort((a, b) => b.views - a.views || a.clicks - b.clicks || a.name.localeCompare(b.name))
          .slice(0, 3),
        emptyLabel: `Nothing needs attention yet ${scope === "today" ? "today" : "during the last 7 days"}.`
      }
    ],
    [productInsights, scope]
  );

  return (
    <div className="dashboard-stack">
      <section className="panel-card">
        <div className="panel-header analytics-header">
          <div>
            <p className="eyebrow">Storefront insights</p>
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

      <section className="panel-card analytics-list-panel">
        <div className="analytics-section-head">
          <div className="analytics-list-head">
            <p className="eyebrow">Top products</p>
            <h2>Product interest at a glance</h2>
          </div>
          <p className="form-intro">The live leaderboards below stay focused on the current baseline: top viewed products and top WhatsApp-clicked products.</p>
        </div>
        <div className="analytics-grid">
          <div className="analytics-list-panel">
            <div className="analytics-list-head">
              <p className="eyebrow">Product interest</p>
              <h3>Top viewed products</h3>
            </div>
            <RankedList items={topViewedProducts} emptyLabel={`Top viewed products will appear here once people start browsing ${scopeLabel}.`} />
          </div>

          <div className="analytics-list-panel">
            <div className="analytics-list-head">
              <p className="eyebrow">WhatsApp intent</p>
              <h3>Top WhatsApp-clicked products</h3>
            </div>
            <RankedList items={topClickedProducts} emptyLabel={`Top WhatsApp-clicked products will appear here once people start reaching out ${scopeLabel}.`} />
          </div>
        </div>
      </section>

      <section className="panel-card analytics-list-panel">
        <div className="analytics-section-head">
          <div className="analytics-list-head">
            <p className="eyebrow">Insights v1</p>
            <h2>Simple business signals</h2>
          </div>
          <p className="form-intro">Read-only cues derived from the same aggregated analytics data already shown above.</p>
        </div>
        <div className="analytics-insights-grid">
          {insights.map((insight) => (
            <article key={insight.title} className="analytics-insight-card">
              <div className="analytics-list-head">
                <p className="eyebrow">{insight.eyebrow}</p>
                <h3>{insight.title}</h3>
                <p className="analytics-insight-description">{insight.description}</p>
              </div>
              <InsightList
                items={insight.items}
                emptyLabel={insight.emptyLabel}
                metricLabel={insight.eyebrow === "Strong WhatsApp intent" ? "clicks" : "views"}
              />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
