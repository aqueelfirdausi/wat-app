import assert from "node:assert/strict";
import test from "node:test";
import type { StaffAuthorizationResult } from "@/lib/appwrite/auth/authorization";
import { handleCategoryMutationRequest } from "@/lib/appwrite/category-mutation-handlers";
import {
  createAppwriteCategoryMutationService,
  prepareCategoryMutationActivityEvent,
  type CategoryMutationTables
} from "@/lib/appwrite/category-mutations";
import {
  parseCategoryMutationVerificationArguments,
  runCategoryMutationVerificationLifecycle
} from "@/lib/appwrite/category-mutation-verification";
import {
  MutationContractError,
  type MutationErrorCode
} from "@/lib/appwrite/mutation-design";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";

type Row = Record<string, unknown> & { $id: string; $permissions: string[] };

function sdkError(code: number) {
  return Object.assign(new Error(`SDK ${code}`), { code });
}

function cloneRows(rows: Map<string, Row>) {
  return new Map(Array.from(rows, ([id, row]) => [id, structuredClone(row)]));
}

class FakeTables implements CategoryMutationTables {
  categories = new Map<string, Row>();
  products = new Map<string, Row>();
  transactions = new Map<string, {
    categories: Map<string, Row>;
    products: Map<string, Row>;
  }>();
  transactionCounter = 0;
  transactionStatuses = new Map<string, string>();

  private state(transactionId?: string) {
    if (!transactionId) {
      return { categories: this.categories, products: this.products };
    }
    const transaction = this.transactions.get(transactionId);
    if (!transaction) throw sdkError(404);
    return transaction;
  }

  private table(tableId: string, transactionId?: string) {
    const state = this.state(transactionId);
    return tableId === "categories" ? state.categories : state.products;
  }

  async createTransaction() {
    const id = `transaction_${++this.transactionCounter}`;
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
    const transaction = this.transactions.get(input.transactionId);
    if (!transaction) throw sdkError(404);
    if (input.commit) {
      this.categories = transaction.categories;
      this.products = transaction.products;
      this.transactionStatuses.set(input.transactionId, "committed");
      this.transactions.delete(input.transactionId);
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
  }) {
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
      if (query.method === "startsWith" && query.attribute && query.values?.[0]) {
        rows = rows.filter((row) =>
          String(row[query.attribute as string] ?? "").startsWith(String(query.values?.[0]))
        );
      }
    }
    return { rows: structuredClone(rows), total: rows.length };
  }

  async getRow(input: {
    tableId: string;
    rowId: string;
    transactionId?: string;
  }) {
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
    if (
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
    const updated = {
      ...current,
      ...structuredClone(input.data),
      ...(input.permissions ? { $permissions: [...input.permissions] } : {})
    };
    table.set(input.rowId, updated);
    return structuredClone(updated);
  }

  async deleteRow(input: {
    tableId: string;
    rowId: string;
    transactionId?: string;
  }) {
    const table = this.table(input.tableId, input.transactionId);
    if (!table.delete(input.rowId)) throw sdkError(404);
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
  role: "product_editor"
};

function setup() {
  const tables = new FakeTables();
  const events: Array<Record<string, unknown>> = [];
  let clock = Date.parse("2026-07-18T10:00:00.000Z");
  const service = createAppwriteCategoryMutationService({
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
    name: "  Mobile   Phones  ",
    idempotencyKey: "category:create:test-1",
    ...overrides
  };
}

async function expectCode(
  promise: Promise<unknown>,
  code: MutationErrorCode
) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof MutationContractError);
    assert.equal(error.code, code);
    return true;
  });
}

test("admin create normalizes whitespace and returns a narrow public DTO", async () => {
  const { service, tables } = setup();
  const dto = await service.createCategory(createRequest(), admin);
  assert.equal(dto.name, "Mobile Phones");
  assert.equal(dto.slug, "mobile-phones");
  assert.deepEqual(Object.keys(dto).sort(), ["id", "name", "slug", "updatedAt"]);
  assert.deepEqual(tables.categories.get(dto.id)?.$permissions, [
    'read("any")',
    'read("team:wat_staff/admin")',
    'read("team:wat_staff/product_editor")'
  ]);
});

