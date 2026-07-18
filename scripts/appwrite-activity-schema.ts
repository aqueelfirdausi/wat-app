import { loadEnvConfig } from "@next/env";
import { Client, TablesDB, TablesDBIndexType } from "node-appwrite";
import {
  appwriteColumnMatchesBlueprint,
  sanitizeBootstrapText,
  validateBootstrapEnvironment,
  type BootstrapInventory
} from "@/lib/appwrite/bootstrap";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import {
  APPWRITE_TABLE_BLUEPRINTS,
  type AppwriteColumnBlueprint
} from "@/lib/appwrite/table-blueprints";

loadEnvConfig(process.cwd());

const tableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.activityLogs;
const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
const blueprint = APPWRITE_TABLE_BLUEPRINTS.activity_logs;

function parseMode(args: string[]) {
  const allowed = new Set(["--apply", "--confirm-create-activity-logs"]);
  const unknown = args.find((arg) => !allowed.has(arg));
  if (unknown) throw new Error(`Unknown activity schema argument: ${unknown}`);
  const apply = args.includes("--apply");
  const confirm = args.includes("--confirm-create-activity-logs");
  if (apply !== confirm) {
    throw new Error(
      "Creation requires both --apply and --confirm-create-activity-logs."
    );
  }
  return apply ? "apply" : "read-only";
}

function normalizeTable(value: Record<string, unknown>) {
  return {
    id: String(value.$id),
    name: String(value.name),
    rowSecurity: Boolean(value.rowSecurity),
    permissions: Array.isArray(value.$permissions)
      ? value.$permissions.map(String)
      : [],
    columns: Array.isArray(value.columns)
      ? value.columns.map((entry) => {
          const column = entry as Record<string, unknown>;
          return {
            key: String(column.key),
            type: String(column.type),
            required: Boolean(column.required),
            ...(typeof column.array === "boolean" ? { array: column.array } : {}),
            ...(typeof column.size === "number" ? { size: column.size } : {}),
            ...(column.default !== undefined && column.default !== null
              ? { default: column.default as string | number | boolean }
              : {}),
            ...(Array.isArray(column.elements)
              ? { elements: column.elements.map(String) }
              : {}),
            ...(typeof column.format === "string" ? { format: column.format } : {}),
            ...(typeof column.status === "string" ? { status: column.status } : {})
          };
        })
      : [],
    indexes: Array.isArray(value.indexes)
      ? value.indexes.map((entry) => {
          const index = entry as Record<string, unknown>;
          const columns = Array.isArray(index.columns)
            ? index.columns
            : Array.isArray(index.attributes)
              ? index.attributes
              : [];
          return {
            key: String(index.key),
            type: String(index.type),
            columns: columns.map(String),
            ...(typeof index.status === "string" ? { status: index.status } : {})
          };
        })
      : []
  } satisfies BootstrapInventory["tables"][number];
}

function inspectExact(table: BootstrapInventory["tables"][number]) {
  const reasons: string[] = [];
  if (table.name !== tableId) reasons.push("Fixed table name does not match.");
  if (!table.rowSecurity) reasons.push("Row security is disabled.");
  if (table.permissions.length !== 0) reasons.push("Table permissions are not empty.");
  const expectedKeys = blueprint.columns.map((column) => column.key);
  const expectedKeySet = new Set<string>(expectedKeys);
  const actualKeys = table.columns.map((column) => column.key);
  const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
  const extra = actualKeys.filter((key) => !expectedKeySet.has(key));
  if (missing.length) reasons.push(`Missing columns: ${missing.join(", ")}.`);
  if (extra.length) reasons.push(`Unexpected columns: ${extra.join(", ")}.`);
  for (const expected of blueprint.columns) {
    const actual = table.columns.find((column) => column.key === expected.key);
    if (actual && !appwriteColumnMatchesBlueprint(expected, actual)) {
      reasons.push(`Incompatible column: ${expected.key}.`);
    }
  }
  for (const expected of blueprint.indexes) {
    const actual = table.indexes.find((index) => index.key === expected.key);
    if (
      !actual ||
      actual.type !== expected.type ||
      JSON.stringify(actual.columns) !== JSON.stringify(expected.columns) ||
      (actual.status !== undefined && actual.status !== "available")
    ) {
      reasons.push(`Missing or incompatible index: ${expected.key}.`);
    }
  }
  const extraIndexes = table.indexes.filter(
    (index) => !blueprint.indexes.some((expected) => expected.key === index.key)
  );
  if (extraIndexes.length) {
    reasons.push(
      `Unexpected indexes: ${extraIndexes.map((index) => index.key).join(", ")}.`
    );
  }
  return reasons;
}

