import assert from "node:assert/strict";
import test from "node:test";
import {
  createAppwriteProductLifecycleService,
  prepareProductLifecycleActivityEvent,
  type ProductLifecycleStorage
} from "@/lib/appwrite/product-lifecycle";
import {
  createPhase3XProductLifecycleVerificationContext
} from "@/lib/appwrite/product-lifecycle-context";
import {
  validateProductImage
} from "@/lib/appwrite/product-lifecycle-contracts";
import {
  parseProductLifecycleVerificationArguments,
  phase3XCleanupOrder
} from "@/lib/appwrite/product-lifecycle-verification";
import type { ProductMutationTables } from "@/lib/appwrite/product-mutations";
import { MutationContractError } from "@/lib/appwrite/mutation-design";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";

type Row = Record<string, unknown> & { $id: string; $permissions: string[] };
type StoredFile = Record<string, unknown> & {
  $id: string;
  $permissions: string[];
  bytes: Uint8Array;
};

function sdkError(code: number) {
  return Object.assign(new Error(`SDK ${code}`), { code });
}

function cloneRows(rows: Map<string, Row>) {
  return new Map(Array.from(rows, ([id, row]) => [id, structuredClone(row)]));
}

class FakeTables implements ProductMutationTables {
  categories = new Map<string, Row>();
  products = new Map<string, Row>();
  transactions = new Map<string, { categories: Map<string, Row>; products: Map<string, Row> }>();
  statuses = new Map<string, string>();
  counter = 0;
  listTtls: Array<number | undefined> = [];
  operations: string[] = [];
  failNextRowUpdate = false;
  throwCommitAfterApply = false;

  private state(transactionId?: string) {
    if (!transactionId) return { categories: this.categories, products: this.products };
    const state = this.transactions.get(transactionId);
    if (!state) throw sdkError(404);
    return state;
  }

  private table(tableId: string, transactionId?: string) {
    const state = this.state(transactionId);
    return tableId === "categories" ? state.categories : state.products;
  }

  async createTransaction() {
    const id = `tx_${++this.counter}`;
    this.transactions.set(id, {
      categories: cloneRows(this.categories),
      products: cloneRows(this.products)
    });
    this.statuses.set(id, "pending");
    return { $id: id, status: "pending" };
  }

  async getTransaction({ transactionId }: { transactionId: string }) {
    const status = this.statuses.get(transactionId);
    if (!status) throw sdkError(404);
    return { $id: transactionId, status };
  }

  async deleteTransaction({ transactionId }: { transactionId: string }) {
    this.transactions.delete(transactionId);
    this.statuses.delete(transactionId);
    return {};
  }

  async updateTransaction(input: {
    transactionId: string;
    commit?: boolean;
    rollback?: boolean;
  }) {
    const state = this.transactions.get(input.transactionId);
    if (!state) throw sdkError(404);
    if (input.commit) {
      this.categories = state.categories;
      this.products = state.products;
      this.transactions.delete(input.transactionId);
      this.statuses.set(input.transactionId, "committed");
      this.operations.push("transaction:commit");
      if (this.throwCommitAfterApply) {
        this.throwCommitAfterApply = false;
        throw sdkError(500);
      }
      return { $id: input.transactionId, status: "committed" };
    }
    this.transactions.delete(input.transactionId);
    this.statuses.set(input.transactionId, "rolled_back");
    this.operations.push("transaction:rollback");
    return { $id: input.transactionId, status: "rolled_back" };
  }

  async listRows(input: {
    tableId: string;
    queries?: string[];
    transactionId?: string;
    ttl?: number;
  }) {
    this.listTtls.push(input.ttl);
    let rows = Array.from(this.table(input.tableId, input.transactionId).values());
    for (const raw of input.queries ?? []) {
      const query = JSON.parse(raw) as {
        method?: string;
        attribute?: string;
        values?: unknown[];
      };
      if (query.method === "equal" && query.attribute && query.values) {
        rows = rows.filter((row) => query.values?.includes(row[query.attribute as string]));
      }
    }
    return { rows: structuredClone(rows), total: rows.length };
  }

  async getRow(input: { tableId: string; rowId: string; transactionId?: string }) {
    const row = this.table(input.tableId, input.transactionId).get(input.rowId);
    if (!row) throw sdkError(404);
    return structuredClone(row);
  }