test("product editor may create and rename a category", async () => {
  const { service } = setup();
  const created = await service.createCategory(
    createRequest({ idempotencyKey: "category:create:editor" }),
    editor
  );
  const renamed = await service.updateCategory({
    categoryId: created.id,
    name: "Smart Phones",
    slug: "smart-phones",
    expectedUpdatedAt: created.updatedAt,
    idempotencyKey: "category:update:editor"
  }, editor);
  assert.equal(renamed.name, "Smart Phones");
});

test("create rejects invalid names, slugs, unknown fields, permissions, and actors", async () => {
  for (const request of [
    createRequest({ name: " " }),
    createRequest({ slug: "Bad Slug!" }),
    createRequest({ unknown: true }),
    createRequest({ permissions: ['read("any")'] }),
    createRequest({ actorName: "Browser actor" })
  ]) {
    const { service } = setup();
    await expectCode(service.createCategory(request, admin), "VALIDATION_FAILED");
  }
});

test("create is deterministic and idempotent after an unknown outcome", async () => {
  const { service, tables } = setup();
  const first = await service.createCategory(createRequest(), admin);
  const second = await service.createCategory(createRequest(), admin);
  assert.deepEqual(second, first);
  assert.equal(tables.categories.size, 1);
  await expectCode(
    service.createCategory(createRequest({ name: "Different" }), admin),
    "CONFLICT"
  );
});

test("duplicate slug from another idempotency request is a conflict", async () => {
  const { service } = setup();
  await service.createCategory(createRequest(), admin);
  await expectCode(
    service.createCategory(
      createRequest({ idempotencyKey: "category:create:test-2" }),
      admin
    ),
    "CONFLICT"
  );
});

test("rename rejects stale writes and duplicate slugs", async () => {
  const { service } = setup();
  const first = await service.createCategory(createRequest(), admin);
  const second = await service.createCategory(
    createRequest({
      name: "Accessories",
      slug: "accessories",
      idempotencyKey: "category:create:accessories"
    }),
    admin
  );
  const renamed = await service.updateCategory({
    categoryId: first.id,
    name: "Phones",
    slug: "phones",
    expectedUpdatedAt: first.updatedAt,
    idempotencyKey: "category:update:phones"
  }, admin);
  await expectCode(
    service.updateCategory({
      categoryId: first.id,
      name: "Stale Phones",
      slug: "stale-phones",
      expectedUpdatedAt: first.updatedAt,
      idempotencyKey: "category:update:stale"
    }, admin),
    "STALE_WRITE"
  );
  await expectCode(
    service.updateCategory({
      categoryId: first.id,
      name: "Accessories",
      slug: second.slug,
      expectedUpdatedAt: renamed.updatedAt,
      idempotencyKey: "category:update:duplicate"
    }, admin),
    "CONFLICT"
  );
});

test("completed rename retry returns the intended current state", async () => {
  const { service } = setup();
  const created = await service.createCategory(createRequest(), admin);
  const request = {
    categoryId: created.id,
    name: "Phones",
    slug: "phones",
    expectedUpdatedAt: created.updatedAt,
    idempotencyKey: "category:update:retry"
  };
  const updated = await service.updateCategory(request, admin);
  assert.deepEqual(await service.updateCategory(request, admin), updated);
});

test("delete is admin only and rejects stale or referenced categories", async () => {
  const { service, tables } = setup();
  const created = await service.createCategory(createRequest(), admin);
  await expectCode(
    service.deleteCategory({
      categoryId: created.id,
      expectedUpdatedAt: created.updatedAt,
      idempotencyKey: "category:delete:editor"
    }, editor),
    "AUTHORIZATION_FAILED"
  );
  await expectCode(
    service.deleteCategory({
      categoryId: created.id,
      expectedUpdatedAt: "2026-07-18T09:00:00.000Z",
      idempotencyKey: "category:delete:stale"
    }, admin),
    "STALE_WRITE"
  );
  tables.products.set("product_1", {
    $id: "product_1",
    $permissions: [],
    categoryId: created.id
  });
  await expectCode(
    service.deleteCategory({
      categoryId: created.id,
      expectedUpdatedAt: created.updatedAt,
      idempotencyKey: "category:delete:referenced"
    }, admin),
    "REFERENCE_CONFLICT"
  );
  assert.equal(tables.categories.has(created.id), true);
});

