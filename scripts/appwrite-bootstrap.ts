import { loadEnvConfig } from "@next/env";
import { Client, Storage, TablesDB, TablesDBIndexType, Teams } from "node-appwrite";
import {
  APPWRITE_TABLE_BLUEPRINTS,
  buildBootstrapPlan,
  parseBootstrapArguments,
  sanitizeBootstrapText,
  validateBootstrapEnvironment,
  type BootstrapInventory
} from "@/lib/appwrite/bootstrap";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import type { AppwriteColumnBlueprint } from "@/lib/appwrite/table-blueprints";

loadEnvConfig(process.cwd());

function normalizeInventory(input: {
  teams: Array<Record<string, unknown>>;
  databases: Array<Record<string, unknown>>;
  buckets: Array<Record<string, unknown>>;
  tables: Array<Record<string, unknown>>;
}): BootstrapInventory {
  return {
    teams: input.teams.map((item) => ({ id: String(item.$id), name: String(item.name) })),
    databases: input.databases.map((item) => ({ id: String(item.$id), name: String(item.name) })),
    buckets: input.buckets.map((item) => ({
      id: String(item.$id),
      name: String(item.name),
      fileSecurity: Boolean(item.fileSecurity),
      permissions: Array.isArray(item.$permissions) ? item.$permissions.map(String) : [],
      maximumFileSize: Number(item.maximumFileSize)
    })),
    tables: input.tables.map((item) => ({
      id: String(item.$id),
      name: String(item.name),
      rowSecurity: Boolean(item.rowSecurity),
      permissions: Array.isArray(item.$permissions) ? item.$permissions.map(String) : [],
      columns: Array.isArray(item.columns) ? item.columns.map((value) => {
        const column = value as Record<string, unknown>;
        return {
          key: String(column.key),
          type: String(column.type),
          required: Boolean(column.required),
          ...(typeof column.size === "number" ? { size: column.size } : {}),
          ...(column.default !== undefined && column.default !== null
            ? { default: column.default as string | number | boolean }
            : {}),
          ...(Array.isArray(column.elements) ? { elements: column.elements.map(String) } : {}),
          ...(typeof column.status === "string" ? { status: column.status } : {})
        };
      }) : [],
      indexes: Array.isArray(item.indexes) ? item.indexes.map((value) => {
        const index = value as Record<string, unknown>;
        const columns = Array.isArray(index.columns)
          ? index.columns
          : Array.isArray(index.attributes) ? index.attributes : [];
        return {
          key: String(index.key),
          type: String(index.type),
          columns: columns.map(String),
          ...(typeof index.status === "string" ? { status: index.status } : {})
        };
      }) : []
    }))
  };
}

async function createColumn(tables: TablesDB, tableId: string, column: AppwriteColumnBlueprint) {
  const base = {
    databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database,
    tableId,
    key: column.key,
    required: column.required
  };
  const xdefault = column.default;

  switch (column.kind) {
    case "varchar":
      return tables.createVarcharColumn({ ...base, size: column.size as number, xdefault: xdefault as string | undefined });
    case "text":
      return tables.createTextColumn({ ...base, xdefault: xdefault as string | undefined });
    case "enum":
      return tables.createEnumColumn({ ...base, elements: [...(column.elements ?? [])], xdefault: xdefault as string | undefined });
    case "url":
      return tables.createUrlColumn({ ...base, xdefault: xdefault as string | undefined });
    case "integer":
      return tables.createIntegerColumn({ ...base, xdefault: xdefault as number | undefined });
    case "boolean":
      return tables.createBooleanColumn({ ...base, xdefault: xdefault as boolean | undefined });
    case "datetime":
      return tables.createDatetimeColumn({ ...base, xdefault: xdefault as string | undefined });
  }
}

async function waitUntilAvailable(
  inspectStatus: () => Promise<Array<{ key: string; status?: string; error?: string }>>,
  expectedKeys: readonly string[]
) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const resources = await inspectStatus();
    const expected = resources.filter((resource) => expectedKeys.includes(resource.key));
    const failed = expected.find((resource) => resource.status === "failed" || resource.status === "stuck");
    if (failed) throw new Error(`Appwrite resource ${failed.key} did not become available.`);
    if (expected.length === expectedKeys.length && expected.every((resource) => resource.status === "available")) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out while waiting for Appwrite schema resources.");
}

