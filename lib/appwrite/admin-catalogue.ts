import "server-only";

import { Query } from "node-appwrite";
import {
  buildPublicAppwriteFileViewUrl,
  classifyAppwriteProductImageFile,
  isValidAppwriteId,
  safeLegacyProductImageUrl,
  type AppwriteReadStorage
} from "@/lib/appwrite/product-image";
import { hasExactPublicReadPermission } from "@/lib/appwrite/public-permissions";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";
import { isAppwriteApplicationRole } from "@/lib/appwrite/schema";
import { getAppwriteDataServices } from "@/lib/appwrite/server";
import type { BackendMode } from "@/lib/backend/mode";

const PAGE_SIZE = 100;
const MAX_ROWS = 1000;

type AppwriteAdminRow = Record<string, unknown> & {
  $id: string;
  $permissions?: unknown;
};

export interface AppwriteAdminTables {
  listRows(input: {
    databaseId: string;
    tableId: string;
    queries?: string[];
    total?: boolean;
  }): Promise<{ rows: AppwriteAdminRow[]; total?: number }>;
}

export type AdminProductImageState =
  | "none"
  | "public"
  | "private"
  | "legacy_public"
  | "unavailable";

export type AppwriteAdminProduct = {
  key: string;
  name: string;
  slug: string;
  description: string;
  brand: "univercell" | "eko";
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
  chosenState: "selected" | "not_selected";
  isPubliclyReadable: boolean;
  hasImage: boolean;
  imageState: AdminProductImageState;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
  createdByName?: string;
  updatedByName?: string;
};

export type AppwriteAdminCategory = {
  key: string;
  name: string;
  slug: string;
  isPubliclyReadable: boolean;
  productCount: number;
  updatedAt: string;
};

export type AppwriteAdminCatalogueSummary = {
  totalProducts: number;
  totalCategories: number;
  publicProducts: number;
  hiddenProducts: number;
  inStockProducts: number;
  lowStockProducts: number;
  soldOutProducts: number;
  featuredProducts: number;
  statusPickProducts: number;
  productsWithImages: number;
  productsWithoutImages: number;
};

export type AppwriteAdminCatalogue = {
  products: AppwriteAdminProduct[];
  categories: AppwriteAdminCategory[];
  summary: AppwriteAdminCatalogueSummary;
};

type AdminCatalogueDependencies = {
  tables?: AppwriteAdminTables;
  storage?: AppwriteReadStorage;
  endpoint?: string;
  projectId?: string;
};

function invalidRow(): never {
  throw new Error("Invalid Appwrite admin catalogue row.");
}

function requiredString(row: AppwriteAdminRow, key: string) {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) invalidRow();
  return value;
}

function optionalString(row: AppwriteAdminRow, key: string) {
  const value = row[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") invalidRow();
  return value;
}

function requiredBoolean(row: AppwriteAdminRow, key: string) {
  if (typeof row[key] !== "boolean") invalidRow();
  return row[key] as boolean;
}

function requiredDate(row: AppwriteAdminRow, key: string) {
  const value = requiredString(row, key);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalidRow();
  return date.toISOString();
}

function permissionState(row: AppwriteAdminRow) {
  if (
    !Array.isArray(row.$permissions) ||
    row.$permissions.some((permission) => typeof permission !== "string")
  ) {
    invalidRow();
  }
  return hasExactPublicReadPermission(row.$permissions);
}

async function listAllRows(tables: AppwriteAdminTables, tableId: string) {
  const rows: AppwriteAdminRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const result = await tables.listRows({
      databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database,
      tableId,
      queries: [Query.limit(PAGE_SIZE), Query.offset(offset)],
      total: true
    });
    if (!Array.isArray(result.rows)) throw new Error("Invalid Appwrite row result.");
    rows.push(...result.rows);
    if (
      result.rows.length < PAGE_SIZE ||
      (typeof result.total === "number" && rows.length >= result.total)
    ) {
      return rows;
    }
  }
  throw new Error("Appwrite admin catalogue exceeds the bounded read limit.");
}

