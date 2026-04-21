const DEFAULT_APP_TITLE = "WAT App";
const DEFAULT_APP_DESCRIPTION = "Daily live products from WhatsApp Status";
const LOCAL_FALLBACK_APP_URL = "http://localhost:3000";

export function getPublicAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || LOCAL_FALLBACK_APP_URL;
}

export function getMetadataBase() {
  const appUrl = getPublicAppUrl();

  if (!appUrl) {
    return undefined;
  }

  try {
    return new URL(appUrl);
  } catch {
    return undefined;
  }
}

export function buildMetadataUrl(path = "/") {
  const base = getPublicAppUrl();
  return base ? new URL(path, `${base}/`).toString() : path;
}

export function getAbsolutePublicImageUrl(imageUrl?: string) {
  const trimmedImageUrl = imageUrl?.trim();

  if (!trimmedImageUrl) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(trimmedImageUrl);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return undefined;
    }

    return parsedUrl.toString();
  } catch {
    return undefined;
  }
}

export function getDefaultMeta() {
  return {
    title: DEFAULT_APP_TITLE,
    description: DEFAULT_APP_DESCRIPTION
  };
}

export function buildProductMetadataTitle(name: string) {
  const trimmedName = name.trim();
  return trimmedName ? `${trimmedName} | ${DEFAULT_APP_TITLE}` : DEFAULT_APP_TITLE;
}

export function buildProductMetaDescription(input: {
  categoryName?: string;
  condition?: string;
  price?: number;
  currency?: string;
  description?: string;
}) {
  const summary = input.description?.trim();

  if (summary) {
    return summary.length > 160 ? `${summary.slice(0, 157)}...` : summary;
  }

  const category = input.categoryName ? `${input.categoryName}` : "Live product";
  const condition = input.condition ? `${input.condition}` : "Available today";
  const price =
    typeof input.price === "number" && Number.isFinite(input.price)
      ? new Intl.NumberFormat("en-PK", {
          style: "currency",
          currency: input.currency || "PKR",
          maximumFractionDigits: 0
        }).format(input.price)
      : "Price on request";

  return `${category} - ${condition} - ${price}`;
}

export function buildProductMetadataImageUrl(slug: string) {
  return buildMetadataUrl(`/product/${slug}/opengraph-image`);
}
