import assert from "node:assert/strict";
import test from "node:test";
import {
  createAppwriteProductMutationService,
  prepareProductMutationActivityEvent,
  type ProductMutationTables
} from "@/lib/appwrite/product-mutations";
import { createAppwriteCategoryMutationService } from "@/lib/appwrite/category-mutations";
import { handleProductMutationRequest } from "@/lib/appwrite/product-mutation-handlers";
import type { StaffAuthorizationResult } from "@/lib/appwrite/auth/authorization";
import {
  MutationContractError,
  planProductCreate,
  planProductDelete,
  planProductUpdate,
  type MutationErrorCode
} from "@/lib/appwrite/mutation-design";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";
import {
  parseProductMutationVerificationArguments,
  runProductMutationVerificationLifecycle
} from "@/lib/appwrite/product-mutation-verification";

type Row = Record<string, unknown> & { $id: string; $permissions: string[] };

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
  transactionStatuses = new Map<string, string>();
  transactionCounter = 0;
  listTtls: Array<number | undefined> = [];

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
    const id = `tx_${++this.transactionCounter}`;
    this.transactions.set(id, {
      categories: cloneRows(this.categories),
      products: cloneRows(this.products)
    });
    this.transactionStatuses.set(id, "pending");
    return { $id: id, status: "pending" };
  }

  async getTransaction(input: { transactionId: string }) {
    const status = this.transactionStatuses.get(input.transactionId);
    if (!status) throw sdkError(404);
    return { $id: input.transactionId, status };
  }

  async deleteTransaction(input: { transactionId: string }) {
    this.transactions.delete(input.transactionId);
    this.transactionStatuses.delete(input.transactionId);
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
      this.transactionStatuses.set(input.transactionId, "committed");
      return { $id: input.transactionId, status: "committed" };
    }
    this.transactions.delete(input.transactionId);
    this.transactionStatuses.set(input.transactionId, "rolled_back");
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
    if (
      table.has(input.rowId) ||
      Array.from(table.values()).some((row) => row.slug === input.data.slug)
    ) {
      throw sdkError(409);
    }
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
    const table = this.table(input.tableId, input.transactionId);
    const current = table.get(input.rowId);
    if (!current) throw sdkError(404);
    if (
      input.data.slug &&
      Array.from(table.values()).some(
        (row) => row.$id !== input.rowId && row.slug === input.data.slug
      )
    ) {
      throw sdkError(409);
    }
    const row = {
      ...current,
      ...structuredClone(input.data),
      ...(input.permissions ? { $permissions: [...input.permissions] } : {})
    };
    table.set(input.rowId, row);
    return structuredClone(row);
  }

  async deleteRow(input: { tableId: string; rowId: string; transactionId?: string }) {
    if (!this.table(input.tableId, input.transactionId).delete(input.rowId)) {
      throw sdkError(404);
    }
    return {};
  }
}

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

const publicCategoryPermissions = [
  'read("any")',
  'read("team:wat_staff/admin")',
  'read("team:wat_staff/product_editor")'
];

const privateProductPermissions = [
  'read("team:wat_staff/admin")',
  'read("team:wat_staff/product_editor")'
];

function setup() {
  const tables = new FakeTables();
  tables.categories.set("category_1", {
    $id: "category_1",
    $permissions: publicCategoryPermissions,
    name: "Phones",
    slug: "phones",
    updatedAt: "2026-07-18T10:00:00.000Z"
  });
  tables.categories.set("category_2", {
    $id: "category_2",
    $permissions: publicCategoryPermissions,
    name: "Accessories",
    slug: "accessories",
    updatedAt: "2026-07-18T10:00:00.000Z"
  });
  const events: Array<Record<string, unknown>> = [];
  let clock = Date.parse("2026-07-18T10:00:00.000Z");
  const service = createAppwriteProductMutationService({
    tables,
    now: () => new Date(++clock).toISOString(),
    enforceRuntimeBoundary() {},
    emitActivityEvent(event) {
      events.push(event);
    },
    wait: async () => {}
  });
  return { tables, events, service };
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    name: "  Eko   One  ",
    description: "  A practical   daily phone. ",
    brand: "eko",
    categoryId: "category_1",
    price: 25000,
    currency: "PKR",
    condition: "New",
    stockStatus: "in_stock",
    featured: false,
    statusPick: false,
    storefrontVisible: false,
    feedVisible: false,
    sortPriority: 10,
    idempotencyKey: "product:create:test-1",
    ...overrides
  };
}

