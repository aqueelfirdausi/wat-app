import "server-only";

import { Query } from "node-appwrite";
import { getAppwriteDataServices } from "@/lib/appwrite/server";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import type { PublicCategory, PublicProduct } from "@/lib/types";

type AppwriteRow = Record<string, unknown> & {
  $id: string;
  $permissions?: unknown;
};

export interface AppwriteReadTables {
  listRows(input: {
    databaseId: string;
    tableId: string;
    queries?: string[];
    total?: boolean;
  }): Promise<{ rows: AppwriteRow[] }>;
}

function requiredString(row: AppwriteRow, key: string) {
  const value = row[key];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("Invalid Appwrite row data.");
  return value;
}

function optionalString(row: AppwriteRow, key: string) {
  const value = row[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Invalid Appwrite row data.");
  return value;
}

function requiredBoolean(row: AppwriteRow, key: string) {
  if (typeof row[key] !== "boolean") throw new Error("Invalid Appwrite row data.");
  return row[key] as boolean;
}

function appwriteDate(row: AppwriteRow, key: string) {
  const value = requiredString(row, key);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid Appwrite row data.");
  return date;
}

function hasPublicReadPermission(row: AppwriteRow) {
  return Array.isArray(row.$permissions) && row.$permissions.includes('read("any")');
}

function safeLegacyImageUrl(row: AppwriteRow) {
  const value = optionalString(row, "legacyImageUrl");
  if (!value) return "";

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isFirebaseHost =
      hostname === "firebasestorage.googleapis.com" ||
      hostname.endsWith(".firebaseapp.com") ||
      hostname.endsWith(".firebaseio.com") ||
      hostname.endsWith(".googleapis.com");

    return url.protocol === "https:" && !isFirebaseHost ? url.toString() : "";
  } catch {
    throw new Error("Invalid Appwrite row data.");
  }
}

export function mapAppwriteProductRow(row: AppwriteRow): PublicProduct {
  const brand = requiredString(row, "brand");
  const condition = requiredString(row, "condition");
  const stockStatus = requiredString(row, "stockStatus");
  const price = row.price;
  const currency = requiredString(row, "currency");
  const sortPriority = row.sortPriority;
  if (brand !== "univercell" && brand !== "eko") throw new Error("Invalid Appwrite row data.");
  if (condition !== "New" && condition !== "Like New" && condition !== "Used") throw new Error("Invalid Appwrite row data.");
  if (stockStatus !== "in_stock" && stockStatus !== "low_stock" && stockStatus !== "sold_out") {
    throw new Error("Invalid Appwrite row data.");
  }
  if (typeof price !== "number" || !Number.isSafeInteger(price) || price < 0) {
    throw new Error("Invalid Appwrite row data.");
  }
  if (currency !== "PKR") throw new Error("Invalid Appwrite row data.");
  if (typeof sortPriority !== "number" || !Number.isSafeInteger(sortPriority) || sortPriority < 0) {
    throw new Error("Invalid Appwrite row data.");
  }
  requiredString(row, "$id");
  requiredString(row, "categoryId");
  requiredString(row, "chosenSelectionKey");
  requiredBoolean(row, "statusPick");
  optionalString(row, "imageFileId");
  optionalString(row, "createdByName");
  optionalString(row, "updatedByName");

  return {
    id: requiredString(row, "slug"),
    name: requiredString(row, "name"),
    slug: requiredString(row, "slug"),
    description: requiredString(row, "description"),
    brand,
    preferredContactId: optionalString(row, "preferredContactId"),
    categoryName: requiredString(row, "categoryName"),
    price,
    currency,
    condition,
    stockStatus,
    featured: requiredBoolean(row, "featured"),
    storefrontVisible: requiredBoolean(row, "storefrontVisible"),
    feedVisible: requiredBoolean(row, "feedVisible"),
    sortPriority,
    imageUrl: safeLegacyImageUrl(row),
    createdAt: appwriteDate(row, "createdAt"),
    updatedAt: appwriteDate(row, "updatedAt")
  };
}

export function mapAppwriteCategoryRow(row: AppwriteRow): PublicCategory {
  appwriteDate(row, "updatedAt");
  return {
    id: requiredString(row, "slug"),
    name: requiredString(row, "name"),
    slug: requiredString(row, "slug")
  };
}

function defaultTables(): AppwriteReadTables {
  return getAppwriteDataServices().tables as unknown as AppwriteReadTables;
}

export async function listAppwriteProducts(tables: AppwriteReadTables = defaultTables()) {
  const result = await tables.listRows({
    databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database,
    tableId: APPWRITE_DEFAULT_RESOURCE_IDS.tables.products,
    queries: [Query.equal("storefrontVisible", true), Query.orderDesc("updatedAt")],
    total: false
  });
  return result.rows.flatMap((row) => {
    if (!hasPublicReadPermission(row)) return [];
    try {
      const product = mapAppwriteProductRow(row);
      return product.storefrontVisible ? [product] : [];
    } catch {
      return [];
    }
  });
}

export async function getAppwriteProductBySlug(slug: string, tables: AppwriteReadTables = defaultTables()) {
  if (!slug.trim()) return null;
  const result = await tables.listRows({
    databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database,
    tableId: APPWRITE_DEFAULT_RESOURCE_IDS.tables.products,
    queries: [
      Query.equal("slug", slug),
      Query.equal("storefrontVisible", true),
      Query.limit(1)
    ],
    total: false
  });
  const row = result.rows[0];
  if (!row || !hasPublicReadPermission(row)) return null;
  try {
    const product = mapAppwriteProductRow(row);
    return product.storefrontVisible ? product : null;
  } catch {
    return null;
  }
}

export async function listAppwriteCategories(tables: AppwriteReadTables = defaultTables()) {
  const result = await tables.listRows({
    databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database,
    tableId: APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories,
    queries: [Query.orderAsc("name")],
    total: false
  });
  return result.rows.flatMap((row) => {
    if (!hasPublicReadPermission(row)) return [];
    try {
      return [mapAppwriteCategoryRow(row)];
    } catch {
      return [];
    }
  });
}

export async function getAppwriteCategoryBySlugOrId(
  identifier: string,
  tables: AppwriteReadTables = defaultTables()
) {
  if (!identifier.trim()) return null;
  const result = await tables.listRows({
    databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database,
    tableId: APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories,
    queries: [
      Query.or([Query.equal("$id", identifier), Query.equal("slug", identifier)]),
      Query.limit(1)
    ],
    total: false
  });
  const row = result.rows[0];
  if (!row || !hasPublicReadPermission(row)) return null;
  try {
    return mapAppwriteCategoryRow(row);
  } catch {
    return null;
  }
}
