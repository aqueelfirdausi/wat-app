"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { WhatsAppChooserButton } from "@/components/whatsapp-contact-chooser";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { getStoreBrandById, resolveProductBrand } from "@/lib/brands";
import { PublicProduct } from "@/lib/types";
import {
  formatCurrency,
  getProductAvailabilityMessage,
  getProductSupportingLine,
  getStockStatusClassName,
  getStockStatusLabel,
  getWhatsAppCtaLabel,
  getWhatsAppCtaHelper,
  isProductLowStock,
  isProductSoldOut
} from "@/lib/utils";

type ProductDetailClientProps = {
  product: PublicProduct;
};

export function ProductDetailClient({ product }: ProductDetailClientProps) {
  useEffect(() => {
    trackAnalyticsEvent({
      eventName: "product_view",
      context: "detail",
      product,
      dedupeKey: `product_view:${product.id}`
    });
  }, [product]);

  const storeBrand = getStoreBrandById(resolveProductBrand(product));
  const isSoldOut = isProductSoldOut(product);
  const isLowStock = isProductLowStock(product);
  const continuityLine = getProductSupportingLine(product, 96);
  const ctaHeading = getWhatsAppCtaLabel(product);

  return (
    <main className="public-shell">
      <header className="platform-header">
        <div className="platform-mark">
          <div>
            <p className="platform-kicker">WAT App</p>
            <strong>What&apos;s Available Today</strong>
          </div>
        </div>
        <Link href="/" className="secondary-link">
          Back to storefront
        </Link>
      </header>

      <section className="product-detail-layout">
          <div className="product-detail-media-card">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                width={880}
                height={880}
                className="product-detail-image"
                priority
              />
            ) : (
              <div className="product-detail-image-fallback">{product.categoryName || "WAT"}</div>
            )}
          </div>

          <article className="panel-card product-detail-card">
            <div className="product-detail-copy">
              <div className="product-meta">
                {storeBrand ? <span className="product-brand-line">{storeBrand.name}</span> : null}
                <span className="product-category-line">{product.categoryName}</span>
              </div>
              <div className="product-detail-heading">
                <h1>{product.name}</h1>
                <div className="product-detail-price-block" aria-label="Price">
                  <span className="product-detail-price-label">Today&apos;s price</span>
                  <p className="product-detail-price">{formatCurrency(product.price, product.currency)}</p>
                </div>
                {continuityLine ? <p className="product-detail-supporting">{continuityLine}</p> : null}
              </div>

              <div className="product-detail-facts" aria-label="Product summary">
                <section className="product-detail-fact-card">
                  <p className="product-detail-fact-label">Availability</p>
                  <div className="product-detail-pills">
                    <span className={`stock-pill product-detail-stock ${getStockStatusClassName(product.stockStatus)}`}>
                      {getStockStatusLabel(product.stockStatus)}
                    </span>
                    {isLowStock ? <span className="product-tag product-tag-low-stock">Almost gone</span> : null}
                  </div>
                  <p
                    className={`product-detail-availability-message ${
                      isSoldOut
                        ? "product-detail-availability-message-sold-out"
                        : isLowStock
                          ? "product-detail-availability-message-low-stock"
                          : "product-detail-availability-message-in-stock"
                    }`}
                  >
                    {getProductAvailabilityMessage(product)}
                  </p>
                </section>

                <section className="product-detail-fact-card">
                  <p className="product-detail-fact-label">Condition</p>
                  <div className="product-detail-pills">
                    <span className="product-tag product-tag-condition">{product.condition}</span>
                    {product.featured ? <span className="product-tag product-tag-featured">Featured</span> : null}
                  </div>
                  <p className="product-detail-fact-note">
                    Clean product details, posted price, and direct WhatsApp support keep this listing easy to verify quickly.
                  </p>
                </section>
              </div>

              <section className="product-detail-description-block" aria-label="Product description">
                <p className="product-detail-section-label">What to know</p>
                <p className="product-detail-description">
                  {product.description || "Ask on WhatsApp for the latest details, availability, and ordering information."}
                </p>
              </section>
            </div>

            <div className="product-detail-actions">
              <div className="product-detail-actions-copy">
                <p className="product-detail-section-label">Continue from the feed</p>
                <h2>{ctaHeading}</h2>
                <p className="product-detail-note">{getWhatsAppCtaHelper(product)}</p>
              </div>
              <WhatsAppChooserButton
                product={product}
                analyticsContext="detail"
                className={isSoldOut ? "secondary-button product-detail-button product-detail-button-muted" : "whatsapp-button product-detail-button"}
              />
              <div className="product-detail-trust-list" aria-label="Buying support">
                <span className="product-detail-trust-item">Choose the right team member</span>
                <span className="product-detail-trust-item">Confirm stock before ordering</span>
                <span className="product-detail-trust-item">Get help with similar options</span>
              </div>
            </div>
          </article>
      </section>
    </main>
  );
}