async function expectCode(promise: Promise<unknown>, code: MutationErrorCode) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof MutationContractError);
    assert.equal(error.code, code);
    return true;
  });
}

test("create normalizes, derives category data, stays private, and returns a narrow DTO", async () => {
  const { service, tables } = setup();
  const product = await service.createProduct(createRequest(), admin);
  assert.equal(product.name, "Eko One");
  assert.equal(product.description, "A practical daily phone.");
  assert.equal(product.slug, "eko-one");
  assert.equal(product.categoryName, "Phones");
  assert.equal(product.chosenSelectionKey, product.id);
  assert.equal(product.storefrontVisible, false);
  assert.equal(product.feedVisible, false);
  assert.equal(product.imageFileId, null);
  assert.equal(product.createdByName, "Admin");
  assert.deepEqual(tables.products.get(product.id)?.$permissions, privateProductPermissions);
  assert.equal("$permissions" in product, false);
  assert.equal("$id" in product, false);
  assert.ok(tables.listTtls.every((ttl) => ttl === 0));
});

test("admin and product editor may create and update products", async () => {
  for (const identity of [admin, editor]) {
    const { service } = setup();
    const created = await service.createProduct(
      createRequest({ idempotencyKey: `product:create:${identity.role}` }),
      identity
    );
    const updated = await service.updateProduct({
      productId: created.id,
      expectedUpdatedAt: created.updatedAt,
      idempotencyKey: `product:update:${identity.role}`,
      name: "Updated Phone",
      featured: true
    }, identity);
    assert.equal(updated.name, "Updated Phone");
    assert.equal(updated.featured, true);
    assert.equal(updated.chosenSelectionKey, created.id);
    assert.equal(updated.createdAt, created.createdAt);
    assert.equal(updated.createdByName, identity.name);
  }
});

test("create retry is deterministic and conflicting reuse or duplicate slug is rejected", async () => {
  const { service } = setup();
  const first = await service.createProduct(createRequest(), admin);
  assert.deepEqual(await service.createProduct(createRequest(), admin), first);
  await expectCode(
    service.createProduct(createRequest({ price: 26000 }), admin),
    "CONFLICT"
  );
  await expectCode(
    service.createProduct(
      createRequest({ idempotencyKey: "product:create:other-1" }),
      admin
    ),
    "CONFLICT"
  );
});

test("category reassignment derives canonical name and stale update is rejected", async () => {
  const { service } = setup();
  const created = await service.createProduct(createRequest(), admin);
  const updated = await service.updateProduct({
    productId: created.id,
    expectedUpdatedAt: created.updatedAt,
    idempotencyKey: "product:update:category-1",
    categoryId: "category_2"
  }, editor);
  assert.equal(updated.categoryId, "category_2");
  assert.equal(updated.categoryName, "Accessories");
  await expectCode(service.updateProduct({
    productId: created.id,
    expectedUpdatedAt: created.updatedAt,
    idempotencyKey: "product:update:stale-1",
    price: 1
  }, admin), "STALE_WRITE");
  assert.deepEqual(await service.updateProduct({
    productId: created.id,
    expectedUpdatedAt: created.updatedAt,
    idempotencyKey: "product:update:retry-1",
    categoryId: "category_2"
  }, admin), updated);
});

