import "server-only";

import { createHash } from "node:crypto";
import { AppwriteException, Query } from "node-appwrite";
import {
  MutationContractError,
  type buildActivityEvent
} from "@/lib/appwrite/mutation-design";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";
import { getAppwriteDataServices } from "@/lib/appwrite/server";
import { getServerBackendMode } from "@/lib/backend/server";

type LogicalActivityEvent = ReturnType<typeof buildActivityEvent>;
type ActivityRow = Record<string, unknown> & {
  $id: string;
  $permissions?: unknown;
};

const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
const tableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.activityLogs;
const MAX_SERIALIZED_STATE = 16_384;
const MAX_PAGE_SIZE = 50;
const MAX_OFFSET = 5_000;
const ADMIN_READ_PERMISSION = 'read("team:wat_staff/admin")';
const SAFE_STATE_FIELDS = new Set([
  "id",
  "name",
  "slug",
  "description",
  "brand",
  "preferredContactId",
  "categoryId",
  "categoryName",
  "price",
  "currency",
  "condition",
  "stockStatus",
  "featured",
  "statusPick",
  "storefrontVisible",
  "feedVisible",
  "sortPriority",
  "chosenState",
  "selectedProductId",
  "imageFileId",
  "fileId",
  "mimeType",
  "size",
  "public",
  "linkage",
  "createdAt",
  "updatedAt",
  "deleted"
]);
const SAFE_METADATA_FIELDS = new Set([
  "fixtureClassification",
  "operation",
  "mimeType",
  "size",
  "public",
  "linkage",
  "cleanup",
  "retry",
  "outcome"
]);

export type ActivityFixtureClassification =
  | "ordinary"
  | "phase3y_verification";

export type PhysicalActivityEvent = {
  rowId: string;
  eventId: string;
  eventType: string;
  entityType: "product" | "category" | "image";
  entityId: string;
  actorUserId: string;
  actorDisplayName: string;
  actorRole: "admin" | "product_editor";
  occurredAt: string;
  requestId: string;
  result: "succeeded" | "failed" | "compensated" | "compensation_failed";
  changedFields: string;
  beforeState: string | null;
  afterState: string | null;
  errorClassification: string | null;
  compensationClassification: string | null;
  metadataSummary: string | null;
  fixtureClassification: ActivityFixtureClassification;
};

export type ActivityLogDto = {
  id: string;
  eventType: string;
  entityType: "product" | "category" | "image";
  entityId: string;
  actorDisplayName: string;
  actorRole: "admin" | "product_editor";
  occurredAt: string;
  result: "succeeded" | "failed" | "compensated" | "compensation_failed";
  changedFields: string[];
  errorClassification: string | null;
  compensationClassification: string | null;
  fixtureClassification: ActivityFixtureClassification;
};

export type ActivityLogPage = {
  items: ActivityLogDto[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export interface ActivityLogTables {
  createRow(input: {
    databaseId: string;
    tableId: string;
    rowId: string;
    data: Record<string, unknown>;
    permissions: string[];
  }): Promise<unknown>;
  getRow(input: {
    databaseId: string;
    tableId: string;
    rowId: string;
  }): Promise<unknown>;
  listRows(input: {
    databaseId: string;
    tableId: string;
    queries?: string[];
    total?: boolean;
    ttl?: number;
  }): Promise<{ rows: ActivityRow[]; total?: number }>;
}

function isCode(error: unknown, code: number) {
  return (
    (error instanceof AppwriteException && error.code === code) ||
    (!!error && typeof error === "object" && "code" in error && error.code === code)
  );
}

function canonicalDate(value: unknown) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Activity timestamp is invalid."
    );
  }
  return new Date(value).toISOString();
}

function safeText(value: unknown, label: string, maximum: number) {
  if (typeof value !== "string" || !value || value.length > maximum) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      `${label} is invalid.`,
      label
    );
  }
  return value;
}

function plainRecord(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function redactRecord(
  value: unknown,
  allowed: Set<string>,
  label: string
): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (!plainRecord(value)) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      `${label} must be a plain record.`
    );
  }
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (
      nested === null ||
      typeof nested === "string" ||
      typeof nested === "number" ||
      typeof nested === "boolean"
    ) {
      result[key] = nested;
    }
  }
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => left.localeCompare(right))
  );
}

function serializeBounded(
  value: Record<string, unknown> | null,
  label: string
) {
  if (!value || Object.keys(value).length === 0) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_SERIALIZED_STATE) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      `${label} exceeds the safe activity limit.`
    );
  }
  return serialized;
}

function physicalData(event: PhysicalActivityEvent) {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorUserId: event.actorUserId,
    actorDisplayName: event.actorDisplayName,
    actorRole: event.actorRole,
    occurredAt: event.occurredAt,
    requestId: event.requestId,
    result: event.result,
    changedFields: event.changedFields,
    ...(event.beforeState ? { beforeState: event.beforeState } : {}),
    ...(event.afterState ? { afterState: event.afterState } : {}),
    ...(event.errorClassification
      ? { errorClassification: event.errorClassification }
      : {}),
    ...(event.compensationClassification
      ? { compensationClassification: event.compensationClassification }
      : {}),
    ...(event.metadataSummary
      ? { metadataSummary: event.metadataSummary }
      : {}),
    fixtureClassification: event.fixtureClassification
  };
}

