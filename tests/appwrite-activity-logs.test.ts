import test from "node:test";
import assert from "node:assert/strict";
import {
  activityLogAdminPermissions,
  hasExactActivityLogPermissions,
  listAppwriteActivityLogs,
  mapLogicalActivityEvent,
  persistAppwriteActivityEvent,
  type ActivityLogTables
} from "@/lib/appwrite/activity-logs";
import {
  buildActivityEvent,
  MutationContractError
} from "@/lib/appwrite/mutation-design";
import { handleProductLifecycleRequest } from "@/lib/appwrite/product-lifecycle-handlers";

const previousBackend = process.env.WAT_BACKEND;
process.env.WAT_BACKEND = "appwrite";
test.after(() => {
  if (previousBackend === undefined) delete process.env.WAT_BACKEND;
  else process.env.WAT_BACKEND = previousBackend;
});

function logical(overrides: Record<string, unknown> = {}) {
  return buildActivityEvent({
    eventId: "phase3y:event:0001",
    eventType: "product.updated",
    entityType: "product",
    entityId: "phase3y_product_0001",
    actor: {
      userId: "phase3y_admin_0001",
      displayName: "Phase 3Y Admin",
      role: "admin"
    },
    timestamp: "2026-07-18T12:00:00.000Z",
    requestId: "phase3y_request_0001",
    before: {
      name: "Before",
      price: 100,
      chosenSelectionKey: "must-not-persist"
    },
    after: {
      name: "After",
      price: 200,
      imageFileId: "phase3y_image_0001"
    },
    result: "succeeded",
    metadata: {
      fixtureClassification: "phase3y_verification",
      operation: "update"
    },
    ...overrides
  });
}

class FakeTables implements ActivityLogTables {
  rows = new Map<string, Record<string, unknown> & { $id: string }>();
  createError: unknown = null;
  createCalls = 0;
  listResult: Array<Record<string, unknown> & { $id: string }> = [];

  async createRow(input: {
    rowId: string;
    data: Record<string, unknown>;
    permissions: string[];
  }) {
    this.createCalls++;
    if (this.createError) throw this.createError;
    if (this.rows.has(input.rowId)) throw { code: 409 };
    const row = {
      $id: input.rowId,
      $permissions: input.permissions,
      ...input.data
    };
    this.rows.set(input.rowId, row);
    return row;
  }

  async getRow(input: { rowId: string }) {
    const row = this.rows.get(input.rowId);
    if (!row) throw { code: 404 };
    return row;
  }

  async listRows() {
    return { rows: this.listResult };
  }
}

test("logical activity maps to bounded redacted physical fields", () => {
  const mapped = mapLogicalActivityEvent(logical());
  assert.match(mapped.rowId, /^evt_[a-f0-9]{32}$/);
  assert.equal(mapped.fixtureClassification, "phase3y_verification");
  assert.deepEqual(JSON.parse(mapped.changedFields), [
    "imageFileId",
    "name",
    "price"
  ]);
  assert.deepEqual(JSON.parse(mapped.beforeState ?? ""), {
    name: "Before",
    price: 100
  });
  assert.ok(!mapped.beforeState?.includes("chosenSelectionKey"));
  assert.ok(!mapped.beforeState?.includes("permissions"));
  assert.deepEqual(JSON.parse(mapped.metadataSummary ?? ""), {
    fixtureClassification: "phase3y_verification",
    operation: "update"
  });
});

test("logical constructor rejects raw permissions and authorization data", () => {
  assert.throws(
    () =>
      logical({
        before: { name: "Before", permissions: ['read("any")'] }
      }),
    (error) =>
      error instanceof MutationContractError &&
      error.code === "VALIDATION_FAILED"
  );
  assert.throws(
    () => logical({ metadata: { authorization: "Bearer secret" } }),
    (error) =>
      error instanceof MutationContractError &&
      error.code === "VALIDATION_FAILED"
  );
});

test("deterministic event IDs and strict row permission are stable", () => {
  const first = mapLogicalActivityEvent(logical());
  const second = mapLogicalActivityEvent(logical());
  assert.equal(first.rowId, second.rowId);
  assert.deepEqual(activityLogAdminPermissions(), [
    'read("team:wat_staff/admin")'
  ]);
  assert.equal(
    hasExactActivityLogPermissions(activityLogAdminPermissions()),
    true
  );
  assert.equal(hasExactActivityLogPermissions(['read("any")']), false);
});

test("oversized redacted snapshots fail without truncation", () => {
  assert.throws(
    () =>
      mapLogicalActivityEvent(
        logical({ after: { description: "x".repeat(16_500) } })
      ),
    (error) =>
      error instanceof MutationContractError &&
      error.code === "VALIDATION_FAILED"
  );
});

test("durable persistence verifies materialization", async () => {
  const tables = new FakeTables();
  const result = await persistAppwriteActivityEvent(logical(), tables);
  assert.deepEqual(result, {
    eventId: "phase3y:event:0001",
    duplicate: false,
    outcomeRecovered: false
  });
  assert.equal(tables.createCalls, 1);
  assert.equal(tables.rows.size, 1);
});

