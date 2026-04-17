import type { Metadata } from "next";
import { ProductDetailClient } from "@/components/product-detail-client";
import { fetchProductMetadataBySlug } from "@/lib/firebase/firestore-server";
import { buildMetadataUrl, buildProductMetaDescription } from "@/lib/metadata";

type ProductPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProductMetadataBySlug(slug);
  const productUrl = buildMetadataUrl(`/product/${slug}`);

  if (!product) {
    return {
      title: "Product unavailable | WAT App",
      description: "This product link is no longer available.",
      alternates: {
        canonical: productUrl
      },
      openGraph: {
        title: "Product unavailable | WAT App",
        description: "This product link is no longer available.",
        url: productUrl,
        type: "website",
        images: [
          {
            url: buildMetadataUrl(`/product/${slug}/opengraph-image`),
            width: 1200,
            height: 630,
            alt: "WAT App product preview"
          }
        ]
      },
      twitter: {
        card: "summary_large_image",
        title: "Product unavailable | WAT App",
        description: "This product link is no longer available.",
        images: [buildMetadataUrl(`/product/${slug}/opengraph-image`)]
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

  const imageUrl = product.imageUrl || buildMetadataUrl(`/product/${slug}/opengraph-image`);

  return {
    title: `${product.name} | WAT App`,
    description,
    alternates: {
      canonical: productUrl
    },
    openGraph: {
      title: product.name,
      description,
      url: productUrl,
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
      title: product.name,
      description,
      images: [imageUrl]
    }
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;

  return <ProductDetailClient slug={slug} />;
}