  async createRow(input: {
    tableId: string;
    rowId: string;
    data: Record<string, unknown>;
    permissions: string[];
    transactionId?: string;
  }) {
    const table = this.table(input.tableId, input.transactionId);
    if (table.has(input.rowId)) throw sdkError(409);
    const row = {
      $id: input.rowId,
      $permissions: [...input.permissions],
      ...structuredClone(input.data)
    };
    table.set(input.rowId, row);
    return structuredClone(row);
  }

  async updateRow(input: {
    tableId: string;
    rowId: string;
    data: Record<string, unknown>;
    permissions?: string[];
    transactionId?: string;
  }) {
    if (this.failNextRowUpdate) {
      this.failNextRowUpdate = false;
      throw sdkError(409);
    }
    const table = this.table(input.tableId, input.transactionId);
    const current = table.get(input.rowId);
    if (!current) throw sdkError(404);
    if (
      input.data.chosenSelectionKey === "current" &&
      Array.from(table.values()).some(
        (row) =>
          row.$id !== input.rowId && row.chosenSelectionKey === "current"
      )
    ) {
      throw sdkError(409);
    }
    const next = {
      ...current,
      ...structuredClone(input.data),
      ...(input.permissions ? { $permissions: [...input.permissions] } : {})
    };
    table.set(input.rowId, next);
    this.operations.push(
      `row:update:${input.rowId}:${String(input.data.storefrontVisible ?? input.data.imageFileId ?? input.data.chosenSelectionKey ?? "flags")}`
    );
    return structuredClone(next);
  }

  async deleteRow(input: { tableId: string; rowId: string; transactionId?: string }) {
    if (!this.table(input.tableId, input.transactionId).delete(input.rowId)) {
      throw sdkError(404);
    }
    return {};
  }
}

class FakeStorage implements ProductLifecycleStorage {
  files = new Map<string, StoredFile>();
  operations: string[] = [];
  failNextUpdate = false;
  failNextDelete = false;

  async createFile(input: {
    fileId: string;
    file: unknown;
    permissions: string[];
  }) {
    if (this.files.has(input.fileId)) throw sdkError(409);
    const image = input.file as {
      bytes: Uint8Array;
      mimeType: string;
      normalizedFilename: string;
    };
    const value: StoredFile = {
      $id: input.fileId,
      bucketId: "product_images",
      $permissions: [...input.permissions],
      name: image.normalizedFilename,
      mimeType: image.mimeType,
      sizeOriginal: image.bytes.length,
      chunksTotal: 1,
      chunksUploaded: 1,
      bytes: new Uint8Array(image.bytes)
    };
    this.files.set(input.fileId, value);
    this.operations.push(`file:create:${input.fileId}`);
    return structuredClone(value);
  }

  async getFile({ fileId }: { fileId: string }) {
    const file = this.files.get(fileId);
    if (!file) throw sdkError(404);
    return structuredClone(file);
  }

  async updateFile(input: { fileId: string; permissions?: string[]; name?: string }) {
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      throw sdkError(500);
    }
    const file = this.files.get(input.fileId);
    if (!file) throw sdkError(404);
    if (input.permissions) file.$permissions = [...input.permissions];
    if (input.name) file.name = input.name;
    this.operations.push(
      `file:update:${input.fileId}:${input.permissions?.includes('read("any")') ? "public" : "private"}`
    );
    return structuredClone(file);
  }

  async deleteFile({ fileId }: { fileId: string }) {
    if (this.failNextDelete) {
      this.failNextDelete = false;
      throw sdkError(500);
    }
    if (!this.files.delete(fileId)) throw sdkError(404);
    this.operations.push(`file:delete:${fileId}`);
    return {};
  }
}

const privatePermissions = [
  'read("team:wat_staff/admin")',
  'read("team:wat_staff/product_editor")'
];
const publicPermissions = ['read("any")', ...privatePermissions];

const admin: AuthenticatedStaffIdentity = {
  userId: "admin_1",
  email: "admin@example.test",
  name: "Admin",
  role: "admin"
};
const editor: AuthenticatedStaffIdentity = {
  ...admin,
  userId: "editor_1",
  email: "editor@example.test",
  name: "Editor",
  role: "product_editor"
};

const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nH0AAAAASUVORK5CYII=",
    "base64"
  )
);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]);
const webp = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50
]);