function validateProductBase(row: AppwriteAdminRow) {
  const id = requiredString(row, "$id");
  const brand = requiredString(row, "brand");
  const currency = requiredString(row, "currency");
  const condition = requiredString(row, "condition");
  const stockStatus = requiredString(row, "stockStatus");
  const price = row.price;
  const sortPriority = row.sortPriority;
  const chosenSelectionKey = requiredString(row, "chosenSelectionKey");
  const imageFileId = optionalString(row, "imageFileId");

  if (!isValidAppwriteId(id)) invalidRow();
  if (brand !== "univercell" && brand !== "eko") invalidRow();
  if (currency !== "PKR") invalidRow();
  if (condition !== "New" && condition !== "Like New" && condition !== "Used") {
    invalidRow();
  }
  if (
    stockStatus !== "in_stock" &&
    stockStatus !== "low_stock" &&
    stockStatus !== "sold_out"
  ) {
    invalidRow();
  }
  if (typeof price !== "number" || !Number.isSafeInteger(price) || price < 0) {
    invalidRow();
  }
  if (
    typeof sortPriority !== "number" ||
    !Number.isSafeInteger(sortPriority) ||
    sortPriority < 0
  ) {
    invalidRow();
  }
  if (chosenSelectionKey !== "current" && chosenSelectionKey !== id) invalidRow();
  if (imageFileId && !isValidAppwriteId(imageFileId)) invalidRow();

  return {
    id,
    name: requiredString(row, "name"),
    slug: requiredString(row, "slug"),
    description: requiredString(row, "description"),
    brand: brand as "univercell" | "eko",
    categoryId: requiredString(row, "categoryId"),
    categoryName: requiredString(row, "categoryName"),
    price,
    currency: currency as "PKR",
    condition: condition as "New" | "Like New" | "Used",
    stockStatus: stockStatus as "in_stock" | "low_stock" | "sold_out",
    featured: requiredBoolean(row, "featured"),
    statusPick: requiredBoolean(row, "statusPick"),
    storefrontVisible: requiredBoolean(row, "storefrontVisible"),
    feedVisible: requiredBoolean(row, "feedVisible"),
    sortPriority,
    chosenState: chosenSelectionKey === "current" ? "selected" as const : "not_selected" as const,
    isPubliclyReadable: permissionState(row),
    imageFileId,
    legacyImageUrl: optionalString(row, "legacyImageUrl"),
    createdAt: requiredDate(row, "createdAt"),
    updatedAt: requiredDate(row, "updatedAt"),
    createdByName: optionalString(row, "createdByName"),
    updatedByName: optionalString(row, "updatedByName")
  };
}

async function mapProduct(
  row: AppwriteAdminRow,
  storage: AppwriteReadStorage,
  endpoint: string,
  projectId: string
): Promise<AppwriteAdminProduct> {
  const product = validateProductBase(row);
  let imageState: AdminProductImageState = "none";
  let imageUrl = "";

  if (product.imageFileId) {
    try {
      const file = await storage.getFile({
        bucketId: APPWRITE_DEFAULT_RESOURCE_IDS.productImagesBucket,
        fileId: product.imageFileId
      });
      const fileState = classifyAppwriteProductImageFile(file, product.imageFileId);
      imageState = fileState === "invalid" ? "unavailable" : fileState;
      if (fileState === "public") {
        imageUrl = buildPublicAppwriteFileViewUrl(product.imageFileId, {
          endpoint,
          projectId
        });
        if (!imageUrl) imageState = "unavailable";
      }
    } catch {
      imageState = "unavailable";
    }
  } else {
    imageUrl = safeLegacyProductImageUrl(product.legacyImageUrl);
    if (imageUrl) imageState = "legacy_public";
  }

  return {
    key: product.slug,
    name: product.name,
    slug: product.slug,
    description: product.description,
    brand: product.brand,
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    price: product.price,
    currency: product.currency,
    condition: product.condition,
    stockStatus: product.stockStatus,
    featured: product.featured,
    statusPick: product.statusPick,
    storefrontVisible: product.storefrontVisible,
    feedVisible: product.feedVisible,
    sortPriority: product.sortPriority,
    chosenState: product.chosenState,
    isPubliclyReadable: product.isPubliclyReadable,
    hasImage: imageState !== "none" && imageState !== "unavailable",
    imageState,
    imageUrl,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    createdByName: product.createdByName,
    updatedByName: product.updatedByName
  };
}

