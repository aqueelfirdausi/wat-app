"use client";

import Image from "next/image";
import { getStoreBrandById, resolveProductBrand } from "@/lib/brands";
import { Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { WhatsAppChooserButton } from "@/components/whatsapp-chooser-button";

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  const resolvedBrand = resolveProductBrand(product);
  const storeBrand = getStoreBrandById(resolvedBrand);

  return (
    <article className="product-card">
      <div className="product-image-wrap">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="product-image"
          />
        ) : (
          <div className="product-image product-image-fallback">{product.categoryName || "WAT"}</div>
        )}
        <span className={`stock-pill stock-${product.stockStatus.toLowerCase().replace(/\s+/g, "-")}`}>
          {product.stockStatus}
        </span>
      </div>
      <div className="product-card-body">
        <div className="product-meta">
          {storeBrand ? <span className="product-brand-line">{storeBrand.name}</span> : null}
          <span className="product-category-line">{product.categoryName}</span>
        </div>
        <h3>{product.name}</h3>
        <p className="product-price">{formatCurrency(product.price, product.currency)}</p>
        <div className="product-tags">
          <span className="product-tag product-tag-condition">{product.condition}</span>
          <span className={`product-tag ${product.featured ? "product-tag-featured" : "product-tag-availability"}`}>
            {product.featured ? "Featured" : "Ready today"}
          </span>
        </div>
        <WhatsAppChooserButton product={product} />
      </div>
    </article>
  );
}
