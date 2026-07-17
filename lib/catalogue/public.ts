import type { Category, Product, PublicCategory, PublicProduct } from "@/lib/types";

export function toPublicProduct(product: Product): PublicProduct {
  return {
    id: product.slug,
    name: product.name,
    slug: product.slug,
    description: product.description,
    brand: product.brand,
    preferredContactId: product.preferredContactId,
    categoryName: product.categoryName,
    price: product.price,
    currency: product.currency,
    condition: product.condition,
    stockStatus: product.stockStatus,
    featured: product.featured,
    storefrontVisible: product.storefrontVisible,
    feedVisible: product.feedVisible,
    sortPriority: product.sortPriority,
    imageUrl: product.imageUrl,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

export function toPublicCategory(category: Category): PublicCategory {
  return {
    id: category.slug,
    name: category.name,
    slug: category.slug
  };
}
