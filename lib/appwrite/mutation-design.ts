import type { AppwriteApplicationRole } from "@/lib/appwrite/resources";

export const CATALOGUE_MUTATION_ACTIONS = [
  "read_products",
  "read_categories",
  "create_category",
  "rename_category",
  "delete_category",
  "create_product",
  "edit_product",
  "delete_product",
  "upload_product_image",
  "replace_product_image",
  "remove_product_image",
  "change_storefront_visibility",
  "change_feed_visibility",
  "change_featured",
  "change_status_pick",
  "select_chosen_product",
  "clear_chosen_product",
  "destructive_cleanup",
  "read_activity_logs"
] as const;

export type CatalogueMutationAction = (typeof CATALOGUE_MUTATION_ACTIONS)[number];

const PRODUCT_EDITOR_ACTIONS = new Set<CatalogueMutationAction>([
  "read_products",
  "read_categories",
  "create_category",
  "rename_category",
  "create_product",
  "edit_product",
  "upload_product_image",
  "replace_product_image",
  "remove_product_image",
  "change_storefront_visibility",
  "change_feed_visibility",
  "change_featured",
  "change_status_pick",
  "select_chosen_product",
  "clear_chosen_product"
]);

export function isRoleAuthorizedForAction(
  role: AppwriteApplicationRole,
  action: CatalogueMutationAction
) {
  return role === "admin" || PRODUCT_EDITOR_ACTIONS.has(action);
}

export type MutationErrorCode =
  | "VALIDATION_FAILED"
  | "AUTHORIZATION_FAILED"
  | "CONFLICT"
  | "STALE_WRITE"
  | "REFERENCE_CONFLICT"
  | "NOT_FOUND"
  | "DEPENDENCY_FAILED"
  | "AUDIT_PERSISTENCE_FAILED"
  | "CLEANUP_FAILED"
  | "INTERNAL_ERROR";

export class MutationContractError extends Error {
  constructor(
    readonly code: MutationErrorCode,
    message: string,
    readonly field?: string
  ) {
    super(message);
    this.name = "MutationContractError";
  }
}

