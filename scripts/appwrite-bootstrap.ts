import { Client, Storage, TablesDB, Teams } from "node-appwrite";
import {
  buildBootstrapPlan,
  parseBootstrapArguments,
  sanitizeBootstrapText,
  validateBootstrapEnvironment,
  type BootstrapInventory
} from "@/lib/appwrite/bootstrap";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";

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
      columns: Array.isArray(item.columns)
        ? item.columns.map((column) => String((column as Record<string, unknown>).key))
        : [],
      indexes: Array.isArray(item.indexes)
        ? item.indexes.map((index) => String((index as Record<string, unknown>).key))
        : []
    }))
  };
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
    }
  }

  const finalPlan = buildBootstrapPlan(await inspect(services), "read-only");
  console.log(JSON.stringify({ applied: plan.writeActions, verification: finalPlan }, null, 2));
}

main().catch((error) => {
  console.error(sanitizeBootstrapText(error, [process.env.APPWRITE_BOOTSTRAP_API_KEY ?? ""]));
  process.exitCode = 1;
});
