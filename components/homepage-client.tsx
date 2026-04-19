"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { FirebaseStatus } from "@/components/firebase-status";
import { ProductCard } from "@/components/product-card";
import { STORE_BRANDS, resolveProductBrand } from "@/lib/brands";
import { fetchCategories, fetchProducts, subscribeToCategories, subscribeToProducts } from "@/lib/firebase/firestore";
import { Category, Product } from "@/lib/types";
import { compareProductsForStorefront, isFreshProduct } from "@/lib/utils";

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

const INSTALL_HINT_STORAGE_KEY = "watapp-install-hint-dismissed";

function getInstallGuidance() {
  if (typeof window === "undefined") {
    return {
      title: "Save WAT App to your home screen",
      steps: ["Use your browser menu to add this app to your home screen for faster daily stock checks."]
    };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isSafari = isIOS && /safari/.test(userAgent) && !/crios|fxios/.test(userAgent);
  const isAndroid = /android/.test(userAgent);
  const isChrome = /chrome/.test(userAgent) && !/edg|opr/.test(userAgent);

  if (isSafari) {
    return {
      title: "Save WAT App in Safari",
      steps: ["Tap Share in Safari.", "Choose Add to Home Screen.", "Open WAT App in one tap whenever fresh stock drops."]
    };
  }

  if (isAndroid && isChrome) {
    return {
      title: "Save WAT App in Chrome",
      steps: ["Open the browser menu in Chrome.", "Choose Add to Home screen or Install app.", "Use the shortcut to check daily stock faster."]
    };
  }

  return {
    title: "Save WAT App to your home screen",
    steps: ["Open your browser menu.", "Choose Add to Home Screen or Install App.", "Use the shortcut to check fresh items quickly."]
  };
}

export function HomepageClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [error, setError] = useState<string>("");
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const installHintMode = isLocalhost ? params.get("installHint") : null;

    if (installHintMode === "reset") {
      window.localStorage.removeItem(INSTALL_HINT_STORAGE_KEY);
    }

    const dismissed = installHintMode === "show" ? false : window.localStorage.getItem(INSTALL_HINT_STORAGE_KEY) === "true";
    if (!dismissed) {
      setShowInstallHint(true);
    }

    if (installHintMode === "guide") {
      setShowInstallHint(true);
      setShowInstallGuide(true);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as DeferredInstallPrompt);
      if (!dismissed) {
        setShowInstallHint(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const scopedProducts =
      activeCategory === "All" ? products : products.filter((product) => product.categoryName === activeCategory);

    return [...scopedProducts].sort(compareProductsForStorefront);
  }, [activeCategory, products]);

  const featuredProducts = useMemo(() => filteredProducts.filter((product) => product.featured).slice(0, 4), [filteredProducts]);
  const featuredIds = useMemo(() => new Set(featuredProducts.map((product) => product.id)), [featuredProducts]);
  const freshProducts = useMemo(
    () => filteredProducts.filter((product) => !featuredIds.has(product.id) && isFreshProduct(product)).slice(0, 4),
    [featuredIds, filteredProducts]
  );
  const freshIds = useMemo(() => new Set(freshProducts.map((product) => product.id)), [freshProducts]);
  const latestProducts = useMemo(() => {
    const remainingProducts = filteredProducts.filter((product) => !featuredIds.has(product.id) && !freshIds.has(product.id));
    return remainingProducts.length ? remainingProducts.slice(0, 8) : filteredProducts.slice(0, 8);
  }, [featuredIds, filteredProducts, freshIds]);
  const freshTodayCount = useMemo(() => products.filter((item) => isFreshProduct(item)).length, [products]);
  const liveProductCount = useMemo(() => products.filter((item) => item.stockStatus === "In Stock").length, [products]);
  const readyTodayCount = useMemo(() => products.filter((item) => item.stockStatus !== "Out of Stock").length, [products]);
  const firstProductSectionId = featuredProducts.length
    ? "featured-products"
    : freshProducts.length
      ? "fresh-products"
      : "latest-products";

  function dismissInstallHint() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INSTALL_HINT_STORAGE_KEY, "true");
    }
    setShowInstallHint(false);
  }

  async function handleInstallHintAction() {
    if (!deferredInstallPrompt) {
      setShowInstallGuide(true);
      return;
    }

    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice.catch(() => undefined);
    setDeferredInstallPrompt(null);

    if (choice?.outcome === "accepted") {
      dismissInstallHint();
      return;
    }

    setShowInstallGuide(true);
  }

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
        <a href={`#${firstProductSectionId}`} className="primary-link">
          Open today&apos;s stock
        </a>
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow">Daily stock from WhatsApp Status</span>
          <h1>Browse today&apos;s live stock fast.</h1>
          <p>Open the status link, scan what&apos;s available now, and message your order in one tap.</p>
          <div className="hero-actions">
            <a href={`#${firstProductSectionId}`} className="primary-link">
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
          <div className="hero-summary-strip" aria-label="Live stock summary">
            <span>
              <strong>{products.length}</strong> live products
            </span>
            <span>
              <strong>{freshTodayCount}</strong> updated today
            </span>
            <span>
              <strong>{categories.length}</strong> categories
            </span>
            <span>
              <strong>{readyTodayCount}</strong> ready today
            </span>
          </div>
        </div>
      </section>

      {showInstallHint && !showInstallGuide ? (
        <section className="install-hint" aria-label="Save WAT App for daily stock checks">
          <div className="install-hint-copy">
            <p className="eyebrow">Quick return</p>
            <strong>Save WAT App to your home screen for fast daily stock checks.</strong>
            <p>{freshTodayCount ? `${freshTodayCount} items were updated today.` : "Fresh items appear regularly."} Reopen in one tap whenever stock changes.</p>
          </div>
          <div className="install-hint-actions">
            <button type="button" className="secondary-link" onClick={dismissInstallHint}>
              Not now
            </button>
            <button type="button" className="primary-link" onClick={handleInstallHintAction}>
              Save app
            </button>
          </div>
        </section>
      ) : null}

      {showInstallGuide ? (
        <section className="install-guide" aria-label="How to save WAT App">
          <div className="install-guide-copy">
            <p className="eyebrow">Save app</p>
            <strong>{getInstallGuidance().title}</strong>
            <p>Check daily stock faster, open in one tap, and spot fresh items quickly.</p>
          </div>
          <ol className="install-guide-steps">
            {getInstallGuidance().steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="install-hint-actions">
            <button
              type="button"
              className="secondary-link"
              onClick={() => {
                setShowInstallGuide(false);
                dismissInstallHint();
              }}
            >
              Not now
            </button>
            <button
              type="button"
              className="primary-link"
              onClick={() => {
                setShowInstallGuide(false);
                dismissInstallHint();
              }}
            >
              Done
            </button>
          </div>
        </section>
      ) : null}

      <section className="section-block section-tight">
        <div className="section-heading">
          <h2>Browse by category</h2>
          <p>Tap a category to narrow down live stock fast.</p>
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

      {featuredProducts.length ? (
        <section className="section-block" id="featured-products">
          <div className="section-heading">
            <h2>Featured today</h2>
            <p>Admin-picked items that deserve the strongest visibility on today&apos;s live board.</p>
          </div>
          <div className="product-grid">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      {freshProducts.length ? (
        <section className="section-block section-fresh" id="fresh-products">
          <div className="section-heading">
            <h2>Fresh today</h2>
            <p>Newest additions or updates from today, surfaced first for fast status-driven browsing.</p>
          </div>
          <div className="product-grid">
            {freshProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      <section
        className="section-block"
        id={!featuredProducts.length && !freshProducts.length ? "latest-products" : undefined}
      >
        <div className="section-heading">
          <h2>{featuredProducts.length || freshProducts.length ? "More live items" : "Live stock today"}</h2>
          <p>
            {featuredProducts.length || freshProducts.length
              ? "The rest of today's live stock, still ordered to keep the most important items near the top."
              : "Fresh stock from across the WAT App stores, ready for WhatsApp conversations now."}
          </p>
        </div>
        <div className="product-grid">
          {latestProducts.length ? latestProducts.map((product) => <ProductCard key={product.id} product={product} />) : <div className="empty-state">Products will appear here once your team starts adding stock.</div>}
        </div>
      </section>

      <section className="section-block" id="brand-stores">
        <div className="section-heading">
          <h2>Shop by brand</h2>
          <p>Browse by store once you&apos;ve scanned the live stock above.</p>
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

      {error ? <div className="inline-error">{error}</div> : null}
    </main>
  );
}
