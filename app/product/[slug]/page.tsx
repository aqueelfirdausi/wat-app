import { ProductDetailClient } from "@/components/product-detail-client";

type ProductPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;

  return <ProductDetailClient slug={slug} />;
}
