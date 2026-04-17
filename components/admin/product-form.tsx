"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

export function ProductForm({ mode, actor, initialProduct }: ProductFormProps) {
  const router = useRouter();
  const initialValues: ProductFormValues = {
    name: initialProduct?.name ?? "",
    description: initialProduct?.description ?? "",
    brand: initialProduct?.brand ?? inferBrandFromCategory(initialProduct?.categoryName ?? "") ?? "",
    preferredContactId: initialProduct?.preferredContactId ?? initialProduct?.assignedContactId ?? initialProduct?.contactId ?? "",
    categoryName: initialProduct?.categoryName ?? "",
    price: initialProduct?.price ? String(initialProduct.price) : "",
    condition: initialProduct?.condition ?? "Used",
    stockStatus: initialProduct?.stockStatus ?? "In Stock",
    featured: initialProduct?.featured ?? false
  };
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [brandTouched, setBrandTouched] = useState(Boolean(initialProduct?.brand));
  const [submitMode, setSubmitMode] = useState<"save" | "save_and_add_another">("save");

  const categorySuggestions = useMemo(
    () => Array.from(new Set(STORE_BRANDS.flatMap((brand) => brand.categoryNames))),
    []
  );
  const filteredContacts = useMemo(() => TEAM_CONTACTS.filter((contact) => contact.active), []);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(initialProduct?.imageUrl ?? null);

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
    setSubmitting(true);

    const trimmedName = values.name.trim();
    const trimmedDescription = values.description.trim();
    const trimmedCategory = values.categoryName.trim();
    const parsedPrice = Number(values.price);

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

    const payload: ProductFormValues = {
      ...values,
      name: trimmedName,
      description: trimmedDescription,
      categoryName: trimmedCategory,
      price: String(parsedPrice)
    };

    try {
      if (mode === "create") {
        await createProduct(payload, actor, imageFile);
      } else if (initialProduct) {
        await updateProduct(initialProduct.id, initialProduct, payload, actor, imageFile);
      }

      if (mode === "create" && submitMode === "save_and_add_another") {
        setValues({
          ...initialValues,
          brand: values.brand,
          preferredContactId: values.preferredContactId,
          categoryName: values.categoryName,
          condition: values.condition,
          stockStatus: values.stockStatus
        });
        setImageFile(null);
        setImagePreviewUrl(null);
        setBrandTouched(Boolean(values.brand));
        setError("");
        router.refresh();
        return;
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
            <small className="field-helper">Keep it brief and useful: condition, standout features, and what the buyer is getting.</small>
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-head">
          <div>
            <h2>Pricing and stock</h2>
            <p>Set the price and availability details customers will see today.</p>
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
            <small className="field-helper">Enter the final selling price customers should see on the product card.</small>
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
            <h2>Display settings</h2>
            <p>Choose how prominently this item appears on the storefront.</p>
          </div>
        </div>
        <div className="form-section-grid">
          <label className="checkbox-row form-toggle-card">
            <input type="checkbox" checked={values.featured} onChange={(event) => setValues((current) => ({ ...current, featured: event.target.checked }))} />
            <span>Show in featured products</span>
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-head">
          <div>
            <h2>Product image</h2>
            <p>Add a clear image that looks good on mobile and loads quickly.</p>
          </div>
        </div>
        <div className="form-section-grid">
          <label className="form-section-span-full">
            <span>{mode === "create" ? "Product image" : "Replace image"}</span>
            <input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} />
            <small className="field-helper">Use clean, properly cropped images that are clear on mobile and reasonably sized for fast uploads.</small>
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
            <h2>WhatsApp routing</h2>
            <p>Choose who should appear first in the customer WhatsApp chooser.</p>
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
            <small className="field-helper">All active WhatsApp contacts still appear in the chooser. This only controls the suggested first option.</small>
          </label>
        </div>
      </section>
      {error ? <div className="inline-error">{error}</div> : null}
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