test("a product reference blocks category rename and deletion", async () => {
  const { service, tables } = setup();
  const product = await service.createProduct(createRequest(), admin);
  const categoryService = createAppwriteCategoryMutationService({
    tables,
    now: () => "2026-07-18T11:00:00.000Z",
    enforceRuntimeBoundary() {},
    wait: async () => {}
  });
  await expectCode(categoryService.updateCategory({
    categoryId: "category_1",
    name: "Renamed Phones",
    expectedUpdatedAt: "2026-07-18T10:00:00.000Z",
    idempotencyKey: "category:update:product-reference"
  }, admin), "REFERENCE_CONFLICT");
  await expectCode(categoryService.deleteCategory({
    categoryId: "category_1",
    expectedUpdatedAt: "2026-07-18T10:00:00.000Z",
    idempotencyKey: "category:delete:product-reference"
  }, admin), "REFERENCE_CONFLICT");
  assert.equal(tables.products.has(product.id), true);
  assert.equal(tables.categories.has("category_1"), true);
});

test("missing and malformed category dependencies fail closed", async () => {
  const { service, tables } = setup();
  await expectCode(
    service.createProduct(createRequest({ categoryId: "missing" }), admin),
    "DEPENDENCY_FAILED"
  );
  tables.categories.get("category_1")!.name = "";
  await expectCode(service.createProduct(createRequest(), admin), "DEPENDENCY_FAILED");
});

test("admin deletes a private image-free unselected product; editor is denied", async () => {
  const { service, tables } = setup();
  const created = await service.createProduct(createRequest(), editor);
  await expectCode(service.deleteProduct({
    productId: created.id,
    expectedUpdatedAt: created.updatedAt,
    idempotencyKey: "product:delete:editor-1"
  }, editor), "AUTHORIZATION_FAILED");
  assert.deepEqual(await service.deleteProduct({
    productId: created.id,
    expectedUpdatedAt: created.updatedAt,
    idempotencyKey: "product:delete:admin-1"
  }, admin), { id: created.id, deleted: true });
  assert.equal(tables.products.has(created.id), false);
  await expectCode(service.deleteProduct({
    productId: created.id,
    expectedUpdatedAt: created.updatedAt,
    idempotencyKey: "product:delete:missing-1"
  }, admin), "NOT_FOUND");
});

test("delete blocks stale, selected, image-linked, and public products", async () => {
  for (const mode of ["stale", "selected", "image", "public"] as const) {
    const { service, tables } = setup();
    const created = await service.createProduct(
      createRequest({ idempotencyKey: `product:create:${mode}` }),
      admin
    );
    const row = tables.products.get(created.id)!;
    if (mode === "selected") row.chosenSelectionKey = "current";
    if (mode === "image") row.imageFileId = "fixture_image";
    if (mode === "public") {
      row.storefrontVisible = true;
      row.$permissions = ['read("any")', ...privateProductPermissions];
    }
    await expectCode(service.deleteProduct({
      productId: created.id,
      expectedUpdatedAt:
        mode === "stale" ? "2025-01-01T00:00:00.000Z" : created.updatedAt,
      idempotencyKey: `product:delete:${mode}`
    }, admin), mode === "stale" ? "STALE_WRITE" : "REFERENCE_CONFLICT");
    assert.equal(tables.products.has(created.id), true);
  }
});

test("create validation rejects invalid and server-owned input", () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ name: "" }, "name"],
    [{ description: "" }, "description"],
    [{ slug: "Not Canonical" }, "slug"],
    [{ brand: "other" }, "brand"],
    [{ categoryId: "bad id" }, "categoryId"],
    [{ price: 0 }, "price"],
    [{ price: 1.5 }, "price"],
    [{ currency: "USD" }, "currency"],
    [{ condition: "Broken" }, "condition"],
    [{ stockStatus: "unknown" }, "stockStatus"],
    [{ featured: "false" }, "featured"],
    [{ sortPriority: -1 }, "sortPriority"],
    [{ storefrontVisible: true }, "storefrontVisible"],
    [{ feedVisible: true, storefrontVisible: true }, "storefrontVisible"],
    [{ imageFileId: "file_1" }, "imageFileId"],
    [{ permissions: [] }, "permissions"],
    [{ createdAt: "2026-01-01T00:00:00.000Z" }, "createdAt"],
    [{ actorName: "Client" }, "actorName"],
    [{ chosenSelectionKey: "current" }, "chosenSelectionKey"],
    [{ unknown: true }, "unknown"]
  ];
  for (const [override, field] of cases) {
    assert.throws(
      () => planProductCreate(createRequest(override)),
      (error) =>
        error instanceof MutationContractError &&
        error.code === "VALIDATION_FAILED" &&
        error.field === field
    );
  }
});

