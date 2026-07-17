import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getAppwriteCategoryBySlugOrId,
  getAppwriteProductBySlug,
  listAppwriteCategories,
  listAppwriteProducts,
  mapAppwriteProductRow,
  type AppwriteReadTables
} from "@/lib/appwrite/read";

const visibleProduct = {
  $id: "internal-product-row-id",
  $permissions: ['read("any")', 'read("team:wat_staff/admin")'],
  name: "PHASE-3P fixture phone",
  slug: "phase-3p-fixture-phone",
  description: "Fixture-only catalogue data",
  brand: "eko",
  preferredContactId: "aqueel-firdausi",
  categoryId: "internal-category-row-id",
  categoryName: "Phones",
  price: 1000,
  currency: "PKR",
  condition: "New",
  stockStatus: "in_stock",
  featured: false,
  statusPick: false,
  storefrontVisible: true,
  feedVisible: true,
  sortPriority: 0,
  chosenSelectionKey: "internal-product-row-id",
  imageFileId: "internal-file-id",
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
  createdByName: "Internal actor",
  updatedByName: "Internal actor"
};

const hiddenProduct = {
  ...visibleProduct,
  $id: "hidden-row-id",
  $permissions: ['read("team:wat_staff/admin")'],
  slug: "phase-3p-hidden-phone",
  storefrontVisible: false,
  feedVisible: false,
  chosenSelectionKey: "hidden-row-id"
};

function tablesWith(rows: Array<Record<string, unknown>>) {
  const calls: Array<Record<string, unknown>> = [];
  const tables: AppwriteReadTables = {
    async listRows(input) {
      calls.push(input);
      return { rows: rows as Array<Record<string, unknown> & { $id: string }> };
    }
  };
  return { tables, calls };
}

test("empty Appwrite product and category tables are valid", async () => {
  assert.deepEqual(await listAppwriteProducts(tablesWith([]).tables), []);
  assert.deepEqual(await listAppwriteCategories(tablesWith([]).tables), []);
});

test("public product listing includes only visible rows with public read permission", async () => {
  const booleanVisibleButPrivate = {
    ...visibleProduct,
    $id: "private-row-id",
    $permissions: ['read("team:wat_staff/admin")'],
    slug: "private-despite-boolean"
  };
  const publicPermissionButHidden = {
    ...hiddenProduct,
    $permissions: ['read("any")']
  };

  const { tables, calls } = tablesWith([
    hiddenProduct,
    booleanVisibleButPrivate,
    publicPermissionButHidden,
    visibleProduct
  ]);
  const result = await listAppwriteProducts(tables);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, visibleProduct.slug);
  assert.equal(result[0].slug, visibleProduct.slug);
  assert.equal(calls[0].tableId, "products");
});

test("public product DTO omits row, permission, selection, storage, and audit fields", () => {
  const result = mapAppwriteProductRow(visibleProduct);
  assert.deepEqual(Object.keys(result).sort(), [
    "brand",
    "categoryName",
    "condition",
    "createdAt",
    "currency",
    "description",
    "featured",
    "feedVisible",
    "id",
    "imageUrl",
    "name",
    "preferredContactId",
    "price",
    "slug",
    "sortPriority",
    "stockStatus",
    "storefrontVisible",
    "updatedAt"
  ]);
  const serialized = JSON.stringify(result);
  for (const privateValue of [
    visibleProduct.$id,
    visibleProduct.categoryId,
    visibleProduct.chosenSelectionKey,
    visibleProduct.imageFileId,
    visibleProduct.createdByName
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("malformed Appwrite products fail closed without leaking row contents", async () => {
  const result = await listAppwriteProducts(
    tablesWith([{ ...visibleProduct, price: "1000", name: "PRIVATE-ROW-CONTENT" }]).tables
  );
  assert.deepEqual(result, []);
  await assert.rejects(
    async () => mapAppwriteProductRow({ ...visibleProduct, price: "1000" }),
    { message: "Invalid Appwrite row data." }
  );
  await assert.rejects(
    async () => mapAppwriteProductRow({ ...visibleProduct, price: -1 }),
    { message: "Invalid Appwrite row data." }
  );
  await assert.rejects(
    async () => mapAppwriteProductRow({ ...visibleProduct, slug: " " }),
    { message: "Invalid Appwrite row data." }
  );
});

test("product detail returns visible public rows and hides all other rows", async () => {
  const found = await getAppwriteProductBySlug(
    visibleProduct.slug,
    tablesWith([visibleProduct]).tables
  );
  const hidden = await getAppwriteProductBySlug(
    hiddenProduct.slug,
    tablesWith([hiddenProduct]).tables
  );
  const malformed = await getAppwriteProductBySlug(
    "malformed",
    tablesWith([{ ...visibleProduct, price: "invalid" }]).tables
  );
  const missing = await getAppwriteProductBySlug("missing", tablesWith([]).tables);

  assert.equal(found?.slug, visibleProduct.slug);
  assert.equal(hidden, null);
  assert.equal(malformed, null);
  assert.equal(missing, null);
});

test("Appwrite mode never restores Firebase Storage image URLs", () => {
  const firebaseImage = mapAppwriteProductRow({
    ...visibleProduct,
    legacyImageUrl: "https://firebasestorage.googleapis.com/v0/b/example/o/image.jpg"
  });
  const safeExternalImage = mapAppwriteProductRow({
    ...visibleProduct,
    legacyImageUrl: "https://images.example.test/catalogue/image.jpg"
  });

  assert.equal(firebaseImage.imageUrl, "");
  assert.equal(
    safeExternalImage.imageUrl,
    "https://images.example.test/catalogue/image.jpg"
  );
});

test("category listing and lookup require valid public rows", async () => {
  const category = {
    $id: "internal-category-row-id",
    $permissions: ['read("any")'],
    name: "Phones",
    slug: "phones",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
  const privateCategory = {
    ...category,
    $id: "private-category",
    $permissions: [],
    slug: "private"
  };
  const malformedCategory = {
    ...category,
    $id: "malformed-category",
    slug: "",
    name: "PRIVATE-CATEGORY-CONTENT"
  };

  const listed = await listAppwriteCategories(
    tablesWith([privateCategory, malformedCategory, category]).tables
  );
  const found = await getAppwriteCategoryBySlugOrId(
    "phones",
    tablesWith([category]).tables
  );
  const hidden = await getAppwriteCategoryBySlugOrId(
    "private",
    tablesWith([privateCategory]).tables
  );

  assert.deepEqual(listed, [{ id: "phones", name: "Phones", slug: "phones" }]);
  assert.deepEqual(found, { id: "phones", name: "Phones", slug: "phones" });
  assert.equal(hidden, null);
});
