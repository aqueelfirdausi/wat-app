import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  loadAppwriteAdminCatalogue,
  loadBackendAdminCatalogue,
  type AppwriteAdminTables
} from "@/lib/appwrite/admin-catalogue";
import type { AppwriteReadStorage } from "@/lib/appwrite/product-image";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";

const now = "2026-07-17T12:00:00.000Z";
const later = "2026-07-18T12:00:00.000Z";

const categoryPublic = {
  $id: "category-public",
  $permissions: ['read("any")', 'read("team:wat_staff/admin")'],
  name: "Phones",
  slug: "phones",
  updatedAt: now
};

const categoryPrivate = {
  $id: "category-private",
  $permissions: ['read("team:wat_staff/admin")'],
  name: "Staff",
  slug: "staff",
  updatedAt: later
};

const productBase = {
  $id: "product-public",
  $permissions: ['read("any")', 'read("team:wat_staff/admin")'],
  name: "PHASE-3T fixture public product",
  slug: "phase-3t-public",
  description: "Fixture-only product",
  brand: "eko",
  categoryId: categoryPublic.$id,
  categoryName: categoryPublic.name,
  price: 1000,
  currency: "PKR",
  condition: "New",
  stockStatus: "in_stock",
  featured: true,
  statusPick: true,
  storefrontVisible: true,
  feedVisible: true,
  sortPriority: 2,
  chosenSelectionKey: "product-public",
  imageFileId: "file-public",
  createdAt: now,
  updatedAt: later,
  createdByName: "Fixture creator",
  updatedByName: "Fixture editor"
};

const productPrivate = {
  ...productBase,
  $id: "product-private",
  $permissions: ['read("team:wat_staff/product_editor")'],
  name: "PHASE-3T fixture private product",
  slug: "phase-3t-private",
  categoryId: categoryPrivate.$id,
  categoryName: categoryPrivate.name,
  stockStatus: "low_stock",
  featured: false,
  statusPick: false,
  sortPriority: 1,
  chosenSelectionKey: "product-private",
  imageFileId: "file-private",
  updatedAt: now
};

const productHidden = {
  ...productBase,
  $id: "product-hidden",
  $permissions: ['read("team:wat_staff/admin")'],
  name: "PHASE-3T fixture hidden product",
  slug: "phase-3t-hidden",
  storefrontVisible: false,
  feedVisible: true,
  stockStatus: "sold_out",
  featured: false,
  statusPick: false,
  sortPriority: 1,
  chosenSelectionKey: "current",
  imageFileId: null,
  updatedAt: now
};

const adminIdentity: AuthenticatedStaffIdentity = {
  userId: "fixture-admin",
  email: "admin@example.test",
  name: "Fixture Admin",
  role: "admin"
};

const editorIdentity: AuthenticatedStaffIdentity = {
  ...adminIdentity,
  userId: "fixture-editor",
  role: "product_editor"
};

function dependencies(
  products: Array<Record<string, unknown>>,
  categories: Array<Record<string, unknown>>
) {
  const calls: string[] = [];
  const tables: AppwriteAdminTables = {
    async listRows(input) {
      calls.push(input.tableId);
      return {
        rows: (input.tableId === "products" ? products : categories) as never[],
        total: input.tableId === "products" ? products.length : categories.length
      };
    }
  };
  const storage: AppwriteReadStorage = {
    async getFile({ fileId }) {
      return {
        $id: fileId,
        bucketId: "product_images",
        $permissions:
          fileId === "file-public"
            ? ['read("any")', 'read("team:wat_staff/admin")']
            : ['read("team:wat_staff/admin")'],
        mimeType: "image/png",
        sizeOriginal: 64,
        chunksTotal: 1,
        chunksUploaded: 1
      };
    }
  };
  return {
    calls,
    values: {
      tables,
      storage,
      endpoint: "https://fra.cloud.appwrite.io/v1",
      projectId: "fixture-project"
    }
  };
}

test("authorized admin sees public, private, and hidden validated rows", async () => {
  const fixture = dependencies(
    [productBase, productPrivate, productHidden],
    [categoryPrivate, categoryPublic]
  );
  const result = await loadAppwriteAdminCatalogue(adminIdentity, fixture.values);

  assert.deepEqual(result.products.map((product) => product.slug), [
    "phase-3t-hidden",
    "phase-3t-private",
    "phase-3t-public"
  ]);
  assert.deepEqual(result.products.map((product) => product.imageState), [
    "none",
    "private",
    "public"
  ]);
  assert.equal(result.products[0].chosenState, "selected");
  assert.equal(result.products[1].isPubliclyReadable, false);
  assert.equal(result.products[2].isPubliclyReadable, true);
  assert.deepEqual(fixture.calls.sort(), ["categories", "products"]);
});

test("authorized product editor receives the same read-only catalogue", async () => {
  const fixture = dependencies([productBase], [categoryPublic]);
  const result = await loadAppwriteAdminCatalogue(editorIdentity, fixture.values);
  assert.equal(result.products.length, 1);
  assert.equal(result.categories.length, 1);
});

test("invalid identity is denied before a catalogue read", async () => {
  const fixture = dependencies([productBase], [categoryPublic]);
  await assert.rejects(
    () =>
      loadAppwriteAdminCatalogue(
        { ...adminIdentity, role: "owner" } as unknown as AuthenticatedStaffIdentity,
        fixture.values
      ),
    /Authorized Appwrite staff identity is required/
  );
  assert.deepEqual(fixture.calls, []);
});