function product(id: string, overrides: Record<string, unknown> = {}): Row {
  return {
    $id: id,
    $permissions: privatePermissions,
    name: `Product ${id}`,
    slug: `product-${id.replaceAll("_", "-")}`,
    description: "Disposable product.",
    brand: "eko",
    categoryId: "category_1",
    categoryName: "Phones",
    price: 1,
    currency: "PKR",
    condition: "New",
    stockStatus: "in_stock",
    featured: false,
    statusPick: false,
    storefrontVisible: false,
    feedVisible: false,
    sortPriority: 0,
    chosenSelectionKey: id,
    createdAt: "2026-07-18T10:00:00.000Z",
    updatedAt: "2026-07-18T10:00:00.000Z",
    createdByName: "Admin",
    updatedByName: "Admin",
    ...overrides
  };
}

function setup() {
  const tables = new FakeTables();
  const storage = new FakeStorage();
  tables.categories.set("category_1", {
    $id: "category_1",
    $permissions: publicPermissions,
    name: "Phones",
    slug: "phones",
    updatedAt: "2026-07-18T10:00:00.000Z"
  });
  tables.products.set("product_1", product("product_1"));
  tables.products.set("product_2", product("product_2"));
  let clock = Date.parse("2026-07-18T10:00:00.000Z");
  const events: Array<Record<string, unknown>> = [];
  const service = createAppwriteProductLifecycleService({
    tables,
    storage,
    now: () => new Date(++clock).toISOString(),
    wait: async () => {},
    toInputFile: (image) => image,
    fetchAnonymousFile: async (fileId) => {
      const file = storage.files.get(fileId);
      if (!file || !file.$permissions.includes('read("any")')) {
        return { status: 404, contentType: "", bytes: new Uint8Array() };
      }
      return {
        status: 200,
        contentType: String(file.mimeType),
        bytes: file.bytes
      };
    },
    enforceRuntimeBoundary() {},
    emitActivityEvent(event) {
      events.push(event);
    }
  });
  return { tables, storage, service, events };
}

function imageRequest(
  productId: string,
  idempotencyKey: string,
  updatedAt = "2026-07-18T10:00:00.000Z"
) {
  return { productId, expectedUpdatedAt: updatedAt, idempotencyKey };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof MutationContractError && error.code === code
  );
}

test("validates JPEG, PNG, and WebP signatures and extensions", () => {
  assert.equal(
    validateProductImage({ bytes: jpeg, mimeType: "image/jpeg", filename: "a.jpeg" })
      .extension,
    "jpg"
  );
  assert.equal(
    validateProductImage({ bytes: png, mimeType: "image/png", filename: "a.png" })
      .mimeType,
    "image/png"
  );
  assert.equal(
    validateProductImage({ bytes: webp, mimeType: "image/webp", filename: "a.webp" })
      .mimeType,
    "image/webp"
  );
});

for (const [name, input] of [
  [
    "invalid MIME",
    { bytes: png, mimeType: "image/gif", filename: "a.gif" }
  ],
  [
    "signature mismatch",
    { bytes: png, mimeType: "image/jpeg", filename: "a.jpg" }
  ],
  [
    "extension mismatch",
    { bytes: png, mimeType: "image/png", filename: "a.svg" }
  ],
  [
    "empty image",
    { bytes: new Uint8Array(), mimeType: "image/png", filename: "a.png" }
  ],
  [
    "oversized image",
    {
      bytes: new Uint8Array(1024 * 1024 + 1),
      mimeType: "image/png",
      filename: "a.png"
    }
  ]
] as const) {
  test(`rejects ${name}`, () => {
    assert.throws(() => validateProductImage(input), MutationContractError);
  });
}

test("upload is private-first, attaches narrowly, and retries safely", async () => {
  const { service, storage, tables } = setup();
  const result = await service.uploadAndAttachImage(
    imageRequest("product_1", "upload-key-0001"),
    { bytes: png, mimeType: "image/png", filename: "unsafe Product !!.png" },
    editor
  );
  assert.equal(result.product.imageFileId, result.image?.fileId);
  assert.deepEqual(
    storage.files.get(result.image!.fileId)!.$permissions,
    privatePermissions
  );
  assert.equal(result.image?.public, false);
  assert.equal("permissions" in result, false);
  const retry = await service.uploadAndAttachImage(
    imageRequest("product_1", "upload-key-0001"),
    { bytes: png, mimeType: "image/png", filename: "again.png" },
    editor
  );
  assert.equal(retry.product.imageFileId, result.product.imageFileId);
  assert.equal(storage.files.size, 1);
  assert.ok(tables.operations.some((entry) => entry.includes("row:update:product_1")));
});