async function createLockedTable(tables: TablesDB, tableId: "products" | "categories") {
  const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
  const blueprint = APPWRITE_TABLE_BLUEPRINTS[tableId];
  await tables.createTable({
    databaseId,
    tableId,
    name: tableId,
    permissions: [],
    rowSecurity: true,
    enabled: true
  });

  for (const column of blueprint.columns) {
    await createColumn(tables, tableId, column);
    await waitUntilAvailable(async () => {
      const result = await tables.listColumns({ databaseId, tableId, total: false });
      return result.columns.map((item) => ({ key: item.key, status: item.status, error: item.error }));
    }, [column.key]);
  }

  for (const index of blueprint.indexes) {
    await tables.createIndex({
      databaseId,
      tableId,
      key: index.key,
      type: index.type === "unique" ? TablesDBIndexType.Unique : TablesDBIndexType.Key,
      columns: [...index.columns]
    });
    await waitUntilAvailable(async () => {
      const result = await tables.listIndexes({ databaseId, tableId, total: false });
      return result.indexes.map((item) => ({ key: item.key, status: item.status, error: item.error }));
    }, [index.key]);
  }
}

async function inspect(services: { teams: Teams; tables: TablesDB; storage: Storage }) {
  const [teams, databases, buckets] = await Promise.all([
    services.teams.list({ total: false }),
    services.tables.list({ total: false }),
    services.storage.listBuckets({ total: false })
  ]);
  const databaseExists = databases.databases.some(
    (database) => database.$id === APPWRITE_DEFAULT_RESOURCE_IDS.database
  );
  const tables = databaseExists
    ? await services.tables.listTables({ databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database, total: false })
    : { tables: [] };

  return normalizeInventory({
    teams: teams.teams as unknown as Array<Record<string, unknown>>,
    databases: databases.databases as unknown as Array<Record<string, unknown>>,
    buckets: buckets.buckets as unknown as Array<Record<string, unknown>>,
    tables: tables.tables as unknown as Array<Record<string, unknown>>
  });
}

async function main() {
  const mode = parseBootstrapArguments(process.argv.slice(2));
  const configuration = validateBootstrapEnvironment(process.env);
  const client = new Client()
    .setEndpoint(configuration.endpoint)
    .setProject(configuration.projectId)
    .setKey(configuration.apiKey);
  const services = {
    teams: new Teams(client),
    tables: new TablesDB(client),
    storage: new Storage(client)
  };

  const inventory = await inspect(services);
  const plan = buildBootstrapPlan(inventory, mode);
  console.log(JSON.stringify(plan, null, 2));

  if (mode === "read-only") return;
  if (plan.hasConflicts) throw new Error("Bootstrap apply blocked because conflicts were detected.");

  for (const action of plan.writeActions) {
    if (action.kind === "team") {
      await services.teams.create({ teamId: action.id, name: action.id });
    } else if (action.kind === "database") {
      await services.tables.create({ databaseId: action.id, name: action.id, enabled: true });
    } else if (action.kind === "bucket") {
      await services.storage.createBucket({
        bucketId: action.id,
        name: action.id,
        permissions: [],
        fileSecurity: true,
        enabled: true,
        maximumFileSize: 1024 * 1024
      });
    } else if (action.kind === "table") {
      if (action.id !== "products" && action.id !== "categories") {
        throw new Error(`Table ${action.id} is not approved for Phase 3L creation.`);
      }
      await createLockedTable(services.tables, action.id);
    }
  }

  const finalPlan = buildBootstrapPlan(await inspect(services), "read-only");
  console.log(JSON.stringify({ applied: plan.writeActions, verification: finalPlan }, null, 2));
}

main().catch((error) => {
  console.error(sanitizeBootstrapText(error, [process.env.APPWRITE_BOOTSTRAP_API_KEY ?? ""]));
  process.exitCode = 1;
});
