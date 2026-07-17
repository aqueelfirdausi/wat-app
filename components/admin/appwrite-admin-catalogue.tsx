import type {
  AppwriteAdminCatalogue,
  AppwriteAdminProduct
} from "@/lib/appwrite/admin-catalogue";
import { loadBackendAdminCatalogue } from "@/lib/appwrite/admin-catalogue";
import { requireCurrentAppwriteStaffIdentity } from "@/lib/appwrite/auth/current-staff";
import { getServerBackendMode } from "@/lib/backend/server";

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(price);
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi"
  }).format(new Date(value));
}

function visibilityLabel(product: AppwriteAdminProduct) {
  if (product.storefrontVisible && product.isPubliclyReadable) return "Public storefront";
  if (product.storefrontVisible) return "Private despite visibility";
  return "Hidden";
}

function imageLabel(product: AppwriteAdminProduct) {
  switch (product.imageState) {
    case "public":
      return "Public image";
    case "private":
      return "Private image";
    case "legacy_public":
      return "Legacy public image";
    case "unavailable":
      return "Image unavailable";
    default:
      return "No image";
  }
}

export function AppwriteAdminCatalogueView({
  catalogue,
  heading = "Read-only catalogue"
}: {
  catalogue: AppwriteAdminCatalogue;
  heading?: string;
}) {
  const { products, categories, summary } = catalogue;

  return (
    <div className="dashboard-stack appwrite-admin-catalogue">
      <section className="panel-card">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Appwrite · read only</p>
            <h1>{heading}</h1>
            <p>
              Live staff catalogue data. Creating, editing, publishing, reordering,
              uploading, and deleting remain unavailable.
            </p>
          </div>
          <span className="admin-readonly-badge">Mutations disabled</span>
        </div>

        <div className="admin-catalogue-stats" aria-label="Catalogue summary">
          <div className="dashboard-stat">
            <strong>{summary.totalProducts}</strong>
            <span>Products</span>
          </div>
          <div className="dashboard-stat">
            <strong>{summary.totalCategories}</strong>
            <span>Categories</span>
          </div>
          <div className="dashboard-stat dashboard-stat-good">
            <strong>{summary.publicProducts}</strong>
            <span>Public</span>
          </div>
          <div className="dashboard-stat dashboard-stat-warn">
            <strong>{summary.hiddenProducts}</strong>
            <span>Hidden/private</span>
          </div>
          <div className="dashboard-stat">
            <strong>{summary.inStockProducts}</strong>
            <span>In stock</span>
          </div>
          <div className="dashboard-stat dashboard-stat-warn">
            <strong>{summary.lowStockProducts}</strong>
            <span>Low stock</span>
          </div>
          <div className="dashboard-stat dashboard-stat-bad">
            <strong>{summary.soldOutProducts}</strong>
            <span>Sold out</span>
          </div>
          <div className="dashboard-stat">
            <strong>{summary.productsWithImages}</strong>
            <span>With images</span>
          </div>
        </div>
      </section>

      <section className="panel-card">
        <div className="admin-catalogue-section-heading">
          <div>
            <p className="eyebrow">Inventory</p>
            <h2>Products</h2>
          </div>
          <span>{products.length} validated</span>
        </div>

        {products.length === 0 ? (
          <div className="admin-catalogue-empty">
            <strong>No Appwrite products yet</strong>
            <span>The empty catalogue is valid. No sample or Firebase data is shown.</span>
          </div>
        ) : (
          <div className="admin-catalogue-product-list">
            {products.map((product) => (
              <article className="admin-catalogue-product" key={product.key}>
                <div className="admin-catalogue-product-heading">
                  <div>
                    <h3>{product.name}</h3>
                    <span>{product.slug}</span>
                  </div>
                  <span
                    className={
                      product.storefrontVisible && product.isPubliclyReadable
                        ? "admin-state-pill admin-state-public"
                        : "admin-state-pill admin-state-hidden"
                    }
                  >
                    {visibilityLabel(product)}
                  </span>
                </div>

                <dl className="admin-catalogue-product-grid">
                  <div>
                    <dt>Category</dt>
                    <dd>{product.categoryName}</dd>
                  </div>
                  <div>
                    <dt>Price</dt>
                    <dd>{formatPrice(product.price, product.currency)}</dd>
                  </div>
                  <div>
                    <dt>Condition</dt>
                    <dd>{product.condition}</dd>
                  </div>
                  <div>
                    <dt>Stock</dt>
                    <dd>{product.stockStatus.replaceAll("_", " ")}</dd>
                  </div>
                  <div>
                    <dt>Feed</dt>
                    <dd>{product.feedVisible ? "Visible" : "Hidden"}</dd>
                  </div>
                  <div>
                    <dt>Image</dt>
                    <dd>{imageLabel(product)}</dd>
                  </div>
                  <div>
                    <dt>Flags</dt>
                    <dd>
                      {[
                        product.featured ? "Featured" : "",
                        product.statusPick ? "Status pick" : "",
                        product.chosenState === "selected" ? "Chosen" : ""
                      ].filter(Boolean).join(" · ") || "None"}
                    </dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{formatUpdatedAt(product.updatedAt)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card">
        <div className="admin-catalogue-section-heading">
          <div>
            <p className="eyebrow">Taxonomy</p>
            <h2>Categories</h2>
          </div>
          <span>{categories.length} validated</span>
        </div>

        {categories.length === 0 ? (
          <div className="admin-catalogue-empty">
            <strong>No Appwrite categories yet</strong>
            <span>Categories will appear here after a separately approved migration.</span>
          </div>
        ) : (
          <div className="admin-category-list">
            {categories.map((category) => (
              <article className="admin-category-row" key={category.key}>
                <div>
                  <strong>{category.name}</strong>
                  <span>{category.slug}</span>
                </div>
                <div>
                  <strong>{category.productCount}</strong>
                  <span>{category.productCount === 1 ? "product" : "products"}</span>
                </div>
                <span className="admin-state-pill">
                  {category.isPubliclyReadable ? "Public read" : "Staff only"}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export async function AppwriteAdminCataloguePage({
  heading
}: {
  heading?: string;
}) {
  const identity = await requireCurrentAppwriteStaffIdentity();
  const catalogue = await loadBackendAdminCatalogue(
    getServerBackendMode(),
    identity
  );
  if (!catalogue) return null;
  return <AppwriteAdminCatalogueView catalogue={catalogue} heading={heading} />;
}
