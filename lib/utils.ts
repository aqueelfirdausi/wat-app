import type { Product } from "@/lib/types";

export function normalizeStockStatus(value: unknown): Product["stockStatus"] {
  if (typeof value !== "string") {
    return "in_stock";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "low_stock" || normalized === "low stock") {
    return "low_stock";
  }

  if (
    normalized === "sold_out" ||
    normalized === "sold out" ||
    normalized === "out_of_stock" ||
    normalized === "out of stock"
  ) {
    return "sold_out";
  }

  return "in_stock";
}

export function getStockStatusLabel(status: Product["stockStatus"]) {
  switch (status) {
    case "low_stock":
      return "Low stock";
    case "sold_out":
      return "Sold out";
    default:
      return "In stock";
  }
}

export function getStockStatusClassName(status: Product["stockStatus"]) {
  switch (status) {
    case "low_stock":
      return "stock-low-stock";
    case "sold_out":
      return "stock-sold-out";
    default:
      return "stock-in-stock";
  }
}

export function isProductSoldOut(product: Pick<Product, "stockStatus">) {
  return normalizeStockStatus(product.stockStatus) === "sold_out";
}

export function isProductLowStock(product: Pick<Product, "stockStatus">) {
  return normalizeStockStatus(product.stockStatus) === "low_stock";
}

export function formatCurrency(amount: number, currency = "PKR") {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatDate(value?: Date | null) {
  if (!value) {
    return "Just now";
  }

  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

export function slugify(input: string) {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

export function buildWhatsAppLink(
  productName: string,
  price: number,
  condition: string,
  options?: {
    phone?: string;
    contactName?: string;
  }
) {
  const phone = options?.phone ?? process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
  const contactLine = options?.contactName ? ` for ${options.contactName}` : "";
  const message = encodeURIComponent(
    `Hi, I'm interested in "${productName}" (${condition}) listed at ${formatCurrency(price)}. Is it available today${contactLine}?`
  );

  return `https://wa.me/${phone}?text=${message}`;
}

export function buildProductPath(slug: string) {
  return `/product/${slug}`;
}

export function buildAbsoluteUrl(path: string, origin?: string) {
  const normalizedOrigin =
    origin?.trim() ||
    (typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL?.trim()) ||
    "";

  if (!normalizedOrigin) {
    return path;
  }

  return new URL(path, normalizedOrigin).toString();
}

export function buildProductUrl(slug: string, origin?: string) {
  return buildAbsoluteUrl(buildProductPath(slug), origin);
}

export function buildPublicProductUrl(slug: string, currentOrigin?: string) {
  const preferredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || currentOrigin;
  return buildProductUrl(slug, preferredOrigin);
}

export function parseFirebaseDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }

  return null;
}

export function getProductFreshnessDate(product: Product) {
  return product.updatedAt ?? product.createdAt ?? null;
}

export function isFreshProduct(product: Product, now = new Date()) {
  const freshnessDate = getProductFreshnessDate(product);
  if (!freshnessDate) {
    return false;
  }

  return (
    freshnessDate.getFullYear() === now.getFullYear() &&
    freshnessDate.getMonth() === now.getMonth() &&
    freshnessDate.getDate() === now.getDate()
  );
}

export function isNewToday(product: Product, now = new Date()) {
  const sourceDate = product.createdAt ?? getProductFreshnessDate(product);
  if (!sourceDate) {
    return false;
  }

  return (
    sourceDate.getFullYear() === now.getFullYear() &&
    sourceDate.getMonth() === now.getMonth() &&
    sourceDate.getDate() === now.getDate()
  );
}

export function isNewArrival(product: Product, now = new Date()) {
  const sourceDate = product.createdAt ?? getProductFreshnessDate(product);
  if (!sourceDate) {
    return false;
  }

  return now.getTime() - sourceDate.getTime() <= 1000 * 60 * 60 * 72;
}

export function compareProductsByFreshness(a: Product, b: Product) {
  const aTime = getProductFreshnessDate(a)?.getTime() ?? 0;
  const bTime = getProductFreshnessDate(b)?.getTime() ?? 0;
  return bTime - aTime;
}

export function compareProductsForStorefront(a: Product, b: Product) {
  const featuredDelta = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
  if (featuredDelta !== 0) {
    return featuredDelta;
  }

  const priorityDelta = (b.sortPriority ?? 0) - (a.sortPriority ?? 0);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const freshnessDelta = compareProductsByFreshness(a, b);
  if (freshnessDelta !== 0) {
    return freshnessDelta;
  }

  return a.name.localeCompare(b.name);
}
