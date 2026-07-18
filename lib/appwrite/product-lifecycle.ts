import "server-only";

import { createHash } from "node:crypto";
import { AppwriteException, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { hasExactCategoryPermissions } from "@/lib/appwrite/category-permissions";
import type { ProductMutationTables } from "@/lib/appwrite/product-mutations";
import {
  mapProductMutationRow,
  type ProductMutationDto,
  type ProductMutationRow
} from "@/lib/appwrite/product-mutations";
import {
  planChosenProductMutation,
  planMerchandisingMutation,
  planOrphanCleanup,
  planProductImageMutation,
  planVisibilityMutation,
  validateProductImage,
  type AcceptedProductImageMime,
  type ProductImageUpload
} from "@/lib/appwrite/product-lifecycle-contracts";
import {
  APPLICATION_PRODUCT_LIFECYCLE_CONTEXT,
  assertPhase3XResourceAllowed,
  isPhase3XProductLifecycleVerificationContext,
  type ProductLifecycleExecutionContext
} from "@/lib/appwrite/product-lifecycle-context";
import {
  hasExactProductImagePrivatePermissions,
  hasExactProductImagePublicPermissions,
  hasExactProductPublicPermissions,
  productImagePrivatePermissions,
  productImagePublicPermissions,
  productPermissionsForVisibility
} from "@/lib/appwrite/product-lifecycle-permissions";
import {
  buildActivityEvent,
  isRoleAuthorizedForAction,
  MutationContractError,
  type ActivityEventInput,
  type CatalogueMutationAction,
  type MutationErrorCode
} from "@/lib/appwrite/mutation-design";
import { hasExactProductPrivatePermissions } from "@/lib/appwrite/product-permissions";
import {
  buildPublicAppwriteFileViewUrl,
  isValidAppwriteId
} from "@/lib/appwrite/product-image";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";
import { getAppwriteDataServices } from "@/lib/appwrite/server";
import { getServerBackendMode } from "@/lib/backend/server";
import { requireMutationEnabled } from "@/lib/server/mutation-gate";

type LifecycleRow = ProductMutationRow;
type FileMetadata = Record<string, unknown>;

export interface ProductLifecycleStorage {
  createFile(input: {
    bucketId: string;
    fileId: string;
    file: unknown;
    permissions: string[];
  }): Promise<unknown>;
  getFile(input: { bucketId: string; fileId: string }): Promise<unknown>;
  updateFile(input: {
    bucketId: string;
    fileId: string;
    name?: string;
    permissions?: string[];
  }): Promise<unknown>;
  deleteFile(input: { bucketId: string; fileId: string }): Promise<unknown>;
}

type AnonymousFileResult = {
  status: number;
  contentType: string;
  bytes: Uint8Array;
};

type ProductLifecycleDependencies = {
  tables: ProductMutationTables;
  storage: ProductLifecycleStorage;
  now: () => string;
  wait: (milliseconds: number) => Promise<void>;
  toInputFile: (image: ProductImageUpload, fileId: string) => unknown;
  fetchAnonymousFile: (fileId: string) => Promise<AnonymousFileResult>;
  enforceRuntimeBoundary: (verification: boolean) => void;
  emitActivityEvent: (event: ReturnType<typeof buildActivityEvent>) => void | Promise<void>;
};

export type ProductImageMutationDto = {
  product: ProductMutationDto;
  image: {
    fileId: string;
    mimeType: AcceptedProductImageMime;
    size: number;
    public: boolean;
  } | null;
  cleanup: {
    complete: boolean;
    deletedFileId: string | null;
  };
};

export type OrphanCleanupDto = {
  fileId: string;
  deleted: true;
  referenced: false;
};

export type ChosenProductMutationDto = {
  selectedProduct: ProductMutationDto;
  previousProductId: string | null;
  selectedCount: 1;
  outcome: "selected" | "already_selected" | "commit_outcome_recovered";
};

const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
const productsTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.products;
const categoriesTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories;
const bucketId = APPWRITE_DEFAULT_RESOURCE_IDS.productImagesBucket;
const MAX_IMAGE_BYTES = 1024 * 1024;
const ACCEPTED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function defaultRuntimeBoundary(verification: boolean) {
  if (getServerBackendMode() !== "appwrite") {
    throw new MutationContractError(
      "DEPENDENCY_FAILED",
      "Appwrite product lifecycle mutations are unavailable."
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
      "Product lifecycle action is not authorized."
    );
  }
}

function isCode(error: unknown, code: number) {
  return (
    (error instanceof AppwriteException && error.code === code) ||
    (!!error && typeof error === "object" && "code" in error && error.code === code)
  );
}

function classify(error: unknown): never {
  if (error instanceof MutationContractError) throw error;
  if (isCode(error, 404)) {
    throw new MutationContractError("NOT_FOUND", "Lifecycle resource was not found.");
  }
  if (isCode(error, 409)) {
    throw new MutationContractError("CONFLICT", "Lifecycle mutation conflicted.");
  }
  throw new MutationContractError("INTERNAL_ERROR", "Product lifecycle mutation failed.");
}

function normalizedDate(value: unknown) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function mapLifecycleProduct(row: LifecycleRow) {
  const dto = mapProductMutationRow(row, { allowBlockedPublicState: true });
  const exactPrivate = hasExactProductPrivatePermissions(row.$permissions);
  const exactPublic = hasExactProductPublicPermissions(row.$permissions);
  if (
    (!dto.storefrontVisible && !exactPrivate) ||
    (dto.storefrontVisible && !exactPublic) ||
    (dto.feedVisible && !dto.storefrontVisible)
  ) {
    throw new MutationContractError(
      "DEPENDENCY_FAILED",
      "Product visibility and permissions are inconsistent."
    );
  }
  return dto;
}

function mapImageFile(
  value: unknown,
  expectedFileId: string,
  expectedPublic: boolean,
  expected?: { mimeType: AcceptedProductImageMime; size: number }
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MutationContractError("DEPENDENCY_FAILED", "Image metadata is malformed.");
  }
  const file = value as FileMetadata;
  const complete =
    typeof file.chunksTotal === "number" &&
    file.chunksTotal >= 1 &&
    file.chunksUploaded === file.chunksTotal;
  const permissionsValid = expectedPublic
    ? hasExactProductImagePublicPermissions(file.$permissions)
    : hasExactProductImagePrivatePermissions(file.$permissions);
  if (
    file.$id !== expectedFileId ||
    !isValidAppwriteId(file.$id) ||
    file.bucketId !== bucketId ||
    typeof file.mimeType !== "string" ||
    !ACCEPTED_MIME.has(file.mimeType) ||
    typeof file.sizeOriginal !== "number" ||
    !Number.isSafeInteger(file.sizeOriginal) ||
    file.sizeOriginal < 1 ||
    file.sizeOriginal > MAX_IMAGE_BYTES ||
    !complete ||
    file.deleted === true ||
    (file.$deletedAt !== undefined && file.$deletedAt !== null && file.$deletedAt !== "") ||
    !permissionsValid ||
    (expected &&
      (file.mimeType !== expected.mimeType || file.sizeOriginal !== expected.size))
  ) {
    throw new MutationContractError(
      "DEPENDENCY_FAILED",
      "Image metadata or permissions do not match the locked contract."
    );
  }
  return {
    fileId: expectedFileId,
    mimeType: file.mimeType as AcceptedProductImageMime,
    size: file.sizeOriginal,
    public: expectedPublic
  };
}