test("admin delete succeeds and repeated read/delete are not found", async () => {
  const { service } = setup();
  const created = await service.createCategory(createRequest(), admin);
  assert.deepEqual(
    await service.deleteCategory({
      categoryId: created.id,
      expectedUpdatedAt: created.updatedAt,
      idempotencyKey: "category:delete:admin"
    }, admin),
    { id: created.id, deleted: true }
  );
  await expectCode(service.readCategory(created.id, admin), "NOT_FOUND");
  await expectCode(
    service.deleteCategory({
      categoryId: created.id,
      expectedUpdatedAt: created.updatedAt,
      idempotencyKey: "category:delete:again"
    }, admin),
    "NOT_FOUND"
  );
});

test("malformed identity is denied before any table write", async () => {
  const { service, tables } = setup();
  await expectCode(
    service.createCategory(
      createRequest(),
      { ...admin, role: "owner" } as unknown as AuthenticatedStaffIdentity
    ),
    "AUTHORIZATION_FAILED"
  );
  assert.equal(tables.categories.size, 0);
});

test("logical activity events are prepared but not stored as rows", async () => {
  const { service, events, tables } = setup();
  const created = await service.createCategory(createRequest(), admin);
  await service.updateCategory({
    categoryId: created.id,
    name: "Phones",
    slug: "phones",
    expectedUpdatedAt: created.updatedAt,
    idempotencyKey: "category:update:event"
  }, admin);
  assert.deepEqual(events.map((event) => event.eventType), [
    "category.created",
    "category.renamed"
  ]);
  assert.equal(events.every((event) => !("$permissions" in event)), true);
  assert.equal(tables.categories.size, 1);
});

test("failed mutation and cleanup-result activity events remain logical only", () => {
  const failed = prepareCategoryMutationActivityEvent({
    eventType: "category.mutation_failed",
    categoryId: "category_1",
    identity: admin,
    timestamp: "2026-07-18T10:00:00.000Z",
    requestId: "category:failed:test",
    before: { name: "Phones" },
    after: null,
    result: "failed",
    errorClassification: "STALE_WRITE"
  });
  const cleanup = prepareCategoryMutationActivityEvent({
    eventType: "category.cleanup_result",
    categoryId: "category_1",
    identity: admin,
    timestamp: "2026-07-18T10:00:01.000Z",
    requestId: "category:cleanup:test",
    before: null,
    after: null,
    result: "compensated",
    compensationResult: "fixture rows absent"
  });
  assert.equal(failed.errorClassification, "STALE_WRITE");
  assert.equal(cleanup.compensationResult, "fixture rows absent");
});

