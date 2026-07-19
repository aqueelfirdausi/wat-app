import { loadEnvConfig } from "@next/env";
import { Client, TablesDB } from "node-appwrite";
import {
  sanitizeBootstrapText,
  validateBootstrapEnvironment
} from "@/lib/appwrite/bootstrap";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import { APPWRITE_TABLE_BLUEPRINTS } from "@/lib/appwrite/table-blueprints";

loadEnvConfig(process.cwd());

const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
const tableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.activityLogs;
const key = "fixtureClassification";
const expectedElements = [
  "ordinary",
  "phase3y_verification",
  "phase3z_staging_verification",
  "phase3zr_blocker_closure"
];
const previousElements = expectedElements.slice(0, -1);

function parseMode(args: string[]) {
  const allowed = new Set([
    "--apply",
    "--confirm-add-phase3zr-activity-classification"
  ]);
  const unknown = args.find((arg) => !allowed.has(arg));
  if (unknown) throw new Error(`Unknown Phase 3Z-R schema argument: ${unknown}`);
  const apply = args.includes("--apply");
  const confirm = args.includes(
    "--confirm-add-phase3zr-activity-classification"
  );
  if (apply !== confirm) {
    throw new Error(
      "Schema update requires both Phase 3Z-R confirmation arguments."
    );
  }
  return apply ? "apply" : "read-only";
}

function same(left: string[], right: string[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function readColumn(tables: TablesDB) {
  const result = await tables.listColumns({
    databaseId,
    tableId,
    total: false
  });
  const matches = result.columns.filter((column) => column.key === key);
  if (matches.length !== 1) {
    throw new Error("The activity fixture-classification column is not unique.");
  }
  const column = matches[0] as unknown as Record<string, unknown>;
  return {
    type: String(column.type),
    required: Boolean(column.required),
    status: String(column.status),
    elements: Array.isArray(column.elements)
      ? column.elements.map(String)
      : []
  };
}

async function waitForAvailable(tables: TablesDB) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const column = await readColumn(tables);
    if (column.status === "available") return column;
    if (column.status === "failed" || column.status === "stuck") {
      throw new Error("The Phase 3Z-R activity schema update failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for the Phase 3Z-R activity schema update.");
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
  const column = await readColumn(tables);
  const exact =
    column.type === "string" &&
    column.required &&
    column.status === "available" &&
    same(column.elements, expectedElements);
  const eligible =
    column.type === "string" &&
    column.required &&
    column.status === "available" &&
    same(column.elements, previousElements);

  console.log(
    JSON.stringify(
      {
        mode,
        tableId,
        key,
        classification: exact
          ? "exact_match"
          : eligible
            ? "eligible_additive_update"
            : "schema_mismatch",
        action: mode === "apply" && eligible ? "add_phase3zr_enum_value" : "none"
      },
      null,
      2
    )
  );
  if (exact) return;
  if (!eligible) {
    throw new Error("Activity fixture-classification schema is not safely updatable.");
  }
  if (mode !== "apply") return;

  await tables.updateEnumColumn({
    databaseId,
    tableId,
    key,
    elements: expectedElements,
    required: true,
    // Appwrite's generated SDK currently requires the optional field to be
    // present on updates; null preserves the required column's no-default state.
    xdefault: null as unknown as string
  });
  const updated = await waitForAvailable(tables);
  if (!same(updated.elements, expectedElements)) {
    throw new Error("Updated activity classification elements are not exact.");
  }
  const blueprint = APPWRITE_TABLE_BLUEPRINTS.activity_logs.columns.find(
    (column) => column.key === key
  );
  if (
    !blueprint ||
    !same([...(blueprint.elements ?? [])], expectedElements)
  ) {
    throw new Error("Committed activity blueprint does not match the live update.");
  }
  console.log(
    JSON.stringify(
      {
        applied: true,
        tableId,
        key,
        classification: "exact_match"
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    sanitizeBootstrapText(error, [process.env.APPWRITE_BOOTSTRAP_API_KEY ?? ""])
  );
  process.exitCode = 1;
});
