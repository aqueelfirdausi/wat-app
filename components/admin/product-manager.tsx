"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { STOCK_STATUSES } from "@/lib/constants";
import { removeProduct, subscribeToProducts, updateProductOperationalState, updateProductStockStatus } from "@/lib/firebase/firestore";
import { generateMinimalStatusImage } from "@/lib/status-image-minimal";
import { getTeamContactById } from "@/lib/team-contacts";
import { Product } from "@/lib/types";
import {
  buildProductPath,
  buildPublicProductUrl,
  compareProductsForStorefront,
  formatCurrency,
  formatDate,
  getStockStatusClassName,
  getStockStatusLabel,
  isNewArrival,
  isNewToday,
  normalizeStockStatus
} from "@/lib/utils";

type ProductManagerProps = {
  actor: {
    uid: string;
    name: string;
    email: string;
  };
};

const SAVE_FEEDBACK_STORAGE_KEY = "watapp-admin-save-feedback";
const DUPLICATE_DRAFT_STORAGE_KEY = "watapp-admin-duplicate-draft";
const INVENTORY_SESSION_STATE_KEY = "watapp-admin-inventory-session";

type InventorySessionState = {
  shortlistedIds?: string[];
  selectedIds?: string[];
  chosenProductId?: string | null;
  shortlistedOnly?: boolean;
  needsAttentionOnly?: boolean;
  featuredOnly?: boolean;
  sortBy?: string;
  categoryFilter?: string;
  stockFilter?: string;
  searchQuery?: string;
};