function rowMatches(row: ActivityRow, event: PhysicalActivityEvent) {
  const expected = physicalData(event);
  return Object.entries(expected).every(([key, value]) => {
    if (key === "occurredAt") {
      return (
        typeof row[key] === "string" &&
        Date.parse(row[key]) === Date.parse(String(value))
      );
    }
    return row[key] === value;
  });
}

export function mapLogicalActivityEvent(
  event: LogicalActivityEvent
): PhysicalActivityEvent {
  const eventId = safeText(event.eventId, "eventId", 96);
  const eventType = safeText(event.eventType, "eventType", 96);
  const entityId = safeText(event.entityId, "entityId", 36);
  const actorUserId = safeText(event.actorUserId, "actorUserId", 36);
  const actorDisplayName = safeText(
    event.actorDisplayName,
    "actorDisplayName",
    160
  );
  const requestId = safeText(event.requestId, "requestId", 128);
  if (
    event.entityType !== "product" &&
    event.entityType !== "category" &&
    event.entityType !== "image"
  ) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Activity entity type is invalid."
    );
  }
  if (event.actorRole !== "admin" && event.actorRole !== "product_editor") {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Activity actor role is invalid."
    );
  }
  if (
    event.result !== "succeeded" &&
    event.result !== "failed" &&
    event.result !== "compensated" &&
    event.result !== "compensation_failed"
  ) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Activity result is invalid."
    );
  }
  if (
    !Array.isArray(event.changedFields) ||
    event.changedFields.some(
      (field) =>
        typeof field !== "string" ||
        field.length > 64
    )
  ) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Activity changed fields are invalid."
    );
  }
  const changedFields = event.changedFields.filter((field) =>
    SAFE_STATE_FIELDS.has(field)
  );
  const before = redactRecord(event.before, SAFE_STATE_FIELDS, "before state");
  const after = redactRecord(event.after, SAFE_STATE_FIELDS, "after state");
  const metadata = redactRecord(
    event.metadata,
    SAFE_METADATA_FIELDS,
    "activity metadata"
  );
  const explicitFixture = metadata?.fixtureClassification;
  const fixtureClassification: ActivityFixtureClassification =
    explicitFixture === "phase3y_verification" ||
    entityId.startsWith("phase3y_") ||
    actorUserId.startsWith("phase3y_")
      ? "phase3y_verification"
      : "ordinary";
  if (
    explicitFixture !== undefined &&
    explicitFixture !== "ordinary" &&
    explicitFixture !== "phase3y_verification"
  ) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Activity fixture classification is invalid."
    );
  }
  return {
    rowId: `evt_${createHash("sha256")
      .update(eventId)
      .digest("hex")
      .slice(0, 32)}`,
    eventId,
    eventType,
    entityType: event.entityType,
    entityId,
    actorUserId,
    actorDisplayName,
    actorRole: event.actorRole,
    occurredAt: canonicalDate(event.timestamp),
    requestId,
    result: event.result,
    changedFields: JSON.stringify([...changedFields].sort()),
    beforeState: serializeBounded(before, "before state"),
    afterState: serializeBounded(after, "after state"),
    errorClassification:
      event.errorClassification === null ||
      event.errorClassification === undefined
        ? null
        : safeText(event.errorClassification, "errorClassification", 64),
    compensationClassification:
      event.compensationResult === null ||
      event.compensationResult === undefined
        ? null
        : safeText(
            event.compensationResult,
            "compensationClassification",
            160
          ),
    metadataSummary: serializeBounded(metadata, "metadata summary"),
    fixtureClassification
  };
}

export function activityLogAdminPermissions() {
  return [ADMIN_READ_PERMISSION];
}

export function hasExactActivityLogPermissions(value: unknown) {
  return (
    Array.isArray(value) &&
    value.length === 1 &&
    value[0] === ADMIN_READ_PERMISSION
  );
}

function defaultTables() {
  return getAppwriteDataServices().tables as unknown as ActivityLogTables;
}

