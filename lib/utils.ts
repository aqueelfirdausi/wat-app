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
