import "server-only";

import { createHash } from "node:crypto";
import { AppwriteException, Query } from "node-appwrite";
import { hasExactCategoryPermissions } from "@/lib/appwrite/category-permissions";
import type { CategoryMutationTables } from "@/lib/appwrite/category-mutations";
import {
  MutationContractError,
  buildActivityEvent,
  isRoleAuthorizedForAction,
  planProductCreate,
  planProductDelete,
  planProductUpdate,
  type ActivityEventInput,
  type CatalogueMutationAction,
  type MutationErrorCode,
  type ProductCreateCommand,
  type ProductUpdatePatch
} from "@/lib/appwrite/mutation-design";
import {
  hasExactProductPrivatePermissions,
  productPrivatePermissions
} from "@/lib/appwrite/product-permissions";
import { APPWRITE_PUBLIC_READ_PERMISSION } from "@/lib/appwrite/public-permissions";
import {
  APPLICATION_PRODUCT_MUTATION_CONTEXT,
  isProductMutationVerificationContext,
  type ProductMutationExecutionContext
} from "@/lib/appwrite/product-verification-context";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import { persistAppwriteActivityEvent } from "@/lib/appwrite/activity-logs";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";
import { getAppwriteDataServices } from "@/lib/appwrite/server";
import { getServerBackendMode } from "@/lib/backend/server";
import { requireMutationEnabled } from "@/lib/server/mutation-gate";

export type ProductMutationRow = Record<string, unknown> & {
  $id: string;
  $permissions?: unknown;
};

type CategoryRow = Record<string, unknown> & {
  $id: string;
  $permissions?: unknown;
};

export type ProductMutationDto = {
  id: string;
  name: string;
  slug: string;
  description: string;
  brand: "univercell" | "eko";
  preferredContactId: string | null;
  categoryId: string;
  categoryName: string;
  price: number;
  currency: "PKR";
  condition: "New" | "Like New" | "Used";
  stockStatus: "in_stock" | "low_stock" | "sold_out";
  featured: boolean;
  statusPick: boolean;
  storefrontVisible: boolean;
  feedVisible: boolean;
  sortPriority: number;
  chosenSelectionKey: string;
  imageFileId: string | null;
  legacyImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
};

export type ProductDeleteDto = {
  id: string;
  deleted: true;
};

export interface ProductMutationTables extends CategoryMutationTables {}

type ProductMutationDependencies = {
  tables: ProductMutationTables;
  now: () => string;
  enforceRuntimeBoundary: (verification: boolean) => void;
  emitActivityEvent: (event: ReturnType<typeof buildActivityEvent>) => void | Promise<void>;
  wait: (milliseconds: number) => Promise<void>;
};

const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
const productsTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.products;
const categoriesTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories;
const APPWRITE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function enforceDefaultRuntimeBoundary(verification: boolean) {
  if (getServerBackendMode() !== "appwrite") {
    throw new MutationContractError(
      "DEPENDENCY_FAILED",
      "Appwrite product mutations are unavailable."
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
      "Product action is not authorized."
    );
  }
}

