import {
  APPWRITE_DEFAULT_RESOURCE_IDS,
  APPWRITE_PERMANENT_TABLE_IDS,
  getAppwriteResourceIds
} from "@/lib/appwrite/resources";

export type ResourceClassification =
  | "exact match"
  | "compatible"
  | "requires adjustment"
  | "conflicting"
  | "missing"
  | "unrelated"
  | "legacy"
  | "Needs verification";

export type BootstrapMode = "read-only" | "apply";

export type BootstrapResource = {
  kind: "team" | "database" | "bucket" | "table";
  id: string;
  name: string;
  classification: ResourceClassification;
  reasons: string[];
  canCreate: boolean;
};

export type BootstrapInventory = {
  teams: Array<{ id: string; name: string }>;
  databases: Array<{ id: string; name: string }>;
  buckets: Array<{
    id: string;
    name: string;
    fileSecurity: boolean;
    permissions: string[];
    maximumFileSize: number;
  }>;
  tables: Array<{
    id: string;
    name: string;
    rowSecurity: boolean;
    permissions: string[];
    columns: string[];
    indexes: string[];
  }>;
};

export type BootstrapPlan = {
  mode: BootstrapMode;
  resources: BootstrapResource[];
  hasConflicts: boolean;
  writeActions: Array<{ kind: "team" | "database" | "bucket"; id: string }>;
  prohibitedActions: ["delete", "user mutation", "API-key mutation"];
  summary: string;
};

const ONE_MEBIBYTE = 1024 * 1024;

export const APPWRITE_TABLE_BLUEPRINTS = {
  products: {
    columns: [
      "name", "slug", "description", "brand", "preferredContactId", "categoryId",
      "categoryName", "price", "currency", "condition", "stockStatus", "featured",
      "statusPick", "storefrontVisible", "feedVisible", "sortPriority",
      "chosenSelectionKey", "imageFileId", "legacyImageUrl", "createdAt", "updatedAt",
      "createdByName", "updatedByName"
    ],
    indexes: ["products_slug_unique", "products_updated_at", "products_chosen_unique"]
  },
  categories: {
    columns: ["name", "slug", "updatedAt"],
    indexes: ["categories_slug_unique", "categories_name"]
  },
  activity_logs: {
    columns: [
      "action", "entityType", "entityId", "entityName", "actorUserId",
      "legacyActorFirebaseUid", "actorName", "actorEmail", "details", "requestId", "createdAt"
    ],
    indexes: ["activity_logs_created_at"]
  },
  analytics_events: {
    columns: ["eventName", "sessionId", "productId", "productSlug", "category", "context", "createdAt"],
    indexes: ["analytics_events_created_at"]
  },
  broadcasts: {
    columns: [
      "title", "body", "sentAt", "sentByUserId", "sentByName", "sentByEmail",
      "productId", "productSlug", "productImageFileId", "legacyProductImageUrl"
    ],
    indexes: ["broadcasts_sent_at"]
  }
} as const;

function findById<T extends { id: string }>(resources: T[], id: string) {
  return resources.find((resource) => resource.id === id);
}

function findNameCollision<T extends { id: string; name: string }>(resources: T[], id: string, name: string) {
  return resources.find((resource) => resource.name === name && resource.id !== id);
}

function classifyNamedResource(
  kind: "team" | "database",
  resources: Array<{ id: string; name: string }>,
  id: string,
  name: string
): BootstrapResource {
  const byId = findById(resources, id);
  const collision = findNameCollision(resources, id, name);

  if (collision) {
    return { kind, id, name, classification: "conflicting", reasons: [`Name is already used by ID ${collision.id}.`], canCreate: false };
  }

  if (!byId) {
    return { kind, id, name, classification: "missing", reasons: ["Fixed ID is absent."], canCreate: true };
  }

  if (byId.name !== name) {
    return { kind, id, name, classification: "conflicting", reasons: [`Fixed ID has name ${byId.name}.`], canCreate: false };
  }

  return { kind, id, name, classification: "exact match", reasons: [], canCreate: false };
}

function classifyBucket(inventory: BootstrapInventory): BootstrapResource {
  const id = APPWRITE_DEFAULT_RESOURCE_IDS.productImagesBucket;
  const collision = findNameCollision(inventory.buckets, id, id);
  const bucket = findById(inventory.buckets, id);

  if (collision) {
    return { kind: "bucket", id, name: id, classification: "conflicting", reasons: [`Name is already used by ID ${collision.id}.`], canCreate: false };
  }

  if (!bucket) {
    return { kind: "bucket", id, name: id, classification: "missing", reasons: ["Fixed ID is absent."], canCreate: true };
  }

  const reasons: string[] = [];
  if (bucket.name !== id) reasons.push(`Fixed ID has name ${bucket.name}.`);
  if (!bucket.fileSecurity) reasons.push("File security is disabled.");
  if (bucket.permissions.length !== 0) reasons.push("Bucket permissions are not empty.");
  if (bucket.maximumFileSize !== ONE_MEBIBYTE) reasons.push("Maximum file size is not 1 MiB.");

  return {
    kind: "bucket",
    id,
    name: id,
    classification: reasons.length ? "requires adjustment" : "exact match",
    reasons,
    canCreate: false
  };
}

