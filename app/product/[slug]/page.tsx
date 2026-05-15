import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "@/components/product-detail-client";
import { fetchProductMetadataBySlug } from "@/lib/firebase/firestore-server";
import { buildMetadataUrl, buildProductMetadataTitle, getAbsolutePublicImageUrl } from "@/lib/metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProductPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProductMetadataBySlug(slug, { revalidate: false });
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
        type: "website"
      },
      twitter: {
        card: "summary",
        title: "Product unavailable | WAT App",
        description: "This product link is no longer available."
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

  // Use the product's own image URL directly (already an absolute https:// URL)
  const imageUrl = getAbsolutePublicImageUrl(product.imageUrl);

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
      ...(imageUrl
        ? { images: [{ url: imageUrl, alt: product.name }] }
        : {})
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {})
    }
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await fetchProductMetadataBySlug(slug, { revalidate: false });

  if (!product) {
    notFound();
  }

  return <ProductDetailClient slug={slug} />;
}
