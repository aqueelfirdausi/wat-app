import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPublicAppwriteFileViewUrl,
  isValidPublicProductImageFile,
  resolvePublicAppwriteProductImage,
  safeLegacyProductImageUrl,
  type AppwriteReadStorage
} from "@/lib/appwrite/product-image";
import { hasExactPublicReadPermission } from "@/lib/appwrite/public-permissions";

const fileId = "phase-3q-public-image";
const configuration = {
  endpoint: "https://fra.cloud.appwrite.io/v1",
  projectId: "fixture-project"
};
const publicFile = {
  $id: fileId,
  bucketId: "product_images",
  $permissions: ['read("team:wat_staff/admin")', 'read("any")'],
  name: "../../name-does-not-control-authorization.jpg",
  mimeType: "image/jpeg",
  sizeOriginal: 512_000,
  chunksTotal: 1,
  chunksUploaded: 1
};
const publicProduct = {
  productVisible: true,
  productPermissions: ['read("any")'],
  imageFileId: fileId,
  legacyImageUrl: "",
  configuration
};

function storageWith(file: unknown): AppwriteReadStorage {
  return {
    async getFile(input) {
      assert.deepEqual(input, {
        bucketId: "product_images",
        fileId
      });
      if (file instanceof Error) throw file;
      return file;
    }
  };
}

test("public permission parsing requires the exact Appwrite public read permission", () => {
  assert.equal(hasExactPublicReadPermission(['read("any")']), true);
  assert.equal(hasExactPublicReadPermission(['read("any")', 'read("any")']), true);
  assert.equal(hasExactPublicReadPermission(['read("team:wat_staff/admin")', 'read("any")']), true);
  assert.equal(hasExactPublicReadPermission(['read("any")', 'read("team:wat_staff/admin")']), true);
  assert.equal(hasExactPublicReadPermission(['read("team:wat_staff/admin")']), false);
  assert.equal(hasExactPublicReadPermission([]), false);
  assert.equal(hasExactPublicReadPermission(['update("any")']), false);
  assert.equal(hasExactPublicReadPermission(['prefix-read("any")-suffix']), false);
  assert.equal(hasExactPublicReadPermission(['read("any")', 42]), false);
  assert.equal(hasExactPublicReadPermission("read(\"any\")"), false);
});

test("valid public file metadata produces one deterministic anonymous view URL", async () => {
  const result = await resolvePublicAppwriteProductImage({
    ...publicProduct,
    storage: storageWith(publicFile)
  });
  assert.equal(
    result,
    "https://fra.cloud.appwrite.io/v1/storage/buckets/product_images/files/phase-3q-public-image/view?project=fixture-project"
  );
  assert.equal(result.includes("key"), false);
  assert.equal(result.includes("token"), false);
});

test("private file, hidden product, and private product all use the placeholder", async () => {
  assert.equal(await resolvePublicAppwriteProductImage({
    ...publicProduct,
    storage: storageWith({ ...publicFile, $permissions: ['read("team:wat_staff/admin")'] })
  }), "");
  assert.equal(await resolvePublicAppwriteProductImage({
    ...publicProduct,
    productVisible: false,
    storage: storageWith(publicFile)
  }), "");
  assert.equal(await resolvePublicAppwriteProductImage({
    ...publicProduct,
    productPermissions: ['read("team:wat_staff/admin")'],
    storage: storageWith(publicFile)
  }), "");
});

test("missing, malformed, mismatched, deleted, and collection-like file metadata fail closed", async () => {
  for (const file of [
    new Error("not found"),
    null,
    [publicFile],
    { ...publicFile, $id: "different-file" },
    { ...publicFile, bucketId: "wrong_bucket" },
    { ...publicFile, deleted: true },
    { ...publicFile, $deletedAt: "2026-07-17T00:00:00.000Z" },
    { ...publicFile, chunksUploaded: 0 }
  ]) {
    assert.equal(await resolvePublicAppwriteProductImage({
      ...publicProduct,
      storage: storageWith(file)
    }), "");
  }
  assert.equal(await resolvePublicAppwriteProductImage({
    ...publicProduct,
    imageFileId: "../malformed",
    storage: storageWith(publicFile)
  }), "");
});

test("invalid MIME types and oversized files fail closed", () => {
  assert.equal(isValidPublicProductImageFile({ ...publicFile, mimeType: "image/svg+xml" }, fileId), false);
  assert.equal(isValidPublicProductImageFile({ ...publicFile, mimeType: "text/html" }, fileId), false);
  assert.equal(isValidPublicProductImageFile({ ...publicFile, sizeOriginal: 1_048_577 }, fileId), false);
  assert.equal(isValidPublicProductImageFile({ ...publicFile, sizeOriginal: 1_048_576 }, fileId), true);
});

test("no file reference preserves only the existing safe non-Firebase HTTPS legacy policy", async () => {
  assert.equal(await resolvePublicAppwriteProductImage({
    ...publicProduct,
    imageFileId: null,
    legacyImageUrl: "https://images.example.test/catalogue/legacy.jpg",
    storage: storageWith(publicFile)
  }), "https://images.example.test/catalogue/legacy.jpg");
  assert.equal(safeLegacyProductImageUrl("https://firebasestorage.googleapis.com/private.jpg"), "");
  assert.equal(safeLegacyProductImageUrl("https://example.firebaseapp.com/private.jpg"), "");
  assert.equal(safeLegacyProductImageUrl("http://images.example.test/insecure.jpg"), "");
  assert.equal(safeLegacyProductImageUrl("https://user:password@images.example.test/private.jpg"), "");
});

test("URL construction rejects arbitrary endpoints, buckets, IDs, and project values", () => {
  assert.equal(buildPublicAppwriteFileViewUrl("../file", configuration), "");
  assert.equal(buildPublicAppwriteFileViewUrl(fileId, { ...configuration, projectId: "../project" }), "");
  assert.equal(buildPublicAppwriteFileViewUrl(fileId, { ...configuration, endpoint: "http://fra.cloud.appwrite.io/v1" }), "");
  assert.equal(buildPublicAppwriteFileViewUrl(fileId, { ...configuration, endpoint: "https://evil.test/not-v1" }), "");
  assert.equal(buildPublicAppwriteFileViewUrl(fileId, { ...configuration, endpoint: "https://user:pass@evil.test/v1" }), "");
});