test("update and delete planners reject forbidden lifecycle fields and malformed tokens", () => {
  const base = {
    productId: "product_1",
    expectedUpdatedAt: "2026-07-18T10:00:00.000Z",
    idempotencyKey: "product:update:test-1"
  };
  for (const forbidden of [
    "createdAt",
    "createdByName",
    "permissions",
    "chosenSelectionKey",
    "imageFileId",
    "legacyImageUrl",
    "actorUserId"
  ]) {
    assert.throws(
      () => planProductUpdate({ ...base, name: "Phone", [forbidden]: "unsafe" }),
      MutationContractError
    );
  }
  assert.throws(() => planProductUpdate(base), MutationContractError);
  assert.throws(
    () => planProductDelete({ ...base, expectedUpdatedAt: "not-a-date" }),
    MutationContractError
  );
});

test("malformed identities and unrecognized roles are denied", async () => {
  for (const identity of [
    null,
    {},
    { ...admin, userId: "" },
    { ...admin, role: "owner" },
    { ...admin, role: ["admin", "product_editor"] }
  ]) {
    const { service } = setup();
    await expectCode(
      service.createProduct(
        createRequest(),
        identity as unknown as AuthenticatedStaffIdentity
      ),
      "AUTHORIZATION_FAILED"
    );
  }
});

test("product handler denies absent, owner-only, zero-role, and ambiguous authorization", async () => {
  const denials: Array<Extract<StaffAuthorizationResult, { ok: false }>> = [
    { ok: false, code: "no_session" },
    { ok: false, code: "owner_only" },
    { ok: false, code: "no_application_role" },
    { ok: false, code: "ambiguous_application_role" }
  ];
  for (const denial of denials) {
    const { service } = setup();
    const result = await handleProductMutationRequest(
      new Request("https://watapp.pk/api/admin/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://watapp.pk"
        },
        body: JSON.stringify(createRequest())
      }),
      "create",
      { resolveIdentity: async () => denial, service }
    );
    assert.equal(result.status, denial.code === "no_session" ? 401 : 403);
    assert.equal(result.body.code, "AUTHORIZATION_FAILED");
  }
});

test("product commit waits for terminal status and conflicts fail closed", async () => {
  class PollingTables extends FakeTables {
    polls = 0;
    override async updateTransaction(input: {
      transactionId: string;
      commit?: boolean;
      rollback?: boolean;
    }) {
      const result = await super.updateTransaction(input);
      return input.commit ? { ...result, status: "pending" } : result;
    }
    override async getTransaction(input: { transactionId: string }) {
      this.polls++;
      return { $id: input.transactionId, status: "committed" };
    }
  }
  const base = setup();
  const tables = new PollingTables();
  tables.categories = base.tables.categories;
  const service = createAppwriteProductMutationService({
    tables,
    now: () => "2026-07-18T10:00:01.000Z",
    enforceRuntimeBoundary() {},
    wait: async () => {}
  });
  await service.createProduct(createRequest(), admin);
  assert.equal(tables.polls, 1);

  class ConflictTables extends FakeTables {
    override async updateTransaction(input: {
      transactionId: string;
      commit?: boolean;
      rollback?: boolean;
    }) {
      if (input.commit) return { $id: input.transactionId, status: "failed" };
      return super.updateTransaction(input);
    }
  }
  const conflictTables = new ConflictTables();
  conflictTables.categories = base.tables.categories;
  const conflictService = createAppwriteProductMutationService({
    tables: conflictTables,
    now: () => "2026-07-18T10:00:01.000Z",
    enforceRuntimeBoundary() {},
    wait: async () => {}
  });
  await expectCode(conflictService.createProduct(createRequest(), admin), "CONFLICT");
  assert.equal(conflictTables.products.size, 0);
});

