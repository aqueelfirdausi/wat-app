import { randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { AppwriteException, Query } from "node-appwrite";
import {
  createPhase3VCategoryVerificationContext
} from "@/lib/appwrite/category-verification-context";
import {
  APPWRITE_CATEGORY_STAFF_READ_PERMISSIONS,
  hasExactCategoryPermissions
} from "@/lib/appwrite/category-permissions";
import {
  createAppwriteCategoryMutationService,
  type CategoryMutationTables
} from "@/lib/appwrite/category-mutations";
import {
  PHASE3V_FIXTURE_SLUG_PREFIX,
  parseCategoryMutationVerificationArguments,
  runCategoryMutationVerificationLifecycle
} from "@/lib/appwrite/category-mutation-verification";
import { MutationContractError, type MutationErrorCode } from "@/lib/appwrite/mutation-design";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";
import { getAppwriteDataServices } from "@/lib/appwrite/server";
import { sanitizeBootstrapText, validateBootstrapEnvironment } from "@/lib/appwrite/bootstrap";

loadEnvConfig(process.cwd());

const admin: AuthenticatedStaffIdentity = {
  userId: "phase3v_verifier_admin",
  email: "phase3v-verifier-admin@invalid.example",
  name: "Phase 3V verifier",
  role: "admin"
};

const productEditor: AuthenticatedStaffIdentity = {
  ...admin,
  userId: "phase3v_verifier_editor",
  email: "phase3v-verifier-editor@invalid.example",
  role: "product_editor"
};

function codeOf(error: unknown): MutationErrorCode | null {
  return error instanceof MutationContractError ? error.code : null;
}

async function main() {
  const mode = parseCategoryMutationVerificationArguments(process.argv.slice(2));
  const configuration = validateBootstrapEnvironment(process.env);
  if (
    configuration.endpoint !== "https://fra.cloud.appwrite.io/v1" ||
    process.env.WAT_BACKEND !== "appwrite" ||
    process.env.WAT_MUTATIONS_ENABLED !== "false"
  ) {
    throw new Error("Phase 3V verification is locked to mutation-disabled Frankfurt Appwrite mode.");
  }
  if (
    APPWRITE_DEFAULT_RESOURCE_IDS.database !== "wat_app" ||
    APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories !== "categories" ||
    APPWRITE_DEFAULT_RESOURCE_IDS.tables.products !== "products"
  ) {
    throw new Error("Phase 3V fixed resource IDs are invalid.");
  }
  const { tables } = getAppwriteDataServices();
  if (mode === "read-only") {
    const [products, categories] = await Promise.all([
      tables.listRows({
        databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database,
        tableId: APPWRITE_DEFAULT_RESOURCE_IDS.tables.products,
        queries: [Query.startsWith("slug", PHASE3V_FIXTURE_SLUG_PREFIX), Query.limit(100)],
        total: true,
        ttl: 0
      }),
      tables.listRows({
        databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database,
        tableId: APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories,
        queries: [Query.startsWith("slug", PHASE3V_FIXTURE_SLUG_PREFIX), Query.limit(100)],
        total: true,
        ttl: 0
      })
    ]);
    console.log(JSON.stringify({
      mode,
      writeActions: [],
      disposablePrefixMatches: {
        products: await Promise.all(products.rows.map(async (row) => ({
          id: row.$id,
          nameMatches: typeof row.name === "string" && row.name.startsWith("__wat_phase_3v_disposable__"),
          slugMatches: typeof row.slug === "string" && row.slug.startsWith(PHASE3V_FIXTURE_SLUG_PREFIX),
          exactPrivatePermissions: hasExactCategoryPermissions(row.$permissions, "private_fixture"),
          directGetPresent: !(await missingByDirectGet(tables, APPWRITE_DEFAULT_RESOURCE_IDS.tables.products, row.$id))
        }))),
        categories: await Promise.all(categories.rows.map(async (row) => ({
          id: row.$id,
          nameMatches: typeof row.name === "string" && row.name.startsWith("__wat_phase_3v_disposable__"),
          slugMatches: typeof row.slug === "string" && row.slug.startsWith(PHASE3V_FIXTURE_SLUG_PREFIX),
          exactPrivatePermissions: hasExactCategoryPermissions(row.$permissions, "private_fixture"),
          directGetPresent: !(await missingByDirectGet(tables, APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories, row.$id))
        })))
      },
      summary: "Phase 3V preflight complete; both explicit gates are required."
    }, null, 2));
    return;
  }

  const suffix = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`.slice(-8);
  const ids = {
    categoryId: `phase3v_disposable_c_${suffix}`,
    productId: `phase3v_disposable_p_${suffix}`,
    originalName: "__wat_phase_3v_disposable__ Original Category",
    originalSlug: `${PHASE3V_FIXTURE_SLUG_PREFIX}original-${suffix}`,
    renamedName: "__wat_phase_3v_disposable__ Renamed Category",
    renamedSlug: `${PHASE3V_FIXTURE_SLUG_PREFIX}renamed-${suffix}`
  };
  const context = createPhase3VCategoryVerificationContext(ids.categoryId);
  const mutationTables = tables as unknown as CategoryMutationTables;
  const logicalEvents: string[] = [];
  let clock = Date.now();
  const service = createAppwriteCategoryMutationService({
    tables: mutationTables,
    now: () => new Date(clock += 2000).toISOString(),
    emitActivityEvent(event) {
      logicalEvents.push(event.eventType);
    }
  });
  const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
  const categoriesTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories;
  const productsTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.products;

  async function counts() {
    const [products, categories] = await Promise.all([
      tables.listRows({
        databaseId,
        tableId: productsTableId,
        queries: [Query.limit(1)],
        total: true,
        ttl: 0
      }),
      tables.listRows({
        databaseId,
        tableId: categoriesTableId,
        queries: [Query.limit(1)],
        total: true,
        ttl: 0
      })
    ]);
    return { products: products.total, categories: categories.total };
  }

  async function recoverPhase3VOrphans() {
    const [products, categories] = await Promise.all([
      tables.listRows({
        databaseId,
        tableId: productsTableId,
        queries: [Query.startsWith("slug", PHASE3V_FIXTURE_SLUG_PREFIX), Query.limit(100)],
        total: true,
        ttl: 0
      }),
      tables.listRows({
        databaseId,
        tableId: categoriesTableId,
        queries: [Query.startsWith("slug", PHASE3V_FIXTURE_SLUG_PREFIX), Query.limit(100)],
        total: true,
        ttl: 0
      })
    ]);
    for (const row of [...products.rows, ...categories.rows]) {
      if (
        typeof row.$id !== "string" ||
        !row.$id.startsWith("phase3v_disposable_") ||
        typeof row.name !== "string" ||
        !row.name.startsWith("__wat_phase_3v_disposable__") ||
        typeof row.slug !== "string" ||
        !row.slug.startsWith(PHASE3V_FIXTURE_SLUG_PREFIX) ||
        !hasExactCategoryPermissions(row.$permissions, "private_fixture")
      ) {
        throw new Error("Phase 3V prefix matched a row outside the exact disposable contract.");
      }
    }
    for (const row of products.rows) {
      await tables.deleteRow({ databaseId, tableId: productsTableId, rowId: row.$id });
    }
    for (const row of categories.rows) {
      await tables.deleteRow({ databaseId, tableId: categoriesTableId, rowId: row.$id });
    }
    const remaining = await Promise.all([
      tables.listRows({
        databaseId,
        tableId: productsTableId,
        queries: [Query.startsWith("slug", PHASE3V_FIXTURE_SLUG_PREFIX), Query.limit(1)],
        total: true,
        ttl: 0
      }),
      tables.listRows({
        databaseId,
        tableId: categoriesTableId,
        queries: [Query.startsWith("slug", PHASE3V_FIXTURE_SLUG_PREFIX), Query.limit(1)],
        total: true,
        ttl: 0
      })
    ]);
    if (remaining[0].total !== 0 || remaining[1].total !== 0) {
      throw new Error("Phase 3V orphan recovery could not prove cleanup.");
    }
    return { products: products.total, categories: categories.total };
  }

  async function missing(tableId: string, rowId: string) {
    try {
      await tables.getRow({ databaseId, tableId, rowId });
      return false;
    } catch (error) {
      return error instanceof AppwriteException && error.code === 404;
    }
  }

  async function deleteIfPresent(tableId: string, rowId: string) {
    try {
      await tables.deleteRow({ databaseId, tableId, rowId });
    } catch (error) {
      if (!(error instanceof AppwriteException && error.code === 404)) throw error;
    }
  }

  const recoveredOrphans = await recoverPhase3VOrphans();
  if (mode === "disposable-recovery") {
    const finalCounts = await counts();
    if (finalCounts.products !== 0 || finalCounts.categories !== 0) {
      throw new Error("Phase 3V recovery did not restore the zero baseline.");
    }
    console.log(JSON.stringify({
      mode,
      recoveredOrphans,
      finalCounts,
      cleanupVerified: true
    }, null, 2));
    return;
  }
  const result = await runCategoryMutationVerificationLifecycle({
    ids,
    dependencies: {
      counts,
      async createCategory(values) {
        const created = await service.createCategory({
          name: `  ${values.originalName.replace(" ", "   ")}  `,
          slug: values.originalSlug,
          idempotencyKey: `phase3v:create:${suffix}`
        }, admin, context);
        const row = await tables.getRow({
          databaseId,
          tableId: categoriesTableId,
          rowId: values.categoryId
        });
        if (!hasExactCategoryPermissions(row.$permissions, "private_fixture")) {
          throw new Error("Disposable category permissions are not exactly private staff read.");
        }
        return created;
      },
      readCategory: (categoryId) => service.readCategory(categoryId, admin, context),
      renameCategory: (values, expectedUpdatedAt) =>
        service.updateCategory({
          categoryId: values.categoryId,
          name: values.renamedName,
          slug: values.renamedSlug,
          expectedUpdatedAt,
          idempotencyKey: `phase3v:update:${suffix}`
        }, admin, context),
      async staleRenameCode(values, staleUpdatedAt) {
        try {
          await service.updateCategory({
            categoryId: values.categoryId,
            name: `${values.renamedName} Stale`,
            slug: `${values.renamedSlug}-stale`,
            expectedUpdatedAt: staleUpdatedAt,
            idempotencyKey: `phase3v:stale:${suffix}`
          }, admin, context);
          return null;
        } catch (error) {
          return codeOf(error);
        }
      },
      async productEditorDeleteCode(categoryId, expectedUpdatedAt) {
        try {
          await service.deleteCategory({
            categoryId,
            expectedUpdatedAt,
            idempotencyKey: `phase3v:editor-delete:${suffix}`
          }, productEditor, context);
          return null;
        } catch (error) {
          return codeOf(error);
        }
      },
      async createReferenceProduct(values, category) {
        const now = new Date(clock += 2000).toISOString();
        await tables.createRow({
          databaseId,
          tableId: productsTableId,
          rowId: values.productId,
          data: {
            name: "__wat_phase_3v_disposable__ Reference Product",
            slug: `${PHASE3V_FIXTURE_SLUG_PREFIX}product-${suffix}`,
            description: "Private disposable Phase 3V reference-protection fixture.",
            brand: "eko",
            categoryId: category.id,
            categoryName: category.name,
            price: 1,
            currency: "PKR",
            condition: "New",
            stockStatus: "in_stock",
            featured: false,
            statusPick: false,
            storefrontVisible: false,
            feedVisible: false,
            sortPriority: 0,
            chosenSelectionKey: values.productId,
            createdAt: now,
            updatedAt: now
          },
          permissions: [...APPWRITE_CATEGORY_STAFF_READ_PERMISSIONS]
        });
      },
      async referencedDeleteCode(categoryId, expectedUpdatedAt) {
        try {
          await service.deleteCategory({
            categoryId,
            expectedUpdatedAt,
            idempotencyKey: `phase3v:referenced-delete:${suffix}`
          }, admin, context);
          return null;
        } catch (error) {
          return codeOf(error);
        }
      },
      deleteReferenceProduct: (productId) =>
        tables.deleteRow({ databaseId, tableId: productsTableId, rowId: productId }).then(() => undefined),
      deleteCategory: (categoryId, expectedUpdatedAt) =>
        service.deleteCategory({
          categoryId,
          expectedUpdatedAt,
          idempotencyKey: `phase3v:admin-delete:${suffix}`
        }, admin, context),
      cleanupProduct: (productId) => deleteIfPresent(productsTableId, productId),
      cleanupCategory: (categoryId) => deleteIfPresent(categoriesTableId, categoryId),
      productIsMissing: (productId) => missing(productsTableId, productId),
      categoryIsMissing: (categoryId) => missing(categoriesTableId, categoryId),
      async prefixMatches() {
        const [products, categories] = await Promise.all([
          tables.listRows({
            databaseId,
            tableId: productsTableId,
            queries: [Query.startsWith("slug", PHASE3V_FIXTURE_SLUG_PREFIX), Query.limit(1)],
            total: true,
            ttl: 0
          }),
          tables.listRows({
            databaseId,
            tableId: categoriesTableId,
            queries: [Query.startsWith("slug", PHASE3V_FIXTURE_SLUG_PREFIX), Query.limit(1)],
            total: true,
            ttl: 0
          })
        ]);
        return { products: products.total, categories: categories.total };
      }
    }
  });
  console.log(JSON.stringify({
    mode,
    ...result,
    recoveredOrphans,
    logicalEventsPrepared: logicalEvents,
    exactPrivatePermissionsVerified: true
  }, null, 2));
}

async function missingByDirectGet(
  tables: ReturnType<typeof getAppwriteDataServices>["tables"],
  tableId: string,
  rowId: string
) {
  try {
    await tables.getRow({
      databaseId: APPWRITE_DEFAULT_RESOURCE_IDS.database,
      tableId,
      rowId
    });
    return false;
  } catch (error) {
    return error instanceof AppwriteException && error.code === 404;
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
