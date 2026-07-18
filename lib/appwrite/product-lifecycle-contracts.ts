import {
  MutationContractError,
  type ProductUpdatePatch
} from "@/lib/appwrite/mutation-design";

const APPWRITE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MAX_PRODUCT_IMAGE_BYTES = 1024 * 1024;

export type AcceptedProductImageMime = "image/jpeg" | "image/png" | "image/webp";

export type ProductImageUpload = {
  bytes: Uint8Array;
  mimeType: AcceptedProductImageMime;
  normalizedFilename: string;
  extension: "jpg" | "png" | "webp";
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MutationContractError("VALIDATION_FAILED", "Request must be an object.");
  }
  return value as Record<string, unknown>;
}

function rejectUnknown(value: Record<string, unknown>, allowed: readonly string[]) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      `${unknown} is not accepted.`,
      unknown
    );
  }
}

function appwriteId(value: unknown, field: string) {
  if (typeof value !== "string" || !APPWRITE_ID.test(value)) {
    throw new MutationContractError("VALIDATION_FAILED", `${field} is invalid.`, field);
  }
  return value;
}

function expectedUpdatedAt(value: unknown) {
  if (
    typeof value !== "string" ||
    !ISO_TIMESTAMP.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "expectedUpdatedAt must be an ISO UTC timestamp.",
      "expectedUpdatedAt"
    );
  }
  return new Date(value).toISOString();
}

function idempotencyKey(value: unknown) {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "idempotencyKey must be 8 to 128 safe characters.",
      "idempotencyKey"
    );
  }
  return value;
}

function imageExtension(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match?.[1]?.toLowerCase() ?? "";
}

function signatureMime(bytes: Uint8Array): AcceptedProductImageMime | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function validateProductImage(input: {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
}): ProductImageUpload {
  if (!(input.bytes instanceof Uint8Array) || input.bytes.length === 0) {
    throw new MutationContractError("VALIDATION_FAILED", "Image file is empty.", "file");
  }
  if (input.bytes.length > MAX_PRODUCT_IMAGE_BYTES) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Image exceeds the 1 MiB limit.",
      "file"
    );
  }
  const accepted = ["image/jpeg", "image/png", "image/webp"] as const;
  if (!accepted.includes(input.mimeType as AcceptedProductImageMime)) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Only JPEG, PNG, and WebP images are accepted.",
      "file"
    );
  }
  const detected = signatureMime(input.bytes);
  if (detected !== input.mimeType) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Image signature does not match its MIME type.",
      "file"
    );
  }
  const extension = imageExtension(input.filename);
  const allowedExtensions: Record<AcceptedProductImageMime, readonly string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"]
  };
  if (!allowedExtensions[detected].includes(extension)) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "Image filename extension does not match its MIME type.",
      "file"
    );
  }
  const normalizedExtension = detected === "image/jpeg" ? "jpg" : extension as "png" | "webp";
  return {
    bytes: input.bytes,
    mimeType: detected,
    extension: normalizedExtension,
    normalizedFilename: `wat-product-image.${normalizedExtension}`
  };
}

export type ProductImageMutationCommand = {
  productId: string;
  expectedUpdatedAt: string;
  idempotencyKey: string;
};

export function planProductImageMutation(input: unknown): ProductImageMutationCommand {
  const value = record(input);
  rejectUnknown(value, ["productId", "expectedUpdatedAt", "idempotencyKey"]);
  return {
    productId: appwriteId(value.productId, "productId"),
    expectedUpdatedAt: expectedUpdatedAt(value.expectedUpdatedAt),
    idempotencyKey: idempotencyKey(value.idempotencyKey)
  };
}

export type OrphanCleanupCommand = {
  fileId: string;
  idempotencyKey: string;
};

export function planOrphanCleanup(input: unknown): OrphanCleanupCommand {
  const value = record(input);
  rejectUnknown(value, ["fileId", "idempotencyKey"]);
  return {
    fileId: appwriteId(value.fileId, "fileId"),
    idempotencyKey: idempotencyKey(value.idempotencyKey)
  };
}

export type VisibilityCommand = {
  productId: string;
  expectedUpdatedAt: string;
  storefrontVisible: boolean;
  idempotencyKey: string;
};

export function planVisibilityMutation(input: unknown): VisibilityCommand {
  const value = record(input);
  rejectUnknown(value, [
    "productId",
    "expectedUpdatedAt",
    "storefrontVisible",
    "idempotencyKey"
  ]);
  if (typeof value.storefrontVisible !== "boolean") {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "storefrontVisible must be a boolean.",
      "storefrontVisible"
    );
  }
  return {
    productId: appwriteId(value.productId, "productId"),
    expectedUpdatedAt: expectedUpdatedAt(value.expectedUpdatedAt),
    storefrontVisible: value.storefrontVisible,
    idempotencyKey: idempotencyKey(value.idempotencyKey)
  };
}

export type MerchandisingCommand = {
  productId: string;
  expectedUpdatedAt: string;
  idempotencyKey: string;
  patch: Pick<Partial<ProductUpdatePatch>, "feedVisible" | "featured" | "statusPick">;
};

export function planMerchandisingMutation(input: unknown): MerchandisingCommand {
  const value = record(input);
  rejectUnknown(value, [
    "productId",
    "expectedUpdatedAt",
    "idempotencyKey",
    "feedVisible",
    "featured",
    "statusPick"
  ]);
  const patch: MerchandisingCommand["patch"] = {};
  for (const field of ["feedVisible", "featured", "statusPick"] as const) {
    if (field in value) {
      if (typeof value[field] !== "boolean") {
        throw new MutationContractError(
          "VALIDATION_FAILED",
          `${field} must be a boolean.`,
          field
        );
      }
      patch[field] = value[field];
    }
  }
  if (!Object.keys(patch).length) {
    throw new MutationContractError(
      "VALIDATION_FAILED",
      "At least one merchandising flag is required."
    );
  }
  return {
    productId: appwriteId(value.productId, "productId"),
    expectedUpdatedAt: expectedUpdatedAt(value.expectedUpdatedAt),
    idempotencyKey: idempotencyKey(value.idempotencyKey),
    patch
  };
}

export type ChosenProductCommand = {
  targetProductId: string;
  expectedTargetUpdatedAt: string;
  idempotencyKey: string;
};

export function planChosenProductMutation(input: unknown): ChosenProductCommand {
  const value = record(input);
  rejectUnknown(value, [
    "targetProductId",
    "expectedTargetUpdatedAt",
    "idempotencyKey"
  ]);
  return {
    targetProductId: appwriteId(value.targetProductId, "targetProductId"),
    expectedTargetUpdatedAt: expectedUpdatedAt(value.expectedTargetUpdatedAt),
    idempotencyKey: idempotencyKey(value.idempotencyKey)
  };
}
