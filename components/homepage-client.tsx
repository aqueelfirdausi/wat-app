"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { FirebaseStatus } from "@/components/firebase-status";
import { ProductCard } from "@/components/product-card";
import { STORE_BRANDS, resolveProductBrand } from "@/lib/brands";
import { fetchCategories, fetchProducts, subscribeToCategories, subscribeToProducts } from "@/lib/firebase/firestore";
import { Category, Product } from "@/lib/types";

export function HomepageClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let productsUnsubscribe: undefined | (() => void);
    let categoriesUnsubscribe: undefined | (() => void);

    fetchProducts()
      .then(setProducts)
      .catch((err: Error) => setError(err.message));

    fetchCategories()
      .then(setCategories)
      .catch((err: Error) => setError(err.message));

    try {
      productsUnsubscribe = subscribeToProducts(setProducts);
      categoriesUnsubscribe = subscribeToCategories(setCategories);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to connect to Firebase.";
      setError(message);
    }

    return () => {
      productsUnsubscribe?.();
      categoriesUnsubscribe?.();
    };
  }, []);

  const filteredProducts = useMemo(() => {
    if (activeCategory === "All") {
      return products;
    }

    return products.filter((product) => product.categoryName === activeCategory);
  }, [activeCategory, products]);

  const featuredProducts = useMemo(() => filteredProducts.filter((product) => product.featured).slice(0, 4), [filteredProducts]);
  const latestProducts = useMemo(() => filteredProducts.slice(0, 8), [filteredProducts]);
  const liveProductCount = useMemo(() => products.filter((item) => item.stockStatus === "In Stock").length, [products]);
  const readyTodayCount = useMemo(() => products.filter((item) => item.stockStatus !== "Out of Stock").length, [products]);

  const brandCards = useMemo(
    () =>
      STORE_BRANDS.map((brand) => ({
        ...brand,
        productCount: products.filter((product) => resolveProductBrand(product) === brand.id).length,
        categories: categories.filter((category) => brand.categoryNames.includes(category.name))
      })),
    [categories, products]
  );

  return (
    <main className="public-shell">
      <FirebaseStatus />
      <header className="platform-header">
        <div className="platform-mark">
          <div className="platform-logo-wrap">
            <Image src="/branding/wat-logo.png" alt="WAT App" width={44} height={44} className="platform-logo" />
          </div>
          <div>
            <p className="platform-kicker">WAT App</p>
            <strong>What&apos;s Available Today</strong>
          </div>
        </div>
        <a href="#latest-products" className="primary-link">
          Open today&apos;s stock
        </a>
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow">Daily stock from WhatsApp Status</span>
          <h1>One clean app for what&apos;s live today across tech and fragrances.</h1>
          <p>
            Built for WhatsApp buyers: open the status link, scan what&apos;s available today, compare price and condition fast,
            and message your order in one tap.
          </p>
          <div className="hero-actions">
            <a href="#latest-products" className="primary-link">
              Browse live products
            </a>
            <a href="#brand-stores" className="secondary-link">
              Shop by brand
            </a>
          </div>
          <div className="hero-trust-bar">
            <span>Updated daily</span>
            <span>WhatsApp-first ordering</span>
            <span>Fast stock checks</span>
          </div>
        </div>
        <div className="hero-panel">
          <div className="hero-stat">
            <strong>{products.length}</strong>
            <span>live products</span>
          </div>
          <div className="hero-stat">
            <strong>{liveProductCount}</strong>
            <span>in stock now</span>
          </div>
          <div className="hero-stat">
            <strong>{categories.length}</strong>
            <span>categories</span>
          </div>
          <div className="hero-highlight">
            <p className="eyebrow">Why WAT works</p>
            <h2>Made for fast replies from Status viewers.</h2>
            <p>{readyTodayCount} items are currently ready for real WhatsApp conversations today.</p>
          </div>
        </div>
      </section>

      <section className="section-block" id="brand-stores">
        <div className="section-heading">
          <h2>Shop by brand</h2>
          <p>Two focused store identities inside one live daily storefront, built for quick browsing from WhatsApp Status.</p>
        </div>
        <div className="brand-grid">
          {brandCards.map((brand) => (
            <article key={brand.id} className={`brand-card ${brand.accentClassName}`}>
              <div className="brand-card-head">
                <div className="brand-logo-shell">
                  <Image src={brand.logo} alt={brand.name} width={132} height={52} className="brand-logo" />
                </div>
                <span className="brand-badge">{brand.tagline}</span>
              </div>
              <p className="brand-description">{brand.description}</p>
              <div className="brand-metrics">
                <div>
                  <strong>{brand.productCount}</strong>
                  <span>products live</span>
                </div>
                <div>
                  <strong>{brand.categories.length}</strong>
                  <span>categories</span>
                </div>
              </div>
              <div className="brand-chip-row">
                {brand.categoryNames.map((categoryName) => (
                  <button key={categoryName} className="brand-chip" onClick={() => setActiveCategory(categoryName)}>
                    {categoryName}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block section-tight">
        <div className="section-heading">
          <h2>Browse by category</h2>
          <p>Tap a category to narrow down what&apos;s available today without losing the fast mobile flow.</p>
        </div>
        <div className="category-strip">
          <button className={activeCategory === "All" ? "category-chip active" : "category-chip"} onClick={() => setActiveCategory("All")}>
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              className={activeCategory === category.name ? "category-chip active" : "category-chip"}
              onClick={() => setActiveCategory(category.name)}
            >
              {category.name}
            </button>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h2>Featured today</h2>
          <p>Standout picks worth checking first before they disappear from today&apos;s stock.</p>
        </div>
        <div className="product-grid">
          {featuredProducts.length ? featuredProducts.map((product) => <ProductCard key={product.id} product={product} />) : <div className="empty-state">No featured products yet.</div>}
        </div>
      </section>

      <section className="section-block" id="latest-products">
        <div className="section-heading">
          <h2>Latest live items</h2>
          <p>Most recently added or updated stock from across the WAT App stores, ready for WhatsApp conversations now.</p>
        </div>
        <div className="product-grid">
          {latestProducts.length ? latestProducts.map((product) => <ProductCard key={product.id} product={product} />) : <div className="empty-state">Products will appear here once your team starts adding stock.</div>}
        </div>
      </section>

      {error ? <div className="inline-error">{error}</div> : null}
    </main>
  );
}
