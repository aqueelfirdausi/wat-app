import { randomBytes } from "node:crypto";
import { access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { AppwriteException, Permission, Query, Role } from "node-appwrite";
import {
  parseAdminCatalogueVerificationArguments,
  runDisposableAdminCatalogueLifecycle,
  type DisposableAdminCatalogueIds
} from "@/lib/appwrite/admin-catalogue-verification";
import { sanitizeBootstrapText, validateBootstrapEnvironment } from "@/lib/appwrite/bootstrap";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import { getAppwriteDataServices } from "@/lib/appwrite/server";

loadEnvConfig(process.cwd());

const DONE_PATH = join(tmpdir(), "wat-phase-3t-admin-catalogue.done");

function staffReadPermissions() {
  return [
    Permission.read(Role.team(APPWRITE_DEFAULT_RESOURCE_IDS.team, "admin")),
    Permission.read(Role.team(APPWRITE_DEFAULT_RESOURCE_IDS.team, "product_editor"))
  ];
}

function publicReadPermissions() {
  return [Permission.read(Role.any()), ...staffReadPermissions()];
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const mode = parseAdminCatalogueVerificationArguments(process.argv.slice(2));
  const configuration = validateBootstrapEnvironment(process.env);
  if (
    configuration.endpoint !== "https://fra.cloud.appwrite.io/v1" ||
    process.env.WAT_BACKEND !== "appwrite" ||
    process.env.WAT_MUTATIONS_ENABLED !== "false"
  ) {
    throw new Error("Admin catalogue verification is locked to read-only Frankfurt Appwrite mode.");
  }
  if (
    APPWRITE_DEFAULT_RESOURCE_IDS.database !== "wat_app" ||
    APPWRITE_DEFAULT_RESOURCE_IDS.tables.products !== "products" ||
    APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories !== "categories"
  ) {
    throw new Error("Admin catalogue verification resource IDs are invalid.");
  }

  if (!mode.apply) {
    console.log(JSON.stringify({
      mode: "read-only",
      writeActions: [],
      summary: "Admin catalogue verification preflight complete; no writes were performed."
    }, null, 2));
    return;
  }

  const suffix = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`.slice(-10);
  const ids: DisposableAdminCatalogueIds = {
    categoryId: `PHASE-3T-DISPOSABLE-C-${suffix}`,
    publicProductId: `PHASE-3T-DISPOSABLE-P-${suffix}`,
    hiddenProductId: `PHASE-3T-DISPOSABLE-H-${suffix}`,
    publicSlug: `phase-3t-disposable-public-${suffix}`,
    hiddenSlug: `phase-3t-disposable-hidden-${suffix}`
  };
  const { tables } = getAppwriteDataServices();
  const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
  const productsTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.products;
  const categoriesTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories;
  const now = new Date().toISOString();

  async function counts() {
    const [products, categories] = await Promise.all([
      tables.listRows({
        databaseId,
        tableId: productsTableId,
        queries: [Query.limit(1)],
        total: true
      }),
      tables.listRows({
        databaseId,
        tableId: categoriesTableId,
        queries: [Query.limit(1)],
        total: true
      })
    ]);
    return { products: products.total, categories: categories.total };
  }

  async function notFound(promise: Promise<unknown>) {
    try {
      await promise;
      return false;
    } catch (error) {
      return error instanceof AppwriteException && error.code === 404;
    }
  }

  await rm(DONE_PATH, { force: true });
  try {
    const result = await runDisposableAdminCatalogueLifecycle({
      ids,
      dependencies: {
        counts,
        async createCategory(values) {
          await tables.createRow({
            databaseId,
            tableId: categoriesTableId,
            rowId: values.categoryId,
            data: {
              name: "PHASE-3T-DISPOSABLE-CATEGORY",
              slug: `phase-3t-disposable-category-${suffix}`,
              updatedAt: now
            },
            permissions: publicReadPermissions()
          });
        },
        async createPublicProduct(values) {
          await tables.createRow({
            databaseId,
            tableId: productsTableId,
            rowId: values.publicProductId,
            data: {
              name: "PHASE-3T-DISPOSABLE-PUBLIC-PRODUCT",
              slug: values.publicSlug,
              description: "Synthetic Phase 3T public browser-verification row.",
              brand: "eko",
              categoryId: values.categoryId,
              categoryName: "PHASE-3T-DISPOSABLE-CATEGORY",
              price: 1,
              currency: "PKR",
              condition: "New",
              stockStatus: "in_stock",
              featured: true,
              statusPick: true,
              storefrontVisible: true,
              feedVisible: true,
              sortPriority: 1,
              chosenSelectionKey: values.publicProductId,
              createdAt: now,
              updatedAt: now
            },
            permissions: publicReadPermissions()
          });
        },
        async createHiddenProduct(values) {
          await tables.createRow({
            databaseId,
            tableId: productsTableId,
            rowId: values.hiddenProductId,
            data: {
              name: "PHASE-3T-DISPOSABLE-HIDDEN-PRODUCT",
              slug: values.hiddenSlug,
              description: "Synthetic Phase 3T private browser-verification row.",
              brand: "eko",
              categoryId: values.categoryId,
              categoryName: "PHASE-3T-DISPOSABLE-CATEGORY",
              price: 2,
              currency: "PKR",
              condition: "Used",
              stockStatus: "sold_out",
              featured: false,
              statusPick: false,
              storefrontVisible: false,
              feedVisible: false,
              sortPriority: 2,
              chosenSelectionKey: values.hiddenProductId,
              createdAt: now,
              updatedAt: now
            },
            permissions: staffReadPermissions()
          });
        },
        async verifyRows(values) {
          const [category, publicProduct, hiddenProduct] = await Promise.all([
            tables.getRow({ databaseId, tableId: categoriesTableId, rowId: values.categoryId }),
            tables.getRow({ databaseId, tableId: productsTableId, rowId: values.publicProductId }),
            tables.getRow({ databaseId, tableId: productsTableId, rowId: values.hiddenProductId })
          ]);
          return (
            category.$id === values.categoryId &&
            publicProduct.$id === values.publicProductId &&
            hiddenProduct.$id === values.hiddenProductId &&
            publicProduct.$permissions.includes(Permission.read(Role.any())) &&
            !hiddenProduct.$permissions.includes(Permission.read(Role.any()))
          );
        },
        holdForBrowser: mode.holdSeconds
          ? async (values) => {
              console.log(JSON.stringify({
                event: "browser-ready",
                publicSlug: values.publicSlug,
                hiddenSlug: values.hiddenSlug,
                holdSeconds: mode.holdSeconds,
                donePath: DONE_PATH
              }));
              const deadline = Date.now() + mode.holdSeconds * 1000;
              while (Date.now() < deadline && !(await exists(DONE_PATH))) {
                await new Promise((resolve) => setTimeout(resolve, 250));
              }
              if (!(await exists(DONE_PATH))) {
                throw new Error("Browser verification did not finish before cleanup.");
              }
            }
          : undefined,
        async deleteProduct(id) {
          await tables.deleteRow({ databaseId, tableId: productsTableId, rowId: id });
        },
        async deleteCategory(id) {
          await tables.deleteRow({ databaseId, tableId: categoriesTableId, rowId: id });
        },
        productIsMissing: (id) =>
          notFound(tables.getRow({ databaseId, tableId: productsTableId, rowId: id })),
        categoryIsMissing: (id) =>
          notFound(tables.getRow({ databaseId, tableId: categoriesTableId, rowId: id }))
      }
    });
    console.log(JSON.stringify({
      mode: "disposable-admin-catalogue",
      categoryCreated: result.categoryCreated,
      publicProductCreated: result.publicProductCreated,
      hiddenProductCreated: result.hiddenProductCreated,
      rowsVerified: result.rowsVerified,
      browserHoldCompleted: result.browserHoldCompleted,
      cleanupVerified: result.cleanupVerified
    }, null, 2));
  } finally {
    await rm(DONE_PATH, { force: true });
  }
}

main().catch((error) => {
  console.error(sanitizeBootstrapText(error, [
    process.env.APPWRITE_DATA_API_KEY ?? "",
    process.env.APPWRITE_BOOTSTRAP_API_KEY ?? "",
    process.env.APPWRITE_AUTH_API_KEY ?? ""
  ]));
  process.exitCode = 1;
});