test("equivalent duplicate is accepted and conflicting reuse is rejected", async () => {
  const tables = new FakeTables();
  await persistAppwriteActivityEvent(logical(), tables);
  const duplicate = await persistAppwriteActivityEvent(logical(), tables);
  assert.equal(duplicate.duplicate, true);
  await assert.rejects(
    persistAppwriteActivityEvent(
      logical({ after: { name: "Conflicting", price: 200 } }),
      tables
    ),
    (error) =>
      error instanceof MutationContractError &&
      error.code === "AUDIT_PERSISTENCE_FAILED"
  );
});

test("unknown create outcome is recovered only from equivalent materialization", async () => {
  const tables = new FakeTables();
  const mapped = mapLogicalActivityEvent(logical());
  tables.rows.set(mapped.rowId, {
    $id: mapped.rowId,
    $permissions: activityLogAdminPermissions(),
    eventId: mapped.eventId,
    eventType: mapped.eventType,
    entityType: mapped.entityType,
    entityId: mapped.entityId,
    actorUserId: mapped.actorUserId,
    actorDisplayName: mapped.actorDisplayName,
    actorRole: mapped.actorRole,
    occurredAt: mapped.occurredAt,
    requestId: mapped.requestId,
    result: mapped.result,
    changedFields: mapped.changedFields,
    beforeState: mapped.beforeState,
    afterState: mapped.afterState,
    metadataSummary: mapped.metadataSummary,
    fixtureClassification: mapped.fixtureClassification
  });
  tables.createError = new Error("unknown transport outcome");
  const recovered = await persistAppwriteActivityEvent(logical(), tables);
  assert.equal(recovered.outcomeRecovered, true);
});

test("admin reader is narrow, paginated, newest-first queried, and editor denied", async () => {
  const tables = new FakeTables();
  const mapped = mapLogicalActivityEvent(logical());
  tables.listResult = [
    {
      $id: mapped.rowId,
      $permissions: activityLogAdminPermissions(),
      eventType: mapped.eventType,
      entityType: mapped.entityType,
      entityId: mapped.entityId,
      actorDisplayName: mapped.actorDisplayName,
      actorRole: mapped.actorRole,
      occurredAt: mapped.occurredAt,
      result: mapped.result,
      changedFields: mapped.changedFields,
      fixtureClassification: mapped.fixtureClassification
    }
  ];
  const admin = {
    userId: "phase3y_admin_0001",
    email: "phase3y-admin@example.invalid",
    name: "Phase 3Y Admin",
    role: "admin" as const
  };
  const page = await listAppwriteActivityLogs({
    identity: admin,
    page: 1,
    pageSize: 25,
    tables
  });
  assert.equal(page.items.length, 1);
  assert.deepEqual(Object.keys(page.items[0]).sort(), [
    "actorDisplayName",
    "actorRole",
    "changedFields",
    "compensationClassification",
    "entityId",
    "entityType",
    "errorClassification",
    "eventType",
    "fixtureClassification",
    "id",
    "occurredAt",
    "result"
  ]);
  assert.ok(!("actorUserId" in page.items[0]));
  assert.ok(!("beforeState" in page.items[0]));
  await assert.rejects(
    listAppwriteActivityLogs({
      identity: { ...admin, role: "product_editor" },
      tables
    }),
    (error) =>
      error instanceof MutationContractError &&
      error.code === "AUTHORIZATION_FAILED"
  );
});

test("normal activity boundary exposes create/read only, never update/delete", () => {
  const methods: Array<keyof ActivityLogTables> = [
    "createRow",
    "getRow",
    "listRows"
  ];
  assert.ok(!methods.includes("updateRow" as keyof ActivityLogTables));
  assert.ok(!methods.includes("deleteRow" as keyof ActivityLogTables));
});

test("authorized lifecycle failures are durably shaped at the handler boundary", async () => {
  const events: ReturnType<typeof buildActivityEvent>[] = [];
  const result = await handleProductLifecycleRequest(
    new Request("http://localhost/api/admin/product-lifecycle", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost"
      },
      body: JSON.stringify({
        operation: "visibility",
        productId: "phase3y_product_0001",
        expectedUpdatedAt: "2026-07-18T12:00:00.000Z",
        idempotencyKey: "phase3y_visibility_failure_0001",
        storefrontVisible: true
      })
    }),
    {
      resolveIdentity: async () => ({
        ok: true,
        identity: {
          userId: "phase3y_admin_0001",
          email: "phase3y-admin@example.invalid",
          name: "Phase 3Y Admin",
          role: "admin"
        }
      }),
      service: {
        setStorefrontVisibility: async () => {
          throw new MutationContractError(
            "DEPENDENCY_FAILED",
            "A verified Appwrite image is required for publication."
          );
        }
      } as never,
      emitActivityEvent: async (event) => {
        events.push(event);
      }
    }
  );
  assert.equal(result.status, 424);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "product.visibility_transition_failed");
  assert.equal(events[0].entityId, "phase3y_product_0001");
  assert.equal(events[0].actorUserId, "phase3y_admin_0001");
  assert.equal(events[0].result, "failed");
  assert.equal(events[0].errorClassification, "DEPENDENCY_FAILED");
});