function handlerRequest(body: unknown) {
  return new Request("http://localhost/api/admin/categories", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

test("handler denies unauthenticated and invalid membership/role states", async () => {
  const denied: Array<Extract<StaffAuthorizationResult, { ok: false }>> = [
    { ok: false, code: "no_session" },
    { ok: false, code: "no_team_membership" },
    { ok: false, code: "no_application_role" },
    { ok: false, code: "ambiguous_application_role" }
  ];
  for (const authorization of denied) {
    const { service, tables } = setup();
    const result = await handleCategoryMutationRequest(
      handlerRequest(createRequest()),
      "create",
      {
        resolveIdentity: async () => authorization,
        service
      }
    );
    assert.equal(result.status, authorization.code === "no_session" ? 401 : 403);
    assert.equal(tables.categories.size, 0);
  }
});

test("handler accepts an authorized create and contains raw rows", async () => {
  const { service } = setup();
  const result = await handleCategoryMutationRequest(
    handlerRequest(createRequest()),
    "create",
    {
      resolveIdentity: async () => ({ ok: true, identity: admin }),
      service
    }
  );
  assert.equal(result.status, 201);
  const data = result.body.data as Record<string, unknown>;
  assert.deepEqual(Object.keys(data).sort(), ["id", "name", "slug", "updatedAt"]);
  assert.equal("$permissions" in data, false);
});

test("verification arguments refuse partial gates and accept both", () => {
  assert.equal(parseCategoryMutationVerificationArguments([]), "read-only");
  assert.throws(() => parseCategoryMutationVerificationArguments(["--run-lifecycle"]));
  assert.throws(() =>
    parseCategoryMutationVerificationArguments([
      "--confirm-destructive-disposable-category-mutations"
    ])
  );
  assert.equal(
    parseCategoryMutationVerificationArguments([
      "--run-lifecycle",
      "--confirm-destructive-disposable-category-mutations"
    ]),
    "disposable-write"
  );
  assert.equal(
    parseCategoryMutationVerificationArguments([
      "--recover-disposable-orphans",
      "--confirm-destructive-disposable-category-mutations"
    ]),
    "disposable-recovery"
  );
  assert.throws(() =>
    parseCategoryMutationVerificationArguments([
      "--run-lifecycle",
      "--recover-disposable-orphans",
      "--confirm-destructive-disposable-category-mutations"
    ])
  );
});

test("verification lifecycle proves behavior and restores baselines", async () => {
  let products = 0;
  let categories = 0;
  let categoryMissing = true;
  let productMissing = true;
  const result = await runCategoryMutationVerificationLifecycle({
    ids: {
      categoryId: "phase3v_disposable_c_123456",
      productId: "phase3v_disposable_p_123456",
      originalName: "__wat_phase_3v_disposable__ Original Category",
      originalSlug: "wat-phase-3v-disposable-original",
      renamedName: "__wat_phase_3v_disposable__ Renamed Category",
      renamedSlug: "wat-phase-3v-disposable-renamed"
    },
    dependencies: {
      counts: async () => ({ products, categories }),
      async createCategory(ids) {
        categories++;
        categoryMissing = false;
        return {
          id: ids.categoryId,
          name: ids.originalName,
          slug: ids.originalSlug,
          updatedAt: "2026-07-18T10:00:00.000Z"
        };
      },
      async readCategory(id) {
        return {
          id,
          name: "__wat_phase_3v_disposable__ Original Category",
          slug: "wat-phase-3v-disposable-original",
          updatedAt: "2026-07-18T10:00:00.000Z"
        };
      },
      async renameCategory(ids) {
        return {
          id: ids.categoryId,
          name: ids.renamedName,
          slug: ids.renamedSlug,
          updatedAt: "2026-07-18T10:00:01.000Z"
        };
      },
      staleRenameCode: async () => "STALE_WRITE",
      productEditorDeleteCode: async () => "AUTHORIZATION_FAILED",
      async createReferenceProduct() {
        products++;
        productMissing = false;
      },
      referencedDeleteCode: async () => "REFERENCE_CONFLICT",
      async deleteReferenceProduct() {
        products--;
        productMissing = true;
      },
      async deleteCategory(id) {
        categories--;
        categoryMissing = true;
        return { id, deleted: true };
      },
      async cleanupProduct() {
        products = 0;
        productMissing = true;
      },
      async cleanupCategory() {
        categories = 0;
        categoryMissing = true;
      },
      productIsMissing: async () => productMissing,
      categoryIsMissing: async () => categoryMissing,
      prefixMatches: async () => ({ products: 0, categories: 0 })
    }
  });
  assert.equal(result.cleanupVerified, true);
  assert.equal(result.referenceDeleteRejected, true);
  assert.deepEqual(result.baseline, { products: 0, categories: 0 });
});

test("verification lifecycle cleans category after mid-run failure", async () => {
  let categories = 0;
  let cleanupCalled = false;
  await assert.rejects(
    runCategoryMutationVerificationLifecycle({
      ids: {
        categoryId: "phase3v_disposable_c_654321",
        productId: "phase3v_disposable_p_654321",
        originalName: "__wat_phase_3v_disposable__ Original Category",
        originalSlug: "wat-phase-3v-disposable-original",
        renamedName: "__wat_phase_3v_disposable__ Renamed Category",
        renamedSlug: "wat-phase-3v-disposable-renamed"
      },
      dependencies: {
        counts: async () => ({ products: 0, categories }),
        async createCategory(ids) {
          categories = 1;
          return {
            id: ids.categoryId,
            name: ids.originalName,
            slug: ids.originalSlug,
            updatedAt: "2026-07-18T10:00:00.000Z"
          };
        },
        readCategory: async () => {
          throw new Error("verification failure");
        },
        renameCategory: async () => {
          throw new Error("unreachable");
        },
        staleRenameCode: async () => null,
        productEditorDeleteCode: async () => null,
        createReferenceProduct: async () => {},
        referencedDeleteCode: async () => null,
        deleteReferenceProduct: async () => {},
        deleteCategory: async (id) => ({ id, deleted: true }),
        cleanupProduct: async () => {},
        async cleanupCategory() {
          cleanupCalled = true;
          categories = 0;
        },
        productIsMissing: async () => true,
        categoryIsMissing: async () => categories === 0,
        prefixMatches: async () => ({ products: 0, categories: 0 })
      }
    }),
    /verification failure/
  );
  assert.equal(cleanupCalled, true);
  assert.equal(categories, 0);
});