async function createColumn(
  tables: TablesDB,
  column: AppwriteColumnBlueprint
) {
  const base = { databaseId, tableId, key: column.key, required: column.required };
  const xdefault = column.default;
  switch (column.kind) {
    case "varchar":
      return tables.createVarcharColumn({
        ...base,
        size: column.size as number,
        xdefault: xdefault as string | undefined
      });
    case "text":
      return tables.createTextColumn({
        ...base,
        xdefault: xdefault as string | undefined
      });
    case "enum":
      return tables.createEnumColumn({
        ...base,
        elements: [...(column.elements ?? [])],
        xdefault: xdefault as string | undefined
      });
    case "datetime":
      return tables.createDatetimeColumn({
        ...base,
        xdefault: xdefault as string | undefined
      });
    default:
      throw new Error(`Unsupported activity column kind: ${column.kind}`);
  }
}

async function waitFor(
  read: () => Promise<Array<{ key: string; status?: string }>>,
  key: string
) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const found = (await read()).find((entry) => entry.key === key);
    if (found?.status === "available") return;
    if (found?.status === "failed" || found?.status === "stuck") {
      throw new Error(`Activity schema resource ${key} failed.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for activity schema resource ${key}.`);
}

async function getTable(tables: TablesDB) {
  const result = await tables.listTables({ databaseId, total: false });
  const matches = result.tables.filter(
    (table) => table.$id === tableId || table.name === tableId
  );
  if (matches.length > 1) throw new Error("Activity table ID/name collision detected.");
  return matches[0] as unknown as Record<string, unknown> | undefined;
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const configuration = validateBootstrapEnvironment(process.env);
  const tables = new TablesDB(
    new Client()
      .setEndpoint(configuration.endpoint)
      .setProject(configuration.projectId)
      .setKey(configuration.apiKey)
  );
  const existing = await getTable(tables);
  if (existing) {
    const normalized = normalizeTable(existing);
    const reasons = inspectExact(normalized);
    console.log(
      JSON.stringify(
        {
          mode,
          tableId,
          classification: reasons.length ? "schema_mismatch" : "exact_match",
          reasons
        },
        null,
        2
      )
    );
    if (reasons.length) throw new Error("Activity table schema mismatch; no writes allowed.");
    return;
  }
  console.log(
    JSON.stringify(
      { mode, tableId, classification: "absent", action: mode === "apply" ? "create" : "none" },
      null,
      2
    )
  );
  if (mode === "read-only") return;

  await tables.createTable({
    databaseId,
    tableId,
    name: tableId,
    permissions: [],
    rowSecurity: true,
    enabled: true
  });
  for (const column of blueprint.columns) {
    await createColumn(tables, column);
    await waitFor(async () => {
      const result = await tables.listColumns({ databaseId, tableId, total: false });
      return result.columns.map((entry) => ({ key: entry.key, status: entry.status }));
    }, column.key);
  }
  for (const index of blueprint.indexes) {
    await tables.createIndex({
      databaseId,
      tableId,
      key: index.key,
      type:
        index.type === "unique"
          ? TablesDBIndexType.Unique
          : TablesDBIndexType.Key,
      columns: [...index.columns]
    });
    await waitFor(async () => {
      const result = await tables.listIndexes({ databaseId, tableId, total: false });
      return result.indexes.map((entry) => ({ key: entry.key, status: entry.status }));
    }, index.key);
  }
  const created = await getTable(tables);
  if (!created) throw new Error("Created activity table did not materialize.");
  const reasons = inspectExact(normalizeTable(created));
  if (reasons.length) throw new Error(`Created activity table is not exact: ${reasons.join(" ")}`);
  console.log(JSON.stringify({ applied: true, tableId, classification: "exact_match" }, null, 2));
}

main().catch((error) => {
  console.error(
    sanitizeBootstrapText(error, [process.env.APPWRITE_BOOTSTRAP_API_KEY ?? ""])
  );
  process.exitCode = 1;
});
