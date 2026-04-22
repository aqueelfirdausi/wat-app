"use client";

import Image from "next/image";
import Link from "next/link";
import { WhatsAppChooserButton } from "@/components/whatsapp-contact-chooser";
import { getStoreBrandById, resolveProductBrand } from "@/lib/brands";
import { Product } from "@/lib/types";
import {
  buildProductPath,
  formatCurrency,
  getStockStatusClassName,
  getStockStatusLabel,
  getProductSupportingLine,
  isFreshProduct,
  isNewArrival,
  isProductSoldOut
} from "@/lib/utils";

type MobileFeedCardProps = {
  product: Product;
};

export function MobileFeedCard({ product }: MobileFeedCardProps) {
  const storeBrand = getStoreBrandById(resolveProductBrand(product));
  const isFreshToday = isFreshProduct(product);
  const isRecentlyAdded = !isFreshToday && isNewArrival(product);
  const isSoldOut = isProductSoldOut(product);
  const supportingLine = getProductSupportingLine(product);
  const secondaryBadge = product.featured ? "Featured" : isFreshToday ? "Fresh today" : isRecentlyAdded ? "New" : null;

  return (
    <article className={isSoldOut ? "mobile-feed-card mobile-feed-card-sold-out" : "mobile-feed-card"}>
      <Link href={buildProductPath(product.slug)} className="mobile-feed-link">
        <div className="mobile-feed-media">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, 560px"
              className="mobile-feed-image"
            />
          ) : (
            <div className="mobile-feed-image mobile-feed-image-fallback">{product.categoryName || "WAT"}</div>
          )}
          <div className="mobile-feed-overlay" />
          <div className="mobile-feed-topline">
            <span className={`stock-pill ${getStockStatusClassName(product.stockStatus)}`}>
              {getStockStatusLabel(product.stockStatus)}
            </span>
          </div>
        </div>

        <div className="mobile-feed-body">
          <div className="mobile-feed-meta">
            {storeBrand ? <span className="product-brand-line">{storeBrand.name}</span> : null}
            <span className="product-category-line">{product.categoryName}</span>
            {secondaryBadge ? <span className="mobile-feed-accent-chip mobile-feed-accent-chip-inline">{secondaryBadge}</span> : null}
          </div>
          <div className="mobile-feed-copy">
            <h3>{product.name}</h3>
            <div className="mobile-feed-price-row">
              <p className="mobile-feed-price">{formatCurrency(product.price, product.currency)}</p>
              <span className="mobile-feed-condition">{product.condition}</span>
            </div>
            <p className="mobile-feed-supporting">{supportingLine}</p>
          </div>
        </div>
      </Link>

      <div className="mobile-feed-actions">
        <WhatsAppChooserButton
          product={product}
          className={isSoldOut ? "secondary-button mobile-feed-whatsapp mobile-feed-whatsapp-muted" : "whatsapp-button mobile-feed-whatsapp"}
        />
        <Link href={buildProductPath(product.slug)} className="secondary-link mobile-feed-details">
          View details
        </Link>
      </div>
    </article>
  );
}