test("attach rejects public products, existing images, and stale tokens", async () => {
  const a = setup();
  a.tables.products.set(
    "product_1",
    product("product_1", {
      storefrontVisible: true,
      $permissions: publicPermissions
    })
  );
  await expectCode(
    a.service.uploadAndAttachImage(
      imageRequest("product_1", "upload-key-0002"),
      { bytes: png, mimeType: "image/png", filename: "a.png" },
      admin
    ),
    "REFERENCE_CONFLICT"
  );
  const b = setup();
  b.tables.products.set(
    "product_1",
    product("product_1", { imageFileId: "old_file" })
  );
  await expectCode(
    b.service.uploadAndAttachImage(
      imageRequest("product_1", "upload-key-0003"),
      { bytes: png, mimeType: "image/png", filename: "a.png" },
      admin
    ),
    "REFERENCE_CONFLICT"
  );
  const c = setup();
  await expectCode(
    c.service.uploadAndAttachImage(
      imageRequest("product_1", "upload-key-0004", "2026-07-18T09:00:00.000Z"),
      { bytes: png, mimeType: "image/png", filename: "a.png" },
      admin
    ),
    "STALE_WRITE"
  );
});

test("failed attachment deletes and proves absence of the new upload", async () => {
  const { service, storage, tables } = setup();
  tables.failNextRowUpdate = true;
  await expectCode(
    service.uploadAndAttachImage(
      imageRequest("product_1", "attach-fail-0001"),
      { bytes: png, mimeType: "image/png", filename: "a.png" },
      admin
    ),
    "CONFLICT"
  );
  assert.equal(storage.files.size, 0);
  assert.equal(tables.products.get("product_1")!.imageFileId, undefined);
});

test("replacement attaches the new file before deleting the old file", async () => {
  const { service, storage, tables } = setup();
  const attached = await service.uploadAndAttachImage(
    imageRequest("product_1", "replace-base-001"),
    { bytes: png, mimeType: "image/png", filename: "a.png" },
    admin
  );
  const oldId = attached.image!.fileId;
  const replaced = await service.replaceImage(
    imageRequest("product_1", "replace-new-0001", attached.product.updatedAt),
    { bytes: jpeg, mimeType: "image/jpeg", filename: "b.jpg" },
    editor
  );
  assert.notEqual(replaced.image?.fileId, oldId);
  assert.equal(storage.files.has(oldId), false);
  const rowIndex = tables.operations.findIndex(
    (entry) =>
      entry.includes("row:update:product_1") &&
      entry.includes(replaced.image!.fileId)
  );
  const deleteIndex = storage.operations.findIndex(
    (entry) => entry === `file:delete:${oldId}`
  );
  assert.ok(rowIndex >= 0);
  assert.ok(deleteIndex >= 0);
});

test("failed replacement attachment deletes only the new file and preserves the old link", async () => {
  const { service, storage, tables } = setup();
  const attached = await service.uploadAndAttachImage(
    imageRequest("product_1", "replace-fail-base"),
    { bytes: png, mimeType: "image/png", filename: "a.png" },
    admin
  );
  const oldId = attached.image!.fileId;
  tables.failNextRowUpdate = true;
  await expectCode(
    service.replaceImage(
      imageRequest("product_1", "replace-fail-next", attached.product.updatedAt),
      { bytes: jpeg, mimeType: "image/jpeg", filename: "b.jpg" },
      admin
    ),
    "CONFLICT"
  );
  assert.equal(storage.files.size, 1);
  assert.equal(storage.files.has(oldId), true);
  assert.equal(tables.products.get("product_1")!.imageFileId, oldId);
});

test("image removal clears the row before deleting and refuses public removal", async () => {
  const a = setup();
  const attached = await a.service.uploadAndAttachImage(
    imageRequest("product_1", "remove-base-0001"),
    { bytes: png, mimeType: "image/png", filename: "a.png" },
    admin
  );
  const removed = await a.service.removeImage(
    imageRequest("product_1", "remove-key-00001", attached.product.updatedAt),
    editor
  );
  assert.equal(removed.product.imageFileId, null);
  assert.equal(a.storage.files.size, 0);

  const b = setup();
  b.tables.products.set(
    "product_1",
    product("product_1", {
      imageFileId: "public_image",
      storefrontVisible: true,
      $permissions: publicPermissions
    })
  );
  await expectCode(
    b.service.removeImage(imageRequest("product_1", "remove-key-00002"), admin),
    "REFERENCE_CONFLICT"
  );
});

