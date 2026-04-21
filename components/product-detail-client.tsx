"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WhatsAppChooserButton } from "@/components/whatsapp-contact-chooser";
import { getStoreBrandById, resolveProductBrand } from "@/lib/brands";
import { fetchProductBySlug } from "@/lib/firebase/firestore";
import { Product } from "@/lib/types";
import {
  formatCurrency,
  getStockStatusClassName,
  getStockStatusLabel,
  getWhatsAppCtaHelper,
  isProductLowStock,
  isProductSoldOut
} from "@/lib/utils";

type ProductDetailClientProps = {
  slug: string;
};

export function ProductDetailClient({ slug }: ProductDetailClientProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    setLoading(true);
    setError("");

    fetchProductBySlug(slug)
      .then((nextProduct) => {
        if (!isMounted) {
          return;
        }

        setProduct(nextProduct);
        if (!nextProduct) {
          setError("This product link is no longer available.");
        }
      })
      .catch((err: Error) => {
        if (!isMounted) {
          return;
        }

        setError(err.message || "Unable to load this product.");
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [slug]);

  const storeBrand = product ? getStoreBrandById(resolveProductBrand(product)) : undefined;
  const isSoldOut = product ? isProductSoldOut(product) : false;
  const isLowStock = product ? isProductLowStock(product) : false;

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

      {loading ? <div className="panel-card product-detail-state">Loading product details...</div> : null}

      {!loading && error ? (
        <section className="panel-card product-detail-state">
          <p className="eyebrow">Product link</p>
          <h1>Product unavailable</h1>
          <p>{error}</p>
          <Link href="/" className="primary-link">
            Browse today&apos;s stock
          </Link>
        </section>
      ) : null}

      {!loading && product ? (
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
              <h1>{product.name}</h1>
              <p className="product-detail-price">{formatCurrency(product.price, product.currency)}</p>
              <div className="product-detail-pills">
                <span className={`stock-pill product-detail-stock ${getStockStatusClassName(product.stockStatus)}`}>
                  {getStockStatusLabel(product.stockStatus)}
                </span>
                <span className="product-tag product-tag-condition">{product.condition}</span>
                {product.featured ? <span className="product-tag product-tag-featured">Featured</span> : null}
                {isLowStock ? <span className="product-tag product-tag-low-stock">Almost gone</span> : null}
              </div>
              {isSoldOut ? (
                <p className="product-detail-availability-message product-detail-availability-message-sold-out">
                  Currently sold out. You can still ask on WhatsApp if it may return or if there is a similar option.
                </p>
              ) : isLowStock ? (
                <p className="product-detail-availability-message product-detail-availability-message-low-stock">
                  Low stock today. A quick WhatsApp check can confirm before you order.
                </p>
              ) : null}
              <p className="product-detail-description">
                {product.description || "Ask on WhatsApp for the latest details, availability, and ordering information."}
              </p>
            </div>

            <div className="product-detail-actions">
              <WhatsAppChooserButton
                product={product}
                className={isSoldOut ? "secondary-button product-detail-button product-detail-button-muted" : "whatsapp-button product-detail-button"}
              />
              <p className="product-detail-note">{getWhatsAppCtaHelper(product)}</p>
            </div>
          </article>
        </section>
      ) : null}
    </main>
  );
}
