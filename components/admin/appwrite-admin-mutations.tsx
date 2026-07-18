"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AppwriteAdminCatalogue,
  AppwriteAdminProduct
} from "@/lib/appwrite/admin-catalogue";
import type { AppwriteApplicationRole } from "@/lib/appwrite/resources";

function requestKey() {
  return `phase3y_${crypto.randomUUID()}`;
}

async function readResult(response: Response) {
  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    code?: string;
  };
  if (!response.ok || !payload.ok) {
    const refresh =
      payload.code === "STALE_WRITE"
        ? " Refresh the catalogue and retry."
        : "";
    throw new Error(`${payload.error ?? "Mutation failed."}${refresh}`);
  }
}

export function AppwriteAdminMutations({
  catalogue,
  role,
  enabled
}: {
  catalogue: AppwriteAdminCatalogue;
  role: AppwriteApplicationRole;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function perform(action: () => Promise<Response>, success: string) {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      await readResult(await action());
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mutation failed.");
    } finally {
      setPending(false);
    }
  }

  function json(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>
  ) {
    return fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  if (!enabled) {
    return (
      <section className="panel-card">
        <p className="eyebrow">Safety gate</p>
        <h2>Catalogue mutations are disabled</h2>
        <p>
          The catalogue remains available for review. Mutation controls become
          available only in an explicitly approved verification process.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="panel-card">
        <div className="admin-catalogue-section-heading">
          <div>
            <p className="eyebrow">Categories</p>
            <h2>Create category</h2>
          </div>
        </div>
        <form
          className="admin-mutation-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void perform(
              () =>
                json("/api/admin/categories", "POST", {
                  name: form.get("name"),
                  idempotencyKey: requestKey()
                }),
              "Category created."
            );
          }}
        >
          <label>
            Name
            <input name="name" maxLength={160} required disabled={pending} />
          </label>
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Working…" : "Create category"}
          </button>
        </form>
        <div className="admin-mutation-list">
          {catalogue.categories.map((category) => (
            <form
              className="admin-mutation-form admin-mutation-row"
              key={category.key}
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void perform(
                  () =>
                    json("/api/admin/categories", "PATCH", {
                      categoryId: category.id,
                      name: form.get("name"),
                      expectedUpdatedAt: category.updatedAt,
                      idempotencyKey: requestKey()
                    }),
                  "Category renamed."
                );
              }}
            >
              <label>
                Category name
                <input
                  name="name"
                  defaultValue={category.name}
                  maxLength={160}
                  required
                  disabled={pending}
                />
              </label>
              <button className="secondary-button" disabled={pending} type="submit">
                Rename
              </button>
              {role === "admin" ? (
                <button
                  className="secondary-button"
                  disabled={pending}
                  type="button"
                  onClick={() => {
                    if (!confirm(`Delete category “${category.name}”?`)) return;
                    void perform(
                      () =>
                        json("/api/admin/categories", "DELETE", {
                            categoryId: category.id,
                          expectedUpdatedAt: category.updatedAt,
                          idempotencyKey: requestKey()
                        }),
                      "Category deleted."
                    );
                  }}
                >
                  Delete
                </button>
              ) : null}
            </form>
          ))}
        </div>
      </section>

      <section className="panel-card">
        <div className="admin-catalogue-section-heading">
          <div>
            <p className="eyebrow">Products</p>
            <h2>Create hidden product</h2>
          </div>
        </div>
        <form
          className="admin-mutation-form admin-product-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void perform(
              () =>
                json("/api/admin/products", "POST", {
                  name: form.get("name"),
                  description: form.get("description"),
                  brand: form.get("brand"),
                  preferredContactId: null,
                  categoryId: form.get("categoryId"),
                  price: Number(form.get("price")),
                  currency: "PKR",
                  condition: form.get("condition"),
                  stockStatus: form.get("stockStatus"),
                  featured: false,
                  statusPick: false,
                  storefrontVisible: false,
                  feedVisible: false,
                  sortPriority: 0,
                  imageFileId: null,
                  idempotencyKey: requestKey()
                }),
              "Product created."
            );
          }}
        >
          <label>
            Name
            <input name="name" maxLength={160} required disabled={pending} />
          </label>
          <label>
            Description
            <textarea name="description" minLength={1} required disabled={pending} />
          </label>
          <label>
            Brand
            <select name="brand" defaultValue="univercell" disabled={pending}>
              <option value="univercell">Univercell</option>
              <option value="eko">EKO</option>
            </select>
          </label>
          <label>
            Category
            <select name="categoryId" required disabled={pending}>
              <option value="">Choose category</option>
              {catalogue.categories.map((category) => (
                <option value={category.id} key={category.key}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Price (PKR)
            <input name="price" type="number" min={1} required disabled={pending} />
          </label>
          <label>
            Condition
            <select name="condition" defaultValue="New" disabled={pending}>
              <option>New</option>
              <option>Like New</option>
              <option>Used</option>
            </select>
          </label>
          <label>
            Stock
            <select name="stockStatus" defaultValue="in_stock" disabled={pending}>
              <option value="in_stock">In stock</option>
              <option value="low_stock">Low stock</option>
              <option value="sold_out">Sold out</option>
            </select>
          </label>
          <button
            className="primary-button"
            disabled={pending || catalogue.categories.length === 0}
            type="submit"
          >
            {pending ? "Working…" : "Create product"}
          </button>
        </form>
      </section>

      {catalogue.products.map((product) => (
        <ProductMutationCard
          key={product.key}
          product={product}
          categories={catalogue.categories}
          role={role}
          pending={pending}
          perform={perform}
          json={json}
        />
      ))}

      <div aria-live="polite" className="admin-mutation-message">
        {message}
      </div>
    </>
  );
}

function ProductMutationCard({
  product,
  categories,
  role,
  pending,
  perform,
  json
}: {
  product: AppwriteAdminProduct;
  categories: AppwriteAdminCatalogue["categories"];
  role: AppwriteApplicationRole;
  pending: boolean;
  perform: (action: () => Promise<Response>, success: string) => Promise<void>;
  json: (
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>
  ) => Promise<Response>;
}) {
  function lifecycle(body: Record<string, unknown>, success: string) {
    void perform(
      () =>
        json("/api/admin/product-lifecycle", "POST", {
          ...body,
          idempotencyKey: requestKey()
        }),
      success
    );
  }
  return (
    <section className="panel-card">
      <div className="admin-catalogue-product-heading">
        <div>
          <p className="eyebrow">Product</p>
          <h2>{product.name}</h2>
          <span>{product.storefrontVisible ? "Published" : "Hidden"}</span>
        </div>
        {product.chosenState === "selected" ? (
          <span className="admin-state-pill admin-state-public">Chosen</span>
        ) : null}
      </div>
      <form
        className="admin-mutation-form admin-product-form"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void perform(
            () =>
              json("/api/admin/products", "PATCH", {
                productId: product.id,
                expectedUpdatedAt: product.updatedAt,
                name: form.get("name"),
                description: form.get("description"),
                categoryId: form.get("categoryId"),
                price: Number(form.get("price")),
                stockStatus: form.get("stockStatus"),
                idempotencyKey: requestKey()
              }),
            "Product updated."
          );
        }}
      >
        <label>
          Name
          <input name="name" defaultValue={product.name} required disabled={pending} />
        </label>
        <label>
          Description
          <textarea
            name="description"
            defaultValue={product.description}
            required
            disabled={pending}
          />
        </label>
        <label>
          Category
          <select name="categoryId" defaultValue={product.categoryId} disabled={pending}>
            {categories.map((category) => (
              <option value={category.id} key={category.key}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Price
          <input
            name="price"
            type="number"
            min={1}
            defaultValue={product.price}
            required
            disabled={pending}
          />
        </label>
        <label>
          Stock
          <select name="stockStatus" defaultValue={product.stockStatus} disabled={pending}>
            <option value="in_stock">In stock</option>
            <option value="low_stock">Low stock</option>
            <option value="sold_out">Sold out</option>
          </select>
        </label>
        <button className="secondary-button" type="submit" disabled={pending}>
          Save product
        </button>
      </form>

      <form
        className="admin-mutation-form admin-mutation-row"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const file = form.get("file");
          if (!(file instanceof File) || file.size === 0) {
            void perform(
              () => Promise.reject(new Error("Choose an image file.")),
              ""
            );
            return;
          }
          if (
            file.size > 1024 * 1024 ||
            !["image/jpeg", "image/png", "image/webp"].includes(file.type)
          ) {
            void perform(
              () =>
                Promise.reject(
                  new Error("Choose a JPEG, PNG, or WebP image up to 1 MiB.")
                ),
              ""
            );
            return;
          }
          const body = new FormData();
          body.set("operation", product.hasImage ? "replace" : "upload");
          body.set("productId", product.id);
          body.set("expectedUpdatedAt", product.updatedAt);
          body.set("idempotencyKey", requestKey());
          body.set("file", file);
          void perform(
            () => fetch("/api/admin/product-images", { method: "POST", body }),
            product.hasImage ? "Image replaced." : "Image uploaded."
          );
        }}
      >
        <label>
          Product image
          <input
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            disabled={pending}
          />
        </label>
        <button className="secondary-button" type="submit" disabled={pending}>
          {product.hasImage ? "Replace image" : "Upload image"}
        </button>
      </form>

      <div className="admin-mutation-actions">
        <button
          className="secondary-button"
          disabled={pending}
          onClick={() =>
            lifecycle(
              {
                operation: "visibility",
                productId: product.id,
                expectedUpdatedAt: product.updatedAt,
                storefrontVisible: !product.storefrontVisible
              },
              product.storefrontVisible ? "Product hidden." : "Product published."
            )
          }
          type="button"
        >
          {product.storefrontVisible ? "Hide" : "Publish"}
        </button>
        {(["feedVisible", "featured", "statusPick"] as const).map((field) => (
          <button
            className="secondary-button"
            disabled={pending}
            key={field}
            onClick={() =>
              lifecycle(
                {
                  operation: "merchandising",
                  productId: product.id,
                  expectedUpdatedAt: product.updatedAt,
                  [field]: !product[field]
                },
                `${field} updated.`
              )
            }
            type="button"
          >
            {product[field] ? `Disable ${field}` : `Enable ${field}`}
          </button>
        ))}
        <button
          className="secondary-button"
          disabled={pending}
          onClick={() =>
            lifecycle(
              {
                operation: "chosen",
                targetProductId: product.id,
                expectedTargetUpdatedAt: product.updatedAt
              },
              "Chosen product updated."
            )
          }
          type="button"
        >
          {product.chosenState === "selected" ? "Retry chosen" : "Select chosen"}
        </button>
        {product.chosenState === "selected" ? (
          <button
            className="secondary-button"
            disabled={pending}
            onClick={() =>
              lifecycle(
                {
                  operation: "chosen_clear",
                  targetProductId: product.id,
                  expectedTargetUpdatedAt: product.updatedAt
                },
                "Chosen selection cleared."
              )
            }
            type="button"
          >
            Clear chosen
          </button>
        ) : null}
        {product.hasImage ? (
          <button
            className="secondary-button"
            disabled={pending || product.storefrontVisible}
            onClick={() => {
              const body = new FormData();
              body.set("operation", "remove");
              body.set("productId", product.id);
              body.set("expectedUpdatedAt", product.updatedAt);
              body.set("idempotencyKey", requestKey());
              void perform(
                () => fetch("/api/admin/product-images", { method: "POST", body }),
                "Image removed."
              );
            }}
            type="button"
          >
            Remove image
          </button>
        ) : null}
        {role === "admin" ? (
          <button
            className="secondary-button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Permanently delete “${product.name}”?`)) return;
              void perform(
                () =>
                  json("/api/admin/products", "DELETE", {
                    productId: product.id,
                    expectedUpdatedAt: product.updatedAt,
                    idempotencyKey: requestKey()
                  }),
                "Product deleted."
              );
            }}
            type="button"
          >
            Delete product
          </button>
        ) : null}
      </div>
    </section>
  );
}
