import "server-only";

import { Query } from "node-appwrite";
import { getAppwriteDataServices } from "@/lib/appwrite/server";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import type { Category, Product } from "@/lib/types";

type AppwriteRow = Record<string, unknown> & { $id: string };

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
  if (typeof value !== "string" || value.length === 0) throw new Error("Invalid Appwrite row data.");
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

export function mapAppwriteProductRow(row: AppwriteRow): Product {
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
  if (typeof price !== "number" || !Number.isSafeInteger(price)) throw new Error("Invalid Appwrite row data.");
  if (currency !== "PKR") throw new Error("Invalid Appwrite row data.");
  if (typeof sortPriority !== "number" || !Number.isSafeInteger(sortPriority)) {
    throw new Error("Invalid Appwrite row data.");
  }

  return {
    id: requiredString(row, "$id"),
    name: requiredString(row, "name"),
    slug: requiredString(row, "slug"),
    description: requiredString(row, "description"),
    brand,
    preferredContactId: optionalString(row, "preferredContactId"),
    categoryId: requiredString(row, "categoryId"),
    categoryName: requiredString(row, "categoryName"),
    price,
    currency,
    condition,
    stockStatus,
    featured: requiredBoolean(row, "featured"),
    statusPick: requiredBoolean(row, "statusPick"),
    chosenForToday: requiredString(row, "chosenSelectionKey") === "current",
    storefrontVisible: requiredBoolean(row, "storefrontVisible"),
    feedVisible: requiredBoolean(row, "feedVisible"),
    sortPriority,
    imageUrl: optionalString(row, "legacyImageUrl") ?? "",
    createdAt: appwriteDate(row, "createdAt"),
    updatedAt: appwriteDate(row, "updatedAt"),
    createdByName: optionalString(row, "createdByName"),
    updatedByName: optionalString(row, "updatedByName")
  };
}

export function mapAppwriteCategoryRow(row: AppwriteRow): Category {
  appwriteDate(row, "updatedAt");
  return {
    id: requiredString(row, "$id"),
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
    queries: [Query.orderDesc("updatedAt")],
    total: false
  });
  return result.rows.map(mapAppwriteProductRow);
}

export async function getAppwriteProductBySlug(slug: string, tables: AppwriteReadTables = defaultTables()) {
  if (!slug.trim()) return null;
  const result = await tables.listRows({
    databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database,
    tableId: APPWRITE_DEFAULT_RESOURCE_IDS.tables.products,
    queries: [Query.equal("slug", slug), Query.limit(1)],
    total: false
  });
  return result.rows[0] ? mapAppwriteProductRow(result.rows[0]) : null;
}

export async function listAppwriteCategories(tables: AppwriteReadTables = defaultTables()) {
  const result = await tables.listRows({
    databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database,
    tableId: APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories,
    queries: [Query.orderAsc("name")],
    total: false
  });
  return result.rows.map(mapAppwriteCategoryRow);
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
  return result.rows[0] ? mapAppwriteCategoryRow(result.rows[0]) : null;
}