test("logical product activity events are server-shaped and secret-safe", () => {
  const event = prepareProductMutationActivityEvent({
    eventType: "product.deletion_blocked",
    productId: "product_1",
    identity: admin,
    timestamp: "2026-07-18T10:00:00.000Z",
    requestId: "product:event:test-1",
    before: { id: "product_1" },
    after: { id: "product_1" },
    result: "failed",
    errorClassification: "REFERENCE_CONFLICT"
  });
  assert.equal(event.entityType, "product");
  assert.equal(event.actorRole, "admin");
  assert.equal("permissions" in event, false);
  assert.throws(() => prepareProductMutationActivityEvent({
    eventType: "product.mutation_failed",
    productId: "product_1",
    identity: admin,
    timestamp: "2026-07-18T10:00:00.000Z",
    requestId: "product:event:test-2",
    before: null,
    after: { sessionToken: "unsafe" },
    result: "failed"
  }), MutationContractError);
});

test("verification refuses partial gates and accepts the explicit double gate", () => {
  assert.equal(parseProductMutationVerificationArguments([]), "read_only");
  assert.throws(
    () => parseProductMutationVerificationArguments(["--run-lifecycle"]),
    /both explicit/i
  );
  assert.throws(
    () => parseProductMutationVerificationArguments([
      "--confirm-destructive-disposable-product-mutations"
    ]),
    /alone/i
  );
  assert.equal(parseProductMutationVerificationArguments([
    "--run-lifecycle",
    "--confirm-destructive-disposable-product-mutations"
  ]), "lifecycle");
});

test("verification lifecycle always cleans products before proving category cleanup", async () => {
  let products = 0;
  let categories = 0;
  let files = 0;
  const order: string[] = [];
  const result = await runProductMutationVerificationLifecycle({
    async counts() {
      return { products, categories, files };
    },
    async prefixMatches() {
      return {
        products: products ? ["product"] : [],
        categories: categories ? ["category"] : []
      };
    },
    async createFirstCategory() {
      categories++;
      return { id: "category_1", updatedAt: "2026-07-18T10:00:00.000Z" };
    },
    async createSecondCategory() {
      categories++;
      return { id: "category_2", updatedAt: "2026-07-18T10:00:00.000Z" };
    },
    async createProduct() {
      products++;
      return { id: "product_1", updatedAt: "2026-07-18T10:00:00.000Z" };
    },
    async verifyCreatedProduct() {},
    async retryCreate() {},
    async duplicateSlugCode() { return "CONFLICT"; },
    async updateProduct() { return { updatedAt: "2026-07-18T10:00:01.000Z" }; },
    async reassignProduct() { return { updatedAt: "2026-07-18T10:00:02.000Z" }; },
    async staleUpdateCode() { return "STALE_WRITE"; },
    async forbiddenInputCodes() {
      return ["VALIDATION_FAILED", "VALIDATION_FAILED", "VALIDATION_FAILED"];
    },
    async editorDeleteCode() { return "AUTHORIZATION_FAILED"; },
    async selectedDeleteCode() { return "REFERENCE_CONFLICT"; },
    async imageDeleteCode() { return "REFERENCE_CONFLICT"; },
    async referencedCategoryDeleteCode() { return "REFERENCE_CONFLICT"; },
    async adminDelete() {
      products--;
      order.push("product");
    },
    async deleteCategories() {
      categories = 0;
      order.push("categories");
    },
    async cleanup() {
      products = 0;
      categories = 0;
      files = 0;
    },
    async cleanupIsProven() { return true; }
  });
  assert.deepEqual(order, ["product", "categories"]);
  assert.equal(result.cleanupProven, true);
});