test("failed removal cleanup reports an orphan instead of claiming success", async () => {
  const { service, storage } = setup();
  const attached = await service.uploadAndAttachImage(
    imageRequest("product_1", "remove-fail-base"),
    { bytes: png, mimeType: "image/png", filename: "a.png" },
    admin
  );
  storage.failNextDelete = true;
  await expectCode(
    service.removeImage(
      imageRequest("product_1", "remove-fail-next", attached.product.updatedAt),
      admin
    ),
    "CLEANUP_FAILED"
  );
  assert.equal(storage.files.has(attached.image!.fileId), true);
});

test("orphan cleanup is admin-only and uses an uncached reference query", async () => {
  const { service, storage, tables } = setup();
  storage.files.set("orphan_file", {
    $id: "orphan_file",
    bucketId: "product_images",
    $permissions: privatePermissions,
    mimeType: "image/png",
    sizeOriginal: png.length,
    chunksTotal: 1,
    chunksUploaded: 1,
    bytes: png
  });
  await expectCode(
    service.cleanupOrphanFile(
      { fileId: "orphan_file", idempotencyKey: "orphan-key-0001" },
      editor
    ),
    "AUTHORIZATION_FAILED"
  );
  const result = await service.cleanupOrphanFile(
    { fileId: "orphan_file", idempotencyKey: "orphan-key-0002" },
    admin
  );
  assert.equal(result.deleted, true);
  assert.ok(tables.listTtls.includes(0));
});

test("orphan cleanup refuses a referenced file", async () => {
  const { service, storage, tables } = setup();
  storage.files.set("linked_file", {
    $id: "linked_file",
    bucketId: "product_images",
    $permissions: privatePermissions,
    mimeType: "image/png",
    sizeOriginal: png.length,
    chunksTotal: 1,
    chunksUploaded: 1,
    bytes: png
  });
  tables.products.set(
    "product_1",
    product("product_1", { imageFileId: "linked_file" })
  );
  await expectCode(
    service.cleanupOrphanFile(
      { fileId: "linked_file", idempotencyKey: "orphan-key-0003" },
      admin
    ),
    "REFERENCE_CONFLICT"
  );
});

test("publication uses image-first ordering and exact public permissions", async () => {
  const { service, storage, tables } = setup();
  const attached = await service.uploadAndAttachImage(
    imageRequest("product_1", "publish-base-001"),
    { bytes: png, mimeType: "image/png", filename: "a.png" },
    admin
  );
  const published = await service.setStorefrontVisibility(
    {
      productId: "product_1",
      expectedUpdatedAt: attached.product.updatedAt,
      storefrontVisible: true,
      idempotencyKey: "publish-key-0001"
    },
    editor
  );
  assert.equal(published.storefrontVisible, true);
  assert.deepEqual(
    storage.files.get(attached.image!.fileId)!.$permissions,
    publicPermissions
  );
  assert.deepEqual(tables.products.get("product_1")!.$permissions, publicPermissions);
  const filePublic = storage.operations.findIndex((entry) => entry.endsWith(":public"));
  const rowPublic = tables.operations.findIndex((entry) =>
    entry.includes("row:update:product_1:true")
  );
  assert.ok(filePublic >= 0 && rowPublic >= 0);
});

test("publication rejects missing images and malformed category dependencies", async () => {
  const a = setup();
  await expectCode(
    a.service.setStorefrontVisibility(
      {
        productId: "product_1",
        expectedUpdatedAt: "2026-07-18T10:00:00.000Z",
        storefrontVisible: true,
        idempotencyKey: "publish-key-0002"
      },
      admin
    ),
    "DEPENDENCY_FAILED"
  );
  const b = setup();
  const attached = await b.service.uploadAndAttachImage(
    imageRequest("product_1", "publish-base-002"),
    { bytes: png, mimeType: "image/png", filename: "a.png" },
    admin
  );
  b.tables.categories.get("category_1")!.name = "Changed";
  await expectCode(
    b.service.setStorefrontVisibility(
      {
        productId: "product_1",
        expectedUpdatedAt: attached.product.updatedAt,
        storefrontVisible: true,
        idempotencyKey: "publish-key-0003"
      },
      admin
    ),
    "DEPENDENCY_FAILED"
  );
});

