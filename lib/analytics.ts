"use client";

import { Product } from "@/lib/types";

type AnalyticsEventName = "storefront_visit" | "feed_view" | "product_view" | "whatsapp_click";
type AnalyticsContext = "storefront" | "catalog" | "feed" | "detail";

type AnalyticsEventInput = {
  eventName: AnalyticsEventName;
  context?: AnalyticsContext;
  product?: Product;
  dedupeKey?: string;
};

const SESSION_ID_STORAGE_KEY = "watapp-analytics-session-id";
const DEDUPE_STORAGE_PREFIX = "watapp-analytics-sent:";

function getSessionId() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const nextId =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_STORAGE_KEY);
    if (existing) {
      return existing;
    }

    window.sessionStorage.setItem(SESSION_ID_STORAGE_KEY, nextId);
  } catch {
    return nextId;
  }

  return nextId;
}

function hasSentDedupeKey(dedupeKey?: string) {
  if (!dedupeKey || typeof window === "undefined") {
    return false;
  }

  try {
    const storageKey = `${DEDUPE_STORAGE_PREFIX}${dedupeKey}`;
    if (window.sessionStorage.getItem(storageKey) === "true") {
      return true;
    }

    window.sessionStorage.setItem(storageKey, "true");
  } catch {
    return false;
  }

  return false;
}

export function trackAnalyticsEvent({ eventName, context, product, dedupeKey }: AnalyticsEventInput) {
  if (typeof window === "undefined" || hasSentDedupeKey(dedupeKey)) {
    return;
  }

  const payload = JSON.stringify({
    eventName,
    context,
    sessionId: getSessionId(),
    productId: product?.id,
    productSlug: product?.slug,
    category: product?.categoryName
  });

  const send = () => {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/analytics", blob)) {
        return;
      }
    }

    void fetch("/api/analytics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: payload,
      keepalive: true
    }).catch(() => undefined);
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(send, { timeout: 2000 });
    return;
  }

  globalThis.setTimeout(send, 0);
}
