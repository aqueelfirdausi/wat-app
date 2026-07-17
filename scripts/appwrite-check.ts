import { loadEnvConfig } from "@next/env";
import { AppwriteException, Client, Storage, TablesDB, Teams } from "node-appwrite";
import { sanitizeBootstrapText, validateBootstrapEnvironment } from "@/lib/appwrite/bootstrap";
import {
  parseConnectivityCheckArguments,
  runDisposableCategoryLifecycle
} from "@/lib/appwrite/connectivity";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";

loadEnvConfig(process.cwd());

async function main() {
  const mode = parseConnectivityCheckArguments(process.argv.slice(2));
  const configuration = validateBootstrapEnvironment(process.env);
  const metadataClient = new Client()
    .setEndpoint(configuration.endpoint)
    .setProject(configuration.projectId)
    .setKey(configuration.apiKey);
  const teams = new Teams(metadataClient);
  const tables = new TablesDB(metadataClient);
  const storage = new Storage(metadataClient);

  async function inspectSafe<T>(
    promise: Promise<T>,
    map: (value: T) => Record<string, unknown>
  ): Promise<Record<string, unknown> & { reachable: boolean }> {
    try {
      return { reachable: true, ...map(await promise) };
    } catch (error) {
      return {
        reachable: false,
        code: error instanceof AppwriteException ? error.code : "unavailable"
      };
    }
  }

  const [team, database, bucket, ...tableResults] = await Promise.all([
    inspectSafe(teams.get({ teamId: APPWRITE_DEFAULT_RESOURCE_IDS.team }), (value) => ({ id: value.$id, name: value.name })),
    inspectSafe(tables.get({ databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database }), (value) => ({ id: value.$id, name: value.name })),
    inspectSafe(storage.getBucket({ bucketId: APPWRITE_DEFAULT_RESOURCE_IDS.productImagesBucket }), (value) => ({
      id: value.$id,
      name: value.name,
      fileSecurity: value.fileSecurity,
      maximumFileSize: value.maximumFileSize,
      permissionsEmpty: value.$permissions.length === 0
    })),
    ...Object.values(APPWRITE_DEFAULT_RESOURCE_IDS.tables).map((tableId) => inspectSafe(
      tables.getTable({ databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database, tableId }),
      (value) => ({
        id: value.$id,
        name: value.name,
        rowSecurity: value.rowSecurity,
        permissionsEmpty: value.$permissions.length === 0
      })
    ))
  ]);
  const tableIds = Object.values(APPWRITE_DEFAULT_RESOURCE_IDS.tables);
  const tableMetadata: Array<Record<string, unknown> & { expectedId: string; reachable: boolean }> =
    tableResults.map((table, index) => ({ expectedId: tableIds[index], ...table }));
  const coreTableIds = new Set<string>([
    APPWRITE_DEFAULT_RESOURCE_IDS.tables.products,
    APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories
  ]);
  const coreTablesReady = tableMetadata
    .filter((table) => coreTableIds.has(table.expectedId))
    .every((table) => table.reachable && table.rowSecurity === true && table.permissionsEmpty === true);
  const coreReady = team.reachable
    && database.reachable
    && bucket.reachable
    && bucket.fileSecurity === true
    && bucket.maximumFileSize === 1024 * 1024
    && bucket.permissionsEmpty === true
    && coreTablesReady;

  const result: Record<string, unknown> = {
    mode,
    projectId: configuration.projectId,
    endpoint: configuration.endpoint,
    coreReady,
    resources: {
      team,
      database,
      bucket,
      tables: tableMetadata
    }
  };

  if (!coreReady) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }

  if (mode === "disposable-write") {
    if (process.env.WAT_BACKEND !== "appwrite") {
      throw new Error("Disposable mode requires WAT_BACKEND=appwrite.");
    }
    const dataKey = process.env.APPWRITE_DATA_API_KEY;
    if (!dataKey) throw new Error("Disposable mode requires APPWRITE_DATA_API_KEY.");
    const dataTables = new TablesDB(new Client()
      .setEndpoint(configuration.endpoint)
      .setProject(configuration.projectId)
      .setKey(dataKey));
    const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
    const tableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories;
    const rowId = `migration-disposable-${Date.now().toString(36)}`;
    try {
      result.disposable = await runDisposableCategoryLifecycle({
        rowId,
        now: () => new Date().toISOString(),
        isNotFound: (error) => error instanceof AppwriteException && error.code === 404,
        rows: {
          createRow: ({ rowId: id, data, permissions }) => dataTables.createRow({ databaseId, tableId, rowId: id, data, permissions }),
          getRow: ({ rowId: id }) => dataTables.getRow({ databaseId, tableId, rowId: id }),
          updateRow: ({ rowId: id, data, permissions }) => dataTables.updateRow({ databaseId, tableId, rowId: id, data, permissions }),
          deleteRow: ({ rowId: id }) => dataTables.deleteRow({ databaseId, tableId, rowId: id })
        }
      });
    } catch (error) {
      throw new Error(`Disposable connectivity check failed; verify cleanup for row ${rowId}. ${sanitizeBootstrapText(error, [dataKey])}`);
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(sanitizeBootstrapText(error, [
    process.env.APPWRITE_BOOTSTRAP_API_KEY ?? "",
    process.env.APPWRITE_DATA_API_KEY ?? ""
  ]));
  process.exitCode = 1;
});
