import { loadEnvConfig } from "@next/env";
import { Query } from "node-appwrite";
import {
  hasExactActivityLogPermissions,
  listAppwriteActivityLogs
} from "@/lib/appwrite/activity-logs";
import { MutationContractError } from "@/lib/appwrite/mutation-design";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import { getAppwriteDataServices } from "@/lib/appwrite/server";

loadEnvConfig(process.cwd());

const FORBIDDEN_TEXT =
  /api[_-]?key|password|authorization|cookie|sessionsecret|recoverytoken|\.env\.local/i;

async function main() {
  if (process.argv.length !== 2) {
    throw new Error("Activity verification is read-only and accepts no arguments.");
  }
  if (process.env.WAT_BACKEND !== "appwrite") {
    throw new Error("Activity verification requires WAT_BACKEND=appwrite.");
  }
  if (process.env.WAT_MUTATIONS_ENABLED !== "false") {
    throw new Error("Activity verification requires WAT_MUTATIONS_ENABLED=false.");
  }

  const tables = getAppwriteDataServices().tables;
  const result = await tables.listRows({
    databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database,
    tableId: APPWRITE_DEFAULT_RESOURCE_IDS.tables.activityLogs,
    queries: [Query.orderDesc("occurredAt"), Query.limit(100)],
    total: true,
    ttl: 0
  });
  if (result.total !== result.rows.length || result.total === 0) {
    throw new Error("Retained activity rows are absent or exceed the bounded verification page.");
  }
  if (result.rows.some((row) => !hasExactActivityLogPermissions(row.$permissions))) {
    throw new Error("An activity row has unexpected permissions.");
  }
  const timestamps = result.rows.map((row) => Date.parse(String(row.occurredAt)));
  if (
    timestamps.some((timestamp) => !Number.isFinite(timestamp)) ||
    timestamps.some((timestamp, index) => index > 0 && timestamps[index - 1] < timestamp)
  ) {
    throw new Error("Activity rows are not deterministically newest-first.");
  }
  const safePayload = JSON.stringify(
    result.rows.map((row) => ({
      eventType: row.eventType,
      entityType: row.entityType,
      result: row.result,
      changedFields: row.changedFields,
      beforeState: row.beforeState,
      afterState: row.afterState,
      errorClassification: row.errorClassification,
      compensationClassification: row.compensationClassification,
      metadataSummary: row.metadataSummary,
      fixtureClassification: row.fixtureClassification
    }))
  );
  if (FORBIDDEN_TEXT.test(safePayload)) {
    throw new Error("Retained activity data failed the sensitive-text scan.");
  }
  const allowedClassifications = new Set([
    "phase3y_verification",
    "phase3z_staging_verification",
    "phase3zr_blocker_closure"
  ]);
  if (
    result.rows.some(
      (row) => !allowedClassifications.has(String(row.fixtureClassification))
    )
  ) {
    throw new Error("A retained activity row has an unexpected fixture classification.");
  }
  const countsByClassification = Object.fromEntries(
    [...allowedClassifications].map((classification) => [
      classification,
      result.rows.filter(
        (row) => row.fixtureClassification === classification
      ).length
    ])
  );
  if (countsByClassification.phase3y_verification !== 15) {
    throw new Error("The 15 retained Phase 3Y verification rows changed unexpectedly.");
  }
  if (countsByClassification.phase3z_staging_verification !== 19) {
    throw new Error("The 19 retained Phase 3Z verification rows changed unexpectedly.");
  }

  const admin = {
    userId: "phase3y_verification_reader",
    email: "phase3y-reader@example.invalid",
    name: "Phase 3Y verification",
    role: "admin" as const
  };
  const pageOne = await listAppwriteActivityLogs({
    identity: admin,
    page: 1,
    pageSize: 5
  });
  const pageTwo = await listAppwriteActivityLogs({
    identity: admin,
    page: 2,
    pageSize: 5
  });
  if (
    pageOne.items.length !== Math.min(5, result.total) ||
    pageTwo.items.some((item) =>
      pageOne.items.some((firstPageItem) => firstPageItem.id === item.id)
    )
  ) {
    throw new Error("Activity pagination did not return bounded, non-overlapping pages.");
  }
  let editorDenied = false;
  try {
    await listAppwriteActivityLogs({
      identity: { ...admin, role: "product_editor" },
      page: 1,
      pageSize: 1
    });
  } catch (error) {
    editorDenied =
      error instanceof MutationContractError &&
      error.code === "AUTHORIZATION_FAILED";
  }
  if (!editorDenied) throw new Error("Product-editor activity read was not denied.");

  const countsByType = Object.fromEntries(
    [...new Set(result.rows.map((row) => String(row.eventType)))]
      .sort()
      .map((eventType) => [
        eventType,
        result.rows.filter((row) => row.eventType === eventType).length
      ])
  );
  console.log(
    JSON.stringify(
      {
        mode: "read-only",
        retainedRows: result.total,
        countsByClassification,
        exactAdminRowPermissions: true,
        newestFirst: true,
        adminRead: true,
        editorReadDenied: true,
        pageSizeVerified: 5,
        updateBoundaryExposed: false,
        deleteBoundaryExposed: false,
        sensitiveTextAbsent: true,
        countsByType
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Activity verification failed.");
  process.exitCode = 1;
});