test("Firebase selection preserves its path without calling Appwrite", async () => {
  const fixture = dependencies([productBase], [categoryPublic]);
  const result = await loadBackendAdminCatalogue("firebase", adminIdentity, fixture.values);
  assert.equal(result, null);
  assert.deepEqual(fixture.calls, []);
});

test("empty product and category tables produce a complete zero summary", async () => {
  const result = await loadAppwriteAdminCatalogue(
    adminIdentity,
    dependencies([], []).values
  );
  assert.deepEqual(result.products, []);
  assert.deepEqual(result.categories, []);
  assert.deepEqual(result.summary, {
    totalProducts: 0,
    totalCategories: 0,
    publicProducts: 0,
    hiddenProducts: 0,
    inStockProducts: 0,
    lowStockProducts: 0,
    soldOutProducts: 0,
    featuredProducts: 0,
    statusPickProducts: 0,
    productsWithImages: 0,
    productsWithoutImages: 0
  });
});

test("summaries and derived category counts use only validated rows", async () => {
  const result = await loadAppwriteAdminCatalogue(
    adminIdentity,
    dependencies(
      [productBase, productPrivate, productHidden],
      [categoryPrivate, categoryPublic]
    ).values
  );
  assert.deepEqual(result.summary, {
    totalProducts: 3,
    totalCategories: 2,
    publicProducts: 1,
    hiddenProducts: 2,
    inStockProducts: 1,
    lowStockProducts: 1,
    soldOutProducts: 1,
    featuredProducts: 1,
    statusPickProducts: 1,
    productsWithImages: 2,
    productsWithoutImages: 1
  });
  assert.deepEqual(
    result.categories.map((category) => [category.slug, category.productCount]),
    [["phones", 2], ["staff", 1]]
  );
});

test("malformed products and categories fail closed", async () => {
  const invalidProducts = [
    { ...productBase, $id: "bad-enum", slug: "bad-enum", condition: "Broken" },
    { ...productBase, $id: "bad-price", slug: "bad-price", price: -1 },
    { ...productBase, $id: "bad-visible", slug: "bad-visible", storefrontVisible: "yes" },
    { ...productBase, $id: "bad-permissions", slug: "bad-permissions", $permissions: "public" },
    { ...productBase, $id: "bad-chosen", slug: "bad-chosen", chosenSelectionKey: "other" }
  ];
  const invalidCategories = [
    { ...categoryPublic, $id: "missing-name", name: "" },
    { ...categoryPublic, $id: "missing-slug", slug: "" },
    { ...categoryPublic, $id: "bad-category-permissions", $permissions: null }
  ];
  const result = await loadAppwriteAdminCatalogue(
    adminIdentity,
    dependencies([productBase, ...invalidProducts], [categoryPublic, ...invalidCategories]).values
  );
  assert.deepEqual(result.products.map((product) => product.slug), ["phase-3t-public"]);
  assert.deepEqual(result.categories.map((category) => category.slug), ["phones"]);
});

test("sorting is deterministic when priority and timestamps are equal", async () => {
  const alpha = {
    ...productBase,
    $id: "product-alpha",
    slug: "alpha",
    name: "Alpha",
    sortPriority: 4,
    chosenSelectionKey: "product-alpha",
    updatedAt: now,
    imageFileId: null
  };
  const beta = {
    ...alpha,
    $id: "product-beta",
    slug: "beta",
    name: "Beta",
    chosenSelectionKey: "product-beta"
  };
  const result = await loadAppwriteAdminCatalogue(
    adminIdentity,
    dependencies([beta, alpha], [
      { ...categoryPublic, $id: "category-z", name: "Same", slug: "z" },
      { ...categoryPublic, $id: "category-a", name: "Same", slug: "a" }
    ]).values
  );
  assert.deepEqual(result.products.map((product) => product.slug), ["alpha", "beta"]);
  assert.deepEqual(result.categories.map((category) => category.slug), ["a", "z"]);
});

test("admin DTO excludes raw rows, permissions, file IDs, and selection keys", async () => {
  const result = await loadAppwriteAdminCatalogue(
    adminIdentity,
    dependencies([productBase], [categoryPublic]).values
  );
  const serialized = JSON.stringify(result);
  for (const privateValue of [
    productBase.$id,
    productBase.chosenSelectionKey,
    'read(\\"any\\")',
    "Fixture creator"
  ]) {
    if (privateValue === "Fixture creator") {
      assert.equal(serialized.includes(privateValue), true);
    } else {
      assert.equal(serialized.includes(privateValue), false);
    }
  }
  assert.equal(serialized.includes("file-public"), true);
  assert.equal(serialized.includes("$permissions"), false);
  assert.equal(serialized.includes("imageFileId"), false);
});

test("Appwrite presentation contains no mutation control or client data loader", async () => {
  const source = await readFile(
    "components/admin/appwrite-admin-catalogue.tsx",
    "utf8"
  );
  assert.doesNotMatch(source, /<button|\/api\/|products\/new|products\/\$\{/);
  assert.doesNotMatch(source, /@\/lib\/firebase|subscribeToProducts|fetchProducts/i);
  assert.doesNotMatch(source, /APPWRITE_(?:DATA|AUTH|BOOTSTRAP)_API_KEY/);
});

test("protected admin rendering remains dynamic and session-dependent", async () => {
  const layout = await readFile("app/admin/(protected)/layout.tsx", "utf8");
  assert.match(layout, /export const dynamic = "force-dynamic"/);
  assert.match(layout, /requireCurrentAppwriteStaffIdentity/);
  assert.doesNotMatch(layout, /revalidate\s*=/);
});