function classifyTable(tableId: string, inventory: BootstrapInventory): BootstrapResource {
  const blueprint = APPWRITE_TABLE_BLUEPRINTS[tableId as keyof typeof APPWRITE_TABLE_BLUEPRINTS];
  const table = findById(inventory.tables, tableId);
  const collision = findNameCollision(inventory.tables, tableId, tableId);

  if (collision) {
    return { kind: "table", id: tableId, name: tableId, classification: "conflicting", reasons: [`Name is already used by ID ${collision.id}.`], canCreate: false };
  }

  if (!table) {
    return {
      kind: "table",
      id: tableId,
      name: tableId,
      classification: "missing",
      reasons: ["Fixed ID is absent.", "Automatic creation is blocked until every column type and size is frozen."],
      canCreate: false
    };
  }

  const reasons: string[] = [];
  if (table.name !== tableId) reasons.push(`Fixed ID has name ${table.name}.`);
  if (!table.rowSecurity) reasons.push("Row security is disabled.");
  if (table.permissions.length !== 0) reasons.push("Table permissions are not empty.");

  const missingColumns = blueprint.columns.filter((column) => !table.columns.includes(column));
  const extraColumns = table.columns.filter((column) => !(blueprint.columns as readonly string[]).includes(column));
  const missingIndexes = blueprint.indexes.filter((index) => !table.indexes.includes(index));

  if (missingColumns.length) reasons.push(`Missing columns: ${missingColumns.join(", ")}.`);
  if (extraColumns.length) reasons.push(`Unexpected columns: ${extraColumns.join(", ")}.`);
  if (missingIndexes.length) reasons.push(`Missing indexes: ${missingIndexes.join(", ")}.`);

  return {
    kind: "table",
    id: tableId,
    name: tableId,
    classification: reasons.length ? "requires adjustment" : "compatible",
    reasons: reasons.length ? reasons : ["Names and major security settings match; exact types and limits still need verification."],
    canCreate: false
  };
}

export function buildBootstrapPlan(inventory: BootstrapInventory, mode: BootstrapMode): BootstrapPlan {
  const resources: BootstrapResource[] = [
    classifyNamedResource("team", inventory.teams, APPWRITE_DEFAULT_RESOURCE_IDS.team, APPWRITE_DEFAULT_RESOURCE_IDS.team),
    classifyNamedResource("database", inventory.databases, APPWRITE_DEFAULT_RESOURCE_IDS.database, APPWRITE_DEFAULT_RESOURCE_IDS.database),
    classifyBucket(inventory),
    ...APPWRITE_PERMANENT_TABLE_IDS.map((tableId) => classifyTable(tableId, inventory))
  ];

  const extraTables = inventory.tables.filter(
    (table) => !APPWRITE_PERMANENT_TABLE_IDS.includes(table.id as (typeof APPWRITE_PERMANENT_TABLE_IDS)[number])
  );
  for (const table of extraTables) {
    resources.push({
      kind: "table",
      id: table.id,
      name: table.name,
      classification: table.id === "team_contacts" ? "conflicting" : "conflicting",
      reasons: [table.id === "team_contacts" ? "Appwrite team_contacts is explicitly prohibited." : "Unexpected permanent table requires owner review."],
      canCreate: false
    });
  }

  const hasConflicts = resources.some((resource) => resource.classification === "conflicting");
  const writeActions = mode === "apply" && !hasConflicts
    ? resources
        .filter((resource) => resource.classification === "missing" && resource.canCreate)
        .map((resource) => ({ kind: resource.kind as "team" | "database" | "bucket", id: resource.id }))
    : [];

  return {
    mode,
    resources,
    hasConflicts,
    writeActions,
    prohibitedActions: ["delete", "user mutation", "API-key mutation"],
    summary: hasConflicts
      ? "Conflicts detected; apply is blocked and no writes are permitted."
      : mode === "read-only"
        ? "Read-only inspection complete; no writes were planned or performed."
        : `${writeActions.length} safe missing-resource creation action(s) planned.`
  };
}

export function parseBootstrapArguments(argumentsList: string[]): BootstrapMode {
  const allowed = new Set(["--apply", "--confirm-create-missing"]);
  const unknown = argumentsList.filter((argument) => !allowed.has(argument));
  if (unknown.length) throw new Error(`Unknown bootstrap argument: ${unknown[0]}`);

  const apply = argumentsList.includes("--apply");
  const confirmed = argumentsList.includes("--confirm-create-missing");
  if (apply !== confirmed) {
    throw new Error("Apply mode requires both --apply and --confirm-create-missing.");
  }

  return apply ? "apply" : "read-only";
}

export function validateBootstrapEnvironment(environment: Record<string, string | undefined>) {
  const endpoint = environment.APPWRITE_ENDPOINT;
  const projectId = environment.APPWRITE_PROJECT_ID;
  const expectedProjectId = environment.APPWRITE_EXPECTED_PROJECT_ID;
  const apiKey = environment.APPWRITE_BOOTSTRAP_API_KEY;

  const missing = [
    ["APPWRITE_ENDPOINT", endpoint],
    ["APPWRITE_PROJECT_ID", projectId],
    ["APPWRITE_EXPECTED_PROJECT_ID", expectedProjectId],
    ["APPWRITE_BOOTSTRAP_API_KEY", apiKey]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing bootstrap configuration: ${missing.join(", ")}.`);
  if (projectId !== expectedProjectId) throw new Error("Configured project ID does not match the expected project ID.");
  getAppwriteResourceIds(environment);

  return { endpoint: endpoint as string, projectId: projectId as string, apiKey: apiKey as string };
}

export function sanitizeBootstrapText(value: unknown, secrets: string[] = []) {
  let text = value instanceof Error ? value.message : String(value);
  for (const secret of secrets.filter(Boolean)) text = text.split(secret).join("[REDACTED]");
  return text.replace(/(key|secret|token|password)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
}