export function ProductManager({ actor }: ProductManagerProps) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [hasLoadedInventory, setHasLoadedInventory] = useState(false);
  const [error, setError] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<{ message: string; hint: string } | null>(null);
  const [restoredStateNotice, setRestoredStateNotice] = useState(false);
  const [freshStartNotice, setFreshStartNotice] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [shortlistedOnly, setShortlistedOnly] = useState(false);
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const [sortBy, setSortBy] = useState("storefront_order");
  const [shortlistedIds, setShortlistedIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [chosenProductId, setChosenProductId] = useState<string | null>(null);
  const [openActionsMenuId, setOpenActionsMenuId] = useState<string | null>(null);
  const [copiedProductId, setCopiedProductId] = useState<string | null>(null);
  const [updatingStockId, setUpdatingStockId] = useState<string | null>(null);
  const [quickActionBusyId, setQuickActionBusyId] = useState<string | null>(null);
  const [quickActionFeedback, setQuickActionFeedback] = useState<{ productId: string; message: string } | null>(null);
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
  const copyResetTimeoutRef = useRef<number | null>(null);
  const inventorySessionRef = useRef<InventorySessionState | null>(null);
  const activeActionsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      return subscribeToProducts((nextProducts) => {
        setProducts(nextProducts);
        setHasLoadedInventory(true);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load products.";
      setError(message);
      setHasLoadedInventory(true);
      return () => undefined;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.sessionStorage.getItem(SAVE_FEEDBACK_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { message?: string; hint?: string };
      if (parsed?.message && parsed?.hint) {
        setSaveFeedback({ message: parsed.message, hint: parsed.hint });
      }
    } catch {
      // Ignore malformed transient feedback.
    } finally {
      window.sessionStorage.removeItem(SAVE_FEEDBACK_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.sessionStorage.getItem(INVENTORY_SESSION_STATE_KEY);
    if (!raw) {
      return;
    }

    try {
      inventorySessionRef.current = JSON.parse(raw) as InventorySessionState;
    } catch {
      inventorySessionRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedInventory || !inventorySessionRef.current) {
      return;
    }

    const restored = inventorySessionRef.current;
    const validIds = new Set(products.map((product) => product.id));
    const validCategories = new Set(products.map((product) => product.categoryName).filter(Boolean));
    const validSortValues = new Set(["storefront_order", "updated_newest", "updated_oldest", "price_low", "price_high"]);
    const validStockValues = new Set(["all", ...STOCK_STATUSES]);

    setShortlistedIds((restored.shortlistedIds ?? []).filter((id) => validIds.has(id)));
    setSelectedIds((restored.selectedIds ?? []).filter((id) => validIds.has(id)));
    setChosenProductId(restored.chosenProductId && validIds.has(restored.chosenProductId) ? restored.chosenProductId : null);
    setShortlistedOnly(Boolean(restored.shortlistedOnly));
    setNeedsAttentionOnly(Boolean(restored.needsAttentionOnly));
    setFeaturedOnly(Boolean(restored.featuredOnly));
    setSortBy(validSortValues.has(restored.sortBy ?? "") ? restored.sortBy ?? "storefront_order" : "storefront_order");
    setCategoryFilter(validCategories.has(restored.categoryFilter ?? "") ? restored.categoryFilter ?? "all" : "all");
    const restoredStockFilter =
      restored.stockFilter && restored.stockFilter !== "all" ? normalizeStockStatus(restored.stockFilter) : "all";
    setStockFilter(validStockValues.has(restoredStockFilter) ? restoredStockFilter : "all");
    setSearchQuery(restored.searchQuery ?? "");
    setRestoredStateNotice(true);
    inventorySessionRef.current = null;
  }, [hasLoadedInventory, products]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedInventory) {
      return;
    }

    const isDefaultState =
      shortlistedIds.length === 0 &&
      selectedIds.length === 0 &&
      chosenProductId === null &&
      !shortlistedOnly &&
      !needsAttentionOnly &&
      !featuredOnly &&
      sortBy === "storefront_order" &&
      categoryFilter === "all" &&
      stockFilter === "all" &&
      searchQuery.trim().length === 0;

    if (isDefaultState) {
      window.sessionStorage.removeItem(INVENTORY_SESSION_STATE_KEY);
      return;
    }

    const payload: InventorySessionState = {
      shortlistedIds,
      selectedIds,
      chosenProductId,
      shortlistedOnly,
      needsAttentionOnly,
      featuredOnly,
      sortBy,
      categoryFilter,
      stockFilter,
      searchQuery
    };

    window.sessionStorage.setItem(INVENTORY_SESSION_STATE_KEY, JSON.stringify(payload));
  }, [
    categoryFilter,
    chosenProductId,
    featuredOnly,
    hasLoadedInventory,
    needsAttentionOnly,
    searchQuery,
    selectedIds,
    shortlistedIds,
    shortlistedOnly,
    sortBy,
    stockFilter
  ]);

  useEffect(() => {
    if (!restoredStateNotice && !freshStartNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRestoredStateNotice(false);
      setFreshStartNotice(false);
    }, 3200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [freshStartNotice, restoredStateNotice]);

  useEffect(() => {
    if (!openActionsMenuId) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (activeActionsMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setOpenActionsMenuId(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenActionsMenuId(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openActionsMenuId]);

  useEffect(() => {
    if (!selectedProduct || typeof window === "undefined") {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedProduct(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedProduct]);

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
      const matchesStock = stockFilter === "all" || normalizeStockStatus(product.stockStatus) === stockFilter;
      const matchesFeatured = !featuredOnly || product.featured;
      const matchesShortlist = !shortlistedOnly || shortlistedIds.includes(product.id);
      const matchesNeedsAttention = !needsAttentionOnly || !getReadinessState(product).ready;

      return matchesQuery && matchesCategory && matchesStock && matchesFeatured && matchesShortlist && matchesNeedsAttention;
    });

    nextProducts.sort((first, second) => {
      if (sortBy === "storefront_order") {
        return compareProductsForStorefront(first, second);
      }

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
  }, [categoryFilter, featuredOnly, needsAttentionOnly, products, searchQuery, shortlistedIds, shortlistedOnly, sortBy, stockFilter]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    categoryFilter !== "all" ||
    stockFilter !== "all" ||
    featuredOnly ||
    shortlistedOnly ||
    needsAttentionOnly ||
    sortBy !== "storefront_order";

  function clearFilters() {
    setSearchQuery("");
    setCategoryFilter("all");
    setStockFilter("all");
    setFeaturedOnly(false);
    setShortlistedOnly(false);
    setNeedsAttentionOnly(false);
    setSortBy("storefront_order");
  }

  function toggleShortlist(productId: string) {
    setShortlistedIds((current) => (current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]));
  }

  function toggleSelected(productId: string) {
    setSelectedIds((current) => (current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]));
  }

  function shortlistSelected() {
    setShortlistedIds((current) => Array.from(new Set([...current, ...selectedIds])));
  }

  function removeSelectedFromShortlist() {
    setShortlistedIds((current) => current.filter((id) => !selectedIds.includes(id)));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function toggleChosen(productId: string) {
    setChosenProductId((current) => (current === productId ? null : productId));
  }

  function toggleActionsMenu(productId: string) {
    setOpenActionsMenuId((current) => (current === productId ? null : productId));
  }

  function closeActionsMenu() {
    setOpenActionsMenuId(null);
  }

  function handleStartFresh() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(INVENTORY_SESSION_STATE_KEY);
    }

    inventorySessionRef.current = null;
    setSearchQuery("");
    setCategoryFilter("all");
    setStockFilter("all");
    setFeaturedOnly(false);
    setShortlistedOnly(false);
    setNeedsAttentionOnly(false);
    setSortBy("storefront_order");
    setShortlistedIds([]);
    setSelectedIds([]);
    setChosenProductId(null);
    setRestoredStateNotice(false);
    setFreshStartNotice(true);
  }

  function handleDuplicate(product: Product) {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        DUPLICATE_DRAFT_STORAGE_KEY,
        JSON.stringify({
          sourceName: product.name,
          values: {
            name: `${product.name} (Copy)`,
            description: product.description,
            brand: product.brand ?? "",
            preferredContactId: product.preferredContactId ?? product.assignedContactId ?? product.contactId ?? "",
            categoryName: product.categoryName,
            price: product.price ? String(product.price) : "",
            condition: product.condition,
            stockStatus: product.stockStatus,
            featured: product.featured,
            sortPriority: String(product.sortPriority ?? 0)
          }
        })
      );
    }

    router.push("/admin/products/new?duplicate=1");
  }

  async function handleCopyLink(product: Product) {
    try {
      const url = buildPublicProductUrl(product.slug, window.location.origin);
      await navigator.clipboard.writeText(url);

      if (copyResetTimeoutRef.current) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }

      setCopiedProductId(product.id);
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedProductId((current) => (current === product.id ? null : current));
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to copy product link.";
      setError(message);
    }
  }

  async function handleStockStatusChange(product: Product, nextStatus: Product["stockStatus"]) {
    const normalizedCurrent = normalizeStockStatus(product.stockStatus);
    const normalizedNext = normalizeStockStatus(nextStatus);

    if (normalizedCurrent === normalizedNext) {
      return;
    }

    setError("");
    setUpdatingStockId(product.id);

    try {
      await updateProductStockStatus(product, normalizedNext, actor);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update stock status.";
      setError(message);
    } finally {
      setUpdatingStockId((current) => (current === product.id ? null : current));
    }
  }

  function setRowFeedback(productId: string, message: string) {
    setQuickActionFeedback({ productId, message });
  }

  async function handleQuickStockAction(product: Product, nextStatus: Product["stockStatus"]) {
    const normalizedStatus = normalizeStockStatus(nextStatus);

    if (normalizeStockStatus(product.stockStatus) === normalizedStatus) {
      setRowFeedback(product.id, `Already ${getStockStatusLabel(normalizedStatus).toLowerCase()}.`);
      return;
    }

    setError("");
    setQuickActionBusyId(product.id);

    try {
      await updateProductStockStatus(product, normalizedStatus, actor);
      setRowFeedback(product.id, `${getStockStatusLabel(normalizedStatus)} saved.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update stock status.";
      setError(message);
    } finally {
      setQuickActionBusyId((current) => (current === product.id ? null : current));
    }
  }

  async function handleFeaturedToggle(product: Product) {
    const nextFeatured = !product.featured;

    setError("");
    setQuickActionBusyId(product.id);

    try {
      await updateProductOperationalState(
        product,
        { featured: nextFeatured },
        actor,
        `${nextFeatured ? "Featured" : "Removed featured status from"} ${product.name}.`
      );
      setRowFeedback(product.id, nextFeatured ? "Featured on homepage." : "Removed from featured.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update featured status.";
      setError(message);
    } finally {
      setQuickActionBusyId((current) => (current === product.id ? null : current));
    }
  }

  async function handleStorefrontVisibilityToggle(product: Product) {
    const nextStorefrontVisible = !product.storefrontVisible;

    setError("");
    setQuickActionBusyId(product.id);

    try {
      await updateProductOperationalState(
        product,
        { storefrontVisible: nextStorefrontVisible },
        actor,
        `${nextStorefrontVisible ? "Returned" : "Hidden"} ${product.name} ${nextStorefrontVisible ? "to" : "from"} the storefront.`
      );
      setRowFeedback(product.id, nextStorefrontVisible ? "Live on storefront." : "Hidden from storefront.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update storefront visibility.";
      setError(message);
    } finally {
      setQuickActionBusyId((current) => (current === product.id ? null : current));
    }
  }

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!quickActionFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setQuickActionFeedback((current) => (current?.productId === quickActionFeedback.productId ? null : current));
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [quickActionFeedback]);

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

  function getReadinessState(product: Product) {
    const missing: string[] = [];

    if (!product.imageUrl?.trim()) {
      missing.push("image");
    }

    if (!Number.isFinite(product.price) || product.price <= 0) {
      missing.push("price");
    }

    if (!product.description?.trim()) {
      missing.push("details");
    }

    return {
      ready: missing.length === 0,
      missing
    };
  }

  const visibleFeaturedCount = useMemo(() => filteredProducts.filter((product) => product.featured).length, [filteredProducts]);
  const visibleProductIds = useMemo(() => filteredProducts.map((product) => product.id), [filteredProducts]);
  const selectedVisibleCount = useMemo(() => selectedIds.filter((id) => visibleProductIds.includes(id)).length, [selectedIds, visibleProductIds]);
  const visibleShortlistedCount = useMemo(
    () => filteredProducts.filter((product) => shortlistedIds.includes(product.id)).length,
    [filteredProducts, shortlistedIds]
  );
  const visibleReadyCount = useMemo(
    () => filteredProducts.filter((product) => getReadinessState(product).ready).length,
    [filteredProducts]
  );
  const visibleNeedsAttentionCount = useMemo(
    () => filteredProducts.filter((product) => !getReadinessState(product).ready).length,
    [filteredProducts]
  );
  const hasWorkingState =
    shortlistedIds.length > 0 ||
    selectedIds.length > 0 ||
    chosenProductId !== null ||
    hasActiveFilters;

  return (
    <>
      <section className="panel-card">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Inventory</p>
            <h1>Product inventory</h1>
            <p>Search stock, review item status, and open the daily share/export tools from one place.</p>
            {shortlistedIds.length ? <p className="panel-shortlist-count">Shortlisted: {shortlistedIds.length}</p> : null}
          </div>
          <Link href="/admin/products/new" className="primary-link">
            Add product
          </Link>
        </div>
        {saveFeedback ? (
          <div className="notice-banner notice-banner-success" role="status" aria-live="polite">
            <strong>{saveFeedback.message}</strong>
            <span>{saveFeedback.hint}</span>
          </div>
        ) : null}
        {restoredStateNotice ? (
          <div className="notice-banner notice-banner-muted" role="status" aria-live="polite">
            <strong>Restored today&apos;s working state</strong>
            <span>Your shortlist, selection, and decision filters are back for this session.</span>
          </div>
        ) : null}
        {freshStartNotice ? (
          <div className="notice-banner notice-banner-muted" role="status" aria-live="polite">
            <strong>Started fresh</strong>
            <span>Your shortlist, selection, and inventory filters are back to the default working view.</span>
          </div>
        ) : null}
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
                {STOCK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {getStockStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="storefront_order">Storefront order</option>
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
            <label className="checkbox-row manager-checkbox">
              <input
                type="checkbox"
                checked={shortlistedOnly}
                onChange={(event) => setShortlistedOnly(event.target.checked)}
              />
              <span>Shortlisted only</span>
            </label>
            <label className="checkbox-row manager-checkbox">
              <input
                type="checkbox"
                checked={needsAttentionOnly}
                onChange={(event) => setNeedsAttentionOnly(event.target.checked)}
              />
              <span>Needs attention</span>
            </label>
            {hasActiveFilters ? (
              <button className="secondary-button manager-clear" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
        <div className="manager-state-row">
          <p className="manager-tip">Tip: storefront order is the default so you can review what customers are most likely to notice first today.</p>
          {hasWorkingState ? (
            <button className="secondary-link manager-start-fresh" type="button" onClick={handleStartFresh}>
              Start fresh
            </button>
          ) : null}
        </div>
        {selectedIds.length ? (
          <div className="batch-actions-strip" aria-label="Batch shortlist actions">
            <span>
              <strong>{selectedVisibleCount || selectedIds.length}</strong> selected
            </span>
            <button className="secondary-link" type="button" onClick={shortlistSelected}>
              Shortlist selected
            </button>
            <button className="secondary-link" type="button" onClick={removeSelectedFromShortlist}>
              Remove from shortlist
            </button>
            <button className="secondary-link" type="button" onClick={clearSelection}>
              Clear selection
            </button>
          </div>
        ) : null}
        <div className="today-picks-strip" aria-label="Today picks summary">
          <span>
            <strong>{visibleFeaturedCount}</strong> featured today
          </span>
          <span>
            <strong>{visibleShortlistedCount}</strong> shortlisted
          </span>
          <span>
            <strong>{visibleReadyCount}</strong> ready
          </span>
          <span>
            <strong>{visibleNeedsAttentionCount}</strong> needs attention
          </span>
          {chosenProductId ? (
            <span>
              <strong>1</strong> chosen for today
            </span>
          ) : null}
        </div>
        <div className="inventory-list">
          <div className="inventory-head" aria-hidden="true">
            <span>Product</span>
            <span>Price</span>
            <span>Status</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>

          {filteredProducts.map((product) => {
            const isBrandNewToday = isNewToday(product);
            const isRecentlyAdded = !isBrandNewToday && isNewArrival(product);
            const readiness = getReadinessState(product);
            const normalizedStockStatus = normalizeStockStatus(product.stockStatus);
            const missingSummary = readiness.missing.slice(0, 2).join(" + ");
            const isShortlisted = shortlistedIds.includes(product.id);
            const isTopPick = readiness.ready && (product.featured || isShortlisted);
            const isChosen = chosenProductId === product.id;
            const isRowBusy = updatingStockId === product.id || quickActionBusyId === product.id;
            const rowFeedback = quickActionFeedback?.productId === product.id ? quickActionFeedback.message : null;

            return (
            <article
              key={product.id}
              className={
                isChosen
                  ? "inventory-row-card inventory-row-card-chosen"
                  : isTopPick
                    ? "inventory-row-card inventory-row-card-top-pick"
                    : "inventory-row-card"
              }
            >
                <div className="inventory-product-cell">
                  <div className="product-row-main">
                    <label className="row-select-toggle" aria-label={`Select ${product.name}`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(product.id)}
                        onChange={() => toggleSelected(product.id)}
                      />
                    </label>
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
                      <strong className="product-row-name">{product.name}</strong>
                      <div className="product-row-badges">
                        {product.featured ? <span className="table-badge">Featured</span> : null}
                        {!product.storefrontVisible ? <span className="table-badge table-badge-muted">Hidden</span> : null}
                        {(product.sortPriority ?? 0) > 0 ? <span className="table-badge">Priority {product.sortPriority}</span> : null}
                        {isBrandNewToday ? <span className="table-badge table-badge-fresh">New today</span> : null}
                        {isRecentlyAdded ? <span className="table-badge table-badge-fresh">New</span> : null}
                        <span className={readiness.ready ? "table-badge table-badge-ready" : "table-badge table-badge-needs"}>
                          {readiness.ready ? "Ready" : "Needs details"}
                        </span>
                        {isTopPick ? <span className="table-badge table-badge-top-pick">Top pick</span> : null}
                        {isChosen ? <span className="table-badge table-badge-chosen">Chosen for today</span> : null}
                      </div>
                      <span>{product.categoryName}</span>
                      {!readiness.ready ? <span className="inventory-readiness-hint">Missing {missingSummary}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="inventory-meta-cell inventory-price-cell">
                  <span className="inventory-meta-label">Price</span>
                  <strong>{formatCurrency(product.price, product.currency)}</strong>
                </div>

                <div className="inventory-meta-cell inventory-status-cell">
                  <span className="inventory-meta-label">Status</span>
                  <div className="inventory-stock-editor">
                    <span className={`status-pill ${getStockStatusClassName(normalizedStockStatus).replace("stock-", "status-pill-")}`}>
                      {getStockStatusLabel(normalizedStockStatus)}
                    </span>
                    <select
                      className="inventory-stock-select"
                      aria-label={`Set stock status for ${product.name}`}
                      value={normalizedStockStatus}
                      onChange={(event) => handleStockStatusChange(product, event.target.value as Product["stockStatus"])}
                      disabled={isRowBusy}
                    >
                      {STOCK_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {getStockStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                    {updatingStockId === product.id ? <span className="inventory-stock-saving">Saving...</span> : null}
                  </div>
                </div>

                <div className="inventory-meta-cell inventory-updated-cell">
                  <span className="inventory-meta-label">Updated</span>
                  <strong>{formatDate(product.updatedAt)}</strong>
                </div>

                <div className="inventory-actions-cell">
                  <div className="actions-menu actions-inline" ref={openActionsMenuId === product.id ? activeActionsMenuRef : null}>
                    <button
                      className="actions-menu-trigger actions-menu-trigger-label"
                      type="button"
                      aria-label={`Open actions for ${product.name}`}
                      aria-haspopup="menu"
                      aria-expanded={openActionsMenuId === product.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleActionsMenu(product.id);
                      }}
                      disabled={isRowBusy}
                    >
                      <span>{quickActionBusyId === product.id ? "Working..." : "Actions"}</span>
                    </button>
                    {openActionsMenuId === product.id ? (
                      <div className="actions-menu-popover" role="menu">
                        <button
                          className="actions-menu-item"
                          type="button"
                          role="menuitem"
                          disabled={isRowBusy}
                          onClick={() => {
                            closeActionsMenu();
                            void handleQuickStockAction(product, "in_stock");
                          }}
                        >
                          Mark in stock
                        </button>
                        <button
                          className="actions-menu-item"
                          type="button"
                          role="menuitem"
                          disabled={isRowBusy}
                          onClick={() => {
                            closeActionsMenu();
                            void handleQuickStockAction(product, "low_stock");
                          }}
                        >
                          Mark low stock
                        </button>
                        <button
                          className="actions-menu-item"
                          type="button"
                          role="menuitem"
                          disabled={isRowBusy}
                          onClick={() => {
                            closeActionsMenu();
                            void handleQuickStockAction(product, "sold_out");
                          }}
                        >
                          Mark sold out
                        </button>
                        <button
                          className="actions-menu-item"
                          type="button"
                          role="menuitem"
                          disabled={isRowBusy}
                          onClick={() => {
                            closeActionsMenu();
                            void handleFeaturedToggle(product);
                          }}
                        >
                          {product.featured ? "Remove featured" : "Feature item"}
                        </button>
                        <button
                          className="actions-menu-item"
                          type="button"
                          role="menuitem"
                          disabled={isRowBusy}
                          onClick={() => {
                            closeActionsMenu();
                            void handleStorefrontVisibilityToggle(product);
                          }}
                        >
                          {product.storefrontVisible ? "Hide from storefront" : "Show on storefront"}
                        </button>
                        <div className="actions-menu-divider" role="separator" />
                        <button
                          className="actions-menu-item"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeActionsMenu();
                            setSelectedProduct(product);
                          }}
                        >
                          View details
                        </button>
                        <Link
                          href={`/admin/products/${product.id}`}
                          className="actions-menu-item"
                          role="menuitem"
                          onClick={closeActionsMenu}
                        >
                          Edit product
                        </Link>
                        {!readiness.ready ? (
                          <Link
                            href={`/admin/products/${product.id}`}
                            className="actions-menu-item"
                            role="menuitem"
                            onClick={closeActionsMenu}
                          >
                            Fix now
                          </Link>
                        ) : null}
                        <Link
                          href={buildProductPath(product.slug)}
                          className="actions-menu-item"
                          target="_blank"
                          rel="noreferrer"
                          role="menuitem"
                          onClick={closeActionsMenu}
                        >
                          View product
                        </Link>
                        <button
                          className="actions-menu-item"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeActionsMenu();
                            toggleChosen(product.id);
                          }}
                        >
                          {isChosen ? "Clear chosen" : "Choose for today"}
                        </button>
                        <button
                          className="actions-menu-item"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeActionsMenu();
                            toggleShortlist(product.id);
                          }}
                        >
                          {isShortlisted ? "Remove from shortlist" : "Shortlist"}
                        </button>
                        <button
                          className="actions-menu-item"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeActionsMenu();
                            handleCopyLink(product);
                          }}
                        >
                          {copiedProductId === product.id ? "Copied link" : "Copy link"}
                        </button>
                        <button
                          className="actions-menu-item"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeActionsMenu();
                            handleDuplicate(product);
                          }}
                        >
                          Duplicate
                        </button>
                        <button
                          className="actions-menu-item"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeActionsMenu();
                            setQrProduct(product);
                          }}
                        >
                          Generate QR
                        </button>
                        <button
                          className="actions-menu-item"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeActionsMenu();
                            handleOpenStatusImage(product);
                          }}
                        >
                          Download status image
                        </button>
                        <button
                          className="actions-menu-item actions-menu-item-danger"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeActionsMenu();
                            handleDelete(product);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {rowFeedback ? <span className="inventory-action-feedback">{rowFeedback}</span> : null}
                </div>
              </article>
            );
          })}

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
                &times;
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
                  <strong>{getStockStatusLabel(normalizeStockStatus(selectedProduct.stockStatus))}</strong>
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
                  <span>Storefront</span>
                  <strong>{selectedProduct.storefrontVisible ? "Visible" : "Hidden"}</strong>
                </div>
                <div className="product-view-row">
                  <span>Priority</span>
                  <strong>{selectedProduct.sortPriority ?? 0}</strong>
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
                &times;
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
                <p>Review the 9:16 preview, then export a ready-made WhatsApp Status image with the QR already placed.</p>
              </div>
              <button
                className="contact-modal-close"
                type="button"
                aria-label="Close status image modal"
                onClick={() => setStatusImageProduct(null)}
              >
                &times;
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
                <p className="product-status-note">Use Copy link for quick sharing, or export the final PNG once the preview looks right.</p>
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