const APPWRITE_ID = /^[A-Za-z0-9._-]{1,36}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function record(value: unknown, label = "request"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MutationContractError("VALIDATION_FAILED", `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: readonly string[]) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      `Unknown field: ${unknown.sort()[0]}.`,
      unknown.sort()[0]
    );
  }
}

function requiredString(
  value: unknown,
  field: string,
  maximum: number,
  options: { lowercase?: boolean } = {}
) {
  if (typeof value !== "string") {
    throw new MutationContractError("VALIDATION_FAILED", `${field} must be a string.`, field);
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maximum) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      `${field} must contain 1 to ${maximum} characters.`,
      field
    );
  }
  return options.lowercase ? normalized.toLowerCase() : normalized;
}

function optionalString(value: unknown, field: string, maximum: number) {
  if (value === undefined || value === null || value === "") return null;
  return requiredString(value, field, maximum);
}

function appwriteId(value: unknown, field: string) {
  const normalized = requiredString(value, field, 36);
  if (!APPWRITE_ID.test(normalized)) {
    throw new MutationContractError("VALIDATION_FAILED", `${field} is invalid.`, field);
  }
  return normalized;
}

function idempotencyKey(value: unknown) {
  const normalized = requiredString(value, "idempotencyKey", 128);
  if (!IDEMPOTENCY_KEY.test(normalized)) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "idempotencyKey must be 8 to 128 safe characters.",
      "idempotencyKey"
    );
  }
  return normalized;
}

function expectedUpdatedAt(value: unknown) {
  const normalized = requiredString(value, "expectedUpdatedAt", 32);
  if (!ISO_TIMESTAMP.test(normalized) || Number.isNaN(Date.parse(normalized))) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "expectedUpdatedAt must be an ISO UTC timestamp.",
      "expectedUpdatedAt"
    );
  }
  return normalized;
}

export function slugifyMutationValue(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizedSlug(value: unknown, fallbackName: string) {
  const candidate =
    value === undefined ? slugifyMutationValue(fallbackName) : requiredString(value, "slug", 160, { lowercase: true });
  if (!candidate || candidate.length > 160 || !SLUG.test(candidate)) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "slug must be a non-empty lowercase URL slug.",
      "slug"
    );
  }
  return candidate;
}

export type CategoryCreateCommand = {
  name: string;
  slug: string;
  idempotencyKey: string;
};

export function planCategoryCreate(input: unknown): CategoryCreateCommand {
  const value = record(input);
  rejectUnknownFields(value, ["name", "slug", "idempotencyKey"]);
  const name = requiredString(value.name, "name", 160);
  return {
    name,
    slug: normalizedSlug(value.slug, name),
    idempotencyKey: idempotencyKey(value.idempotencyKey)
  };
}

export type CategoryUpdateCommand = CategoryCreateCommand & {
  categoryId: string;
  expectedUpdatedAt: string;
};

export function planCategoryUpdate(input: unknown): CategoryUpdateCommand {
  const value = record(input);
  rejectUnknownFields(value, [
    "categoryId",
    "name",
    "slug",
    "expectedUpdatedAt",
    "idempotencyKey"
  ]);
  const name = requiredString(value.name, "name", 160);
  return {
    categoryId: appwriteId(value.categoryId, "categoryId"),
    name,
    slug: normalizedSlug(value.slug, name),
    expectedUpdatedAt: expectedUpdatedAt(value.expectedUpdatedAt),
    idempotencyKey: idempotencyKey(value.idempotencyKey)
  };
}

export type CategoryDeleteCommand = {
  categoryId: string;
  expectedUpdatedAt: string;
  idempotencyKey: string;
};

export function planCategoryDelete(input: unknown): CategoryDeleteCommand {
  const value = record(input);
  rejectUnknownFields(value, ["categoryId", "expectedUpdatedAt", "idempotencyKey"]);
  return {
    categoryId: appwriteId(value.categoryId, "categoryId"),
    expectedUpdatedAt: expectedUpdatedAt(value.expectedUpdatedAt),
    idempotencyKey: idempotencyKey(value.idempotencyKey)
  };
}

const PRODUCT_FIELDS = [
  "name",
  "slug",
  "description",
  "brand",
  "preferredContactId",
  "categoryId",
  "price",
  "currency",
  "condition",
  "stockStatus",
  "featured",
  "statusPick",
  "storefrontVisible",
  "feedVisible",
  "sortPriority",
  "imageFileId",
  "idempotencyKey"
] as const;

const FORBIDDEN_PRODUCT_FIELDS = new Set([
  "$id",
  "$permissions",
  "permissions",
  "categoryName",
  "chosenSelectionKey",
  "legacyImageUrl",
  "createdAt",
  "updatedAt",
  "createdByName",
  "updatedByName",
  "actorUserId",
  "actorName",
  "actorRole",
  "firebaseId",
  "createdByUid",
  "updatedByUid",
  "chosenForToday",
  "shopId",
  "tenantId"
]);

export type ProductMutationCommand = {
  name: string;
  slug: string;
  description: string;
  brand: "univercell" | "eko";
  preferredContactId: string | null;
  categoryId: string;
  price: number;
  currency: "PKR";
  condition: "New" | "Like New" | "Used";
  stockStatus: "in_stock" | "low_stock" | "sold_out";
  featured: boolean;
  statusPick: boolean;
  storefrontVisible: boolean;
  feedVisible: boolean;
  sortPriority: number;
  imageFileId: string | null;
  idempotencyKey: string;
};

function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      `${field} must be one of: ${allowed.join(", ")}.`,
      field
    );
  }
  return value as T;
}

function booleanValue(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new MutationContractError("VALIDATION_FAILED", `${field} must be a boolean.`, field);
  }
  return value;
}

function integerValue(value: unknown, field: string, minimum: number) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      `${field} must be a safe integer of at least ${minimum}.`,
      field
    );
  }
  return value;
}

export function planProductMutation(input: unknown): ProductMutationCommand {
  const value = record(input);
  const forbidden = Object.keys(value).find((key) => FORBIDDEN_PRODUCT_FIELDS.has(key));
  if (forbidden) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      `${forbidden} is server-owned or unsupported.`,
      forbidden
    );
  }
  rejectUnknownFields(value, PRODUCT_FIELDS);
  const name = requiredString(value.name, "name", 160);
  const storefrontVisible = booleanValue(value.storefrontVisible, "storefrontVisible");
  const feedVisible = booleanValue(value.feedVisible, "feedVisible");
  if (feedVisible && !storefrontVisible) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "feedVisible cannot be true while storefrontVisible is false.",
      "feedVisible"
    );
  }
  return {
    name,
    slug: normalizedSlug(value.slug, name),
    description: requiredString(value.description, "description", 10_000),
    brand: enumValue(value.brand, "brand", ["univercell", "eko"]),
    preferredContactId: optionalString(value.preferredContactId, "preferredContactId", 64),
    categoryId: appwriteId(value.categoryId, "categoryId"),
    price: integerValue(value.price, "price", 1),
    currency: enumValue(value.currency, "currency", ["PKR"]),
    condition: enumValue(value.condition, "condition", ["New", "Like New", "Used"]),
    stockStatus: enumValue(value.stockStatus, "stockStatus", [
      "in_stock",
      "low_stock",
      "sold_out"
    ]),
    featured: booleanValue(value.featured, "featured"),
    statusPick: booleanValue(value.statusPick, "statusPick"),
    storefrontVisible,
    feedVisible,
    sortPriority: integerValue(value.sortPriority, "sortPriority", 0),
    imageFileId:
      value.imageFileId === undefined || value.imageFileId === null || value.imageFileId === ""
        ? null
        : appwriteId(value.imageFileId, "imageFileId"),
    idempotencyKey: idempotencyKey(value.idempotencyKey)
  };
}

export type ProductCreateCommand = Omit<ProductMutationCommand, "imageFileId"> & {
  imageFileId: null;
};

export function planProductCreate(input: unknown): ProductCreateCommand {
  const command = planProductMutation(input);
  if (command.imageFileId) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "imageFileId is deferred to the image lifecycle phase.",
      "imageFileId"
    );
  }
  if (command.storefrontVisible) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Products cannot be published in this phase.",
      "storefrontVisible"
    );
  }
  if (command.feedVisible) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Products cannot be added to the feed in this phase.",
      "feedVisible"
    );
  }
  return { ...command, imageFileId: null };
}

const PRODUCT_UPDATE_FIELDS = [
  "productId",
  "expectedUpdatedAt",
  "idempotencyKey",
  "name",
  "slug",
  "description",
  "brand",
  "preferredContactId",
  "categoryId",
  "price",
  "currency",
  "condition",
  "stockStatus",
  "featured",
  "statusPick",
  "storefrontVisible",
  "feedVisible",
  "sortPriority"
] as const;

export type ProductUpdatePatch = Partial<
  Omit<ProductCreateCommand, "idempotencyKey" | "imageFileId">
>;

export type ProductUpdateCommand = {
  productId: string;
  expectedUpdatedAt: string;
  idempotencyKey: string;
  patch: ProductUpdatePatch;
};

export function planProductUpdate(input: unknown): ProductUpdateCommand {
  const value = record(input);
  const forbidden = Object.keys(value).find((key) => FORBIDDEN_PRODUCT_FIELDS.has(key));
  if (forbidden) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      `${forbidden} is server-owned or unsupported.`,
      forbidden
    );
  }
  rejectUnknownFields(value, PRODUCT_UPDATE_FIELDS);
  const patch: ProductUpdatePatch = {};
  if ("name" in value) patch.name = requiredString(value.name, "name", 160);
  if ("slug" in value) {
    if (!patch.name && typeof value.slug !== "string") {
      throw new MutationContractError("VALIDATION_FAILED", "slug must be a string.", "slug");
    }
    patch.slug = normalizedSlug(value.slug, patch.name ?? "product");
  }
  if ("description" in value) {
    patch.description = requiredString(value.description, "description", 10_000);
  }
  if ("brand" in value) {
    patch.brand = enumValue<"univercell" | "eko">(
      value.brand,
      "brand",
      ["univercell", "eko"]
    );
  }
  if ("preferredContactId" in value) {
    patch.preferredContactId = optionalString(
      value.preferredContactId,
      "preferredContactId",
      64
    );
  }
  if ("categoryId" in value) patch.categoryId = appwriteId(value.categoryId, "categoryId");
  if ("price" in value) patch.price = integerValue(value.price, "price", 1);
  if ("currency" in value) {
    patch.currency = enumValue<"PKR">(value.currency, "currency", ["PKR"]);
  }
  if ("condition" in value) {
    patch.condition = enumValue<"New" | "Like New" | "Used">(
      value.condition,
      "condition",
      ["New", "Like New", "Used"]
    );
  }
  if ("stockStatus" in value) {
    patch.stockStatus = enumValue<"in_stock" | "low_stock" | "sold_out">(
      value.stockStatus,
      "stockStatus",
      ["in_stock", "low_stock", "sold_out"]
    );
  }
  if ("featured" in value) patch.featured = booleanValue(value.featured, "featured");
  if ("statusPick" in value) patch.statusPick = booleanValue(value.statusPick, "statusPick");
  if ("storefrontVisible" in value) {
    const storefrontVisible = booleanValue(value.storefrontVisible, "storefrontVisible");
    if (storefrontVisible) {
      throw new MutationContractError(
        "VALIDATION_FAILED",
        "Products cannot be published in this phase.",
        "storefrontVisible"
      );
    }
    patch.storefrontVisible = false;
  }
  if ("feedVisible" in value) {
    const feedVisible = booleanValue(value.feedVisible, "feedVisible");
    if (feedVisible) {
      throw new MutationContractError(
        "VALIDATION_FAILED",
        "Products cannot be added to the feed in this phase.",
        "feedVisible"
      );
    }
    patch.feedVisible = false;
  }
  if ("sortPriority" in value) {
    patch.sortPriority = integerValue(value.sortPriority, "sortPriority", 0);
  }
  if (Object.keys(patch).length === 0) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "At least one mutable product field is required."
    );
  }
  return {
    productId: appwriteId(value.productId, "productId"),
    expectedUpdatedAt: expectedUpdatedAt(value.expectedUpdatedAt),
    idempotencyKey: idempotencyKey(value.idempotencyKey),
    patch
  };
}

export type ProductDeleteCommand = {
  productId: string;
  expectedUpdatedAt: string;
  idempotencyKey: string;
};

export function planProductDelete(input: unknown): ProductDeleteCommand {
  const value = record(input);
  rejectUnknownFields(value, ["productId", "expectedUpdatedAt", "idempotencyKey"]);
  return {
    productId: appwriteId(value.productId, "productId"),
    expectedUpdatedAt: expectedUpdatedAt(value.expectedUpdatedAt),
    idempotencyKey: idempotencyKey(value.idempotencyKey)
  };
}

export type PlannedStep = {
  operation: string;
  compensation: string | null;
};

export function planVisibilityTransition(input: {
  productId: string;
  fromPublic: boolean;
  toPublic: boolean;
  imageFileId: string | null;
}): PlannedStep[] {
  appwriteId(input.productId, "productId");
  if (input.fromPublic === input.toPublic) return [];
  if (input.toPublic) {
    return [
      ...(input.imageFileId
        ? [{
            operation: "validate image metadata then grant exact public and staff read",
            compensation: "restore exact staff-only image read"
          }]
        : []),
      {
        operation: "update row flags then grant exact public and staff read",
        compensation: "restore hidden flags and exact staff-only row read"
      }
    ];
  }
  return [
    {
      operation: "remove public row read and set storefrontVisible/feedVisible false",
      compensation: "restore prior flags and exact public/staff row read only if image remains public"
    },
    ...(input.imageFileId
      ? [{
          operation: "remove public image read after row is private",
          compensation: "restore exact public/staff image read only if row restoration succeeded"
        }]
      : [])
  ];
}

export function planImageReplacement(input: {
  productId: string;
  oldFileId: string | null;
  newFileId: string;
  productWillBePublic: boolean;
}): PlannedStep[] {
  appwriteId(input.productId, "productId");
  appwriteId(input.newFileId, "newFileId");
  if (input.oldFileId) appwriteId(input.oldFileId, "oldFileId");
  if (input.oldFileId === input.newFileId) {
    throw new MutationContractError("VALIDATION_FAILED", "Replacement file must be new.", "newFileId");
  }
  return [
    {
      operation: "verify completed private upload metadata, MIME, size, bucket and staff-only permissions",
      compensation: "delete the unattached new file"
    },
    ...(input.productWillBePublic
      ? [{
          operation: "grant exact public and staff read to the new file",
          compensation: "restore staff-only read then delete the unattached new file"
        }]
      : []),
    {
      operation: "attach the new file ID to the product using expectedUpdatedAt",
      compensation: "restore the old file ID if the row still contains the new file ID"
    },
    ...(input.oldFileId
      ? [{
          operation: "make the old file private, then delete it after linkage verification",
          compensation: "record CLEANUP_FAILED and retry orphan cleanup; never detach the new file"
        }]
      : [])
  ];
}

export type ChosenTransitionPlan = {
  preconditions: string[];
  steps: PlannedStep[];
  conflictRecovery: string[];
};

export function planChosenProductTransition(input: {
  targetProductId: string | null;
  previousProductId: string | null;
  expectedTargetUpdatedAt?: string;
}): ChosenTransitionPlan {
  if (input.targetProductId) appwriteId(input.targetProductId, "targetProductId");
  if (input.previousProductId) appwriteId(input.previousProductId, "previousProductId");
  if (input.targetProductId && input.expectedTargetUpdatedAt) {
    expectedUpdatedAt(input.expectedTargetUpdatedAt);
  }
  if (input.targetProductId && input.targetProductId === input.previousProductId) {
    return {
      preconditions: ["target row is still current and expectedUpdatedAt matches"],
      steps: [],
      conflictRecovery: ["return the existing selected DTO for an idempotent retry"]
    };
  }
  const steps: PlannedStep[] = [];
  if (input.previousProductId) {
    steps.push({
      operation: `set previous chosenSelectionKey to its own row ID (${input.previousProductId})`,
      compensation: "roll back the TablesDB transaction"
    });
  }
  if (input.targetProductId) {
    steps.push({
      operation: `set target chosenSelectionKey to current (${input.targetProductId})`,
      compensation: "roll back the TablesDB transaction"
    });
  }
  return {
    preconditions: [
      "use one verified Appwrite TablesDB transaction for both row changes",
      "re-read the unique current row and target inside the transaction",
      "reject stale expectedUpdatedAt values before commit"
    ],
    steps,
    conflictRecovery: [
      "on unique conflict, re-read current and return CONFLICT unless it already equals the target",
      "a losing request must not restore an older selection over a newer winner",
      "roll back the transaction; use manual restoration only if live transaction capability was never entered"
    ]
  };
}

export type ActivityEventInput = {
  eventId: string;
  eventType: string;
  entityType: "product" | "category" | "image";
  entityId: string;
  actor: {
    userId: string;
    displayName: string;
    role: AppwriteApplicationRole;
  };
  timestamp: string;
  requestId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  result: "succeeded" | "failed" | "compensated" | "compensation_failed";
  errorClassification?: MutationErrorCode;
  compensationResult?: string;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_LOG_KEYS =
  /password|secret|token|cookie|api.?key|permission|session|authorization|headers?/i;

function assertLogSafe(value: unknown, path = "event"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertLogSafe(entry, `${path}.${index}`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      `${path} must contain only plain JSON values.`
    );
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith("$") || SENSITIVE_LOG_KEYS.test(key)) {
      throw new MutationContractError(
        "VALIDATION_FAILED",
        `Sensitive activity field is forbidden: ${path}.${key}.`,
        key
      );
    }
    assertLogSafe(nested, `${path}.${key}`);
  }
}

export function buildActivityEvent(input: ActivityEventInput) {
  const eventId = idempotencyKey(input.eventId);
  const requestId = idempotencyKey(input.requestId);
  const timestamp = expectedUpdatedAt(input.timestamp);
  appwriteId(input.entityId, "entityId");
  appwriteId(input.actor.userId, "actor.userId");
  const eventType = requiredString(input.eventType, "eventType", 96);
  const displayName = requiredString(input.actor.displayName, "actor.displayName", 160);
  assertLogSafe(input.before);
  assertLogSafe(input.after);
  assertLogSafe(input.metadata);
  const changedFields = Array.from(
    new Set([
      ...Object.keys(input.before ?? {}),
      ...Object.keys(input.after ?? {})
    ])
  ).filter((key) => input.before?.[key] !== input.after?.[key]).sort();
  return {
    eventId,
    eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    actorUserId: input.actor.userId,
    actorDisplayName: displayName,
    actorRole: input.actor.role,
    timestamp,
    requestId,
    before: input.before,
    after: input.after,
    changedFields,
    result: input.result,
    errorClassification: input.errorClassification ?? null,
    compensationResult: input.compensationResult ?? null,
    metadata: input.metadata ?? null
  };
}