function compareProducts(left: AppwriteAdminProduct, right: AppwriteAdminProduct) {
  return (
    left.sortPriority - right.sortPriority ||
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
    left.slug.localeCompare(right.slug)
  );
}

function compareCategories(left: AppwriteAdminCategory, right: AppwriteAdminCategory) {
  return left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug);
}

function summarize(
  products: AppwriteAdminProduct[],
  categories: AppwriteAdminCategory[]
): AppwriteAdminCatalogueSummary {
  return {
    totalProducts: products.length,
    totalCategories: categories.length,
    publicProducts: products.filter(
      (product) => product.storefrontVisible && product.isPubliclyReadable
    ).length,
    hiddenProducts: products.filter(
      (product) => !product.storefrontVisible || !product.isPubliclyReadable
    ).length,
    inStockProducts: products.filter((product) => product.stockStatus === "in_stock").length,
    lowStockProducts: products.filter((product) => product.stockStatus === "low_stock").length,
    soldOutProducts: products.filter((product) => product.stockStatus === "sold_out").length,
    featuredProducts: products.filter((product) => product.featured).length,
    statusPickProducts: products.filter((product) => product.statusPick).length,
    productsWithImages: products.filter((product) => product.hasImage).length,
    productsWithoutImages: products.filter((product) => !product.hasImage).length
  };
}

export async function loadAppwriteAdminCatalogue(
  identity: AuthenticatedStaffIdentity,
  dependencies: AdminCatalogueDependencies = {}
): Promise<AppwriteAdminCatalogue> {
  if (!isAppwriteApplicationRole(identity.role) || !identity.userId || !identity.email) {
    throw new Error("Authorized Appwrite staff identity is required.");
  }

  const services =
    dependencies.tables && dependencies.storage ? null : getAppwriteDataServices();
  const tables =
    dependencies.tables ?? (services?.tables as unknown as AppwriteAdminTables);
  const storage =
    dependencies.storage ?? (services?.storage as unknown as AppwriteReadStorage);
  const endpoint = dependencies.endpoint ?? process.env.APPWRITE_ENDPOINT;
  const projectId = dependencies.projectId ?? process.env.APPWRITE_PROJECT_ID;
  if (!endpoint || !projectId) throw new Error("Appwrite admin catalogue is unavailable.");

  const [productRows, categoryRows] = await Promise.all([
    listAllRows(tables, APPWRITE_DEFAULT_RESOURCE_IDS.tables.products),
    listAllRows(tables, APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories)
  ]);

  const products = (
    await Promise.all(
      productRows.map(async (row) => {
        try {
          return await mapProduct(row, storage, endpoint, projectId);
        } catch {
          return null;
        }
      })
    )
  ).filter((product): product is AppwriteAdminProduct => product !== null);

  const categoryRecords = categoryRows.flatMap((row) => {
    try {
      const id = requiredString(row, "$id");
      if (!isValidAppwriteId(id)) invalidRow();
      return [{
        id,
        category: {
          key: requiredString(row, "slug"),
          name: requiredString(row, "name"),
          slug: requiredString(row, "slug"),
          isPubliclyReadable: permissionState(row),
          productCount: 0,
          updatedAt: requiredDate(row, "updatedAt")
        }
      }];
    } catch {
      return [];
    }
  });

  const categories = categoryRecords.map(({ id, category }) => ({
    ...category,
    productCount: products.filter((product) => product.categoryId === id).length
  }));

  products.sort(compareProducts);
  categories.sort(compareCategories);
  return { products, categories, summary: summarize(products, categories) };
}

export async function loadBackendAdminCatalogue(
  backend: BackendMode,
  identity: AuthenticatedStaffIdentity,
  dependencies: AdminCatalogueDependencies = {}
) {
  if (backend === "firebase") return null;
  return loadAppwriteAdminCatalogue(identity, dependencies);
}
