import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "@/components/product-detail-client";
import { fetchProductMetadataBySlug } from "@/lib/firebase/firestore-server";
import { buildMetadataUrl, buildProductMetadataTitle } from "@/lib/metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProductPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  // Site-level fallback image — always available from app/opengraph-image.tsx.
  const siteImageUrl = buildMetadataUrl("/opengraph-image");

  // Returned when the product cannot be found OR when the fetch throws.
  // Must have at minimum a title, description, and og:image so crawlers
  // never see a blank preview card.
  const siteFallback: Metadata = {
    title: "WAT App",
    description: "Browse today's live stock",
    openGraph: {
      title: "WAT App",
      description: "Browse today's live stock",
      siteName: "WAT App",
      type: "website",
      images: [{ url: siteImageUrl, width: 1200, height: 630, alt: "WAT App" }]
    },
    twitter: {
      card: "summary_large_image",
      title: "WAT App",
      description: "Browse today's live stock",
      images: [siteImageUrl]
    }
  };

  try {
    const { slug } = await params;
    // includeHidden: true — fetch metadata even when storefrontVisible is false
    // so hidden products still produce valid OG tags. The page component uses
    // the same function without this flag and calls notFound() for hidden items.
    const product = await fetchProductMetadataBySlug(slug, { revalidate: false, includeHidden: true });
    const productUrl = buildMetadataUrl(`/product/${slug}`);

    if (!product) {
      return {
        title: "Product unavailable | WAT App",
        description: "This product link is no longer available.",
        robots: {
          index: false,
          follow: false,
          googleBot: {
            index: false,
            follow: false,
            noimageindex: true
          }
        },
        alternates: {
          canonical: productUrl
        },
        openGraph: {
          title: "Product unavailable | WAT App",
          description: "This product link is no longer available.",
          url: productUrl,
          siteName: "WAT App",
          type: "website",
          images: [{ url: siteImageUrl, width: 1200, height: 630, alt: "WAT App" }]
        },
        twitter: {
          card: "summary_large_image",
          title: "Product unavailable | WAT App",
          description: "This product link is no longer available.",
          images: [siteImageUrl]
        }
      };
    }

    const title = buildProductMetadataTitle(product.name);

    // "Rs 4,500 · In stock" — price + stock status
    const priceStr = new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency: product.currency || "PKR",
      maximumFractionDigits: 0
    }).format(product.price);
    const stockLabel =
      product.stockStatus === "in_stock"
        ? "In stock"
        : product.stockStatus === "low_stock"
          ? "Low stock"
          : product.stockStatus === "sold_out"
            ? "Sold out"
            : "Available";
    const description = `${priceStr} · ${stockLabel}`;

    // TEMP TEST: hardcode og:image to static site image to isolate whether
    // the proxy URL is causing WhatsApp preview failures.
    const ogImage = "https://watapp.pk/opengraph-image";

    return {
      title,
      description,
      alternates: {
        canonical: productUrl
      },
      openGraph: {
        title,
        description,
        url: productUrl,
        siteName: "WAT App",
        type: "website",
        images: [{ url: ogImage, width: 1200, height: 630, alt: product.name }]
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogImage]
      }
    };
  } catch {
    // fetchProductMetadataBySlug threw (network error, Firestore timeout,
    // cold-start timeout, etc.). Return a minimal but valid OG response so
    // crawlers always get something meaningful instead of a blank card.
    return siteFallback;
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await fetchProductMetadataBySlug(slug, { revalidate: false });

  if (!product) {
    notFound();
  }

  return <ProductDetailClient slug={slug} />;
}
