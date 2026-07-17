import { loadEnvConfig } from "@next/env";
import { Client, TablesDB } from "node-appwrite";
import {
  sanitizeBootstrapText,
  validateBootstrapEnvironment
} from "@/lib/appwrite/bootstrap";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import { APPWRITE_TABLE_BLUEPRINTS } from "@/lib/appwrite/table-blueprints";

loadEnvConfig(process.cwd());

const COLUMN_KEYS = [
  "brand",
  "currency",
  "condition",
  "stockStatus",
  "legacyImageUrl",
  "name",
  "price",
  "featured"
] as const;

const SAFE_LIVE_FIELDS = [
  "key",
  "type",
  "required",
  "array",
  "size",
  "default",
  "elements",
  "format",
  "status",
  "error"
] as const;

function sanitizeColumn(column: unknown) {
  const source = column as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const field of SAFE_LIVE_FIELDS) {
    const value = source[field];
    if (value === undefined) continue;
    if (field === "elements" && Array.isArray(value)) {
      sanitized[field] = value.map(String);
    } else if (field === "error") {
      sanitized[field] = value ? "present" : "none";
    } else {
      sanitized[field] = value;
    }
  }
  return sanitized;
}

async function main() {
  const configuration = validateBootstrapEnvironment(process.env);
  const tables = new TablesDB(
    new Client()
      .setEndpoint(configuration.endpoint)
      .setProject(configuration.projectId)
      .setKey(configuration.apiKey)
  );
  const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
  const tableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.products;
  const expectedByKey = new Map(
    APPWRITE_TABLE_BLUEPRINTS.products.columns.map((column) => [column.key, column])
  );

  const columns = await Promise.all(
    COLUMN_KEYS.map(async (key) => ({
      expected: expectedByKey.get(key),
      live: sanitizeColumn(await tables.getColumn({ databaseId, tableId, key }))
    }))
  );

  console.log(JSON.stringify({ databaseId, tableId, columns }, null, 2));
}

main().catch((error) => {
  console.error(sanitizeBootstrapText(error, [
    process.env.APPWRITE_BOOTSTRAP_API_KEY ?? ""
  ]));
  process.exitCode = 1;
});
