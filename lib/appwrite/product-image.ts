import "server-only";

import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import { getAppwriteDataServices } from "@/lib/appwrite/server";
import { hasExactPublicReadPermission } from "@/lib/appwrite/public-permissions";

const APPWRITE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;
const MAX_PRODUCT_IMAGE_BYTES = 1024 * 1024;
const STOREFRONT_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

type AppwriteFileMetadata = Record<string, unknown>;

export interface AppwriteReadStorage {
  getFile(input: {
    bucketId: string;
    fileId: string;
  }): Promise<unknown>;
}

export type ProductImageConfiguration = {
  endpoint: string;
  projectId: string;
};

export function isValidAppwriteId(value: unknown): value is string {
  return typeof value === "string" && APPWRITE_ID_PATTERN.test(value);
}

export function safeLegacyProductImageUrl(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return "";

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isFirebaseHost =
      hostname === "firebasestorage.googleapis.com" ||
      hostname.endsWith(".firebaseapp.com") ||
      hostname.endsWith(".firebaseio.com") ||
      hostname.endsWith(".googleapis.com");

    return url.protocol === "https:" && !url.username && !url.password && !isFirebaseHost
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

export function isValidPublicProductImageFile(
  value: unknown,
  expectedFileId: string
): value is AppwriteFileMetadata {
  return (
    classifyAppwriteProductImageFile(value, expectedFileId) === "public"
  );
}

export type AdminProductImageFileState = "public" | "private" | "invalid";

export function classifyAppwriteProductImageFile(
  value: unknown,
  expectedFileId: string
): AdminProductImageFileState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "invalid";

  const file = value as AppwriteFileMetadata;
  if (file.$id !== expectedFileId || !isValidAppwriteId(file.$id)) return "invalid";
  if (file.bucketId !== APPWRITE_DEFAULT_RESOURCE_IDS.productImagesBucket) return "invalid";
  if (!STOREFRONT_IMAGE_MIME_TYPES.has(file.mimeType as string)) return "invalid";
  if (
    typeof file.sizeOriginal !== "number" ||
    !Number.isSafeInteger(file.sizeOriginal) ||
    file.sizeOriginal < 0 ||
    file.sizeOriginal > MAX_PRODUCT_IMAGE_BYTES
  ) {
    return "invalid";
  }
  if (
    typeof file.chunksTotal !== "number" ||
    typeof file.chunksUploaded !== "number" ||
    file.chunksTotal < 1 ||
    file.chunksUploaded !== file.chunksTotal
  ) {
    return "invalid";
  }
  if (file.deleted === true || (file.$deletedAt !== undefined && file.$deletedAt !== null && file.$deletedAt !== "")) {
    return "invalid";
  }
  if (
    !Array.isArray(file.$permissions) ||
    file.$permissions.some((permission) => typeof permission !== "string")
  ) {
    return "invalid";
  }

  return hasExactPublicReadPermission(file.$permissions) ? "public" : "private";
}

export function buildPublicAppwriteFileViewUrl(
  fileId: string,
  configuration: ProductImageConfiguration
) {
  if (!isValidAppwriteId(fileId) || !isValidAppwriteId(configuration.projectId)) {
    return "";
  }

  let endpoint: URL;
  try {
    endpoint = new URL(configuration.endpoint);
  } catch {
    return "";
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname.replace(/\/+$/, "") !== "/v1"
  ) {
    return "";
  }

  const viewUrl = new URL(
    `${endpoint.origin}/v1/storage/buckets/${encodeURIComponent(APPWRITE_DEFAULT_RESOURCE_IDS.productImagesBucket)}/files/${encodeURIComponent(fileId)}/view`
  );
  viewUrl.searchParams.set("project", configuration.projectId);
  return viewUrl.toString();
}

function defaultStorage(): AppwriteReadStorage {
  return getAppwriteDataServices().storage as unknown as AppwriteReadStorage;
}

function defaultConfiguration(): ProductImageConfiguration | null {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  return endpoint && projectId ? { endpoint, projectId } : null;
}

export async function resolvePublicAppwriteProductImage(input: {
  productVisible: boolean;
  productPermissions: unknown;
  imageFileId: unknown;
  legacyImageUrl: unknown;
  storage?: AppwriteReadStorage;
  configuration?: ProductImageConfiguration | null;
}) {
  if (!input.productVisible || !hasExactPublicReadPermission(input.productPermissions)) {
    return "";
  }

  if (input.imageFileId === undefined || input.imageFileId === null || input.imageFileId === "") {
    return safeLegacyProductImageUrl(input.legacyImageUrl);
  }
  if (!isValidAppwriteId(input.imageFileId)) return "";

  const configuration = input.configuration === undefined
    ? defaultConfiguration()
    : input.configuration;
  if (!configuration) return "";

  try {
    const file = await (input.storage ?? defaultStorage()).getFile({
      bucketId: APPWRITE_DEFAULT_RESOURCE_IDS.productImagesBucket,
      fileId: input.imageFileId
    });
    if (!isValidPublicProductImageFile(file, input.imageFileId)) return "";
    return buildPublicAppwriteFileViewUrl(input.imageFileId, configuration);
  } catch {
    return "";
  }
}
