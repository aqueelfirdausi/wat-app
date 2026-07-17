import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getAppwriteCategoryBySlugOrId,
  getAppwriteProductBySlug,
  listAppwriteCategories,
  listAppwriteProducts,
  type AppwriteReadTables
} from "@/lib/appwrite/read";

const product = {
  $id: "product-1",
  name: "Test phone",
  slug: "test-phone",
  description: "Private test data",
  brand: "eko",
  categoryId: "category-1",
  categoryName: "Phones",
  price: 1000,
  currency: "PKR",
  condition: "New",
  stockStatus: "in_stock",
  featured: false,
  statusPick: false,
  storefrontVisible: false,
  feedVisible: false,
  sortPriority: 0,
  chosenSelectionKey: "product-1",
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z"
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

test("lists and maps Appwrite products without Firebase fallback", async () => {
  const { tables, calls } = tablesWith([product]);
  const result = await listAppwriteProducts(tables);
  assert.equal(result[0].id, "product-1");
  assert.equal(result[0].chosenForToday, false);
  assert.equal(calls[0].tableId, "products");
});

test("gets one product by slug and supports an empty table", async () => {
  const found = await getAppwriteProductBySlug("test-phone", tablesWith([product]).tables);
  const missing = await getAppwriteProductBySlug("missing", tablesWith([]).tables);
  assert.equal(found?.slug, "test-phone");
  assert.equal(missing, null);
});

test("rejects malformed Appwrite rows without leaking row contents", async () => {
  await assert.rejects(() => listAppwriteProducts(tablesWith([{ ...product, price: "1000" }]).tables), {
    message: "Invalid Appwrite row data."
  });
});

test("lists categories and resolves a slug or row ID", async () => {
  const category = { $id: "category-1", name: "Phones", slug: "phones", updatedAt: "2026-07-17T00:00:00.000Z" };
  const listed = await listAppwriteCategories(tablesWith([category]).tables);
  const found = await getAppwriteCategoryBySlugOrId("phones", tablesWith([category]).tables);
  assert.deepEqual(listed, [{ id: "category-1", name: "Phones", slug: "phones" }]);
  assert.equal(found?.id, "category-1");
});
