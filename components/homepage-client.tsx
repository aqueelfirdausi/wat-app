"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FirebaseStatus } from "@/components/firebase-status";
import { MobileFeedCard } from "@/components/mobile-feed-card";
import { ProductCard } from "@/components/product-card";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { STORE_BRANDS, resolveProductBrand } from "@/lib/brands";
import { fetchCategories, fetchProducts, subscribeToCategories, subscribeToProducts } from "@/lib/firebase/firestore";
import { Category, Product } from "@/lib/types";
import {
  buildProductPath,
  compareProductsForStorefront,
  formatCurrency,
  getStockStatusClassName,
  getStockStatusLabel,
  isFreshProduct,
  isProductVisibleInFeed,
  isProductVisibleOnStorefront,
  normalizeStockStatus
} from "@/lib/utils";

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

const INSTALL_HINT_STORAGE_KEY = "watapp-install-hint-dismissed";
const STOREFRONT_MODE_STORAGE_KEY = "watapp-storefront-mode";
const STOREFRONT_PREFERRED_MODE_STORAGE_KEY = "watapp-storefront-preferred-mode";
const FEED_HINT_SEEN_STORAGE_KEY = "watapp-feed-hint-seen";
const LEGACY_FEED_HINT_DISMISSED_STORAGE_KEY = "watapp-feed-hint-dismissed";

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
  const [storefrontMode, setStorefrontMode] = useState<"catalog" | "feed">("catalog");
  const [showFeedHint, setShowFeedHint] = useState(false);
  const [hasResolvedStorefrontMode, setHasResolvedStorefrontMode] = useState(false);
  const heroLivePicksStripRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedPreferredMode = window.localStorage.getItem(STOREFRONT_PREFERRED_MODE_STORAGE_KEY);
    const legacyStoredMode = window.localStorage.getItem(STOREFRONT_MODE_STORAGE_KEY);
    const resolvedMode =
      storedPreferredMode === "feed" || storedPreferredMode === "catalog"
        ? storedPreferredMode
        : legacyStoredMode === "feed" || legacyStoredMode === "catalog"
          ? legacyStoredMode
          : "catalog";

    setStorefrontMode(resolvedMode);

    if (resolvedMode === "feed" || resolvedMode === "catalog") {
      window.localStorage.setItem(STOREFRONT_PREFERRED_MODE_STORAGE_KEY, resolvedMode);
      window.localStorage.setItem(STOREFRONT_MODE_STORAGE_KEY, resolvedMode);
    }

    const feedHintSeen =
      window.localStorage.getItem(FEED_HINT_SEEN_STORAGE_KEY) === "true" ||
      window.localStorage.getItem(LEGACY_FEED_HINT_DISMISSED_STORAGE_KEY) === "true";
    if (!feedHintSeen && resolvedMode === "catalog") {
      setShowFeedHint(true);
    }

    setHasResolvedStorefrontMode(true);

    trackAnalyticsEvent({
      eventName: "storefront_visit",
      context: resolvedMode,
      dedupeKey: "storefront_visit"
    });

    if (resolvedMode === "feed") {
      trackAnalyticsEvent({
        eventName: "feed_view",
        context: "feed",
        dedupeKey: "feed_view"
      });
    }
  }, []);

  const visibleProducts = useMemo(() => products.filter((product) => isProductVisibleOnStorefront(product)), [products]);
  const visibleCategories = useMemo(
    () => categories.filter((category) => visibleProducts.some((product) => product.categoryName === category.name)),
    [categories, visibleProducts]
  );

  const filteredProducts = useMemo(() => {
    const scopedProducts =
      activeCategory === "All" ? visibleProducts : visibleProducts.filter((product) => product.categoryName === activeCategory);

    return [...scopedProducts].sort(compareProductsForStorefront);
  }, [activeCategory, visibleProducts]);
  const feedProducts = useMemo(() => filteredProducts.filter((product) => isProductVisibleInFeed(product)), [filteredProducts]);

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
  const freshTodayCount = useMemo(() => visibleProducts.filter((item) => isFreshProduct(item)).length, [visibleProducts]);
  const readyTodayCount = useMemo(
    () => visibleProducts.filter((item) => normalizeStockStatus(item.stockStatus) !== "sold_out").length,
    [visibleProducts]
  );
  const heroLivePicks = useMemo(() => {
    const sortedProducts = [...visibleProducts].sort(compareProductsForStorefront);
    const picked = new Map<string, Product>();
    const addProducts = (items: Product[]) => {
      items.forEach((product) => {
        if (picked.size < 4) {
          picked.set(product.id, product);
        }
      });
    };

    addProducts(sortedProducts.filter((product) => isFreshProduct(product)));
    addProducts(sortedProducts.filter((product) => product.featured));
    addProducts(sortedProducts.filter((product) => normalizeStockStatus(product.stockStatus) !== "sold_out"));
    addProducts(sortedProducts);

    return Array.from(picked.values()).slice(0, 4);
  }, [visibleProducts]);
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

  function handleStorefrontModeChange(nextMode: "catalog" | "feed") {
    setStorefrontMode(nextMode);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STOREFRONT_PREFERRED_MODE_STORAGE_KEY, nextMode);
      window.localStorage.setItem(STOREFRONT_MODE_STORAGE_KEY, nextMode);

      if (nextMode === "feed") {
        window.localStorage.setItem(FEED_HINT_SEEN_STORAGE_KEY, "true");
        setShowFeedHint(false);
        trackAnalyticsEvent({
          eventName: "feed_view",
          context: "feed",
          dedupeKey: "feed_view"
        });
      }
    }
  }

  function dismissFeedHint() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FEED_HINT_SEEN_STORAGE_KEY, "true");
    }

    setShowFeedHint(false);
  }

  function scrollHeroLivePicks(direction: "previous" | "next") {
    const strip = heroLivePicksStripRef.current;
    if (!strip) {
      return;
    }

    const scrollAmount = Math.max(220, Math.round(strip.clientWidth * 0.82));
    strip.scrollBy({
      left: direction === "previous" ? -scrollAmount : scrollAmount,
      behavior: "smooth"
    });
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
        productCount: visibleProducts.filter((product) => resolveProductBrand(product) === brand.id).length,
        categories: visibleCategories.filter((category) => brand.categoryNames.includes(category.name))
      })),
    [visibleCategories, visibleProducts]
  );
  const hasFeedModeOption = true;

  return (
    <main className="public-shell">
      <FirebaseStatus />
      <header className="platform-header">
        <div className="platform-mark">
          <div className="platform-logo-wrap" aria-label="WAT App">
            <Image src="/branding/wat-app-icon.svg" alt="" width={34} height={34} className="platform-logo" aria-hidden="true" />
          </div>
          <div className="platform-title-block">
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
          <p className="hero-urdu-line" lang="ur" dir="rtl">
            آج کیا دستیاب ہے؟
          </p>
          <h1>Browse today&apos;s live stock fast.</h1>
          <p>Check what&apos;s available now, see today&apos;s pricing clearly, and move into WhatsApp when you&apos;re ready to confirm.</p>
          <div className="hero-actions">
            <a href={`#${firstProductSectionId}`} className="primary-link">
              Browse live products
            </a>
            <a href="#brand-stores" className="secondary-link">
              Shop by brand
            </a>
          </div>
          <div className="hero-summary-strip" aria-label="Live stock summary">
            <span>
              <strong>{visibleProducts.length}</strong> live products
            </span>
            <span>
              <strong>{freshTodayCount}</strong> updated today
            </span>
            <span>
              <strong>{visibleCategories.length}</strong> categories
            </span>
            <span>
              <strong>{readyTodayCount}</strong> ready today
            </span>
          </div>
          {heroLivePicks.length ? (
            <div className="hero-live-picks" aria-label="Today's live product picks">
              <div className="hero-live-picks-heading">
                <strong>Today&apos;s Live Picks</strong>
                <span>Live stock highlights</span>
                {heroLivePicks.length > 1 ? (
                  <div className="hero-live-picks-controls" aria-label="Today&apos;s Live Picks carousel controls">
                    <button type="button" aria-label="Previous live pick" onClick={() => scrollHeroLivePicks("previous")}>
                      ‹
                    </button>
                    <button type="button" aria-label="Next live pick" onClick={() => scrollHeroLivePicks("next")}>
                      ›
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="hero-live-picks-strip" ref={heroLivePicksStripRef}>
                {heroLivePicks.map((product) => (
                  <Link key={product.id} href={buildProductPath(product.slug)} className="hero-live-pick-card">
                    <div className="hero-live-pick-media">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          fill
                          sizes="132px"
                          className="hero-live-pick-image"
                        />
                      ) : (
                        <div className="hero-live-pick-image-fallback">
                          <span className="product-image-fallback-mark" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <div className="hero-live-pick-copy">
                      <span className={`hero-live-pick-stock ${getStockStatusClassName(product.stockStatus)}`}>
                        {getStockStatusLabel(product.stockStatus)}
                      </span>
                      <strong>{product.name}</strong>
                      <span>{formatCurrency(product.price, product.currency)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="section-block section-tight category-filter-section">
        <div className="section-heading">
          <h2>Browse by category</h2>
          <p>Tap a category to narrow today&apos;s live stock without losing the quick scan flow.</p>
        </div>
        <div className="category-strip">
          <button className={activeCategory === "All" ? "category-chip active" : "category-chip"} onClick={() => setActiveCategory("All")}>
            All
          </button>
          {visibleCategories.map((category) => (
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

      <section className="section-block section-tight">
        <div className="storefront-mode-panel" aria-label="Storefront view mode">
          <div className="storefront-mode-copy">
            <p className="eyebrow">
              <span className="storefront-mode-desktop-copy">Storefront mode</span>
              <span className="storefront-mode-mobile-copy">Browse view</span>
            </p>
            <strong>
              <span className="storefront-mode-desktop-copy">Choose the view that feels easiest to browse right now.</span>
              <span className="storefront-mode-mobile-copy">Choose how to scan today&apos;s stock.</span>
            </strong>
            <p>
              <span className="storefront-mode-desktop-copy">Catalog and Feed show the same live products, pricing, and WhatsApp path. Switch anytime without losing your place.</span>
              <span className="storefront-mode-mobile-copy">Same products, different browsing style.</span>
            </p>
          </div>
          <div className="storefront-mode-toggle" role="tablist" aria-label="Choose storefront mode">
            <button
              type="button"
              role="tab"
              aria-selected={storefrontMode === "catalog"}
              className={storefrontMode === "catalog" ? "storefront-mode-chip active" : "storefront-mode-chip"}
              onClick={() => handleStorefrontModeChange("catalog")}
            >
              Catalog
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={storefrontMode === "feed"}
              className={storefrontMode === "feed" ? "storefront-mode-chip active" : "storefront-mode-chip"}
              onClick={() => handleStorefrontModeChange("feed")}
            >
              Feed
            </button>
          </div>
          {hasResolvedStorefrontMode && showFeedHint && storefrontMode === "catalog" && hasFeedModeOption ? (
            <div className="feed-hint-banner" role="status" aria-live="polite">
              <p>New: try Feed for quick browsing</p>
              <button type="button" className="feed-hint-dismiss" onClick={dismissFeedHint}>
                Got it
              </button>
            </div>
          ) : null}
          <div className="storefront-mode-reassurance" aria-label="Storefront reassurance">
            <span>Same live stock in both views</span>
            <span>Availability stays visible</span>
            <span>WhatsApp ordering works the same way</span>
          </div>
        </div>
      </section>

      {hasResolvedStorefrontMode && storefrontMode === "feed" ? (
        <section className="section-block mobile-feed-section" id={firstProductSectionId}>
          <div className="section-heading mobile-feed-heading">
            <h2>Live mobile feed</h2>
            <p>A cleaner, image-first flow for faster mobile scanning, with the same availability cues and WhatsApp ordering path.</p>
          </div>
          <div className="mobile-feed-list">
            {feedProducts.length ? (
              feedProducts.map((product) => <MobileFeedCard key={product.id} product={product} analyticsContext="feed" />)
            ) : (
              <div className="empty-state">Feed items will appear here once live products are ready for browsing.</div>
            )}
          </div>
        </section>
      ) : null}

      {(!hasResolvedStorefrontMode || storefrontMode === "catalog") && featuredProducts.length ? (
        <section className="section-block" id="featured-products">
          <div className="section-heading">
            <h2>Featured today</h2>
            <p>Important live items surfaced first so casual visitors can trust what deserves attention today.</p>
          </div>
          <div className="product-grid">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} analyticsContext="catalog" />
            ))}
          </div>
        </section>
      ) : null}

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

      {(!hasResolvedStorefrontMode || storefrontMode === "catalog") && freshProducts.length ? (
        <section className="section-block section-fresh" id="fresh-products">
          <div className="section-heading">
            <h2>Fresh today</h2>
            <p>Newest additions or updates from today, surfaced early so repeat visitors can spot fresh stock quickly.</p>
          </div>
          <div className="product-grid">
            {freshProducts.map((product) => (
              <ProductCard key={product.id} product={product} analyticsContext="catalog" />
            ))}
          </div>
        </section>
      ) : null}

      {!hasResolvedStorefrontMode || storefrontMode === "catalog" ? (
        <section
          className="section-block"
          id={!featuredProducts.length && !freshProducts.length ? "latest-products" : undefined}
        >
          <div className="section-heading">
            <h2>{featuredProducts.length || freshProducts.length ? "More live items" : "Live stock today"}</h2>
            <p>
              {featuredProducts.length || freshProducts.length
                ? "The rest of today's live stock, still ordered to keep the clearest and most relevant items near the top."
                : "Live stock from across the WAT App stores, ready for quick detail checks and WhatsApp confirmation."}
            </p>
          </div>
          <div className="product-grid">
            {latestProducts.length ? latestProducts.map((product) => <ProductCard key={product.id} product={product} analyticsContext="catalog" />) : <div className="empty-state">Products will appear here once your team starts adding stock.</div>}
          </div>
        </section>
      ) : null}

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

      <footer className="developer-credit" aria-label="Developer credit">
        <span className="developer-credit-byline">Developed by Aqueel Ahmed Firdausi</span>
        <span className="developer-credit-studio">A novart.io build</span>
        <Image src="/branding/novart-logo-dark.png" alt="novart.io" width={1024} height={1024} className="developer-credit-logo" />
      </footer>
    </main>
  );
}
