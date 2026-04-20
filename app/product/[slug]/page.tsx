import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "@/components/product-detail-client";
import { fetchProductMetadataBySlug } from "@/lib/firebase/firestore-server";
import { buildMetadataUrl, buildProductMetaDescription, buildProductMetadataImageUrl, buildProductMetadataTitle } from "@/lib/metadata";

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

  const description = buildProductMetaDescription({
    categoryName: product.categoryName,
    condition: product.condition,
    price: product.price,
    currency: product.currency,
    description: product.description
  });

  const title = buildProductMetadataTitle(product.name);
  const imageUrl = buildProductMetadataImageUrl(slug, product.imageUrl);

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
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: product.name
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl]
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