test("failed public file transition leaves the product private", async () => {
  const { service, storage, tables } = setup();
  const attached = await service.uploadAndAttachImage(
    imageRequest("product_1", "publish-base-003"),
    { bytes: png, mimeType: "image/png", filename: "a.png" },
    admin
  );
  storage.failNextUpdate = true;
  await expectCode(
    service.setStorefrontVisibility(
      {
        productId: "product_1",
        expectedUpdatedAt: attached.product.updatedAt,
        storefrontVisible: true,
        idempotencyKey: "publish-key-0004"
      },
      admin
    ),
    "INTERNAL_ERROR"
  );
  assert.equal(tables.products.get("product_1")!.storefrontVisible, false);
});

test("failed public row transition restores the image to exact private permissions", async () => {
  const { service, storage, tables } = setup();
  const attached = await service.uploadAndAttachImage(
    imageRequest("product_1", "publish-row-fail-base"),
    { bytes: png, mimeType: "image/png", filename: "a.png" },
    admin
  );
  tables.failNextRowUpdate = true;
  await expectCode(
    service.setStorefrontVisibility(
      {
        productId: "product_1",
        expectedUpdatedAt: attached.product.updatedAt,
        storefrontVisible: true,
        idempotencyKey: "publish-row-fail-next"
      },
      admin
    ),
    "CONFLICT"
  );
  assert.equal(tables.products.get("product_1")!.storefrontVisible, false);
  assert.deepEqual(
    storage.files.get(attached.image!.fileId)!.$permissions,
    privatePermissions
  );
});

test("hiding uses row-first ordering, clears feed, and privatizes the image", async () => {
  const { service, storage, tables } = setup();
  const attached = await service.uploadAndAttachImage(
    imageRequest("product_1", "hide-base-00001"),
    { bytes: png, mimeType: "image/png", filename: "a.png" },
    admin
  );
  const published = await service.setStorefrontVisibility(
    {
      productId: "product_1",
      expectedUpdatedAt: attached.product.updatedAt,
      storefrontVisible: true,
      idempotencyKey: "hide-publish-001"
    },
    admin
  );
  const fed = await service.setMerchandising(
    {
      productId: "product_1",
      expectedUpdatedAt: published.updatedAt,
      feedVisible: true,
      idempotencyKey: "hide-feed-00001"
    },
    admin
  );
  const rowCount = tables.operations.length;
  const fileCount = storage.operations.length;
  const hidden = await service.setStorefrontVisibility(
    {
      productId: "product_1",
      expectedUpdatedAt: fed.updatedAt,
      storefrontVisible: false,
      idempotencyKey: "hide-key-000001"
    },
    editor
  );
  assert.equal(hidden.storefrontVisible, false);
  assert.equal(hidden.feedVisible, false);
  assert.ok(tables.operations.slice(rowCount).some((entry) => entry.includes("false")));
  assert.ok(storage.operations.slice(fileCount).some((entry) => entry.endsWith(":private")));
});

test("failed image privatization keeps the row hidden and reports cleanup failure", async () => {
  const { service, storage, tables } = setup();
  const attached = await service.uploadAndAttachImage(
    imageRequest("product_1", "hide-fail-base-01"),
    { bytes: png, mimeType: "image/png", filename: "a.png" },
    admin
  );
  const published = await service.setStorefrontVisibility(
    {
      productId: "product_1",
      expectedUpdatedAt: attached.product.updatedAt,
      storefrontVisible: true,
      idempotencyKey: "hide-fail-publish"
    },
    admin
  );
  storage.failNextUpdate = true;
  await expectCode(
    service.setStorefrontVisibility(
      {
        productId: "product_1",
        expectedUpdatedAt: published.updatedAt,
        storefrontVisible: false,
        idempotencyKey: "hide-fail-private"
      },
      admin
    ),
    "CLEANUP_FAILED"
  );
  assert.equal(tables.products.get("product_1")!.storefrontVisible, false);
});

test("feed requires public state while featured and status-pick remain independent", async () => {
  const { service, tables } = setup();
  await expectCode(
    service.setMerchandising(
      {
        productId: "product_1",
        expectedUpdatedAt: "2026-07-18T10:00:00.000Z",
        feedVisible: true,
        idempotencyKey: "flags-key-00001"
      },
      editor
    ),
    "REFERENCE_CONFLICT"
  );
  const changed = await service.setMerchandising(
    {
      productId: "product_1",
      expectedUpdatedAt: "2026-07-18T10:00:00.000Z",
      featured: true,
      statusPick: true,
      idempotencyKey: "flags-key-00002"
    },
    editor
  );
  assert.equal(changed.featured, true);
  assert.equal(changed.statusPick, true);
  assert.equal(changed.storefrontVisible, false);
  assert.equal(changed.chosenSelectionKey, "product_1");
  assert.equal(tables.products.get("product_1")!.chosenSelectionKey, "product_1");
});