export async function persistAppwriteActivityEvent(
  logical: LogicalActivityEvent,
  tables?: ActivityLogTables
) {
  if (!tables && getServerBackendMode() !== "appwrite") {
    throw new MutationContractError(
      "AUDIT_PERSISTENCE_FAILED",
      "Durable activity logging is unavailable."
    );
  }
  const activityTables = tables ?? defaultTables();
  const event = mapLogicalActivityEvent(logical);
  const input = {
    databaseId,
    tableId,
    rowId: event.rowId,
    data: physicalData(event),
    permissions: activityLogAdminPermissions()
  };
  try {
    await activityTables.createRow(input);
  } catch (error) {
    try {
      const existing = (await activityTables.getRow({
        databaseId,
        tableId,
        rowId: event.rowId
      })) as ActivityRow;
      if (
        hasExactActivityLogPermissions(existing.$permissions) &&
        rowMatches(existing, event)
      ) {
        return { eventId: event.eventId, duplicate: true, outcomeRecovered: !isCode(error, 409) };
      }
      throw new MutationContractError(
        "AUDIT_PERSISTENCE_FAILED",
        "Activity event ID was reused with conflicting content."
      );
    } catch (verificationError) {
      if (verificationError instanceof MutationContractError) {
        throw verificationError;
      }
      throw new MutationContractError(
        "AUDIT_PERSISTENCE_FAILED",
        "Business outcome was preserved but durable audit persistence failed."
      );
    }
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const materialized = (await activityTables.getRow({
        databaseId,
        tableId,
        rowId: event.rowId
      })) as ActivityRow;
      if (
        hasExactActivityLogPermissions(materialized.$permissions) &&
        rowMatches(materialized, event)
      ) {
        return { eventId: event.eventId, duplicate: false, outcomeRecovered: false };
      }
    } catch (error) {
      if (!isCode(error, 404)) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new MutationContractError(
    "AUDIT_PERSISTENCE_FAILED",
    "Business outcome was preserved but activity materialization is unknown."
  );
}

function mapActivityRow(row: ActivityRow): ActivityLogDto {
  if (
    typeof row.$id !== "string" ||
    !hasExactActivityLogPermissions(row.$permissions) ||
    typeof row.eventType !== "string" ||
    typeof row.entityId !== "string" ||
    typeof row.actorDisplayName !== "string" ||
    typeof row.occurredAt !== "string" ||
    Number.isNaN(Date.parse(row.occurredAt as string)) ||
    (row.entityType !== "product" &&
      row.entityType !== "category" &&
      row.entityType !== "image") ||
    (row.actorRole !== "admin" && row.actorRole !== "product_editor") ||
    (row.result !== "succeeded" &&
      row.result !== "failed" &&
      row.result !== "compensated" &&
      row.result !== "compensation_failed") ||
    (row.fixtureClassification !== "ordinary" &&
      row.fixtureClassification !== "phase3y_verification")
  ) {
    throw new Error("Invalid activity row.");
  }
  let changedFields: unknown;
  try {
    changedFields = JSON.parse(String(row.changedFields));
  } catch {
    throw new Error("Invalid activity changed fields.");
  }
  if (
    !Array.isArray(changedFields) ||
    changedFields.some((field) => typeof field !== "string")
  ) {
    throw new Error("Invalid activity changed fields.");
  }
  return {
    id: row.$id,
    eventType: row.eventType,
    entityType: row.entityType,
    entityId: row.entityId,
    actorDisplayName: row.actorDisplayName,
    actorRole: row.actorRole,
    occurredAt: new Date(row.occurredAt).toISOString(),
    result: row.result,
    changedFields,
    errorClassification:
      typeof row.errorClassification === "string"
        ? row.errorClassification
        : null,
    compensationClassification:
      typeof row.compensationClassification === "string"
        ? row.compensationClassification
        : null,
    fixtureClassification: row.fixtureClassification
  };
}

export async function listAppwriteActivityLogs(input: {
  identity: AuthenticatedStaffIdentity;
  page?: number;
  pageSize?: number;
  entityType?: string;
  entityId?: string;
  eventType?: string;
  result?: string;
  tables?: ActivityLogTables;
}): Promise<ActivityLogPage> {
  if (
    (!input.tables && getServerBackendMode() !== "appwrite") ||
    input.identity.role !== "admin" ||
    !input.identity.userId
  ) {
    throw new MutationContractError(
      "AUTHORIZATION_FAILED",
      "Activity logs are available only to administrators."
    );
  }
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 25;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_PAGE_SIZE
  ) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Activity pagination is invalid."
    );
  }
  const offset = (page - 1) * pageSize;
  if (offset > MAX_OFFSET) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Activity pagination exceeds the bounded limit."
    );
  }
  const queries = [
    Query.orderDesc("occurredAt"),
    Query.limit(pageSize + 1),
    Query.offset(offset)
  ];
  const filters: Array<[string, unknown, number]> = [
    ["entityType", input.entityType, 16],
    ["entityId", input.entityId, 36],
    ["eventType", input.eventType, 96],
    ["result", input.result, 32]
  ];
  for (const [field, value, maximum] of filters) {
    if (value !== undefined) {
      queries.push(Query.equal(field, safeText(value, field, maximum)));
    }
  }
  const result = await (input.tables ?? defaultTables()).listRows({
    databaseId,
    tableId,
    queries,
    total: false,
    ttl: 0
  });
  const mapped = result.rows.map(mapActivityRow);
  return {
    items: mapped.slice(0, pageSize),
    page,
    pageSize,
    hasMore: mapped.length > pageSize
  };
}
