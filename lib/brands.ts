import { Product, ProductBrand } from "@/lib/types";

export type StoreBrand = {
  id: ProductBrand;
  name: string;
  logo: string;
  tagline: string;
  description: string;
  categoryNames: string[];
  accentClassName: string;
};

export const STORE_BRANDS: StoreBrand[] = [
  {
    id: "univercell",
    name: "UniverCell PK",
    logo: "/branding/univercell-logo.png",
    tagline: "Mobiles and everyday tech",
    description: "Latest mobiles, slightly used phones, accessories, and power banks updated for fast WhatsApp buying.",
    categoryNames: ["Mobiles", "Slightly Used", "Accessories", "Power Banks"],
    accentClassName: "brand-card-univercell"
  },
  {
    id: "eko",
    name: "EKO Fragrances",
    logo: "/branding/eko-logo.png",
    tagline: "Inspired perfumes",
    description: "Cleanly presented inspired fragrance drops inside the same WAT App daily stock flow.",
    categoryNames: ["Perfumes"],
    accentClassName: "brand-card-eko"
  }
];

export function inferBrandFromCategory(categoryName: string): ProductBrand | undefined {
  const normalizedCategory = categoryName.trim().toLowerCase();

  const matchedBrand = STORE_BRANDS.find((brand) =>
    brand.categoryNames.some((name) => name.toLowerCase() === normalizedCategory)
  );

  return matchedBrand?.id;
}

export function resolveProductBrand(product: Pick<Product, "brand" | "categoryName">): ProductBrand | undefined {
  return product.brand ?? inferBrandFromCategory(product.categoryName);
}

export function getStoreBrandById(brandId?: ProductBrand) {
  return STORE_BRANDS.find((brand) => brand.id === brandId);
}
