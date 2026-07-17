import "server-only";

import { createHash } from "node:crypto";
import { AppwriteException, Query } from "node-appwrite";
import {
  APPLICATION_CATEGORY_MUTATION_CONTEXT,
  isPhase3VCategoryVerificationContext,
  type CategoryMutationExecutionContext
} from "@/lib/appwrite/category-verification-context";
import {
  categoryPermissions,
  hasExactCategoryPermissions,
  type AppwriteCategoryPermissionMode
} from "@/lib/appwrite/category-permissions";
import {
  MutationContractError,
  buildActivityEvent,
  isRoleAuthorizedForAction,
  planCategoryCreate,
  planCategoryDelete,
  planCategoryUpdate,
  type ActivityEventInput,
  type CatalogueMutationAction,
  type MutationErrorCode
} from "@/lib/appwrite/mutation-design";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";
import { getAppwriteDataServices } from "@/lib/appwrite/server";
import { getServerBackendMode } from "@/lib/backend/server";
import { requireMutationEnabled } from "@/lib/server/mutation-gate";

type CategoryRow = Record<string, unknown> & {
  $id: string;
  $permissions?: unknown;
};

export type CategoryMutationDto = {
  id: string;
  name: string;
  slug: string;
  updatedAt: string;
};

export type CategoryDeleteDto = {
  id: string;
  deleted: true;
};

export interface CategoryMutationTables {
  createTransaction(input?: { ttl?: number }): Promise<{
    $id: string;
    status?: string;
  }>;
  getTransaction(input: { transactionId: string }): Promise<{
    $id: string;
    status: string;
  }>;
  deleteTransaction(input: { transactionId: string }): Promise<unknown>;
  updateTransaction(input: {
    transactionId: string;
    commit?: boolean;
    rollback?: boolean;
  }): Promise<{ $id?: string; status?: string }>;
  listRows(input: {
    databaseId: string;
    tableId: string;
    queries?: string[];
    transactionId?: string;
    total?: boolean;
    ttl?: number;
  }): Promise<{ rows: CategoryRow[]; total?: number }>;
  getRow(input: {
    databaseId: string;
    tableId: string;
    rowId: string;
    transactionId?: string;
  }): Promise<CategoryRow>;
  createRow(input: {
    databaseId: string;
    tableId: string;
    rowId: string;
    data: Record<string, unknown>;
    permissions: string[];
    transactionId?: string;
  }): Promise<CategoryRow>;
  updateRow(input: {
    databaseId: string;
    tableId: string;
    rowId: string;
    data: Record<string, unknown>;
    permissions?: string[];
    transactionId?: string;
  }): Promise<CategoryRow>;
  deleteRow(input: {
    databaseId: string;
    tableId: string;
    rowId: string;
    transactionId?: string;
  }): Promise<unknown>;
}

type CategoryMutationDependencies = {
  tables: CategoryMutationTables;
  now: () => string;
  enforceRuntimeBoundary: (verification: boolean) => void;
  emitActivityEvent: (event: ReturnType<typeof buildActivityEvent>) => void | Promise<void>;
  wait: (milliseconds: number) => Promise<void>;
};

const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
const categoriesTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories;
const productsTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.products;

function enforceDefaultRuntimeBoundary(verification: boolean) {
  if (getServerBackendMode() !== "appwrite") {
    throw new MutationContractError(
      "DEPENDENCY_FAILED",
      "Appwrite category mutations are unavailable."
    );
  }
  if (!verification) requireMutationEnabled();
}

function authorize(identity: AuthenticatedStaffIdentity, action: CatalogueMutationAction) {
  if (
    !identity ||
    typeof identity.userId !== "string" ||
    !identity.userId ||
    typeof identity.name !== "string" ||
    !identity.name ||
    typeof identity.email !== "string" ||
    !identity.email ||
    (identity.role !== "admin" && identity.role !== "product_editor") ||
    !isRoleAuthorizedForAction(identity.role, action)
  ) {
    throw new MutationContractError(
      "AUTHORIZATION_FAILED",
      "Category action is not authorized."
    );
  }
}