function deterministicFileId(idempotencyKey: string) {
  return `img_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
}

function eventId(eventType: string, requestId: string) {
  return `p3x:${createHash("sha256").update(`${eventType}:${requestId}`).digest("hex").slice(0, 32)}`;
}

export type ProductLifecycleEventType =
  | "image.uploaded"
  | "image.verified"
  | "image.attached"
  | "image.replaced"
  | "image.removed"
  | "image.orphan_cleanup_attempted"
  | "image.orphan_cleanup_completed"
  | "product.published"
  | "product.hidden"
  | "image.public_permission_added"
  | "image.public_permission_removed"
  | "product.chosen_changed"
  | "product.chosen_attempt_failed"
  | "product.visibility_transition_failed"
  | "product.compensation_attempted"
  | "product.compensation_completed"
  | "product.cleanup_failed";

export function prepareProductLifecycleActivityEvent(input: {
  eventType: ProductLifecycleEventType;
  entityType: "product" | "image";
  entityId: string;
  identity: AuthenticatedStaffIdentity;
  timestamp: string;
  requestId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  result: ActivityEventInput["result"];
  errorClassification?: MutationErrorCode;
  compensationResult?: string;
  metadata?: Record<string, unknown>;
}) {
  return buildActivityEvent({
    eventId: eventId(input.eventType, input.requestId),
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    actor: {
      userId: input.identity.userId,
      displayName: input.identity.name,
      role: input.identity.role
    },
    timestamp: input.timestamp,
    requestId: input.requestId,
    before: input.before,
    after: input.after,
    result: input.result,
    errorClassification: input.errorClassification,
    compensationResult: input.compensationResult,
    metadata: input.metadata
  });
}

async function discardTransaction(
  dependencies: ProductLifecycleDependencies,
  transactionId: string
) {
  try {
    await dependencies.tables.deleteTransaction({ transactionId });
  } catch (error) {
    if (!isCode(error, 404)) {
      throw new MutationContractError(
        "CLEANUP_FAILED",
        "Empty lifecycle transaction could not be discarded."
      );
    }
  }
}

async function rollbackTransaction(
  dependencies: ProductLifecycleDependencies,
  transactionId: string
) {
  let transaction = await dependencies.tables.updateTransaction({
    transactionId,
    rollback: true
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (transaction.status === "rolled_back") {
      await dependencies.wait(500);
      return;
    }
    if (transaction.status === "committed" || transaction.status === "failed") {
      throw new MutationContractError(
        "CLEANUP_FAILED",
        "Lifecycle transaction rollback failed."
      );
    }
    await dependencies.wait(100);
    transaction = await dependencies.tables.getTransaction({ transactionId });
  }
  throw new MutationContractError(
    "CLEANUP_FAILED",
    "Lifecycle transaction rollback could not be confirmed."
  );
}

async function commitTransaction(
  dependencies: ProductLifecycleDependencies,
  transactionId: string
) {
  let transaction = await dependencies.tables.updateTransaction({
    transactionId,
    commit: true
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (transaction.status === "committed") {
      await dependencies.wait(500);
      return;
    }
    if (transaction.status === "failed" || transaction.status === "rolled_back") {
      throw new MutationContractError("CONFLICT", "Lifecycle transaction did not commit.");
    }
    await dependencies.wait(100);
    transaction = await dependencies.tables.getTransaction({ transactionId });
  }
  throw new MutationContractError(
    "DEPENDENCY_FAILED",
    "Lifecycle transaction commit outcome is unknown."
  );
}

async function verifyFileAbsent(
  dependencies: ProductLifecycleDependencies,
  fileId: string
) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await dependencies.storage.getFile({ bucketId, fileId });
    } catch (error) {
      if (isCode(error, 404)) return;
      throw error;
    }
    await dependencies.wait(100);
  }
  throw new MutationContractError("CLEANUP_FAILED", "Image deletion could not be proven.");
}

async function deleteFileAndVerify(
  dependencies: ProductLifecycleDependencies,
  fileId: string
) {
  try {
    await dependencies.storage.deleteFile({ bucketId, fileId });
  } catch (error) {
    if (!isCode(error, 404)) throw error;
  }
  await verifyFileAbsent(dependencies, fileId);
}

async function readProduct(
  dependencies: ProductLifecycleDependencies,
  productId: string,
  transactionId?: string
) {
  return mapLifecycleProduct(
    await dependencies.tables.getRow({
      databaseId,
      tableId: productsTableId,
      rowId: productId,
      ...(transactionId ? { transactionId } : {})
    })
  );
}

async function waitForProduct(
  dependencies: ProductLifecycleDependencies,
  productId: string,
  predicate: (product: ProductMutationDto) => boolean
) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const product = await readProduct(dependencies, productId);
    if (predicate(product)) return product;
    await dependencies.wait(100);
  }
  throw new MutationContractError(
    "DEPENDENCY_FAILED",
    "Committed lifecycle state did not materialize."
  );
}

async function updateProductInTransaction(input: {
  dependencies: ProductLifecycleDependencies;
  current: ProductMutationDto;
  expectedUpdatedAt: string;
  data: Record<string, unknown>;
  permissions: string[];
  identity: AuthenticatedStaffIdentity;
}) {
  const { dependencies, current } = input;
  if (current.updatedAt !== input.expectedUpdatedAt) {
    throw new MutationContractError("STALE_WRITE", "Product has changed.");
  }
  const transactionId = (await dependencies.tables.createTransaction({ ttl: 60 })).$id;
  let staged = false;
  try {
    const inTransaction = await readProduct(dependencies, current.id, transactionId);
    if (inTransaction.updatedAt !== current.updatedAt) {
      throw new MutationContractError("STALE_WRITE", "Product has changed.");
    }
    await dependencies.tables.updateRow({
      databaseId,
      tableId: productsTableId,
      rowId: current.id,
      data: {
        ...input.data,
        updatedAt: dependencies.now(),
        updatedByName: input.identity.name
      },
      permissions: input.permissions,
      transactionId
    });
    staged = true;
    await commitTransaction(dependencies, transactionId);
  } catch (error) {
    if (staged) await rollbackTransaction(dependencies, transactionId);
    else await discardTransaction(dependencies, transactionId);
    throw error;
  }
}

function defaultAnonymousFetcher(fileId: string) {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const url =
    endpoint && projectId
      ? buildPublicAppwriteFileViewUrl(fileId, { endpoint, projectId })
      : "";
  if (!url) {
    throw new MutationContractError(
      "DEPENDENCY_FAILED",
      "Anonymous file delivery configuration is invalid."
    );
  }
  return fetch(url, {
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "image/jpeg,image/png,image/webp" }
  }).then(async (response) => ({
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    bytes: new Uint8Array(await response.arrayBuffer())
  }));
}

export function createAppwriteProductLifecycleService(
  overrides: Partial<ProductLifecycleDependencies> = {}
) {
  const services =
    overrides.tables && overrides.storage ? null : getAppwriteDataServices();
  const dependencies: ProductLifecycleDependencies = {
    tables:
      overrides.tables ??
      (services?.tables as unknown as ProductMutationTables),
    storage:
      overrides.storage ??
      (services?.storage as unknown as ProductLifecycleStorage),
    now: overrides.now ?? (() => new Date().toISOString()),
    wait:
      overrides.wait ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
    toInputFile:
      overrides.toInputFile ??
      ((image, fileId) =>
        InputFile.fromBuffer(image.bytes, `${fileId}.${image.extension}`)),
    fetchAnonymousFile: overrides.fetchAnonymousFile ?? defaultAnonymousFetcher,
    enforceRuntimeBoundary: overrides.enforceRuntimeBoundary ?? defaultRuntimeBoundary,
    emitActivityEvent:
      overrides.emitActivityEvent ??
      (() => {
        // Physical activity_logs storage is intentionally deferred.
      })
  };

  function begin(
    identity: AuthenticatedStaffIdentity,
    action: CatalogueMutationAction,
    context: ProductLifecycleExecutionContext
  ) {
    const verification = isPhase3XProductLifecycleVerificationContext(context);
    dependencies.enforceRuntimeBoundary(verification);
    authorize(identity, action);
    return verification;
  }

  async function emit(input: Parameters<typeof prepareProductLifecycleActivityEvent>[0]) {
    await dependencies.emitActivityEvent(prepareProductLifecycleActivityEvent(input));
  }

  function selectedFileId(
    command: { idempotencyKey: string },
    context: ProductLifecycleExecutionContext,
    verificationFileId?: string
  ) {
    if (context.kind === "phase3x_verification") {
      if (!verificationFileId) {
        throw new MutationContractError(
          "VALIDATION_FAILED",
          "Verification file ID is required."
        );
      }
      assertPhase3XResourceAllowed(context, "file", verificationFileId);
      return verificationFileId;
    }
    if (verificationFileId) {
      throw new MutationContractError(
        "VALIDATION_FAILED",
        "Client-controlled file IDs are forbidden.",
        "fileId"
      );
    }
    return deterministicFileId(command.idempotencyKey);
  }

  async function uploadPrivateFile(
    fileId: string,
    image: ProductImageUpload,
    identity: AuthenticatedStaffIdentity,
    requestId: string
  ) {
    try {
      const existing = mapImageFile(
        await dependencies.storage.getFile({ bucketId, fileId }),
        fileId,
        false,
        { mimeType: image.mimeType, size: image.bytes.length }
      );
      return existing;
    } catch (error) {
      if (!isCode(error, 404)) throw error;
    }
    await dependencies.storage.createFile({
      bucketId,
      fileId,
      file: dependencies.toInputFile(image, fileId),
      permissions: productImagePrivatePermissions()
    });
    const metadata = mapImageFile(
      await dependencies.storage.getFile({ bucketId, fileId }),
      fileId,
      false,
      { mimeType: image.mimeType, size: image.bytes.length }
    );
    await emit({
      eventType: "image.uploaded",
      entityType: "image",
      entityId: fileId,
      identity,
      timestamp: dependencies.now(),
      requestId,
      before: null,
      after: {
        fileId,
        mimeType: metadata.mimeType,
        size: metadata.size,
        public: false
      },
      result: "succeeded"
    });
    return metadata;
  }

  async function uploadAndAttachImage(
    request: unknown,
    file: { bytes: Uint8Array; mimeType: string; filename: string },
    identity: AuthenticatedStaffIdentity,
    context: ProductLifecycleExecutionContext = APPLICATION_PRODUCT_LIFECYCLE_CONTEXT,
    verificationFileId?: string
  ): Promise<ProductImageMutationDto> {
    begin(identity, "upload_product_image", context);
    const command = planProductImageMutation(request);
    assertPhase3XResourceAllowed(context, "product", command.productId);
    const image = validateProductImage(file);
    const fileId = selectedFileId(command, context, verificationFileId);
    const current = await readProduct(dependencies, command.productId);
    if (current.updatedAt !== command.expectedUpdatedAt) {
      if (current.imageFileId === fileId) {
        const metadata = mapImageFile(
          await dependencies.storage.getFile({ bucketId, fileId }),
          fileId,
          current.storefrontVisible
        );
        return { product: current, image: metadata, cleanup: { complete: true, deletedFileId: null } };
      }
      throw new MutationContractError("STALE_WRITE", "Product has changed.");
    }
    if (current.storefrontVisible || current.feedVisible) {
      throw new MutationContractError(
        "REFERENCE_CONFLICT",
        "Initial image attachment requires a private product."
      );
    }
    if (current.imageFileId) {
      throw new MutationContractError(
        "REFERENCE_CONFLICT",
        "Product already has an image; use replacement."
      );
    }
    let uploaded = false;
    try {
      const metadata = await uploadPrivateFile(fileId, image, identity, command.idempotencyKey);
      uploaded = true;
      await updateProductInTransaction({
        dependencies,
        current,
        expectedUpdatedAt: command.expectedUpdatedAt,
        data: { imageFileId: fileId },
        permissions: productPermissionsForVisibility(false),
        identity
      });
      const product = await waitForProduct(
        dependencies,
        current.id,
        (candidate) => candidate.imageFileId === fileId
      );
      await emit({
        eventType: "image.attached",
        entityType: "product",
        entityId: product.id,
        identity,
        timestamp: dependencies.now(),
        requestId: command.idempotencyKey,
        before: { imageFileId: null },
        after: { imageFileId: fileId },
        result: "succeeded"
      });
      return {
        product,
        image: metadata,
        cleanup: { complete: true, deletedFileId: null }
      };
    } catch (error) {
      if (uploaded) {
        try {
          const latest = await readProduct(dependencies, current.id);
          if (latest.imageFileId !== fileId) {
            await deleteFileAndVerify(dependencies, fileId);
          }
        } catch (cleanupError) {
          if (cleanupError instanceof MutationContractError) throw cleanupError;
          throw new MutationContractError(
            "CLEANUP_FAILED",
            "Failed image attachment left cleanup unproven."
          );
        }
      }
      return classify(error);
    }
  }

  async function replaceImage(
    request: unknown,
    file: { bytes: Uint8Array; mimeType: string; filename: string },
    identity: AuthenticatedStaffIdentity,
    context: ProductLifecycleExecutionContext = APPLICATION_PRODUCT_LIFECYCLE_CONTEXT,
    verificationFileId?: string
  ): Promise<ProductImageMutationDto> {
    begin(identity, "replace_product_image", context);
    const command = planProductImageMutation(request);
    assertPhase3XResourceAllowed(context, "product", command.productId);
    const image = validateProductImage(file);
    const newFileId = selectedFileId(command, context, verificationFileId);
    const current = await readProduct(dependencies, command.productId);
    if (!current.imageFileId) {
      throw new MutationContractError(
        "REFERENCE_CONFLICT",
        "Product has no image to replace."
      );
    }
    if (current.updatedAt !== command.expectedUpdatedAt) {
      if (current.imageFileId === newFileId) {
        const metadata = mapImageFile(
          await dependencies.storage.getFile({ bucketId, fileId: newFileId }),
          newFileId,
          current.storefrontVisible
        );
        return {
          product: current,
          image: metadata,
          cleanup: { complete: true, deletedFileId: null }
        };
      }
      throw new MutationContractError("STALE_WRITE", "Product has changed.");
    }
    const oldFileId = current.imageFileId;
    let attached = false;
    let oldDeleted = false;
    await uploadPrivateFile(newFileId, image, identity, command.idempotencyKey);
    try {
      await updateProductInTransaction({
        dependencies,
        current,
        expectedUpdatedAt: command.expectedUpdatedAt,
        data: { imageFileId: newFileId },
        permissions: productPermissionsForVisibility(current.storefrontVisible),
        identity
      });
      let product = await waitForProduct(
        dependencies,
        current.id,
        (candidate) => candidate.imageFileId === newFileId
      );
      attached = true;
      if (current.storefrontVisible) {
        await dependencies.storage.updateFile({
          bucketId,
          fileId: newFileId,
          permissions: productImagePublicPermissions()
        });
        mapImageFile(
          await dependencies.storage.getFile({ bucketId, fileId: newFileId }),
          newFileId,
          true,
          { mimeType: image.mimeType, size: image.bytes.length }
        );
      }
      if (current.storefrontVisible) {
        await dependencies.storage.updateFile({
          bucketId,
          fileId: oldFileId,
          permissions: productImagePrivatePermissions()
        });
      }
      await deleteFileAndVerify(dependencies, oldFileId);
      oldDeleted = true;
      product = await readProduct(dependencies, current.id);
      const metadata = mapImageFile(
        await dependencies.storage.getFile({ bucketId, fileId: newFileId }),
        newFileId,
        current.storefrontVisible
      );
      await emit({
        eventType: "image.replaced",
        entityType: "product",
        entityId: product.id,
        identity,
        timestamp: dependencies.now(),
        requestId: command.idempotencyKey,
        before: { imageFileId: oldFileId },
        after: { imageFileId: newFileId },
        result: "succeeded"
      });
      return {
        product,
        image: metadata,
        cleanup: { complete: true, deletedFileId: oldFileId }
      };
    } catch (error) {
      if (!attached) {
        await deleteFileAndVerify(dependencies, newFileId);
      } else if (!oldDeleted) {
        const latest = await readProduct(dependencies, current.id);
        if (latest.imageFileId === newFileId) {
          try {
            await updateProductInTransaction({
              dependencies,
              current: latest,
              expectedUpdatedAt: latest.updatedAt,
              data: { imageFileId: oldFileId },
              permissions: productPermissionsForVisibility(latest.storefrontVisible),
              identity
            });
            if (latest.storefrontVisible) {
              await dependencies.storage.updateFile({
                bucketId,
                fileId: oldFileId,
                permissions: productImagePublicPermissions()
              });
            }
            await deleteFileAndVerify(dependencies, newFileId);
          } catch {
            throw new MutationContractError(
              "CLEANUP_FAILED",
              "Replacement compensation could not safely restore the prior image."
            );
          }
        }
      } else {
        const latest = await readProduct(dependencies, current.id);
        if (latest.imageFileId === newFileId && latest.storefrontVisible) {
          try {
            await dependencies.storage.updateFile({
              bucketId,
              fileId: newFileId,
              permissions: productImagePublicPermissions()
            });
          } catch {
            throw new MutationContractError(
              "CLEANUP_FAILED",
              "Replacement committed but its final public file state is unsafe."
            );
          }
        }
      }
      return classify(error);
    }
  }

  async function removeImage(
    request: unknown,
    identity: AuthenticatedStaffIdentity,
    context: ProductLifecycleExecutionContext = APPLICATION_PRODUCT_LIFECYCLE_CONTEXT
  ): Promise<ProductImageMutationDto> {
    begin(identity, "remove_product_image", context);
    const command = planProductImageMutation(request);
    assertPhase3XResourceAllowed(context, "product", command.productId);
    const current = await readProduct(dependencies, command.productId);
    if (current.updatedAt !== command.expectedUpdatedAt) {
      if (!current.imageFileId) {
        return {
          product: current,
          image: null,
          cleanup: { complete: true, deletedFileId: null }
        };
      }
      throw new MutationContractError("STALE_WRITE", "Product has changed.");
    }
    if (!current.imageFileId) {
      return {
        product: current,
        image: null,
        cleanup: { complete: true, deletedFileId: null }
      };
    }
    if (current.storefrontVisible || current.feedVisible) {
      throw new MutationContractError(
        "REFERENCE_CONFLICT",
        "Hide the product before removing its image."
      );
    }
    const fileId = current.imageFileId;
    await updateProductInTransaction({
      dependencies,
      current,
      expectedUpdatedAt: command.expectedUpdatedAt,
      data: { imageFileId: null },
      permissions: productPermissionsForVisibility(false),
      identity
    });
    const product = await waitForProduct(
      dependencies,
      current.id,
      (candidate) => candidate.imageFileId === null
    );
    try {
      await deleteFileAndVerify(dependencies, fileId);
    } catch {
      throw new MutationContractError(
        "CLEANUP_FAILED",
        "Image reference was removed but orphan cleanup could not be proven."
      );
    }
    await emit({
      eventType: "image.removed",
      entityType: "product",
      entityId: product.id,
      identity,
      timestamp: dependencies.now(),
      requestId: command.idempotencyKey,
      before: { imageFileId: fileId },
      after: { imageFileId: null },
      result: "succeeded"
    });
    return {
      product,
      image: null,
      cleanup: { complete: true, deletedFileId: fileId }
    };
  }

  async function cleanupOrphanFile(
    request: unknown,
    identity: AuthenticatedStaffIdentity,
    context: ProductLifecycleExecutionContext = APPLICATION_PRODUCT_LIFECYCLE_CONTEXT
  ): Promise<OrphanCleanupDto> {
    begin(identity, "destructive_cleanup", context);
    const command = planOrphanCleanup(request);
    assertPhase3XResourceAllowed(context, "file", command.fileId);
    const references = await dependencies.tables.listRows({
      databaseId,
      tableId: productsTableId,
      queries: [Query.equal("imageFileId", command.fileId), Query.limit(1)],
      total: false,
      ttl: 0
    });
    if (references.rows.length) {
      throw new MutationContractError(
        "REFERENCE_CONFLICT",
        "Referenced image file cannot be deleted."
      );
    }
    await emit({
      eventType: "image.orphan_cleanup_attempted",
      entityType: "image",
      entityId: command.fileId,
      identity,
      timestamp: dependencies.now(),
      requestId: command.idempotencyKey,
      before: { fileId: command.fileId },
      after: null,
      result: "failed"
    });
    await deleteFileAndVerify(dependencies, command.fileId);
    await emit({
      eventType: "image.orphan_cleanup_completed",
      entityType: "image",
      entityId: command.fileId,
      identity,
      timestamp: dependencies.now(),
      requestId: command.idempotencyKey,
      before: { fileId: command.fileId },
      after: null,
      result: "succeeded"
    });
    return { fileId: command.fileId, deleted: true, referenced: false };
  }

  async function setStorefrontVisibility(
    request: unknown,
    identity: AuthenticatedStaffIdentity,
    context: ProductLifecycleExecutionContext = APPLICATION_PRODUCT_LIFECYCLE_CONTEXT
  ) {
    begin(identity, "change_storefront_visibility", context);
    const command = planVisibilityMutation(request);
    assertPhase3XResourceAllowed(context, "product", command.productId);
    const current = await readProduct(dependencies, command.productId);
    if (current.storefrontVisible === command.storefrontVisible) {
      if (current.updatedAt !== command.expectedUpdatedAt) return current;
      return current;
    }
    if (current.updatedAt !== command.expectedUpdatedAt) {
      throw new MutationContractError("STALE_WRITE", "Product has changed.");
    }
    if (command.storefrontVisible) {
      if (!current.imageFileId) {
        throw new MutationContractError(
          "DEPENDENCY_FAILED",
          "A verified Appwrite image is required for publication."
        );
      }
      const category = await dependencies.tables.getRow({
        databaseId,
        tableId: categoriesTableId,
        rowId: current.categoryId
      });
      const categoryValid =
        typeof category.name === "string" &&
        category.name === current.categoryName &&
        (hasExactCategoryPermissions(category.$permissions, "public") ||
          (isPhase3XProductLifecycleVerificationContext(context) &&
            hasExactCategoryPermissions(category.$permissions, "private_fixture")));
      if (!categoryValid) {
        throw new MutationContractError(
          "DEPENDENCY_FAILED",
          "Product category dependency is invalid."
        );
      }
      mapImageFile(
        await dependencies.storage.getFile({ bucketId, fileId: current.imageFileId }),
        current.imageFileId,
        false
      );
      let publicImage: ReturnType<typeof mapImageFile>;
      try {
        await dependencies.storage.updateFile({
          bucketId,
          fileId: current.imageFileId,
          permissions: productImagePublicPermissions()
        });
        publicImage = mapImageFile(
          await dependencies.storage.getFile({ bucketId, fileId: current.imageFileId }),
          current.imageFileId,
          true
        );
        const anonymous = await dependencies.fetchAnonymousFile(current.imageFileId);
        if (
          anonymous.status !== 200 ||
          !anonymous.contentType.toLowerCase().startsWith(publicImage.mimeType) ||
          anonymous.bytes.length !== publicImage.size
        ) {
          throw new MutationContractError(
            "DEPENDENCY_FAILED",
            "Anonymous image delivery could not be verified."
          );
        }
      } catch (error) {
        try {
          await dependencies.storage.updateFile({
            bucketId,
            fileId: current.imageFileId,
            permissions: productImagePrivatePermissions()
          });
          mapImageFile(
            await dependencies.storage.getFile({ bucketId, fileId: current.imageFileId }),
            current.imageFileId,
            false
          );
        } catch {
          throw new MutationContractError(
            "CLEANUP_FAILED",
            "Failed publication left image permission cleanup unproven."
          );
        }
        return classify(error);
      }
      try {
        await updateProductInTransaction({
          dependencies,
          current,
          expectedUpdatedAt: command.expectedUpdatedAt,
          data: { storefrontVisible: true },
          permissions: productPermissionsForVisibility(true),
          identity
        });
        const product = await waitForProduct(
          dependencies,
          current.id,
          (candidate) => candidate.storefrontVisible
        );
        const visible = await dependencies.tables.listRows({
          databaseId,
          tableId: productsTableId,
          queries: [
            Query.equal("$id", current.id),
            Query.equal("storefrontVisible", true),
            Query.limit(1)
          ],
          total: false,
          ttl: 0
        });
        if (
          visible.rows.length !== 1 ||
          !hasExactProductPublicPermissions(visible.rows[0].$permissions)
        ) {
          throw new MutationContractError(
            "DEPENDENCY_FAILED",
            "Public product reader materialization could not be verified."
          );
        }
        await emit({
          eventType: "product.published",
          entityType: "product",
          entityId: product.id,
          identity,
          timestamp: dependencies.now(),
          requestId: command.idempotencyKey,
          before: { storefrontVisible: false },
          after: { storefrontVisible: true },
          result: "succeeded"
        });
        return product;
      } catch (error) {
        const latest = await readProduct(dependencies, current.id);
        if (!latest.storefrontVisible && latest.imageFileId === current.imageFileId) {
          await dependencies.storage.updateFile({
            bucketId,
            fileId: current.imageFileId,
            permissions: productImagePrivatePermissions()
          });
          mapImageFile(
            await dependencies.storage.getFile({ bucketId, fileId: current.imageFileId }),
            current.imageFileId,
            false
          );
        }
        return classify(error);
      }
    }

    await updateProductInTransaction({
      dependencies,
      current,
      expectedUpdatedAt: command.expectedUpdatedAt,
      data: { storefrontVisible: false, feedVisible: false },
      permissions: productPermissionsForVisibility(false),
      identity
    });
    const product = await waitForProduct(
      dependencies,
      current.id,
      (candidate) => !candidate.storefrontVisible && !candidate.feedVisible
    );
    const visible = await dependencies.tables.listRows({
      databaseId,
      tableId: productsTableId,
      queries: [
        Query.equal("$id", current.id),
        Query.equal("storefrontVisible", true),
        Query.limit(1)
      ],
      total: false,
      ttl: 0
    });
    if (visible.rows.length) {
      throw new MutationContractError(
        "CLEANUP_FAILED",
        "Product remained publicly discoverable while hiding."
      );
    }
    if (current.imageFileId) {
      try {
        await dependencies.storage.updateFile({
          bucketId,
          fileId: current.imageFileId,
          permissions: productImagePrivatePermissions()
        });
        mapImageFile(
          await dependencies.storage.getFile({ bucketId, fileId: current.imageFileId }),
          current.imageFileId,
          false
        );
        const anonymous = await dependencies.fetchAnonymousFile(current.imageFileId);
        if (![401, 403, 404].includes(anonymous.status)) {
          throw new Error("anonymous access remained available");
        }
      } catch {
        throw new MutationContractError(
          "CLEANUP_FAILED",
          "Product is hidden but public image access could not be removed."
        );
      }
    }
    await emit({
      eventType: "product.hidden",
      entityType: "product",
      entityId: product.id,
      identity,
      timestamp: dependencies.now(),
      requestId: command.idempotencyKey,
      before: {
        storefrontVisible: current.storefrontVisible,
        feedVisible: current.feedVisible
      },
      after: { storefrontVisible: false, feedVisible: false },
      result: "succeeded"
    });
    return product;
  }

  async function setMerchandising(
    request: unknown,
    identity: AuthenticatedStaffIdentity,
    context: ProductLifecycleExecutionContext = APPLICATION_PRODUCT_LIFECYCLE_CONTEXT
  ) {
    begin(identity, "edit_product", context);
    const command = planMerchandisingMutation(request);
    assertPhase3XResourceAllowed(context, "product", command.productId);
    const current = await readProduct(dependencies, command.productId);
    if (current.updatedAt !== command.expectedUpdatedAt) {
      const same = Object.entries(command.patch).every(
        ([key, value]) => current[key as keyof ProductMutationDto] === value
      );
      if (same) return current;
      throw new MutationContractError("STALE_WRITE", "Product has changed.");
    }
    if (command.patch.feedVisible && !current.storefrontVisible) {
      throw new MutationContractError(
        "REFERENCE_CONFLICT",
        "Feed visibility requires a public storefront product.",
        "feedVisible"
      );
    }
    await updateProductInTransaction({
      dependencies,
      current,
      expectedUpdatedAt: command.expectedUpdatedAt,
      data: command.patch,
      permissions: productPermissionsForVisibility(current.storefrontVisible),
      identity
    });
    return waitForProduct(
      dependencies,
      current.id,
      (candidate) =>
        Object.entries(command.patch).every(
          ([key, value]) => candidate[key as keyof ProductMutationDto] === value
        ) && candidate.chosenSelectionKey === current.chosenSelectionKey
    );
  }

  async function readChosenRows(transactionId?: string) {
    const result = await dependencies.tables.listRows({
      databaseId,
      tableId: productsTableId,
      queries: [Query.equal("chosenSelectionKey", "current"), Query.limit(3)],
      total: false,
      ttl: 0,
      ...(transactionId ? { transactionId } : {})
    });
    if (result.rows.length > 1) {
      throw new MutationContractError(
        "DEPENDENCY_FAILED",
        "More than one chosen product exists; selection is unsafe."
      );
    }
    return result.rows.map((row) => mapLifecycleProduct(row));
  }

  async function verifyChosenTarget(targetProductId: string) {
    const chosen = await readChosenRows();
    if (chosen.length !== 1 || chosen[0].id !== targetProductId) {
      throw new MutationContractError(
        "DEPENDENCY_FAILED",
        "Chosen-product invariant did not materialize."
      );
    }
    return chosen[0];
  }

  async function selectChosenProduct(
    request: unknown,
    identity: AuthenticatedStaffIdentity,
    context: ProductLifecycleExecutionContext = APPLICATION_PRODUCT_LIFECYCLE_CONTEXT
  ): Promise<ChosenProductMutationDto> {
    begin(identity, "select_chosen_product", context);
    const command = planChosenProductMutation(request);
    assertPhase3XResourceAllowed(context, "product", command.targetProductId);
    const beforeChosen = await readChosenRows();
    if (beforeChosen[0]?.id === command.targetProductId) {
      return {
        selectedProduct: beforeChosen[0],
        previousProductId: command.targetProductId,
        selectedCount: 1,
        outcome: "already_selected"
      };
    }
    const initialTarget = await readProduct(dependencies, command.targetProductId);
    if (initialTarget.updatedAt !== command.expectedTargetUpdatedAt) {
      throw new MutationContractError("STALE_WRITE", "Chosen target has changed.");
    }
    const transactionId = (await dependencies.tables.createTransaction({ ttl: 60 })).$id;
    let staged = false;
    let commitAttempted = false;
    let previousId: string | null = null;
    try {
      const target = await readProduct(dependencies, command.targetProductId, transactionId);
      if (target.updatedAt !== command.expectedTargetUpdatedAt) {
        throw new MutationContractError("STALE_WRITE", "Chosen target has changed.");
      }
      const selected = await readChosenRows(transactionId);
      previousId = selected[0]?.id ?? null;
      if (previousId === target.id) {
        await discardTransaction(dependencies, transactionId);
        return {
          selectedProduct: selected[0],
          previousProductId: previousId,
          selectedCount: 1,
          outcome: "already_selected"
        };
      }
      const timestamp = dependencies.now();
      if (selected[0]) {
        await dependencies.tables.updateRow({
          databaseId,
          tableId: productsTableId,
          rowId: selected[0].id,
          data: {
            chosenSelectionKey: selected[0].id,
            updatedAt: timestamp,
            updatedByName: identity.name
          },
          permissions: productPermissionsForVisibility(selected[0].storefrontVisible),
          transactionId
        });
      }
      await dependencies.tables.updateRow({
        databaseId,
        tableId: productsTableId,
        rowId: target.id,
        data: {
          chosenSelectionKey: "current",
          updatedAt: timestamp,
          updatedByName: identity.name
        },
        permissions: productPermissionsForVisibility(target.storefrontVisible),
        transactionId
      });
      staged = true;
      commitAttempted = true;
      await commitTransaction(dependencies, transactionId);
      const selectedProduct = await verifyChosenTarget(target.id);
      if (previousId && previousId !== target.id) {
        const previous = await readProduct(dependencies, previousId);
        if (previous.chosenSelectionKey !== previous.id) {
          throw new MutationContractError(
            "DEPENDENCY_FAILED",
            "Previous chosen product did not return to its own key."
          );
        }
      }
      await emit({
        eventType: "product.chosen_changed",
        entityType: "product",
        entityId: target.id,
        identity,
        timestamp,
        requestId: command.idempotencyKey,
        before: { selectedProductId: previousId },
        after: { selectedProductId: target.id },
        result: "succeeded"
      });
      return {
        selectedProduct,
        previousProductId: previousId,
        selectedCount: 1,
        outcome: "selected"
      };
    } catch (error) {
      if (!commitAttempted) {
        if (staged) await rollbackTransaction(dependencies, transactionId);
        else await discardTransaction(dependencies, transactionId);
      } else {
        try {
          const selectedProduct = await verifyChosenTarget(command.targetProductId);
          return {
            selectedProduct,
            previousProductId: previousId,
            selectedCount: 1,
            outcome: "commit_outcome_recovered"
          };
        } catch {
          // A committed transaction is atomic; never perform sequential restoration.
        }
      }
      return classify(error);
    }
  }

  return {
    uploadAndAttachImage,
    replaceImage,
    removeImage,
    cleanupOrphanFile,
    setStorefrontVisibility,
    setMerchandising,
    selectChosenProduct,
    validateProductImage,
    readChosenRows
  };
}
