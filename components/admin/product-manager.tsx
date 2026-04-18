"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { removeProduct, subscribeToProducts } from "@/lib/firebase/firestore";
import { generateMinimalStatusImage } from "@/lib/status-image-minimal";
import { getTeamContactById } from "@/lib/team-contacts";
import { Product } from "@/lib/types";
import { buildProductPath, buildPublicProductUrl, formatCurrency, formatDate } from "@/lib/utils";

type ProductManagerProps = {
  actor: {
    uid: string;
    name: string;
    email: string;
  };
};

export function ProductManager({ actor }: ProductManagerProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [sortBy, setSortBy] = useState("updated_newest");
  const [copiedProductId, setCopiedProductId] = useState<string | null>(null);
  const [qrProduct, setQrProduct] = useState<Product | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [qrCodeLoading, setQrCodeLoading] = useState(false);
  const [qrCodeError, setQrCodeError] = useState("");
  const [statusImageProduct, setStatusImageProduct] = useState<Product | null>(null);
  const [statusImageDataUrl, setStatusImageDataUrl] = useState("");
  const [statusImageLoading, setStatusImageLoading] = useState(false);
  const [statusImageError, setStatusImageError] = useState("");
  const [statusImageRequestId, setStatusImageRequestId] = useState(0);
  const [statusImageRenderId, setStatusImageRenderId] = useState("");

  useEffect(() => {
    try {
      return subscribeToProducts(setProducts);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load products.";
      setError(message);
      return () => undefined;
    }
  }, []);

  async function handleDelete(product: Product) {
    const confirmed = window.confirm(`Delete ${product.name}?`);
    if (!confirmed) {
      return;
    }

    try {
      await removeProduct(product, actor);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete product.";
      setError(message);
    }
  }

  const categoryOptions = useMemo(
    () => Array.from(new Set(products.map((product) => product.categoryName).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const nextProducts = products.filter((product) => {
      const matchesQuery =
        !normalizedQuery ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.categoryName.toLowerCase().includes(normalizedQuery);
      const matchesCategory = categoryFilter === "all" || product.categoryName === categoryFilter;
      const matchesStock = stockFilter === "all" || product.stockStatus === stockFilter;
      const matchesFeatured = !featuredOnly || product.featured;

      return matchesQuery && matchesCategory && matchesStock && matchesFeatured;
    });

    nextProducts.sort((first, second) => {
      if (sortBy === "updated_oldest") {
        return (first.updatedAt?.getTime() ?? 0) - (second.updatedAt?.getTime() ?? 0);
      }

      if (sortBy === "price_low") {
        return first.price - second.price;
      }

      if (sortBy === "price_high") {
        return second.price - first.price;
      }

      return (second.updatedAt?.getTime() ?? 0) - (first.updatedAt?.getTime() ?? 0);
    });

    return nextProducts;
  }, [categoryFilter, featuredOnly, products, searchQuery, sortBy, stockFilter]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 || categoryFilter !== "all" || stockFilter !== "all" || featuredOnly || sortBy !== "updated_newest";

  function clearFilters() {
    setSearchQuery("");
    setCategoryFilter("all");
    setStockFilter("all");
    setFeaturedOnly(false);
    setSortBy("updated_newest");
  }

  async function handleCopyLink(product: Product) {
    try {
      const url = buildPublicProductUrl(product.slug, window.location.origin);
      await navigator.clipboard.writeText(url);
      setCopiedProductId(product.id);
      window.setTimeout(() => {
        setCopiedProductId((current) => (current === product.id ? null : current));
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to copy product link.";
      setError(message);
    }
  }

  useEffect(() => {
    if (!qrProduct) {
      setQrCodeDataUrl("");
      setQrCodeError("");
      setQrCodeLoading(false);
      return;
    }

    let cancelled = false;
    const qrUrl = buildPublicProductUrl(qrProduct.slug, window.location.origin);

    setQrCodeLoading(true);
    setQrCodeError("");

    QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
      color: {
        dark: "#1f1a14",
        light: "#fffdf8"
      }
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrCodeDataUrl(dataUrl);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setQrCodeError(err.message || "Unable to generate QR code.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setQrCodeLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qrProduct]);

  function handleDownloadQr() {
    if (!qrProduct || !qrCodeDataUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = qrCodeDataUrl;
    link.download = `${qrProduct.slug}-qr.png`;
    link.click();
  }

  useEffect(() => {
    if (!statusImageProduct || !statusImageRequestId) {
      setStatusImageDataUrl("");
      setStatusImageError("");
      setStatusImageLoading(false);
      return;
    }

    let cancelled = false;
    const productUrl = buildPublicProductUrl(statusImageProduct.slug, window.location.origin);

    setStatusImageLoading(true);
    setStatusImageError("");
    setStatusImageDataUrl("");

    generateMinimalStatusImage(statusImageProduct, productUrl, window.location.origin)
      .then((dataUrl) => {
        if (!cancelled) {
          setStatusImageDataUrl(dataUrl);
          setStatusImageRenderId(`${statusImageProduct.slug}-${Date.now()}`);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setStatusImageError(err.message || "Unable to generate the status image.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStatusImageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [statusImageProduct, statusImageRequestId]);

  function handleDownloadStatusImage() {
    if (!statusImageProduct || !statusImageDataUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = statusImageDataUrl;
    link.download = `${statusImageProduct.slug}-status.png`;
    link.click();
  }

  function handleOpenStatusImage(product: Product) {
    if (!product?.id || !product?.slug || !product?.name) {
      setStatusImageError("Unable to generate the status image for this product.");
      return;
    }

    setStatusImageError("");
    setStatusImageDataUrl("");
    setStatusImageRenderId("");
    setStatusImageRequestId(Date.now());
    setStatusImageProduct(product);
  }

  const preferredContact = selectedProduct
    ? getTeamContactById(
        selectedProduct.preferredContactId ?? selectedProduct.assignedContactId ?? selectedProduct.contactId
      )
    : undefined;

  return (
    <>
      <section className="panel-card">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Inventory</p>
            <h1>Product inventory</h1>
          </div>
          <Link href="/admin/products/new" className="primary-link">
            Add product
          </Link>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="manager-controls">
          <label className="manager-search">
            <span>Search products</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by product name or category"
            />
          </label>
          <div className="manager-filters">
            <label>
              <span>Category</span>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Stock status</span>
              <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
                <option value="all">All stock</option>
                <option value="In Stock">In Stock</option>
                <option value="Low Stock">Low Stock</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="updated_newest">Updated newest</option>
                <option value="updated_oldest">Updated oldest</option>
                <option value="price_low">Price low to high</option>
                <option value="price_high">Price high to low</option>
              </select>
            </label>
            <label className="checkbox-row manager-checkbox">
              <input
                type="checkbox"
                checked={featuredOnly}
                onChange={(event) => setFeaturedOnly(event.target.checked)}
              />
              <span>Featured only</span>
            </label>
            {hasActiveFilters ? (
              <button className="secondary-button manager-clear" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
        <div className="inventory-list">
          <div className="inventory-head" aria-hidden="true">
            <span>Product</span>
            <span>Price</span>
            <span>Status</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>

          {filteredProducts.map((product) => (
            <article key={product.id} className="inventory-row-card">
                <div className="inventory-product-cell">
                  <div className="product-row-main">
                    <div className="product-row-thumb">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          width={60}
                          height={60}
                          className="product-row-thumb-image"
                        />
                      ) : (
                        <div className="product-row-thumb-placeholder">No image</div>
                      )}
                    </div>
                    <div className="product-row-copy">
                      <div className="product-row-title">
                        <strong>{product.name}</strong>
                        {product.featured ? <span className="table-badge">Featured</span> : null}
                      </div>
                      <span>{product.categoryName}</span>
                    </div>
                  </div>
                </div>

                <div className="inventory-meta-cell inventory-price-cell">
                  <span className="inventory-meta-label">Price</span>
                  <strong>{formatCurrency(product.price, product.currency)}</strong>
                </div>

                <div className="inventory-meta-cell inventory-status-cell">
                  <span className="inventory-meta-label">Status</span>
                  <span
                    className={`status-pill ${
                      product.stockStatus === "In Stock"
                        ? "status-pill-in-stock"
                        : product.stockStatus === "Low Stock"
                          ? "status-pill-low-stock"
                          : "status-pill-out-of-stock"
                    }`}
                  >
                    {product.stockStatus}
                  </span>
                </div>

                <div className="inventory-meta-cell inventory-updated-cell">
                  <span className="inventory-meta-label">Updated</span>
                  <strong>{formatDate(product.updatedAt)}</strong>
                </div>

                <div className="inventory-actions-cell">
                  <div className="actions-inline">
                    <button className="secondary-link" type="button" onClick={() => setSelectedProduct(product)}>
                      View
                    </button>
                    <Link href={`/admin/products/${product.id}`} className="secondary-link">
                      Edit
                    </Link>
                    <details className="actions-menu">
                      <summary className="actions-menu-trigger" aria-label={`More actions for ${product.name}`}>
                        <span aria-hidden="true">•••</span>
                      </summary>
                      <div className="actions-menu-popover">
                        <Link href={buildProductPath(product.slug)} className="actions-menu-item" target="_blank" rel="noreferrer">
                          View product
                        </Link>
                        <button className="actions-menu-item" type="button" onClick={() => handleCopyLink(product)}>
                          {copiedProductId === product.id ? "Copied link" : "Copy link"}
                        </button>
                        <button className="actions-menu-item" type="button" onClick={() => setQrProduct(product)}>
                          Generate QR
                        </button>
                        <button className="actions-menu-item" type="button" onClick={() => handleOpenStatusImage(product)}>
                          Download status image
                        </button>
                        <button className="actions-menu-item actions-menu-item-danger" type="button" onClick={() => handleDelete(product)}>
                          Delete
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              </article>
          ))}

          {!products.length ? (
            <div className="empty-state">No products added yet. Your uploaded stock will appear here.</div>
          ) : null}

          {products.length && !filteredProducts.length ? (
            <div className="empty-state">
              No products found for the current search and filters.
              {hasActiveFilters ? (
                <>
                  {" "}
                  <button className="text-button inline-action" type="button" onClick={clearFilters}>
                    Clear filters
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {selectedProduct ? (
        <div className="contact-modal-backdrop" role="presentation" onClick={() => setSelectedProduct(null)}>
          <div
            className="product-view-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-view-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="contact-modal-header">
              <div>
                <p className="eyebrow">Product overview</p>
                <h3 id="product-view-title">{selectedProduct.name}</h3>
                <p>Read-only product details for a quick inventory check.</p>
              </div>
              <button
                className="contact-modal-close"
                type="button"
                aria-label="Close product preview"
                onClick={() => setSelectedProduct(null)}
              >
                ×
              </button>
            </div>
            <div className="product-view-grid">
              <div className="product-view-media">
                {selectedProduct.imageUrl ? (
                  <Image
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.name}
                    width={640}
                    height={420}
                    className="product-view-image"
                  />
                ) : (
                  <div className="product-view-placeholder">No image uploaded</div>
                )}
              </div>
              <div className="product-view-details">
                <div className="product-view-row">
                  <span>Category</span>
                  <strong>{selectedProduct.categoryName}</strong>
                </div>
                <div className="product-view-row">
                  <span>Price</span>
                  <strong>{formatCurrency(selectedProduct.price, selectedProduct.currency)}</strong>
                </div>
                <div className="product-view-row">
                  <span>Stock status</span>
                  <strong>{selectedProduct.stockStatus}</strong>
                </div>
                <div className="product-view-row">
                  <span>Condition</span>
                  <strong>{selectedProduct.condition}</strong>
                </div>
                <div className="product-view-row">
                  <span>Featured</span>
                  <strong>{selectedProduct.featured ? "Yes" : "No"}</strong>
                </div>
                <div className="product-view-row">
                  <span>Preferred WhatsApp contact</span>
                  <strong>
                    {preferredContact
                      ? `${preferredContact.name} (${preferredContact.label})`
                      : selectedProduct.contactName
                        ? selectedProduct.contactName
                        : "No preferred contact"}
                  </strong>
                </div>
              </div>
            </div>
            <div className="product-view-description">
              <span>Description</span>
              <p>{selectedProduct.description || "No description added."}</p>
            </div>
            <div className="form-actions">
              <Link href={`/admin/products/${selectedProduct.id}`} className="secondary-link">
                Edit product
              </Link>
              <button className="primary-button" type="button" onClick={() => setSelectedProduct(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {qrProduct ? (
        <div className="contact-modal-backdrop" role="presentation" onClick={() => setQrProduct(null)}>
          <div
            className="product-qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-qr-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="contact-modal-header">
              <div>
                <p className="eyebrow">Product QR</p>
                <h3 id="product-qr-title">{qrProduct.name}</h3>
                <p>Generate a shareable QR code that opens the live public product page.</p>
              </div>
              <button
                className="contact-modal-close"
                type="button"
                aria-label="Close product QR modal"
                onClick={() => setQrProduct(null)}
              >
                ×
              </button>
            </div>
            <div className="product-qr-layout">
              <div className="product-qr-preview">
                {qrCodeLoading ? <div className="product-qr-placeholder">Generating QR code...</div> : null}
                {!qrCodeLoading && qrCodeError ? <div className="inline-error">{qrCodeError}</div> : null}
                {!qrCodeLoading && !qrCodeError && qrCodeDataUrl ? (
                  <Image src={qrCodeDataUrl} alt={`QR code for ${qrProduct.name}`} width={320} height={320} className="product-qr-image" />
                ) : null}
              </div>
              <div className="product-qr-details">
                <div className="product-view-row">
                  <span>Public product URL</span>
                  <strong className="product-qr-url">{buildPublicProductUrl(qrProduct.slug, window.location.origin)}</strong>
                </div>
                <div className="product-view-row">
                  <span>Suggested use</span>
                  <strong>Place it on WhatsApp Status banners, product posters, or quick-scan story images.</strong>
                </div>
              </div>
            </div>
            <div className="form-actions">
              <button className="secondary-button" type="button" onClick={() => handleCopyLink(qrProduct)}>
                {copiedProductId === qrProduct.id ? "Copied link" : "Copy link"}
              </button>
              <button className="primary-button" type="button" onClick={handleDownloadQr} disabled={!qrCodeDataUrl || qrCodeLoading}>
                Download QR
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {statusImageProduct ? (
        <div className="contact-modal-backdrop" role="presentation" onClick={() => setStatusImageProduct(null)}>
          <div
            className="product-status-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-status-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="contact-modal-header">
              <div>
                <p className="eyebrow">Status-ready image</p>
                <h3 id="product-status-title">{statusImageProduct.name}</h3>
                <p>Generate a ready-made 9:16 WhatsApp Status image with the product QR already placed.</p>
              </div>
              <button
                className="contact-modal-close"
                type="button"
                aria-label="Close status image modal"
                onClick={() => setStatusImageProduct(null)}
              >
                ×
              </button>
            </div>
            <div className="product-status-layout">
              <div className="product-status-preview">
                {statusImageLoading ? <div className="product-qr-placeholder">Generating status image...</div> : null}
                {!statusImageLoading && statusImageError ? <div className="inline-error">{statusImageError}</div> : null}
                {!statusImageLoading && !statusImageError && statusImageDataUrl ? (
                  <Image
                    key={statusImageRenderId || statusImageDataUrl}
                    src={statusImageDataUrl}
                    alt={`Status-ready image for ${statusImageProduct.name}`}
                    width={324}
                    height={576}
                    className="product-status-image"
                    unoptimized
                  />
                ) : null}
              </div>
              <div className="product-qr-details">
                <div className="product-view-row">
                  <span>Public product URL</span>
                  <strong className="product-qr-url">{buildPublicProductUrl(statusImageProduct.slug, window.location.origin)}</strong>
                </div>
                <div className="product-view-row">
                  <span>Layout format</span>
                  <strong>9:16 WhatsApp Status image with QR in a quiet white panel for clean scanning.</strong>
                </div>
                <div className="product-view-row">
                  <span>Included content</span>
                  <strong>Product image, name, price, brand/category, CTA text, and the live product QR code.</strong>
                </div>
              </div>
            </div>
            <div className="form-actions">
              <button className="secondary-button" type="button" onClick={() => handleCopyLink(statusImageProduct)}>
                {copiedProductId === statusImageProduct.id ? "Copied link" : "Copy link"}
              </button>
              <button className="primary-button" type="button" onClick={handleDownloadStatusImage} disabled={!statusImageDataUrl || statusImageLoading}>
                Download status image
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