function permissionMode(context: CategoryMutationExecutionContext): AppwriteCategoryPermissionMode {
  return isPhase3VCategoryVerificationContext(context) ? "private_fixture" : "public";
}

function deterministicCategoryId(idempotencyKey: string) {
  return `cat_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
}

function activityEventId(action: string, idempotencyKey: string) {
  return `category:${action}:${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
}

function normalizedDate(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function mapCategoryRow(
  row: CategoryRow,
  expectedPermissions: AppwriteCategoryPermissionMode
): CategoryMutationDto {
  const updatedAt = normalizedDate(row.updatedAt);
  if (
    typeof row.$id !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(row.$id) ||
    typeof row.name !== "string" ||
    !row.name ||
    row.name.length > 160 ||
    typeof row.slug !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) ||
    row.slug.length > 160 ||
    !updatedAt ||
    !hasExactCategoryPermissions(row.$permissions, expectedPermissions)
  ) {
    throw new MutationContractError(
      "DEPENDENCY_FAILED",
      "Existing category row does not match the locked schema and permissions."
    );
  }
  return {
    id: row.$id,
    name: row.name,
    slug: row.slug,
    updatedAt
  };
}

function isAppwriteCode(error: unknown, code: number) {
  return (
    (error instanceof AppwriteException && error.code === code) ||
    (!!error && typeof error === "object" && "code" in error && error.code === code)
  );
}

function classifySdkFailure(error: unknown): never {
  if (error instanceof MutationContractError) throw error;
  if (isAppwriteCode(error, 404)) {
    throw new MutationContractError("NOT_FOUND", "Category was not found.");
  }
  if (isAppwriteCode(error, 409)) {
    throw new MutationContractError("CONFLICT", "Category mutation conflicted.");
  }
  throw new MutationContractError("INTERNAL_ERROR", "Category mutation failed.");
}

async function rollbackTransaction(
  dependencies: CategoryMutationDependencies,
  transactionId: string
) {
  let transaction = await dependencies.tables.updateTransaction({
    transactionId,
    rollback: true
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (transaction.status === "rolled_back") {
      await dependencies.wait(1000);
      return;
    }
    if (transaction.status === "committed" || transaction.status === "failed") {
      throw new MutationContractError(
        "CLEANUP_FAILED",
        "Category transaction rollback failed."
      );
    }
    await dependencies.wait(100);
    transaction = await dependencies.tables.getTransaction({ transactionId });
  }
  throw new MutationContractError(
    "CLEANUP_FAILED",
    "Category transaction rollback could not be confirmed."
  );
}

async function discardEmptyTransaction(
  dependencies: CategoryMutationDependencies,
  transactionId: string
) {
  try {
    await dependencies.tables.deleteTransaction({ transactionId });
  } catch (error) {
    if (!isAppwriteCode(error, 404)) {
      throw new MutationContractError(
        "CLEANUP_FAILED",
        "Empty category transaction could not be discarded."
      );
    }
  }
}

async function commitTransaction(
  dependencies: CategoryMutationDependencies,
  transactionId: string
) {
  let transaction = await dependencies.tables.updateTransaction({
    transactionId,
    commit: true
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (transaction.status === "committed") {
      await dependencies.wait(1000);
      return;
    }
    if (transaction.status === "failed" || transaction.status === "rolled_back") {
      throw new MutationContractError(
        "CONFLICT",
        "Category transaction did not commit."
      );
    }
    await dependencies.wait(100);
    transaction = await dependencies.tables.getTransaction({ transactionId });
  }
  throw new MutationContractError(
    "DEPENDENCY_FAILED",
    "Category transaction commit could not be confirmed."
  );
}

async function ensureCommittedCategoryDeletion(input: {
  dependencies: CategoryMutationDependencies;
  category: CategoryMutationDto;
  mode: AppwriteCategoryPermissionMode;
}) {
  const { dependencies, category, mode } = input;
  let resurfaced: CategoryMutationDto | null = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      resurfaced = mapCategoryRow(
        await dependencies.tables.getRow({
          databaseId,
          tableId: categoriesTableId,
          rowId: category.id
        }),
        mode
      );
      break;
    } catch (error) {
      if (!isAppwriteCode(error, 404)) throw error;
    }
    await dependencies.wait(100);
  }
  if (!resurfaced) return false;
  if (
    resurfaced.name !== category.name ||
    resurfaced.slug !== category.slug ||
    resurfaced.updatedAt !== category.updatedAt
  ) {
    throw new MutationContractError(
      "CONFLICT",
      "Category changed while delete compensation was pending."
    );
  }
  const references = await dependencies.tables.listRows({
    databaseId,
    tableId: productsTableId,
    queries: [Query.equal("categoryId", category.id), Query.limit(1)],
    total: false,
    ttl: 0
  });
  if (references.rows.length > 0) {
    throw new MutationContractError(
      "REFERENCE_CONFLICT",
      "Category gained a product reference while delete compensation was pending."
    );
  }
  await dependencies.tables.deleteRow({
    databaseId,
    tableId: categoriesTableId,
    rowId: category.id
  });
  for (let attempt = 0; attempt < 10; attempt++) {
    await dependencies.wait(100);
    try {
      await dependencies.tables.getRow({
        databaseId,
        tableId: categoriesTableId,
        rowId: category.id
      });
      throw new MutationContractError(
        "CLEANUP_FAILED",
        "Category delete compensation did not remain absent."
      );
    } catch (error) {
      if (!isAppwriteCode(error, 404)) throw error;
    }
  }
  return true;
}

function eventInput(input: {
  eventId: string;
  eventType: string;
  entityId: string;
  identity: AuthenticatedStaffIdentity;
  timestamp: string;
  requestId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  result: ActivityEventInput["result"];
  errorClassification?: MutationErrorCode;
  compensationResult?: string;
}): ActivityEventInput {
  return {
    ...input,
    entityType: "category",
    actor: {
      userId: input.identity.userId,
      displayName: input.identity.name,
      role: input.identity.role
    }
  };
}

export function prepareCategoryMutationActivityEvent(input: {
  eventType:
    | "category.created"
    | "category.renamed"
    | "category.deletion_attempted"
    | "category.deleted"
    | "category.mutation_failed"
    | "category.cleanup_result";
  categoryId: string;
  identity: AuthenticatedStaffIdentity;
  timestamp: string;
  requestId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  result: ActivityEventInput["result"];
  errorClassification?: MutationErrorCode;
  compensationResult?: string;
}) {
  return buildActivityEvent(eventInput({
    eventId: activityEventId(input.eventType, input.requestId),
    eventType: input.eventType,
    entityId: input.categoryId,
    identity: input.identity,
    timestamp: input.timestamp,
    requestId: input.requestId,
    before: input.before,
    after: input.after,
    result: input.result,
    errorClassification: input.errorClassification,
    compensationResult: input.compensationResult
  }));
}

export function createAppwriteCategoryMutationService(
  overrides: Partial<CategoryMutationDependencies> = {}
) {
  const dependencies: CategoryMutationDependencies = {
    tables:
      overrides.tables ??
      (getAppwriteDataServices().tables as unknown as CategoryMutationTables),
    now: overrides.now ?? (() => new Date().toISOString()),
    enforceRuntimeBoundary:
      overrides.enforceRuntimeBoundary ?? enforceDefaultRuntimeBoundary,
    emitActivityEvent:
      overrides.emitActivityEvent ??
      (() => {
        // Durable activity storage is intentionally deferred until activity_logs exists.
      }),
    wait: overrides.wait ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)))
  };

  function begin(
    identity: AuthenticatedStaffIdentity,
    action: CatalogueMutationAction,
    context: CategoryMutationExecutionContext
  ) {
    const verification = isPhase3VCategoryVerificationContext(context);
    dependencies.enforceRuntimeBoundary(verification);
    authorize(identity, action);
    return permissionMode(context);
  }

  async function emit(input: ActivityEventInput) {
    await dependencies.emitActivityEvent(buildActivityEvent(input));
  }

  async function readCategory(
    categoryId: string,
    identity: AuthenticatedStaffIdentity,
    context: CategoryMutationExecutionContext = APPLICATION_CATEGORY_MUTATION_CONTEXT
  ) {
    const mode = begin(identity, "read_categories", context);
    try {
      return mapCategoryRow(
        await dependencies.tables.getRow({
          databaseId,
          tableId: categoriesTableId,
          rowId: categoryId
        }),
        mode
      );
    } catch (error) {
      return classifySdkFailure(error);
    }
  }

  async function createCategory(
    request: unknown,
    identity: AuthenticatedStaffIdentity,
    context: CategoryMutationExecutionContext = APPLICATION_CATEGORY_MUTATION_CONTEXT
  ) {
    const mode = begin(identity, "create_category", context);
    const command = planCategoryCreate(request);
    const rowId =
      context.kind === "phase3v_verification" && isPhase3VCategoryVerificationContext(context)
        ? context.fixtureRowId
        : deterministicCategoryId(command.idempotencyKey);
    const timestamp = dependencies.now();
    const permissions = categoryPermissions(mode);

    try {
      try {
        const existing = mapCategoryRow(
          await dependencies.tables.getRow({
            databaseId,
            tableId: categoriesTableId,
            rowId
          }),
          mode
        );
        if (existing.name === command.name && existing.slug === command.slug) return existing;
        throw new MutationContractError(
          "CONFLICT",
          "Idempotency key was already used for different category data."
        );
      } catch (error) {
        if (!isAppwriteCode(error, 404)) throw error;
      }

      const duplicate = await dependencies.tables.listRows({
        databaseId,
        tableId: categoriesTableId,
        queries: [Query.equal("slug", command.slug), Query.limit(1)],
        total: false,
        ttl: 0
      });
      if (duplicate.rows.length > 0) {
        throw new MutationContractError("CONFLICT", "Category slug already exists.", "slug");
      }

      let row: CategoryRow;
      try {
        row = await dependencies.tables.createRow({
          databaseId,
          tableId: categoriesTableId,
          rowId,
          data: {
            name: command.name,
            slug: command.slug,
            updatedAt: timestamp
          },
          permissions
        });
      } catch (error) {
        if (!isAppwriteCode(error, 409)) throw error;
        let existing: CategoryMutationDto;
        try {
          existing = mapCategoryRow(
            await dependencies.tables.getRow({
              databaseId,
              tableId: categoriesTableId,
              rowId
            }),
            mode
          );
        } catch (readError) {
          if (isAppwriteCode(readError, 404)) {
            throw new MutationContractError("CONFLICT", "Category slug already exists.", "slug");
          }
          throw readError;
        }
        if (existing.name === command.name && existing.slug === command.slug) return existing;
        throw new MutationContractError("CONFLICT", "Category create conflicted.");
      }
      const dto = mapCategoryRow(row, mode);
      await emit(eventInput({
        eventId: activityEventId("create", command.idempotencyKey),
        eventType: "category.created",
        entityId: dto.id,
        identity,
        timestamp,
        requestId: command.idempotencyKey,
        before: null,
        after: dto,
        result: "succeeded"
      }));
      return dto;
    } catch (error) {
      return classifySdkFailure(error);
    }
  }

  async function updateCategory(
    request: unknown,
    identity: AuthenticatedStaffIdentity,
    context: CategoryMutationExecutionContext = APPLICATION_CATEGORY_MUTATION_CONTEXT
  ) {
    const mode = begin(identity, "rename_category", context);
    const command = planCategoryUpdate(request);
    const timestamp = dependencies.now();
    let transactionId = "";
    let committed = false;
    let staged = false;
    try {
      transactionId = (await dependencies.tables.createTransaction({ ttl: 60 })).$id;
      const current = mapCategoryRow(
        await dependencies.tables.getRow({
          databaseId,
          tableId: categoriesTableId,
          rowId: command.categoryId,
          transactionId
        }),
        mode
      );
      if (current.updatedAt !== command.expectedUpdatedAt) {
        if (current.name === command.name && current.slug === command.slug) {
          await discardEmptyTransaction(dependencies, transactionId);
          return current;
        }
        throw new MutationContractError("STALE_WRITE", "Category has changed.");
      }
      const duplicate = await dependencies.tables.listRows({
        databaseId,
        tableId: categoriesTableId,
        queries: [Query.equal("slug", command.slug), Query.limit(2)],
        transactionId,
        total: false,
        ttl: 0
      });
      if (duplicate.rows.some((row) => row.$id !== command.categoryId)) {
        throw new MutationContractError("CONFLICT", "Category slug already exists.", "slug");
      }
      await dependencies.tables.updateRow({
        databaseId,
        tableId: categoriesTableId,
        rowId: command.categoryId,
        data: {
          name: command.name,
          slug: command.slug,
          updatedAt: timestamp
        },
        permissions: categoryPermissions(mode),
        transactionId
      });
      staged = true;
      await commitTransaction(dependencies, transactionId);
      committed = true;
      const dto = mapCategoryRow(
        await dependencies.tables.getRow({
          databaseId,
          tableId: categoriesTableId,
          rowId: command.categoryId
        }),
        mode
      );
      await emit(eventInput({
        eventId: activityEventId("update", command.idempotencyKey),
        eventType: "category.renamed",
        entityId: dto.id,
        identity,
        timestamp,
        requestId: command.idempotencyKey,
        before: current,
        after: dto,
        result: "succeeded"
      }));
      return dto;
    } catch (error) {
      if (transactionId && !committed) {
        if (staged) await rollbackTransaction(dependencies, transactionId);
        else await discardEmptyTransaction(dependencies, transactionId);
      }
      return classifySdkFailure(error);
    }
  }

  async function deleteCategory(
    request: unknown,
    identity: AuthenticatedStaffIdentity,
    context: CategoryMutationExecutionContext = APPLICATION_CATEGORY_MUTATION_CONTEXT
  ): Promise<CategoryDeleteDto> {
    const mode = begin(identity, "delete_category", context);
    const command = planCategoryDelete(request);
    const timestamp = dependencies.now();
    let transactionId = "";
    let committed = false;
    let staged = false;
    try {
      transactionId = (await dependencies.tables.createTransaction({ ttl: 60 })).$id;
      const current = mapCategoryRow(
        await dependencies.tables.getRow({
          databaseId,
          tableId: categoriesTableId,
          rowId: command.categoryId,
          transactionId
        }),
        mode
      );
      if (current.updatedAt !== command.expectedUpdatedAt) {
        throw new MutationContractError("STALE_WRITE", "Category has changed.");
      }
      const references = await dependencies.tables.listRows({
        databaseId,
        tableId: productsTableId,
        queries: [Query.equal("categoryId", command.categoryId), Query.limit(1)],
        transactionId,
        total: false,
        ttl: 0
      });
      if (references.rows.length > 0) {
        await emit(eventInput({
          eventId: activityEventId("delete-attempt", command.idempotencyKey),
          eventType: "category.deletion_attempted",
          entityId: current.id,
          identity,
          timestamp,
          requestId: command.idempotencyKey,
          before: current,
          after: current,
          result: "failed",
          errorClassification: "REFERENCE_CONFLICT"
        }));
        throw new MutationContractError(
          "REFERENCE_CONFLICT",
          "Category is referenced by a product."
        );
      }
      await dependencies.tables.deleteRow({
        databaseId,
        tableId: categoriesTableId,
        rowId: command.categoryId,
        transactionId
      });
      staged = true;
      await commitTransaction(dependencies, transactionId);
      committed = true;
      const compensated = await ensureCommittedCategoryDeletion({
        dependencies,
        category: current,
        mode
      });
      await emit(eventInput({
        eventId: activityEventId("delete", command.idempotencyKey),
        eventType: "category.deleted",
        entityId: current.id,
        identity,
        timestamp,
        requestId: command.idempotencyKey,
        before: current,
        after: null,
        result: compensated ? "compensated" : "succeeded",
        ...(compensated
          ? { compensationResult: "verified compare-before-delete fallback" }
          : {})
      }));
      return { id: command.categoryId, deleted: true };
    } catch (error) {
      if (transactionId && !committed) {
        if (staged) await rollbackTransaction(dependencies, transactionId);
        else await discardEmptyTransaction(dependencies, transactionId);
      }
      return classifySdkFailure(error);
    }
  }

  return {
    readCategory,
    createCategory,
    updateCategory,
    deleteCategory
  };
}
