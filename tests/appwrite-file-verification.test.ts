import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseFileVerificationArguments,
  runDisposableFileVerification,
  type DisposableFileVerificationDependencies
} from "@/lib/appwrite/file-verification";

const ids = {
  fileId: "p3r-file-fixture",
  categoryId: "p3r-cat-fixture",
  productId: "p3r-product-fixture",
  slug: "phase-3r-disposable-fixture"
};
const bytes = Uint8Array.from([1, 2, 3]);

test("file verification is read-only by default and double-gates apply", () => {
  assert.deepEqual(parseFileVerificationArguments([]), { apply: false, holdSeconds: 0 });
  assert.throws(() => parseFileVerificationArguments(["--apply"]));
  assert.throws(() => parseFileVerificationArguments(["--confirm-disposable-file-check"]));
  assert.throws(() => parseFileVerificationArguments(["--hold-seconds=10"]));
  assert.throws(() => parseFileVerificationArguments([
    "--apply",
    "--confirm-disposable-file-check",
    "--hold-seconds=121"
  ]));
  assert.deepEqual(parseFileVerificationArguments([
    "--apply",
    "--confirm-disposable-file-check",
    "--hold-seconds=30"
  ]), { apply: true, holdSeconds: 30 });
});

function successfulDependencies(events: string[]): DisposableFileVerificationDependencies {
  let publicState = false;
  return {
    async createPrivateFile() {
      events.push("create-private-file");
      return { $id: ids.fileId, $permissions: [] };
    },
    async makeFilePublic() {
      events.push("make-file-public");
      publicState = true;
      return { $id: ids.fileId, $permissions: ['read("any")'] };
    },
    async deleteFile() {
      events.push("delete-file");
    },
    async createCategory() {
      events.push("create-category");
    },
    async deleteCategory() {
      events.push("delete-category");
    },
    async createProduct() {
      events.push("create-product");
    },
    async deleteProduct() {
      events.push("delete-product");
    },
    async fetchAnonymousView() {
      events.push(publicState ? "fetch-public" : "fetch-private");
      return publicState
        ? { status: 200, contentType: "image/png", bytes }
        : { status: 404, contentType: "application/json", bytes: new Uint8Array() };
    },
    async holdForBrowser() {
      events.push("browser-hold");
    }
  };
}

test("disposable lifecycle proves denial and delivery, then cleans in fail-closed order", async () => {
  const events: string[] = [];
  const result = await runDisposableFileVerification({
    ids,
    imageBytes: bytes,
    dependencies: successfulDependencies(events)
  });

  assert.deepEqual(result, {
    privateDenied: true,
    publicDelivered: true,
    productCreated: true,
    browserHoldCompleted: true,
    cleanupComplete: true
  });
  assert.deepEqual(events, [
    "create-private-file",
    "fetch-private",
    "make-file-public",
    "fetch-public",
    "create-category",
    "create-product",
    "browser-hold",
    "delete-product",
    "delete-category",
    "delete-file"
  ]);
});

test("a browser verification failure still cleans every created resource", async () => {
  const events: string[] = [];
  const dependencies = successfulDependencies(events);
  dependencies.holdForBrowser = async () => {
    events.push("browser-failed");
    throw new Error("browser verification failed");
  };

  await assert.rejects(
    runDisposableFileVerification({ ids, imageBytes: bytes, dependencies }),
    /browser verification failed/
  );
  assert.deepEqual(events.slice(-3), ["delete-product", "delete-category", "delete-file"]);
});

test("a private file returning success aborts before publication and still deletes the file", async () => {
  const events: string[] = [];
  const dependencies = successfulDependencies(events);
  dependencies.fetchAnonymousView = async () => ({
    status: 200,
    contentType: "image/png",
    bytes
  });

  await assert.rejects(
    runDisposableFileVerification({ ids, imageBytes: bytes, dependencies }),
    /expected anonymous denial/
  );
  assert.deepEqual(events, ["create-private-file", "delete-file"]);
});

test("an unexpected private-file server error is not accepted as an authorization proof", async () => {
  const events: string[] = [];
  const dependencies = successfulDependencies(events);
  dependencies.fetchAnonymousView = async () => ({
    status: 500,
    contentType: "application/json",
    bytes: new Uint8Array()
  });

  await assert.rejects(
    runDisposableFileVerification({ ids, imageBytes: bytes, dependencies }),
    /expected anonymous denial/
  );
  assert.deepEqual(events, ["create-private-file", "delete-file"]);
});
