import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  analyzeInventory,
  formatInventoryReport,
  hashIdentifier,
  isAppwriteCompatibleId
} from "../scripts/firebase-inventory-readonly.mjs";

const scriptPath = fileURLToPath(new URL("../scripts/firebase-inventory-readonly.mjs", import.meta.url));

function record(id, data) {
  return { id, data };
}

function fixtures(overrides = {}) {
  return {
    collections: {
      products: [], categories: [], logs: [], analyticsEvents: [], broadcasts: [],
      ...overrides.collections
    },
    storageObjects: overrides.storageObjects ?? []
  };
}

test("missing confirmation flag refuses execution before Firebase access", () => {
  const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to run/);
  assert.doesNotMatch(result.stderr, /firebase|credential|project|bucket/i);
});

test("source imports no mutation methods and no Appwrite module", async () => {
  const source = await readFile(scriptPath, "utf8");
  const imports = [...source.matchAll(/import\(([^)]+)\)|import\s+[^;]+?from\s+([^;]+)/gs)]
    .map((match) => match[0]);
  for (const forbidden of ["addDoc", "setDoc", "updateDoc", "deleteDoc", "writeBatch", "uploadBytes", "deleteObject", "updateMetadata", "getDownloadURL"]) {
    assert.equal(imports.some((statement) => statement.includes(forbidden)), false, forbidden);
  }
  assert.equal(imports.some((statement) => /appwrite/i.test(statement)), false);
});

test("hashed identifiers are lowercase hexadecimal and truncated to 12 characters", () => {
  assert.match(hashIdentifier("private-document-id"), /^[0-9a-f]{12}$/);
  assert.equal(hashIdentifier("private-document-id").length, 12);
});

test("duplicate normalized slugs and invalid prices are blockers without raw values", () => {
  const input = fixtures({ collections: { products: [
    record("first-private-id", { slug: "same-slug", price: 100, chosenForToday: false }),
    record("second-private-id", { slug: " SAME-SLUG ", price: 2_147_483_648, chosenForToday: false })
  ] } });
  const report = analyzeInventory(input);
  const output = formatInventoryReport(report);
  assert.equal(report.products.duplicateSlugs.groupCount, 1);
  assert.equal(report.products.invalidPriceCount, 1);
  assert.ok(report.blockerCount >= 2);
  assert.doesNotMatch(output, /same-slug|first-private-id|second-private-id/i);
});

test("incompatible Appwrite IDs are detected", () => {
  assert.equal(isAppwriteCompatibleId("valid_ID-1.2"), true);
  assert.equal(isAppwriteCompatibleId("-invalid-leading-symbol"), false);
  assert.equal(isAppwriteCompatibleId("x".repeat(37)), false);
  const report = analyzeInventory(fixtures({ collections: { categories: [record("-private-category", { name: "Safe", slug: "safe" })] } }));
  assert.equal(report.categories.ids.invalidCount, 1);
});

test("multiple chosen products cause blocker status", () => {
  const report = analyzeInventory(fixtures({ collections: { products: [
    record("chosen-a", { slug: "chosen-a", price: 1, chosenForToday: true, statusPick: true }),
    record("chosen-b", { slug: "chosen-b", price: 1, chosenForToday: true, statusPick: true })
  ] } }));
  assert.equal(report.products.chosenCount, 2);
  assert.ok(report.blockerCount > 0);
});

test("images over one MB cause blocker status", () => {
  const report = analyzeInventory(fixtures({
    collections: { products: [record("image-product", { slug: "image-product", price: 1, imagePath: "products/private.jpg" })] },
    storageObjects: [{ name: "products/private.jpg", contentType: "image/jpeg", size: 1_048_577 }]
  }));
  assert.equal(report.storage.sizeHistogram.over1MB, 1);
  assert.ok(report.blockerCount > 0);
});

test("aggregate output omits secret-like fields and raw sample data", () => {
  const secretSamples = ["person@example.com", "+923001234567", "https://secret.example/path?token=abc", "raw-fcm-token", "private description"];
  const report = analyzeInventory(fixtures({ collections: {
    products: [record("private-product-id", {
      name: "Private Product", slug: "private-product", price: 100, description: secretSamples[4],
      contactWhatsappNumber: secretSamples[1], imageUrl: secretSamples[2], apiToken: "hidden"
    })],
    logs: [record("private-log-id", { actorEmail: secretSamples[0], details: "private details", createdAt: new Date() })],
    broadcasts: [record("private-broadcast-id", { title: "Private title", body: "private body", fcmToken: secretSamples[3] })]
  } }));
  const output = formatInventoryReport(report);
  for (const sample of secretSamples) assert.equal(output.includes(sample), false);
  assert.doesNotMatch(output, /Private Product|private-product-id|private-log-id|private-broadcast-id|private body|private title|apiToken|fcmToken/);
});
