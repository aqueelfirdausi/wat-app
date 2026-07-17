import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseAdminCatalogueVerificationArguments,
  runDisposableAdminCatalogueLifecycle,
  type DisposableAdminCatalogueIds
} from "@/lib/appwrite/admin-catalogue-verification";

const ids: DisposableAdminCatalogueIds = {
  categoryId: "PHASE-3T-DISPOSABLE-C-fixture",
  publicProductId: "PHASE-3T-DISPOSABLE-P-fixture",
  hiddenProductId: "PHASE-3T-DISPOSABLE-H-fixture",
  publicSlug: "phase-3t-disposable-public-fixture",
  hiddenSlug: "phase-3t-disposable-hidden-fixture"
};

test("admin catalogue lifecycle requires both explicit mutation gates", () => {
  assert.deepEqual(parseAdminCatalogueVerificationArguments([]), {
    apply: false,
    holdSeconds: 0
  });
  assert.throws(() =>
    parseAdminCatalogueVerificationArguments(["--apply"])
  );
  assert.throws(() =>
    parseAdminCatalogueVerificationArguments([
      "--confirm-disposable-admin-catalogue"
    ])
  );
  assert.deepEqual(
    parseAdminCatalogueVerificationArguments([
      "--apply",
      "--confirm-disposable-admin-catalogue",
      "--hold-seconds=120"
    ]),
    { apply: true, holdSeconds: 120 }
  );
  assert.throws(() =>
    parseAdminCatalogueVerificationArguments([
      "--apply",
      "--confirm-disposable-admin-catalogue",
      "--hold-seconds=121"
    ])
  );
});

function fixture(failVerification = false) {
  let products = 0;
  let categories = 0;
  const calls: string[] = [];
  const missingProducts = new Set<string>();
  const missingCategories = new Set<string>();
  return {
    calls,
    dependencies: {
      async counts() {
        return { products, categories };
      },
      async createCategory() {
        calls.push("create-category");
        categories += 1;
      },
      async createPublicProduct() {
        calls.push("create-public");
        products += 1;
      },
      async createHiddenProduct() {
        calls.push("create-hidden");
        products += 1;
      },
      async verifyRows() {
        calls.push("verify");
        return !failVerification;
      },
      async holdForBrowser() {
        calls.push("browser");
      },
      async deleteProduct(id: string) {
        calls.push(`delete:${id}`);
        products -= 1;
        missingProducts.add(id);
      },
      async deleteCategory(id: string) {
        calls.push(`delete:${id}`);
        categories -= 1;
        missingCategories.add(id);
      },
      async productIsMissing(id: string) {
        return missingProducts.has(id);
      },
      async categoryIsMissing(id: string) {
        return missingCategories.has(id);
      }
    }
  };
}

test("disposable catalogue lifecycle verifies rows and restores baselines", async () => {
  const state = fixture();
  const result = await runDisposableAdminCatalogueLifecycle({
    ids,
    dependencies: state.dependencies
  });
  assert.equal(result.publicProductCreated, true);
  assert.equal(result.hiddenProductCreated, true);
  assert.equal(result.rowsVerified, true);
  assert.equal(result.browserHoldCompleted, true);
  assert.equal(result.cleanupVerified, true);
  assert.deepEqual(state.calls.slice(-3), [
    `delete:${ids.hiddenProductId}`,
    `delete:${ids.publicProductId}`,
    `delete:${ids.categoryId}`
  ]);
});

test("row verification failure still deletes both products and category", async () => {
  const state = fixture(true);
  await assert.rejects(() =>
    runDisposableAdminCatalogueLifecycle({
      ids,
      dependencies: state.dependencies
    })
  );
  assert.ok(state.calls.includes(`delete:${ids.hiddenProductId}`));
  assert.ok(state.calls.includes(`delete:${ids.publicProductId}`));
  assert.ok(state.calls.includes(`delete:${ids.categoryId}`));
});
