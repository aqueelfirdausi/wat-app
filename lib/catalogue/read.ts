import "server-only";

import type { BackendMode } from "@/lib/backend/mode";
import { getServerBackendMode } from "@/lib/backend/server";
import {
  getAppwriteProductBySlug,
  listAppwriteCategories,
  listAppwriteProducts
} from "@/lib/appwrite/read";
import {
  fetchProductMetadataBySlug,
  type ProductMetadataRecord
} from "@/lib/firebase/firestore-server";
import type { PublicCategory, PublicProduct } from "@/lib/types";

export type CatalogueReadDependencies = {
  listAppwriteProducts(): Promise<PublicProduct[]>;
  listAppwriteCategories(): Promise<PublicCategory[]>;
  getAppwriteProductBySlug(slug: string): Promise<PublicProduct | null>;
  getFirebaseProductBySlug(slug: string): Promise<ProductMetadataRecord | null>;
};

const defaultDependencies: CatalogueReadDependencies = {
  listAppwriteProducts,
  listAppwriteCategories,
  getAppwriteProductBySlug,
  getFirebaseProductBySlug: (slug) =>
    fetchProductMetadataBySlug(slug, { revalidate: false })
};

function firebaseMetadataToPublicProduct(product: ProductMetadataRecord): PublicProduct | null {
  const brand =
    product.brand === "univercell" || product.brand === "eko"
      ? product.brand
      : undefined;
  const condition =
    product.condition === "New" ||
    product.condition === "Like New" ||
    product.condition === "Used"
      ? product.condition
      : null;
  const stockStatus =
    product.stockStatus === "in_stock" ||
    product.stockStatus === "low_stock" ||
    product.stockStatus === "sold_out"
      ? product.stockStatus
      : null;

  if (
    !product.slug ||
    !product.name ||
    !product.categoryName ||
    !condition ||
    !stockStatus ||
    !Number.isFinite(product.price)
  ) {
    return null;
  }

  return {
    id: product.slug,
    name: product.name,
    slug: product.slug,
    description: product.description,
    brand,
    categoryName: product.categoryName,
    price: product.price,
    currency: product.currency,
    condition,
    stockStatus,
    featured: product.featured,
    storefrontVisible: true,
    feedVisible: product.feedVisible,
    sortPriority: 0,
    imageUrl: product.imageUrl,
    createdAt: null,
    updatedAt: null
  };
}

export async function loadPublicCatalogue(
  mode: BackendMode = getServerBackendMode(),
  dependencies: CatalogueReadDependencies = defaultDependencies
) {
  if (mode === "firebase") {
    return {
      mode,
      products: [] as PublicProduct[],
      categories: [] as PublicCategory[]
    };
  }

  const [products, categories] = await Promise.all([
    dependencies.listAppwriteProducts(),
    dependencies.listAppwriteCategories()
  ]);

  return { mode, products, categories };
}

export async function getPublicProductBySlug(
  slug: string,
  mode: BackendMode = getServerBackendMode(),
  dependencies: CatalogueReadDependencies = defaultDependencies
) {
  if (!slug.trim()) {
    return null;
  }

  if (mode === "appwrite") {
    return dependencies.getAppwriteProductBySlug(slug);
  }

  const product = await dependencies.getFirebaseProductBySlug(slug);
  return product?.storefrontVisible ? firebaseMetadataToPublicProduct(product) : null;
}