function deterministicProductId(idempotencyKey: string) {
  return `prd_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
}

function activityEventId(action: string, idempotencyKey: string) {
  return `product:${action}:${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
}

function normalizedDate(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function optionalString(value: unknown, maximum: number) {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" && value.length <= maximum ? value : undefined;
}

function mapCategoryRow(row: CategoryRow, verification: boolean) {
  const updatedAt = normalizedDate(row.updatedAt);
  if (
    typeof row.$id !== "string" ||
    !APPWRITE_ID.test(row.$id) ||
    typeof row.name !== "string" ||
    !row.name ||
    row.name.length > 160 ||
    typeof row.slug !== "string" ||
    !SLUG.test(row.slug) ||
    row.slug.length > 160 ||
    !updatedAt ||
    !hasExactCategoryPermissions(row.$permissions, verification ? "private_fixture" : "public")
  ) {
    throw new MutationContractError(
      "DEPENDENCY_FAILED",
      "Referenced category does not match the locked schema and permissions."
    );
  }
  return { id: row.$id, name: row.name, slug: row.slug, updatedAt };
}

export function mapProductMutationRow(
  row: ProductMutationRow,
  options: { allowBlockedPublicState?: boolean } = {}
): ProductMutationDto {
  const preferredContactId = optionalString(row.preferredContactId, 64);
  const imageFileId = optionalString(row.imageFileId, 36);
  const legacyImageUrl = optionalString(row.legacyImageUrl, 2048);
  const createdByName = optionalString(row.createdByName, 160);
  const updatedByName = optionalString(row.updatedByName, 160);
  const createdAt = normalizedDate(row.createdAt);
  const updatedAt = normalizedDate(row.updatedAt);
  if (
    typeof row.$id !== "string" ||
    !APPWRITE_ID.test(row.$id) ||
    typeof row.name !== "string" ||
    !row.name ||
    row.name.length > 160 ||
    typeof row.slug !== "string" ||
    !SLUG.test(row.slug) ||
    row.slug.length > 160 ||
    typeof row.description !== "string" ||
    !row.description.trim() ||
    row.description.length > 10_000 ||
    (row.brand !== "univercell" && row.brand !== "eko") ||
    preferredContactId === undefined ||
    typeof row.categoryId !== "string" ||
    !APPWRITE_ID.test(row.categoryId) ||
    typeof row.categoryName !== "string" ||
    !row.categoryName ||
    row.categoryName.length > 160 ||
    typeof row.price !== "number" ||
    !Number.isSafeInteger(row.price) ||
    row.price < 1 ||
    row.currency !== "PKR" ||
    (row.condition !== "New" && row.condition !== "Like New" && row.condition !== "Used") ||
    (row.stockStatus !== "in_stock" &&
      row.stockStatus !== "low_stock" &&
      row.stockStatus !== "sold_out") ||
    typeof row.featured !== "boolean" ||
    typeof row.statusPick !== "boolean" ||
    typeof row.storefrontVisible !== "boolean" ||
    typeof row.feedVisible !== "boolean" ||
    typeof row.sortPriority !== "number" ||
    !Number.isSafeInteger(row.sortPriority) ||
    row.sortPriority < 0 ||
    typeof row.chosenSelectionKey !== "string" ||
    (row.chosenSelectionKey !== row.$id && row.chosenSelectionKey !== "current") ||
    imageFileId === undefined ||
    legacyImageUrl === undefined ||
    !createdAt ||
    !updatedAt ||
    createdByName === undefined ||
    updatedByName === undefined ||
    (!hasExactProductPrivatePermissions(row.$permissions) &&
      !(
        options.allowBlockedPublicState &&
        Array.isArray(row.$permissions) &&
        row.$permissions.includes(APPWRITE_PUBLIC_READ_PERMISSION)
      ))
  ) {
    throw new MutationContractError(
      "DEPENDENCY_FAILED",
      "Existing product row does not match the locked private schema and permissions."
    );
  }
  return {
    id: row.$id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    brand: row.brand,
    preferredContactId,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    price: row.price,
    currency: "PKR",
    condition: row.condition,
    stockStatus: row.stockStatus,
    featured: row.featured,
    statusPick: row.statusPick,
    storefrontVisible: row.storefrontVisible,
    feedVisible: row.feedVisible,
    sortPriority: row.sortPriority,
    chosenSelectionKey: row.chosenSelectionKey,
    imageFileId,
    legacyImageUrl,
    createdAt,
    updatedAt,
    createdByName,
    updatedByName
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
    throw new MutationContractError("NOT_FOUND", "Product was not found.");
  }
  if (isAppwriteCode(error, 409)) {
    throw new MutationContractError("CONFLICT", "Product mutation conflicted.");
  }
  throw new MutationContractError("INTERNAL_ERROR", "Product mutation failed.");
}

async function discardEmptyTransaction(
  dependencies: ProductMutationDependencies,
  transactionId: string
) {
  try {
    await dependencies.tables.deleteTransaction({ transactionId });
  } catch (error) {
    if (!isAppwriteCode(error, 404)) {
      throw new MutationContractError(
        "CLEANUP_FAILED",
        "Empty product transaction could not be discarded."
      );
    }
  }
}

async function rollbackTransaction(
  dependencies: ProductMutationDependencies,
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
        "Product transaction rollback failed."
      );
    }
    await dependencies.wait(100);
    transaction = await dependencies.tables.getTransaction({ transactionId });
  }
  throw new MutationContractError(
    "CLEANUP_FAILED",
    "Product transaction rollback could not be confirmed."
  );
}

async function commitTransaction(
  dependencies: ProductMutationDependencies,
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
      throw new MutationContractError("CONFLICT", "Product transaction did not commit.");
    }
    await dependencies.wait(100);
    transaction = await dependencies.tables.getTransaction({ transactionId });
  }
  throw new MutationContractError(
    "DEPENDENCY_FAILED",
    "Product transaction commit could not be confirmed."
  );
}

