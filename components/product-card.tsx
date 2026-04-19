"use client";

import Image from "next/image";
import Link from "next/link";
import { getStoreBrandById, resolveProductBrand } from "@/lib/brands";
import { Product } from "@/lib/types";
import { buildProductPath, formatCurrency, isFreshProduct, isNewArrival } from "@/lib/utils";
import { WhatsAppChooserButton } from "@/components/whatsapp-contact-chooser";

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  const resolvedBrand = resolveProductBrand(product);
  const storeBrand = getStoreBrandById(resolvedBrand);
  const isFreshToday = isFreshProduct(product);
  const isRecentlyAdded = !isFreshToday && isNewArrival(product);

  return (
    <article className="product-card">
      <Link href={buildProductPath(product.slug)} className="product-card-link">
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
            {isFreshToday ? <span className="product-tag product-tag-fresh">Fresh today</span> : null}
            {!isFreshToday && isRecentlyAdded ? <span className="product-tag product-tag-new">New</span> : null}
            <span className="product-tag product-tag-condition">{product.condition}</span>
            <span className={`product-tag ${product.featured ? "product-tag-featured" : "product-tag-availability"}`}>
              {product.featured ? "Featured" : "Ready today"}
            </span>
          </div>
        </div>
      </Link>
      <div className="product-card-actions">
        <WhatsAppChooserButton product={product} />
      </div>
    </article>
  );
}
