import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appwriteColumnMatchesBlueprint,
  buildBootstrapPlan,
  parseBootstrapArguments,
  sanitizeBootstrapText,
  validateBootstrapEnvironment,
  type BootstrapInventory
} from "@/lib/appwrite/bootstrap";
import type { AppwriteColumnBlueprint } from "@/lib/appwrite/table-blueprints";

function inventory(overrides: Partial<BootstrapInventory> = {}): BootstrapInventory {
  return {
    teams: [{ id: "wat_staff", name: "wat_staff" }],
    databases: [{ id: "wat_app", name: "wat_app" }],
    buckets: [{ id: "product_images", name: "product_images", fileSecurity: true, permissions: [], maximumFileSize: 1_048_576 }],
    tables: [],
    ...overrides
  };
}

const environment = {
  APPWRITE_ENDPOINT: "https://fra.cloud.appwrite.io/v1",
  APPWRITE_PROJECT_ID: "expected-project",
  APPWRITE_EXPECTED_PROJECT_ID: "expected-project",
  APPWRITE_BOOTSTRAP_API_KEY: "bootstrap-secret"
};

test("default invocation is read-only", () => {
  assert.equal(parseBootstrapArguments([]), "read-only");
  assert.equal(buildBootstrapPlan(inventory(), "read-only").writeActions.length, 0);
});

test("apply mode requires the confirmation flag", () => {
  assert.throws(() => parseBootstrapArguments(["--apply"]), /requires both/);
  assert.throws(() => parseBootstrapArguments(["--confirm-create-missing"]), /requires both/);
});

test("missing project ID is rejected", () => {
  assert.throws(() => validateBootstrapEnvironment({ ...environment, APPWRITE_PROJECT_ID: undefined }), /APPWRITE_PROJECT_ID/);
});

test("mismatched expected project ID is rejected", () => {
  assert.throws(() => validateBootstrapEnvironment({ ...environment, APPWRITE_EXPECTED_PROJECT_ID: "other" }), /does not match/);
});

test("configured fixed resource IDs cannot be redirected", () => {
  assert.throws(
    () => validateBootstrapEnvironment({ ...environment, APPWRITE_DATABASE_ID: "other" }),
    /must remain the fixed ID wat_app/
  );
});

test("missing bootstrap API key is rejected", () => {
  assert.throws(() => validateBootstrapEnvironment({ ...environment, APPWRITE_BOOTSTRAP_API_KEY: undefined }), /APPWRITE_BOOTSTRAP_API_KEY/);
});

test("exact existing resources are not rewritten", () => {
  const plan = buildBootstrapPlan(inventory(), "apply");
  assert.equal(plan.resources.find((resource) => resource.kind === "team")?.classification, "exact match");
  assert.equal(plan.writeActions.some((action) => action.kind !== "table"), false);
});

test("missing safe resource is planned only in confirmed apply mode", () => {
  const missingTeam = inventory({ teams: [] });
  assert.equal(buildBootstrapPlan(missingTeam, "read-only").writeActions.length, 0);
  assert.deepEqual(
    buildBootstrapPlan(missingTeam, "apply").writeActions.filter((action) => action.kind === "team"),
    [{ kind: "team", id: "wat_staff" }]
  );
});

test("name collision blocks apply", () => {
  const plan = buildBootstrapPlan(inventory({ teams: [{ id: "other", name: "wat_staff" }] }), "apply");
  assert.equal(plan.hasConflicts, true);
  assert.equal(plan.writeActions.some((action) => action.kind === "bucket"), false);
});

test("ID collision with a different name is conflicting", () => {
  const plan = buildBootstrapPlan(inventory({ databases: [{ id: "wat_app", name: "other" }] }), "apply");
  assert.equal(plan.resources.find((resource) => resource.kind === "database")?.classification, "conflicting");
});

test("incompatible bucket security requires adjustment without rewrite", () => {
  const plan = buildBootstrapPlan(inventory({
    buckets: [{ id: "product_images", name: "product_images", fileSecurity: false, permissions: ["read(\"any\")"], maximumFileSize: 2_000_000 }]
  }), "apply");
  const bucket = plan.resources.find((resource) => resource.kind === "bucket");
  assert.equal(bucket?.classification, "requires adjustment");
  assert.equal(plan.writeActions.length, 0);
});

test("a fixed table ID with an unrelated name blocks every apply action", () => {
  const plan = buildBootstrapPlan(inventory({
    tables: [{ id: "products", name: "unrelated", rowSecurity: true, permissions: [], columns: [], indexes: [] }]
  }), "apply");
  assert.equal(plan.resources.find((resource) => resource.id === "products")?.classification, "conflicting");
  assert.equal(plan.writeActions.length, 0);
});