async function readMaterializedProduct(
  dependencies: ProductMutationDependencies,
  productId: string
) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      return mapProductMutationRow(
        await dependencies.tables.getRow({
          databaseId,
          tableId: productsTableId,
          rowId: productId
        })
      );
    } catch (error) {
      if (!isAppwriteCode(error, 404)) throw error;
    }
    await dependencies.wait(100);
  }
  throw new MutationContractError(
    "DEPENDENCY_FAILED",
    "Committed product row did not materialize."
  );
}

function sameCreateResult(
  product: ProductMutationDto,
  command: ProductCreateCommand,
  categoryName: string,
  identity: AuthenticatedStaffIdentity
) {
  return (
    product.name === command.name &&
    product.slug === command.slug &&
    product.description === command.description &&
    product.brand === command.brand &&
    product.preferredContactId === command.preferredContactId &&
    product.categoryId === command.categoryId &&
    product.categoryName === categoryName &&
    product.price === command.price &&
    product.currency === command.currency &&
    product.condition === command.condition &&
    product.stockStatus === command.stockStatus &&
    product.featured === command.featured &&
    product.statusPick === command.statusPick &&
    product.storefrontVisible === false &&
    product.feedVisible === false &&
    product.sortPriority === command.sortPriority &&
    product.chosenSelectionKey === product.id &&
    product.imageFileId === null &&
    product.legacyImageUrl === null &&
    product.createdByName === identity.name
  );
}

function patchMatches(product: ProductMutationDto, patch: ProductUpdatePatch) {
  return Object.entries(patch).every(([key, value]) => {
    if (key === "categoryId") return product.categoryId === value;
    return product[key as keyof ProductMutationDto] === value;
  });
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
    entityType: "product",
    actor: {
      userId: input.identity.userId,
      displayName: input.identity.name,
      role: input.identity.role
    }
  };
}

