"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { inferBrandFromCategory } from "@/lib/brands";
import { STORE_BRANDS } from "@/lib/brands";
import { PRODUCT_BRANDS, PRODUCT_CONDITIONS, STOCK_STATUSES } from "@/lib/constants";
import { createProduct, updateProduct } from "@/lib/firebase/firestore";
import { TEAM_CONTACTS } from "@/lib/team-contacts";
import { Product, ProductFormValues } from "@/lib/types";

type ProductFormProps = {
  mode: "create" | "edit";
  actor: {
    uid: string;
    name: string;
    email: string;
  };
  initialProduct?: Product;
};

const SAVE_FEEDBACK_STORAGE_KEY = "watapp-admin-save-feedback";
const DUPLICATE_DRAFT_STORAGE_KEY = "watapp-admin-duplicate-draft";

export function ProductForm({ mode, actor, initialProduct }: ProductFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialValues: ProductFormValues = {
    name: initialProduct?.name ?? "",
    description: initialProduct?.description ?? "",
    brand: initialProduct?.brand ?? inferBrandFromCategory(initialProduct?.categoryName ?? "") ?? "",
    preferredContactId: initialProduct?.preferredContactId ?? initialProduct?.assignedContactId ?? initialProduct?.contactId ?? "",
    categoryName: initialProduct?.categoryName ?? "",
    price: initialProduct?.price ? String(initialProduct.price) : "",
    condition: initialProduct?.condition ?? "Used",
    stockStatus: initialProduct?.stockStatus ?? "In Stock",
    featured: initialProduct?.featured ?? false,
    sortPriority: String(initialProduct?.sortPriority ?? 0)
  };
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<{ message: string; hint: string } | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [brandTouched, setBrandTouched] = useState(Boolean(initialProduct?.brand));
  const [submitMode, setSubmitMode] = useState<"save" | "save_and_add_another">("save");

  const categorySuggestions = useMemo(
    () => Array.from(new Set(STORE_BRANDS.flatMap((brand) => brand.categoryNames))),
    []
  );
  const filteredContacts = useMemo(() => TEAM_CONTACTS.filter((contact) => contact.active), []);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(initialProduct?.imageUrl ?? null);
  const trimmedName = values.name.trim();
  const trimmedDescription = values.description.trim();
  const parsedPrice = Number(values.price);
  const checklistItems = [
    { label: "Name", complete: Boolean(trimmedName) },
    { label: "Price", complete: Number.isFinite(parsedPrice) && parsedPrice > 0 },
    { label: "Image", complete: Boolean(imageFile || imagePreviewUrl) },
    { label: "Details", complete: Boolean(trimmedDescription) }
  ];
  const isReadyForPosting = checklistItems.every((item) => item.complete);

  function getSaveFeedback() {
    if (isReadyForPosting) {
      return {
        message: "Saved — ready for posting",
        hint: "You can now shortlist it, feature it, or use it for today’s posting."
      };
    }

    const nextIncomplete = checklistItems.find((item) => !item.complete)?.label ?? "Details";
    return {
      message: "Saved — still needs details",
      hint: `Next: add ${nextIncomplete.toLowerCase()}.`
    };
  }

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(initialProduct?.imageUrl ?? null);
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [imageFile, initialProduct?.imageUrl]);

  useEffect(() => {
    if (mode !== "create" || searchParams.get("duplicate") !== "1" || typeof window === "undefined") {
      return;
    }

    const raw = window.sessionStorage.getItem(DUPLICATE_DRAFT_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        sourceName?: string;
        values?: Partial<ProductFormValues>;
      };

      if (parsed.values) {
        setValues((current) => ({
          ...current,
          ...parsed.values
        }));
        setBrandTouched(Boolean(parsed.values.brand));
      }

      if (parsed.sourceName) {
        setDuplicateNotice(`Duplicated from ${parsed.sourceName}. Review details and upload an image if needed before saving.`);
      }
    } catch {
      // Ignore malformed duplicate draft payloads.
    } finally {
      window.sessionStorage.removeItem(DUPLICATE_DRAFT_STORAGE_KEY);
    }
  }, [mode, searchParams]);

  useEffect(() => {
    if (brandTouched) {
      return;
    }

    const inferredBrand = inferBrandFromCategory(values.categoryName);
    setValues((current) => ({
      ...current,
      brand: inferredBrand ?? ""
    }));
  }, [brandTouched, values.categoryName]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaveFeedback(null);
    setSubmitting(true);

    const trimmedCategory = values.categoryName.trim();

    if (!trimmedName || !trimmedDescription || !trimmedCategory) {
      setError("Product name, description, and category are required.");
      setSubmitting(false);
      return;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Enter a valid price greater than zero.");
      setSubmitting(false);
      return;
    }

    const parsedPriority = Number(values.sortPriority);
    if (!Number.isFinite(parsedPriority) || parsedPriority < 0) {
      setError("Priority must be zero or a positive number.");
      setSubmitting(false);
      return;
    }

    const payload: ProductFormValues = {
      ...values,
      name: trimmedName,
      description: trimmedDescription,
      categoryName: trimmedCategory,
      price: String(parsedPrice),
      sortPriority: String(Math.trunc(parsedPriority))
    };

    try {
      if (mode === "create") {
        await createProduct(payload, actor, imageFile);
      } else if (initialProduct) {
        await updateProduct(initialProduct.id, initialProduct, payload, actor, imageFile);
      }

      const feedback = getSaveFeedback();

      if (mode === "create" && submitMode === "save_and_add_another") {
        setSaveFeedback(feedback);
        setValues({
          ...initialValues,
          brand: values.brand,
          preferredContactId: values.preferredContactId,
          categoryName: values.categoryName,
          condition: values.condition,
          stockStatus: values.stockStatus,
          sortPriority: values.sortPriority
        });
        setImageFile(null);
        setImagePreviewUrl(null);
        setBrandTouched(Boolean(values.brand));
        setError("");
        router.refresh();
        return;
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(SAVE_FEEDBACK_STORAGE_KEY, JSON.stringify(feedback));
      }

      router.push("/admin/products");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save product.";
      setError(message);
    } finally {
      setSubmitting(false);
      setSubmitMode("save");
    }
  }

  return (
    <form className="panel-card form-grid" onSubmit={handleSubmit}>
      <div className="form-header">
        <div>
          <p className="eyebrow">{mode === "create" ? "New product" : "Edit product"}</p>
          <h1>{mode === "create" ? "Add a product" : "Update product details"}</h1>
          <p className="form-intro">Keep daily uploads quick with clear product details, clean pricing, and the right WhatsApp routing.</p>
        </div>
        <Link href="/admin/products" className="secondary-link">
          Back to products
        </Link>
      </div>
      {duplicateNotice ? (
        <div className="notice-banner" role="status" aria-live="polite">
          <strong>Duplicated from existing product</strong>
          <span>{duplicateNotice}</span>
        </div>
      ) : null}
      <section className="form-section">
        <div className="form-section-head">
          <div>
            <h2>Basic info</h2>
            <p>Start with the product identity customers will notice first.</p>
          </div>
        </div>
        <div className="form-section-grid">
          <label>
            <span>Product name</span>
            <input
              value={values.name}
              onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
              placeholder="iPhone 13 128GB, Yara Perfume, 30W Charger..."
              autoFocus
              required
            />
            <small className="field-helper">Use a short, recognizable name that matches what buyers expect to read on WhatsApp.</small>
          </label>
          <label>
            <span>Brand</span>
            <select
              value={values.brand}
              onChange={(event) => {
                setBrandTouched(true);
                setValues((current) => ({ ...current, brand: event.target.value as ProductFormValues["brand"] }));
              }}
            >
              <option value="">Auto from category</option>
              {PRODUCT_BRANDS.map((brand) => (
                <option key={brand} value={brand}>
                  {brand === "univercell" ? "UniverCell PK" : "EKO Fragrances"}
                </option>
              ))}
            </select>
            <small className="field-helper">Leave this on auto for faster uploads unless you need to override the category mapping.</small>
          </label>
          <label>
            <span>Category</span>
            <input
              value={values.categoryName}
              onChange={(event) => setValues((current) => ({ ...current, categoryName: event.target.value }))}
              placeholder="Mobiles, Accessories, Power Banks, Perfumes..."
              list="category-suggestions"
              required
            />
            <small className="field-helper">Use a consistent category name to keep storefront browsing and filters tidy.</small>
            <datalist id="category-suggestions">
              {categorySuggestions.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>
          <label className="form-section-span-full">
            <span>Description</span>
            <textarea
              value={values.description}
              onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
              rows={4}
              placeholder="Short WhatsApp-friendly description"
              required
            />
            <small className="field-helper">Keep it brief and useful so buyers can scan the item quickly from Status.</small>
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-head">
          <div>
            <h2>Merchandising essentials</h2>
            <p>Fill the core posting basics before this item goes into today&apos;s live mix.</p>
          </div>
        </div>
        <div className="form-readiness-panel" aria-label="Posting readiness">
          <div className="form-readiness-summary">
            <span className={isReadyForPosting ? "table-badge table-badge-ready" : "table-badge table-badge-needs"}>
              {isReadyForPosting ? "Ready for posting" : "Needs details"}
            </span>
          </div>
          <div className="form-checklist">
            {checklistItems.map((item) => (
              <span key={item.label} className={item.complete ? "form-checklist-item complete" : "form-checklist-item"}>
                {item.label}
              </span>
            ))}
          </div>
        </div>
        <div className="form-section-grid">
          <label>
            <span>Price (PKR)</span>
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={values.price}
              onChange={(event) => setValues((current) => ({ ...current, price: event.target.value }))}
              placeholder="6500"
              required
            />
            <small className="field-helper">Use the real posting price customers should see today.</small>
          </label>
          <label>
            <span>Condition</span>
            <select value={values.condition} onChange={(event) => setValues((current) => ({ ...current, condition: event.target.value as Product["condition"] }))}>
              {PRODUCT_CONDITIONS.map((condition) => (
                <option key={condition} value={condition}>
                  {condition}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Stock status</span>
            <select value={values.stockStatus} onChange={(event) => setValues((current) => ({ ...current, stockStatus: event.target.value as Product["stockStatus"] }))}>
              {STOCK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <small className="field-helper">Use low stock when you want urgency without marking the item unavailable.</small>
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-head">
          <div>
            <h2>Product image</h2>
            <p>Add one clear, mobile-friendly image so the item feels ready to post immediately.</p>
          </div>
        </div>
        <div className="form-section-grid">
          <label className="form-section-span-full">
            <span>{mode === "create" ? "Product image" : "Replace image"}</span>
            <input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} />
            <small className="field-helper">Use one clean image that is clear enough for mobile storefront and WhatsApp posting.</small>
          </label>
          {imagePreviewUrl ? (
            <div className="preview-image-wrap">
              <Image src={imagePreviewUrl} alt={values.name || initialProduct?.name || "Selected product image"} width={120} height={120} className="preview-image" />
            </div>
          ) : null}
          {imageFile ? <div className="field-helper form-section-span-full">Selected image: {imageFile.name}</div> : null}
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-head">
          <div>
            <h2>Display settings</h2>
            <p>Choose how strongly this item should surface on today&apos;s live board.</p>
          </div>
        </div>
        <p className="form-section-note">Featured today highlights the item. Priority helps you review important items first.</p>
        <div className="form-section-grid">
          <label className="checkbox-row form-toggle-card">
            <input type="checkbox" checked={values.featured} onChange={(event) => setValues((current) => ({ ...current, featured: event.target.checked }))} />
            <span>Featured today</span>
            <small className="field-helper form-toggle-helper">Use for items you want highlighted first on today&apos;s board.</small>
          </label>
          <label>
            <span>Priority</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={values.sortPriority}
              onChange={(event) => setValues((current) => ({ ...current, sortPriority: event.target.value }))}
              placeholder="0"
            />
            <small className="field-helper">Higher numbers bring the item closer to the top when you review daily stock.</small>
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-head">
          <div>
            <h2>Optional routing</h2>
            <p>Only adjust this when you want a different suggested contact in the chooser.</p>
          </div>
        </div>
        <div className="form-section-grid">
          <label>
            <span>Preferred WhatsApp contact</span>
            <select
              value={values.preferredContactId}
              onChange={(event) => setValues((current) => ({ ...current, preferredContactId: event.target.value }))}
            >
              <option value="">No preference</option>
              {filteredContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name} ({contact.label})
                </option>
              ))}
            </select>
            <small className="field-helper">Only affects which active contact is suggested first in the chooser.</small>
          </label>
        </div>
      </section>
      {error ? <div className="inline-error">{error}</div> : null}
      {saveFeedback ? (
        <div className="notice-banner notice-banner-success" role="status" aria-live="polite">
          <strong>{saveFeedback.message}</strong>
          <span>{saveFeedback.hint}</span>
        </div>
      ) : null}
      <div className="form-actions">
        <Link href="/admin/products" className="secondary-link">
          Cancel
        </Link>
        <button className="primary-button" type="submit" disabled={submitting} onClick={() => setSubmitMode("save")}>
          {submitting && submitMode === "save" ? (mode === "create" ? "Creating..." : "Saving...") : mode === "create" ? "Create product" : "Save changes"}
        </button>
        {mode === "create" ? (
          <button
            className="secondary-button"
            type="submit"
            disabled={submitting}
            onClick={() => setSubmitMode("save_and_add_another")}
          >
            {submitting && submitMode === "save_and_add_another" ? "Creating..." : "Save and add another"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
