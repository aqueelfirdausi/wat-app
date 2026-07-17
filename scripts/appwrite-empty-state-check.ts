import { loadEnvConfig } from "@next/env";
import { Client, Query, Storage, TablesDB } from "node-appwrite";
import {
  sanitizeBootstrapText,
  validateBootstrapEnvironment
} from "@/lib/appwrite/bootstrap";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";

loadEnvConfig(process.cwd());

async function main() {
  const configuration = validateBootstrapEnvironment(process.env);
  const dataKey = process.env.APPWRITE_DATA_API_KEY;
  if (!dataKey) throw new Error("Missing empty-state configuration: APPWRITE_DATA_API_KEY.");

  const client = new Client()
    .setEndpoint(configuration.endpoint)
    .setProject(configuration.projectId)
    .setKey(dataKey);
  const tables = new TablesDB(client);
  const storage = new Storage(client);
  const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;

  const [products, categories, files] = await Promise.all([
    tables.listRows({
      databaseId,
      tableId: APPWRITE_DEFAULT_RESOURCE_IDS.tables.products,
      queries: [Query.limit(1)],
      total: true
    }),
    tables.listRows({
      databaseId,
      tableId: APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories,
      queries: [Query.limit(1)],
      total: true
    }),
    storage.listFiles({
      bucketId: APPWRITE_DEFAULT_RESOURCE_IDS.productImagesBucket,
      queries: [Query.limit(1)],
      total: true
    })
  ]);

  console.log(JSON.stringify({
    products: products.total,
    categories: categories.total,
    productImages: files.total
  }, null, 2));
}

main().catch((error) => {
  console.error(sanitizeBootstrapText(error, [
    process.env.APPWRITE_BOOTSTRAP_API_KEY ?? "",
    process.env.APPWRITE_DATA_API_KEY ?? ""
  ]));
  process.exitCode = 1;
});