export function prepareProductMutationActivityEvent(input: {
  eventType:
    | "product.created"
    | "product.updated"
    | "product.deletion_attempted"
    | "product.deletion_blocked"
    | "product.deleted"
    | "product.mutation_failed"
    | "product.category_dependency_failed"
    | "product.stale_write_rejected"
    | "product.compensation_result"
    | "product.cleanup_result";
  productId: string;
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
    entityId: input.productId,
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

export function createAppwriteProductMutationService(
  overrides: Partial<ProductMutationDependencies> = {}
) {
  const dependencies: ProductMutationDependencies = {
    tables:
      overrides.tables ??
      (getAppwriteDataServices().tables as unknown as ProductMutationTables),
    now: overrides.now ?? (() => new Date().toISOString()),
    enforceRuntimeBoundary:
      overrides.enforceRuntimeBoundary ?? enforceDefaultRuntimeBoundary,
    emitActivityEvent:
      overrides.emitActivityEvent ??
      (overrides.tables
        ? async () => {}
        : async (event) => {
            await persistAppwriteActivityEvent(event);
          }),
    wait: overrides.wait ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)))
  };

  function begin(
    identity: AuthenticatedStaffIdentity,
    action: CatalogueMutationAction,
    context: ProductMutationExecutionContext
  ) {
    const verification = isProductMutationVerificationContext(context);
    dependencies.enforceRuntimeBoundary(verification);
    authorize(identity, action);
    if (
      context.kind === "phase3x_cleanup_verification" &&
      action !== "delete_product"
    ) {
      throw new MutationContractError(
        "AUTHORIZATION_FAILED",
        "Phase 3X cleanup context permits only exact disposable product deletion."
      );
    }
    return verification;
  }

  async function emit(input: ActivityEventInput) {
    await dependencies.emitActivityEvent(buildActivityEvent(input));
  }

  async function createProduct(
    request: unknown,
    identity: AuthenticatedStaffIdentity,
    context: ProductMutationExecutionContext = APPLICATION_PRODUCT_MUTATION_CONTEXT
  ) {
    const verification = begin(identity, "create_product", context);
    const command = planProductCreate(request);
    const rowId = verification
      ? context.kind === "phase3w_verification"
        ? context.fixtureProductId
        : deterministicProductId(command.idempotencyKey)
      : deterministicProductId(command.idempotencyKey);
    const timestamp = dependencies.now();
    let transactionId = "";
    let committed = false;
    let staged = false;
    try {
      try {
        const existing = mapProductMutationRow(
          await dependencies.tables.getRow({
            databaseId,
            tableId: productsTableId,
            rowId
          })
        );
        const category = mapCategoryRow(
          await dependencies.tables.getRow({
            databaseId,
            tableId: categoriesTableId,
            rowId: command.categoryId
          }),
          verification
        );
        if (sameCreateResult(existing, command, category.name, identity)) return existing;
        throw new MutationContractError(
          "CONFLICT",
          "Idempotency key was already used for different product data."
        );
      } catch (error) {
        if (!isAppwriteCode(error, 404)) throw error;
      }

      transactionId = (await dependencies.tables.createTransaction({ ttl: 60 })).$id;
      let category: ReturnType<typeof mapCategoryRow>;
      try {
        category = mapCategoryRow(
          await dependencies.tables.getRow({
            databaseId,
            tableId: categoriesTableId,
            rowId: command.categoryId,
            transactionId
          }),
          verification
        );
      } catch (error) {
        if (isAppwriteCode(error, 404)) {
          throw new MutationContractError(
            "DEPENDENCY_FAILED",
            "Referenced category was not found.",
            "categoryId"
          );
        }
        throw error;
      }
      const duplicate = await dependencies.tables.listRows({
        databaseId,
        tableId: productsTableId,
        queries: [Query.equal("slug", command.slug), Query.limit(1)],
        transactionId,
        total: false,
        ttl: 0
      });
      if (duplicate.rows.length > 0) {
        throw new MutationContractError("CONFLICT", "Product slug already exists.", "slug");
      }
      await dependencies.tables.createRow({
        databaseId,
        tableId: productsTableId,
        rowId,
        data: {
          name: command.name,
          slug: command.slug,
          description: command.description,
          brand: command.brand,
          ...(command.preferredContactId
            ? { preferredContactId: command.preferredContactId }
            : {}),
          categoryId: category.id,
          categoryName: category.name,
          price: command.price,
          currency: "PKR",
          condition: command.condition,
          stockStatus: command.stockStatus,
          featured: command.featured,
          statusPick: command.statusPick,
          storefrontVisible: false,
          feedVisible: false,
          sortPriority: command.sortPriority,
          chosenSelectionKey: rowId,
          createdAt: timestamp,
          updatedAt: timestamp,
          createdByName: identity.name,
          updatedByName: identity.name
        },
        permissions: productPrivatePermissions(),
        transactionId
      });
      staged = true;
      await commitTransaction(dependencies, transactionId);
      committed = true;
      const dto = await readMaterializedProduct(dependencies, rowId);
      if (!sameCreateResult(dto, command, category.name, identity)) {
        throw new MutationContractError(
          "DEPENDENCY_FAILED",
          "Committed product outcome does not match the request."
        );
      }
      await emit(eventInput({
        eventId: activityEventId("create", command.idempotencyKey),
        eventType: "product.created",
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
      if (transactionId && !committed) {
        if (staged) await rollbackTransaction(dependencies, transactionId);
        else await discardEmptyTransaction(dependencies, transactionId);
      }
      if (
        !(error instanceof MutationContractError) ||
        error.code !== "AUDIT_PERSISTENCE_FAILED"
      ) {
        await emit(eventInput({
          eventId: activityEventId("create-failed", command.idempotencyKey),
          eventType:
            error instanceof MutationContractError &&
            error.code === "DEPENDENCY_FAILED"
              ? "product.dependency_rejected"
              : "product.mutation_failed",
          entityId: rowId,
          identity,
          timestamp,
          requestId: command.idempotencyKey,
          before: null,
          after: null,
          result: "failed",
          errorClassification:
            error instanceof MutationContractError ? error.code : "INTERNAL_ERROR"
        }));
      }
      return classifySdkFailure(error);
    }
  }

  async function updateProduct(
    request: unknown,
    identity: AuthenticatedStaffIdentity,
    context: ProductMutationExecutionContext = APPLICATION_PRODUCT_MUTATION_CONTEXT
  ) {
    const verification = begin(identity, "edit_product", context);
    const command = planProductUpdate(request);
    const timestamp = dependencies.now();
    let transactionId = "";
    let committed = false;
    let staged = false;
    try {
      transactionId = (await dependencies.tables.createTransaction({ ttl: 60 })).$id;
      const current = mapProductMutationRow(
        await dependencies.tables.getRow({
          databaseId,
          tableId: productsTableId,
          rowId: command.productId,
          transactionId
        })
      );
      if (current.updatedAt !== command.expectedUpdatedAt) {
        if (patchMatches(current, command.patch)) {
          await discardEmptyTransaction(dependencies, transactionId);
          return current;
        }
        throw new MutationContractError("STALE_WRITE", "Product has changed.");
      }
      if (current.chosenSelectionKey === "current" && "chosenSelectionKey" in command.patch) {
        throw new MutationContractError(
          "VALIDATION_FAILED",
          "Chosen-product state is immutable in this phase."
        );
      }
      let categoryName = current.categoryName;
      if (command.patch.categoryId && command.patch.categoryId !== current.categoryId) {
        try {
          const category = mapCategoryRow(
            await dependencies.tables.getRow({
              databaseId,
              tableId: categoriesTableId,
              rowId: command.patch.categoryId,
              transactionId
            }),
            verification
          );
          categoryName = category.name;
        } catch (error) {
          if (isAppwriteCode(error, 404)) {
            throw new MutationContractError(
              "DEPENDENCY_FAILED",
              "Referenced category was not found.",
              "categoryId"
            );
          }
          throw error;
        }
      }
      const nextSlug = command.patch.slug ?? current.slug;
      if (nextSlug !== current.slug) {
        const duplicate = await dependencies.tables.listRows({
          databaseId,
          tableId: productsTableId,
          queries: [Query.equal("slug", nextSlug), Query.limit(2)],
          transactionId,
          total: false,
          ttl: 0
        });
        if (duplicate.rows.some((row) => row.$id !== command.productId)) {
          throw new MutationContractError("CONFLICT", "Product slug already exists.", "slug");
        }
      }
      await dependencies.tables.updateRow({
        databaseId,
        tableId: productsTableId,
        rowId: command.productId,
        data: {
          ...command.patch,
          ...(command.patch.categoryId ? { categoryName } : {}),
          updatedAt: timestamp,
          updatedByName: identity.name
        },
        permissions: productPrivatePermissions(),
        transactionId
      });
      staged = true;
      await commitTransaction(dependencies, transactionId);
      committed = true;
      const dto = await readMaterializedProduct(dependencies, command.productId);
      if (
        !patchMatches(dto, command.patch) ||
        (command.patch.categoryId && dto.categoryName !== categoryName) ||
        dto.chosenSelectionKey !== current.chosenSelectionKey ||
        dto.imageFileId !== current.imageFileId ||
        dto.createdAt !== current.createdAt ||
        dto.createdByName !== current.createdByName
      ) {
        throw new MutationContractError(
          "DEPENDENCY_FAILED",
          "Committed product update does not match the request."
        );
      }
      await emit(eventInput({
        eventId: activityEventId("update", command.idempotencyKey),
        eventType: "product.updated",
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
      if (
        !(error instanceof MutationContractError) ||
        error.code !== "AUDIT_PERSISTENCE_FAILED"
      ) {
        await emit(eventInput({
          eventId: activityEventId("update-failed", command.idempotencyKey),
          eventType:
            error instanceof MutationContractError && error.code === "STALE_WRITE"
              ? "product.stale_write_rejected"
              : error instanceof MutationContractError &&
                  error.code === "DEPENDENCY_FAILED"
                ? "product.dependency_rejected"
                : "product.mutation_failed",
          entityId: command.productId,
          identity,
          timestamp,
          requestId: command.idempotencyKey,
          before: null,
          after: null,
          result: "failed",
          errorClassification:
            error instanceof MutationContractError ? error.code : "INTERNAL_ERROR"
        }));
      }
      return classifySdkFailure(error);
    }
  }

  async function deleteProduct(
    request: unknown,
    identity: AuthenticatedStaffIdentity,
    context: ProductMutationExecutionContext = APPLICATION_PRODUCT_MUTATION_CONTEXT
  ): Promise<ProductDeleteDto> {
    begin(identity, "delete_product", context);
    const command = planProductDelete(request);
    if (
      context.kind === "phase3x_cleanup_verification" &&
      !context.fixtureProductIds.includes(command.productId)
    ) {
      throw new MutationContractError(
        "AUTHORIZATION_FAILED",
        "Product is outside the Phase 3X disposable cleanup allow-list."
      );
    }
    const timestamp = dependencies.now();
    let transactionId = "";
    let committed = false;
    let staged = false;
    try {
      transactionId = (await dependencies.tables.createTransaction({ ttl: 60 })).$id;
      const current = mapProductMutationRow(
        await dependencies.tables.getRow({
          databaseId,
          tableId: productsTableId,
          rowId: command.productId,
          transactionId
        }),
        { allowBlockedPublicState: true }
      );
      await emit(eventInput({
        eventId: activityEventId("delete-attempt", command.idempotencyKey),
        eventType: "product.deletion_attempted",
        entityId: current.id,
        identity,
        timestamp,
        requestId: command.idempotencyKey,
        before: current,
        after: current,
        result: "failed"
      }));
      if (current.updatedAt !== command.expectedUpdatedAt) {
        throw new MutationContractError("STALE_WRITE", "Product has changed.");
      }
      if (current.imageFileId) {
        await emit(eventInput({
          eventId: activityEventId("delete-blocked-image", command.idempotencyKey),
          eventType: "product.deletion_blocked",
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
          "Product deletion is blocked while an Appwrite image is attached.",
          "imageFileId"
        );
      }
      if (current.chosenSelectionKey === "current") {
        await emit(eventInput({
          eventId: activityEventId("delete-blocked-selected", command.idempotencyKey),
          eventType: "product.deletion_blocked",
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
          "The currently selected product cannot be deleted in this phase.",
          "chosenSelectionKey"
        );
      }
      if (current.storefrontVisible || current.feedVisible) {
        await emit(eventInput({
          eventId: activityEventId("delete-blocked-public", command.idempotencyKey),
          eventType: "product.deletion_blocked",
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
          "Public product deletion is deferred.",
          "storefrontVisible"
        );
      }
      await dependencies.tables.deleteRow({
        databaseId,
        tableId: productsTableId,
        rowId: command.productId,
        transactionId
      });
      staged = true;
      await commitTransaction(dependencies, transactionId);
      committed = true;
      let resurfaced: ProductMutationDto | null = null;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          resurfaced = mapProductMutationRow(
            await dependencies.tables.getRow({
              databaseId,
              tableId: productsTableId,
              rowId: command.productId
            })
          );
          break;
        } catch (error) {
          if (!isAppwriteCode(error, 404)) throw error;
        }
        await dependencies.wait(100);
      }
      let compensated = false;
      if (resurfaced) {
        if (
          resurfaced.updatedAt !== current.updatedAt ||
          resurfaced.chosenSelectionKey !== current.chosenSelectionKey ||
          resurfaced.imageFileId !== current.imageFileId
        ) {
          throw new MutationContractError(
            "CONFLICT",
            "Product changed while delete compensation was pending."
          );
        }
        await dependencies.tables.deleteRow({
          databaseId,
          tableId: productsTableId,
          rowId: command.productId
        });
        compensated = true;
        for (let attempt = 0; attempt < 10; attempt++) {
          await dependencies.wait(100);
          try {
            await dependencies.tables.getRow({
              databaseId,
              tableId: productsTableId,
              rowId: command.productId
            });
            throw new MutationContractError(
              "CLEANUP_FAILED",
              "Product delete compensation did not remain absent."
            );
          } catch (error) {
            if (!isAppwriteCode(error, 404)) throw error;
          }
        }
      }
      await emit(eventInput({
        eventId: activityEventId("delete", command.idempotencyKey),
        eventType: "product.deleted",
        entityId: current.id,
        identity,
        timestamp,
        requestId: command.idempotencyKey,
        before: current,
        after: null,
        result: compensated ? "compensated" : "succeeded",
        ...(compensated ? { compensationResult: "verified compare-before-delete fallback" } : {})
      }));
      return { id: command.productId, deleted: true };
    } catch (error) {
      if (transactionId && !committed) {
        if (staged) await rollbackTransaction(dependencies, transactionId);
        else await discardEmptyTransaction(dependencies, transactionId);
      }
      if (
        !(error instanceof MutationContractError) ||
        error.code !== "AUDIT_PERSISTENCE_FAILED"
      ) {
        await emit(eventInput({
          eventId: activityEventId("delete-failed", command.idempotencyKey),
          eventType:
            error instanceof MutationContractError && error.code === "STALE_WRITE"
              ? "product.stale_write_rejected"
              : "product.mutation_failed",
          entityId: command.productId,
          identity,
          timestamp,
          requestId: command.idempotencyKey,
          before: null,
          after: null,
          result: "failed",
          errorClassification:
            error instanceof MutationContractError ? error.code : "INTERNAL_ERROR"
        }));
      }
      return classifySdkFailure(error);
    }
  }

  return {
    createProduct,
    updateProduct,
    deleteProduct
  };
}