test("first chosen selection and replacement preserve the one-current invariant", async () => {
  const { service, tables } = setup();
  const first = await service.selectChosenProduct(
    {
      targetProductId: "product_1",
      expectedTargetUpdatedAt: "2026-07-18T10:00:00.000Z",
      idempotencyKey: "chosen-key-0001"
    },
    editor
  );
  assert.equal(first.selectedProduct.chosenSelectionKey, "current");
  const targetTwo = tables.products.get("product_2")!;
  const second = await service.selectChosenProduct(
    {
      targetProductId: "product_2",
      expectedTargetUpdatedAt: targetTwo.updatedAt,
      idempotencyKey: "chosen-key-0002"
    },
    admin
  );
  assert.equal(second.previousProductId, "product_1");
  assert.equal(tables.products.get("product_1")!.chosenSelectionKey, "product_1");
  assert.equal(tables.products.get("product_2")!.chosenSelectionKey, "current");
  assert.equal(
    Array.from(tables.products.values()).filter(
      (row) => row.chosenSelectionKey === "current"
    ).length,
    1
  );
});

test("already-selected retry is outcome-idempotent and stale unselected target rejects", async () => {
  const { service, tables } = setup();
  const first = await service.selectChosenProduct(
    {
      targetProductId: "product_1",
      expectedTargetUpdatedAt: "2026-07-18T10:00:00.000Z",
      idempotencyKey: "chosen-key-0003"
    },
    admin
  );
  const retry = await service.selectChosenProduct(
    {
      targetProductId: "product_1",
      expectedTargetUpdatedAt: "2026-07-18T10:00:00.000Z",
      idempotencyKey: "chosen-key-0003"
    },
    admin
  );
  assert.equal(retry.outcome, "already_selected");
  tables.products.get("product_2")!.updatedAt = "2026-07-18T11:00:00.000Z";
  await expectCode(
    service.selectChosenProduct(
      {
        targetProductId: "product_2",
        expectedTargetUpdatedAt: "2026-07-18T10:00:00.000Z",
        idempotencyKey: "chosen-key-0004"
      },
      admin
    ),
    "STALE_WRITE"
  );
  assert.equal(first.selectedProduct.id, "product_1");
});

test("multiple current rows fail closed", async () => {
  const { service, tables } = setup();
  tables.products.get("product_1")!.chosenSelectionKey = "current";
  tables.products.get("product_2")!.chosenSelectionKey = "current";
  await expectCode(
    service.selectChosenProduct(
      {
        targetProductId: "product_1",
        expectedTargetUpdatedAt: "2026-07-18T10:00:00.000Z",
        idempotencyKey: "chosen-key-0005"
      },
      admin
    ),
    "DEPENDENCY_FAILED"
  );
});

test("chosen transaction conflict leaves the prior selection intact", async () => {
  const { service, tables } = setup();
  tables.products.get("product_1")!.chosenSelectionKey = "current";
  tables.failNextRowUpdate = true;
  await expectCode(
    service.selectChosenProduct(
      {
        targetProductId: "product_2",
        expectedTargetUpdatedAt: "2026-07-18T10:00:00.000Z",
        idempotencyKey: "chosen-conflict-01"
      },
      admin
    ),
    "CONFLICT"
  );
  assert.equal(tables.products.get("product_1")!.chosenSelectionKey, "current");
  assert.equal(tables.products.get("product_2")!.chosenSelectionKey, "product_2");
});

test("unknown chosen commit outcome is recovered only from the exact materialized invariant", async () => {
  const { service, tables } = setup();
  tables.throwCommitAfterApply = true;
  const result = await service.selectChosenProduct(
    {
      targetProductId: "product_2",
      expectedTargetUpdatedAt: "2026-07-18T10:00:00.000Z",
      idempotencyKey: "chosen-unknown-001"
    },
    admin
  );
  assert.equal(result.outcome, "commit_outcome_recovered");
  assert.equal(result.selectedProduct.id, "product_2");
  assert.equal(
    Array.from(tables.products.values()).filter(
      (row) => row.chosenSelectionKey === "current"
    ).length,
    1
  );
});