test("unexpected extra table is conflicting", () => {
  const plan = buildBootstrapPlan(inventory({
    tables: [{ id: "extra", name: "extra", rowSecurity: true, permissions: [], columns: [], indexes: [] }]
  }), "apply");
  assert.equal(plan.hasConflicts, true);
});

test("Appwrite team_contacts is explicitly conflicting", () => {
  const plan = buildBootstrapPlan(inventory({
    tables: [{ id: "team_contacts", name: "team_contacts", rowSecurity: true, permissions: [], columns: [], indexes: [] }]
  }), "read-only");
  assert.match(plan.resources.find((resource) => resource.id === "team_contacts")?.reasons[0] ?? "", /prohibited/);
});

test("partial resource set plans top-level resources and the two locked core tables", () => {
  const plan = buildBootstrapPlan(inventory({ teams: [], databases: [], buckets: [] }), "apply");
  assert.deepEqual(plan.writeActions.map((action) => `${action.kind}:${action.id}`).sort(), [
    "bucket:product_images",
    "database:wat_app",
    "table:categories",
    "table:products",
    "team:wat_staff"
  ]);
  assert.deepEqual(
    plan.resources.filter((resource) => resource.kind === "table" && resource.canCreate).map((resource) => resource.id),
    ["products", "categories"]
  );
});

test("operational tables remain deferred rather than receiving placeholder schemas", () => {
  const plan = buildBootstrapPlan(inventory(), "apply");
  for (const id of ["activity_logs", "analytics_events", "broadcasts"]) {
    const resource = plan.resources.find((candidate) => candidate.id === id);
    assert.equal(resource?.classification, "missing");
    assert.equal(resource?.canCreate, false);
  }
});

test("bootstrap plan contains no delete or user mutation behavior", () => {
  const plan = buildBootstrapPlan(inventory({ teams: [] }), "apply");
  assert.deepEqual(plan.prohibitedActions, ["delete", "user mutation", "API-key mutation"]);
  assert.equal(JSON.stringify(plan.writeActions).includes("delete"), false);
  assert.equal(JSON.stringify(plan.writeActions).includes("user"), false);
});

test("secret redaction removes supplied and labelled secrets", () => {
  const result = sanitizeBootstrapText("key=abc bootstrap-secret password=hunter2", ["bootstrap-secret"]);
  assert.equal(result.includes("abc"), false);
  assert.equal(result.includes("bootstrap-secret"), false);
  assert.equal(result.includes("hunter2"), false);
});

test("Appwrite string format metadata round-trips enum and URL columns", () => {
  const enumColumn = {
    key: "brand",
    kind: "enum",
    elements: ["univercell", "eko"],
    required: true
  } satisfies AppwriteColumnBlueprint;
  assert.equal(appwriteColumnMatchesBlueprint(enumColumn, {
    key: "brand",
    type: "string",
    format: "enum",
    required: true,
    array: false,
    elements: ["univercell", "eko"],
    status: "available"
  }), true);

  const urlColumn = {
    key: "legacyImageUrl",
    kind: "url",
    required: false
  } satisfies AppwriteColumnBlueprint;
  assert.equal(appwriteColumnMatchesBlueprint(urlColumn, {
    key: "legacyImageUrl",
    type: "string",
    format: "url",
    required: false,
    array: false,
    status: "available"
  }), true);
});

test("column metadata normalization does not weaken schema validation", () => {
  const enumColumn = {
    key: "currency",
    kind: "enum",
    elements: ["PKR"],
    required: false,
    default: "PKR"
  } satisfies AppwriteColumnBlueprint;
  const base = {
    key: "currency",
    type: "string",
    format: "enum",
    required: false,
    array: false,
    elements: ["PKR"],
    default: "PKR",
    status: "available"
  };

  assert.equal(appwriteColumnMatchesBlueprint(enumColumn, { ...base, format: "url" }), false);
  assert.equal(appwriteColumnMatchesBlueprint(enumColumn, { ...base, elements: ["USD"] }), false);
  assert.equal(appwriteColumnMatchesBlueprint(enumColumn, { ...base, default: "USD" }), false);
  assert.equal(appwriteColumnMatchesBlueprint(enumColumn, { ...base, array: true }), false);
  assert.equal(appwriteColumnMatchesBlueprint({
    ...enumColumn,
    elements: ["PKR", "USD"]
  }, {
    ...base,
    elements: ["USD", "PKR"]
  }), false);
});

test("safe summary contains no inventory values beyond classifications", () => {
  const plan = buildBootstrapPlan(inventory(), "read-only");
  assert.match(plan.summary, /no writes/);
  assert.equal(plan.summary.includes("secret"), false);
});
