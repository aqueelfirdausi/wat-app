import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getPublicProductBySlug,
  loadPublicCatalogue,
  type CatalogueReadDependencies
} from "@/lib/catalogue/read";
import type { ProductMetadataRecord } from "@/lib/firebase/firestore-server";
import type { PublicCategory, PublicProduct } from "@/lib/types";

const product: PublicProduct = {
  id: "visible-product",
  name: "Visible fixture",
  slug: "visible-product",
  description: "Fixture-only data",
  brand: "eko",
  categoryName: "Phones",
  price: 1000,
  currency: "PKR",
  condition: "New",
  stockStatus: "in_stock",
  featured: false,
  storefrontVisible: true,
  feedVisible: true,
  sortPriority: 0,
  imageUrl: "",
  createdAt: null,
  updatedAt: null
};

const category: PublicCategory = {
  id: "phones",
  name: "Phones",
  slug: "phones"
};

function dependencies() {
  const calls = {
    appwriteProducts: 0,
    appwriteCategories: 0,
    appwriteProduct: 0,
    firebaseProduct: 0
  };

  const readers: CatalogueReadDependencies = {
    async listAppwriteProducts() {
      calls.appwriteProducts += 1;
      return [product];
    },
    async listAppwriteCategories() {
      calls.appwriteCategories += 1;
      return [category];
    },
    async getAppwriteProductBySlug() {
      calls.appwriteProduct += 1;
      return product;
    },
    async getFirebaseProductBySlug() {
      calls.firebaseProduct += 1;
      return {
        ...product,
        id: "firebase-internal-id",
        chosenForToday: false
      } satisfies ProductMetadataRecord;
    }
  };

  return { calls, readers };
}

test("Appwrite catalogue selection calls only Appwrite readers", async () => {
  const { calls, readers } = dependencies();
  const result = await loadPublicCatalogue("appwrite", readers);

  assert.deepEqual(result.products, [product]);
  assert.deepEqual(result.categories, [category]);
  assert.deepEqual(calls, {
    appwriteProducts: 1,
    appwriteCategories: 1,
    appwriteProduct: 0,
    firebaseProduct: 0
  });
});

test("Firebase catalogue selection preserves existing client hydration path", async () => {
  const { calls, readers } = dependencies();
  const result = await loadPublicCatalogue("firebase", readers);

  assert.deepEqual(result.products, []);
  assert.deepEqual(result.categories, []);
  assert.deepEqual(calls, {
    appwriteProducts: 0,
    appwriteCategories: 0,
    appwriteProduct: 0,
    firebaseProduct: 0
  });
});

test("Appwrite product detail never falls back to Firebase", async () => {
  const { calls, readers } = dependencies();
  const found = await getPublicProductBySlug("visible-product", "appwrite", readers);

  assert.equal(found?.slug, "visible-product");
  assert.equal(calls.appwriteProduct, 1);
  assert.equal(calls.firebaseProduct, 0);
});

test("failed Appwrite product detail rejects without Firebase fallback", async () => {
  const { calls, readers } = dependencies();
  readers.getAppwriteProductBySlug = async () => {
    calls.appwriteProduct += 1;
    throw new Error("Appwrite unavailable.");
  };

  await assert.rejects(() =>
    getPublicProductBySlug("visible-product", "appwrite", readers)
  );
  assert.equal(calls.appwriteProduct, 1);
  assert.equal(calls.firebaseProduct, 0);
});

test("Firebase product detail calls only Firebase and filters its public DTO", async () => {
  const { calls, readers } = dependencies();
  const found = await getPublicProductBySlug("visible-product", "firebase", readers);

  assert.equal(found?.id, "visible-product");
  assert.equal(calls.firebaseProduct, 1);
  assert.equal(calls.appwriteProduct, 0);
  assert.equal(JSON.stringify(found).includes("firebase-internal-id"), false);
});

test("missing, hidden, and malformed Firebase products fail closed", async () => {
  const { readers } = dependencies();

  readers.getFirebaseProductBySlug = async () => null;
  assert.equal(await getPublicProductBySlug("missing", "firebase", readers), null);

  readers.getFirebaseProductBySlug = async () => ({
    ...(product as ProductMetadataRecord),
    chosenForToday: false,
    storefrontVisible: false
  });
  assert.equal(await getPublicProductBySlug("hidden", "firebase", readers), null);

  readers.getFirebaseProductBySlug = async () => ({
    ...(product as ProductMetadataRecord),
    chosenForToday: false,
    condition: "invalid"
  });
  assert.equal(await getPublicProductBySlug("malformed", "firebase", readers), null);
});