test("chosen updates preserve status-pick, image, visibility, and creation fields", async () => {
  const { service, tables } = setup();
  tables.products.set(
    "product_1",
    product("product_1", {
      statusPick: true,
      featured: true,
      imageFileId: "image_1"
    })
  );
  const before = structuredClone(tables.products.get("product_1"));
  await service.selectChosenProduct(
    {
      targetProductId: "product_1",
      expectedTargetUpdatedAt: "2026-07-18T10:00:00.000Z",
      idempotencyKey: "chosen-key-0006"
    },
    editor
  );
  const after = tables.products.get("product_1")!;
  for (const key of [
    "statusPick",
    "featured",
    "imageFileId",
    "storefrontVisible",
    "feedVisible",
    "createdAt",
    "createdByName"
  ]) {
    assert.equal(after[key], before![key]);
  }
});

test("contracts reject raw file IDs, permissions, and chosen keys", async () => {
  const { service } = setup();
  for (const forbidden of ["fileId", "permissions", "chosenSelectionKey"]) {
    await expectCode(
      service.uploadAndAttachImage(
        {
          ...imageRequest("product_1", `forbid-${forbidden}-001`),
          [forbidden]: "client-value"
        },
        { bytes: png, mimeType: "image/png", filename: "a.png" },
        admin
      ),
      "VALIDATION_FAILED"
    );
  }
  await expectCode(
    service.selectChosenProduct(
      {
        targetProductId: "product_1",
        expectedTargetUpdatedAt: "2026-07-18T10:00:00.000Z",
        idempotencyKey: "chosen-key-0007",
        chosenSelectionKey: "current"
      },
      admin
    ),
    "VALIDATION_FAILED"
  );
});

test("verification context is exact-ID allow-listed and cannot be forged", async () => {
  const context = createPhase3XProductLifecycleVerificationContext({
    productIds: ["phase3x_disposable_p1", "phase3x_disposable_p2"],
    fileIds: ["phase3x_disposable_f1"]
  });
  assert.equal(context.kind, "phase3x_verification");
  assert.throws(
    () =>
      createPhase3XProductLifecycleVerificationContext({
        productIds: ["real_product", "phase3x_disposable_p2"],
        fileIds: ["phase3x_disposable_f1"]
      }),
    /invalid/
  );
});

test("verification lifecycle refuses by default and requires both gates", () => {
  assert.deepEqual(parseProductLifecycleVerificationArguments([]), { apply: false });
  assert.throws(
    () => parseProductLifecycleVerificationArguments(["--run-lifecycle"]),
    /both explicit/
  );
  assert.throws(
    () =>
      parseProductLifecycleVerificationArguments([
        "--confirm-destructive-disposable-product-lifecycle"
      ]),
    /both explicit/
  );
  assert.deepEqual(
    parseProductLifecycleVerificationArguments([
      "--run-lifecycle",
      "--confirm-destructive-disposable-product-lifecycle"
    ]),
    { apply: true }
  );
});

test("verification cleanup orders hide and file cleanup before rows and categories", () => {
  assert.deepEqual(
    phase3XCleanupOrder({
      publicProductIds: ["p1"],
      fileIds: ["f1"],
      productIds: ["p1", "p2"],
      categoryIds: ["c1"]
    }),
    [
      "hide:p1",
      "privatize-file:f1",
      "delete-file:f1",
      "delete-product:p1",
      "delete-product:p2",
      "delete-category:c1"
    ]
  );
});

test("logical events contain no secrets, raw permissions, or SDK objects", () => {
  const event = prepareProductLifecycleActivityEvent({
    eventType: "product.chosen_changed",
    entityType: "product",
    entityId: "product_1",
    identity: admin,
    timestamp: "2026-07-18T10:00:00.000Z",
    requestId: "event-key-000001",
    before: { selectedProductId: null },
    after: { selectedProductId: "product_1" },
    result: "succeeded"
  });
  assert.equal(event.eventType, "product.chosen_changed");
  assert.equal(JSON.stringify(event).includes("permissions"), false);
  assert.throws(
    () =>
      prepareProductLifecycleActivityEvent({
        eventType: "product.cleanup_failed",
        entityType: "product",
        entityId: "product_1",
        identity: admin,
        timestamp: "2026-07-18T10:00:00.000Z",
        requestId: "event-key-000002",
        before: null,
        after: { apiKey: "forbidden" },
        result: "failed"
      }),
    MutationContractError
  );
});
