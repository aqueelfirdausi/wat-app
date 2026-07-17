import { randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { AppwriteException, Query } from "node-appwrite";
import {
  createPhase3WCategoryVerificationContext
} from "@/lib/appwrite/category-verification-context";
import { hasExactCategoryPermissions } from "@/lib/appwrite/category-permissions";
import {
  createAppwriteCategoryMutationService,
  type CategoryMutationTables
} from "@/lib/appwrite/category-mutations";
import {
  MutationContractError,
  type MutationErrorCode
} from "@/lib/appwrite/mutation-design";
import {
  PHASE3W_FIXTURE_NAME_PREFIX,
  PHASE3W_FIXTURE_SLUG_PREFIX,
  parseProductMutationVerificationArguments,
  runProductMutationVerificationLifecycle
} from "@/lib/appwrite/product-mutation-verification";
import { hasExactProductPrivatePermissions } from "@/lib/appwrite/product-permissions";
import {
  createAppwriteProductMutationService,
  type ProductMutationDto,
  type ProductMutationTables
} from "@/lib/appwrite/product-mutations";
import {
  createPhase3WProductVerificationContext
} from "@/lib/appwrite/product-verification-context";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";
import { getAppwriteDataServices } from "@/lib/appwrite/server";
import {
  sanitizeBootstrapText,
  validateBootstrapEnvironment
} from "@/lib/appwrite/bootstrap";

loadEnvConfig(process.cwd());

const admin: AuthenticatedStaffIdentity = {
  userId: "phase3w_verifier_admin",
  email: "phase3w-verifier-admin@invalid.example",
  name: "Phase 3W verifier",
  role: "admin"
};

const editor: AuthenticatedStaffIdentity = {
  ...admin,
  userId: "phase3w_verifier_editor",
  email: "phase3w-verifier-editor@invalid.example",
  name: "Phase 3W editor verifier",
  role: "product_editor"
};

function codeOf(error: unknown): MutationErrorCode | null {
  return error instanceof MutationContractError ? error.code : null;
}

function canonicalDate(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("Live row returned an invalid datetime.");
  }
  return new Date(value).toISOString();
}

async function main() {
  const mode = parseProductMutationVerificationArguments(process.argv.slice(2));
  const configuration = validateBootstrapEnvironment(process.env);
  if (
    configuration.endpoint !== "https://fra.cloud.appwrite.io/v1" ||
    process.env.WAT_BACKEND !== "appwrite" ||
    process.env.WAT_MUTATIONS_ENABLED !== "false"
  ) {
    throw new Error("Phase 3W verification is locked to mutation-disabled Frankfurt Appwrite mode.");
  }
  const { tables, storage } = getAppwriteDataServices();
  const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
  const productsTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.products;
  const categoriesTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories;
  const bucketId = APPWRITE_DEFAULT_RESOURCE_IDS.productImagesBucket;

  async function prefixRows() {
    const [products, categories] = await Promise.all([
      tables.listRows({
        databaseId,
        tableId: productsTableId,
        queries: [Query.startsWith("slug", PHASE3W_FIXTURE_SLUG_PREFIX), Query.limit(100)],
        total: true,
        ttl: 0
      }),
      tables.listRows({
        databaseId,
        tableId: categoriesTableId,
        queries: [Query.startsWith("slug", PHASE3W_FIXTURE_SLUG_PREFIX), Query.limit(100)],
        total: true,
        ttl: 0
      })
    ]);
    return { products: products.rows, categories: categories.rows };
  }

  async function counts() {
    const [products, categories, files] = await Promise.all([
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
      }),
      storage.listFiles({
        bucketId,
        queries: [Query.limit(1)],
        total: true
      })
    ]);
    return { products: products.total, categories: categories.total, files: files.total };
  }

  async function deleteIfPresent(tableId: string, rowId: string) {
    try {
      await tables.deleteRow({ databaseId, tableId, rowId });
    } catch (error) {
      if (!(error instanceof AppwriteException && error.code === 404)) throw error;
    }
  }

  async function missing(tableId: string, rowId: string) {
    try {
      await tables.getRow({ databaseId, tableId, rowId });
      return false;
    } catch (error) {
      return error instanceof AppwriteException && error.code === 404;
    }
  }

  async function recover() {
    const matches = await prefixRows();
    for (const row of matches.products) {
      if (
        typeof row.$id !== "string" ||
        !row.$id.startsWith("phase3w_disposable_p") ||
        typeof row.name !== "string" ||
        !row.name.startsWith(PHASE3W_FIXTURE_NAME_PREFIX) ||
        typeof row.slug !== "string" ||
        !row.slug.startsWith(PHASE3W_FIXTURE_SLUG_PREFIX) ||
        !hasExactProductPrivatePermissions(row.$permissions)
      ) {
        throw new Error("Phase 3W product prefix matched a row outside the disposable contract.");
      }
    }
    for (const row of matches.categories) {
      if (
        typeof row.$id !== "string" ||
        !row.$id.startsWith("phase3w_disposable_c") ||
        typeof row.name !== "string" ||
        !row.name.startsWith(PHASE3W_FIXTURE_NAME_PREFIX) ||
        typeof row.slug !== "string" ||
        !row.slug.startsWith(PHASE3W_FIXTURE_SLUG_PREFIX) ||
        !hasExactCategoryPermissions(row.$permissions, "private_fixture")
      ) {
        throw new Error("Phase 3W category prefix matched a row outside the disposable contract.");
      }
    }
    for (const row of matches.products) await deleteIfPresent(productsTableId, row.$id);
    for (const row of matches.categories) await deleteIfPresent(categoriesTableId, row.$id);
    const remaining = await prefixRows();
    if (remaining.products.length || remaining.categories.length) {
      throw new Error("Phase 3W prefix recovery could not prove cleanup.");
    }
    return { products: matches.products.length, categories: matches.categories.length };
  }

  if (mode === "read_only") {
    const matches = await prefixRows();
    console.log(JSON.stringify({
      mode: "read-only",
      writeActions: [],
      disposablePrefixMatches: {
        products: matches.products.map((row) => row.$id),
        categories: matches.categories.map((row) => row.$id)
      },
      summary: "Phase 3W preflight complete; both explicit gates are required."
    }, null, 2));
    return;
  }

  const recoveredOrphans = await recover();
  if (mode === "recover") {
    console.log(JSON.stringify({
      mode,
      recoveredOrphans,
      finalCounts: await counts(),
      cleanupVerified: true
    }, null, 2));
    return;
  }

  const suffix = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`.slice(-8);
  const ids = {
    category1: `phase3w_disposable_c1_${suffix}`,
    category2: `phase3w_disposable_c2_${suffix}`,
    product1: `phase3w_disposable_p1_${suffix}`,
    product2: `phase3w_disposable_p2_${suffix}`
  };
  const category1Context = createPhase3WCategoryVerificationContext(ids.category1);
  const category2Context = createPhase3WCategoryVerificationContext(ids.category2);
  const product1Context = createPhase3WProductVerificationContext(ids.product1);
  const product2Context = createPhase3WProductVerificationContext(ids.product2);
  let clock = Date.now();
  const logicalEvents: string[] = [];
  const categoryService = createAppwriteCategoryMutationService({
    tables: tables as unknown as CategoryMutationTables,
    now: () => new Date(clock += 2000).toISOString(),
    emitActivityEvent(event) {
      logicalEvents.push(event.eventType);
    }
  });
  const productService = createAppwriteProductMutationService({
    tables: tables as unknown as ProductMutationTables,
    now: () => new Date(clock += 2000).toISOString(),
    emitActivityEvent(event) {
      logicalEvents.push(event.eventType);
    }
  });

  const createCommand = {
    name: `  ${PHASE3W_FIXTURE_NAME_PREFIX}   Product  `,
    slug: `${PHASE3W_FIXTURE_SLUG_PREFIX}product-${suffix}`,
    description: "  Private disposable   Phase 3W product fixture. ",
    brand: "eko",
    preferredContactId: "phase3w-contact",
    categoryId: ids.category1,
    price: 25000,
    currency: "PKR",
    condition: "New",
    stockStatus: "in_stock",
    featured: false,
    statusPick: false,
    storefrontVisible: false,
    feedVisible: false,
    sortPriority: 3,
    idempotencyKey: `phase3w:create:${suffix}`
  };
  let category1: { id: string; updatedAt: string } | null = null;
  let category2: { id: string; updatedAt: string } | null = null;
  let product: ProductMutationDto | null = null;
  let staleToken = "";

  async function setFixtureFields(data: Record<string, unknown>) {
    const timestamp = new Date(clock += 2000).toISOString();
    await tables.updateRow({
      databaseId,
      tableId: productsTableId,
      rowId: ids.product1,
      data: { ...data, updatedAt: timestamp },
      permissions: [
        'read("team:wat_staff/admin")',
        'read("team:wat_staff/product_editor")'
      ]
    });
    const row = await tables.getRow({
      databaseId,
      tableId: productsTableId,
      rowId: ids.product1
    });
    return canonicalDate(row.updatedAt);
  }

  const result = await runProductMutationVerificationLifecycle({
    counts,
    async prefixMatches() {
      const matches = await prefixRows();
      return {
        products: matches.products.map((row) => row.$id),
        categories: matches.categories.map((row) => row.$id)
      };
    },
    async createFirstCategory() {
      category1 = await categoryService.createCategory({
        name: `${PHASE3W_FIXTURE_NAME_PREFIX} Phones`,
        slug: `${PHASE3W_FIXTURE_SLUG_PREFIX}phones-${suffix}`,
        idempotencyKey: `phase3w:category1:${suffix}`
      }, admin, category1Context);
      return category1;
    },
    async createSecondCategory() {
      category2 = await categoryService.createCategory({
        name: `${PHASE3W_FIXTURE_NAME_PREFIX} Accessories`,
        slug: `${PHASE3W_FIXTURE_SLUG_PREFIX}accessories-${suffix}`,
        idempotencyKey: `phase3w:category2:${suffix}`
      }, admin, category2Context);
      return category2;
    },
    async createProduct() {
      product = await productService.createProduct(createCommand, admin, product1Context);
      staleToken = product.updatedAt;
      return product;
    },
    async verifyCreatedProduct() {
      if (!product || !category1) throw new Error("Product fixture was not created.");
      const row = await tables.getRow({
        databaseId,
        tableId: productsTableId,
        rowId: ids.product1
      });
      if (
        product.name !== `${PHASE3W_FIXTURE_NAME_PREFIX} Product` ||
        product.description !== "Private disposable Phase 3W product fixture." ||
        product.categoryId !== category1.id ||
        product.categoryName !== `${PHASE3W_FIXTURE_NAME_PREFIX} Phones` ||
        product.currency !== "PKR" ||
        product.price !== 25000 ||
        product.condition !== "New" ||
        product.stockStatus !== "in_stock" ||
        product.storefrontVisible ||
        product.feedVisible ||
        product.imageFileId ||
        product.chosenSelectionKey !== product.id ||
        product.createdByName !== admin.name ||
        !hasExactProductPrivatePermissions(row.$permissions)
      ) {
        throw new Error("Created product did not match the exact Phase 3W contract.");
      }
    },
    async retryCreate() {
      const retry = await productService.createProduct(createCommand, admin, product1Context);
      if (!product || retry.id !== product.id || retry.updatedAt !== product.updatedAt) {
        throw new Error("Product create retry was not idempotent.");
      }
    },
    async duplicateSlugCode() {
      try {
        await productService.createProduct({
          ...createCommand,
          idempotencyKey: `phase3w:duplicate:${suffix}`
        }, admin, product2Context);
        return null;
      } catch (error) {
        return codeOf(error);
      }
    },
    async updateProduct() {
      if (!product) throw new Error("Product fixture is unavailable.");
      product = await productService.updateProduct({
        productId: product.id,
        expectedUpdatedAt: product.updatedAt,
        idempotencyKey: `phase3w:update:${suffix}`,
        name: `${PHASE3W_FIXTURE_NAME_PREFIX} Updated Product`,
        price: 26000,
        stockStatus: "low_stock",
        featured: true,
        statusPick: true,
        sortPriority: 4
      }, editor, product1Context);
      return product;
    },
    async reassignProduct() {
      if (!product || !category2) throw new Error("Reassignment fixtures are unavailable.");
      product = await productService.updateProduct({
        productId: product.id,
        expectedUpdatedAt: product.updatedAt,
        idempotencyKey: `phase3w:reassign:${suffix}`,
        categoryId: category2.id
      }, admin, product1Context);
      if (product.categoryName !== `${PHASE3W_FIXTURE_NAME_PREFIX} Accessories`) {
        throw new Error("Category name was not server-derived.");
      }
      return product;
    },
    async staleUpdateCode() {
      try {
        await productService.updateProduct({
          productId: ids.product1,
          expectedUpdatedAt: staleToken,
          idempotencyKey: `phase3w:stale:${suffix}`,
          price: 1
        }, admin, product1Context);
        return null;
      } catch (error) {
        return codeOf(error);
      }
    },
    async forbiddenInputCodes() {
      if (!product) throw new Error("Product fixture is unavailable.");
      const attempts = [
        { chosenSelectionKey: "current" },
        { imageFileId: "phase3w_fake_image" },
        { storefrontVisible: true }
      ];
      const codes: string[] = [];
      for (const attempt of attempts) {
        try {
          await productService.updateProduct({
            productId: product.id,
            expectedUpdatedAt: product.updatedAt,
            idempotencyKey: `phase3w:forbidden:${codes.length}:${suffix}`,
            ...attempt
          }, admin, product1Context);
          codes.push("NONE");
        } catch (error) {
          codes.push(codeOf(error) ?? "UNKNOWN");
        }
      }
      return codes;
    },
    async editorDeleteCode() {
      if (!product) throw new Error("Product fixture is unavailable.");
      try {
        await productService.deleteProduct({
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          idempotencyKey: `phase3w:editor-delete:${suffix}`
        }, editor, product1Context);
        return null;
      } catch (error) {
        return codeOf(error);
      }
    },
    async selectedDeleteCode() {
      if (!product) throw new Error("Product fixture is unavailable.");
      product.updatedAt = await setFixtureFields({ chosenSelectionKey: "current" });
      try {
        await productService.deleteProduct({
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          idempotencyKey: `phase3w:selected-delete:${suffix}`
        }, admin, product1Context);
        return null;
      } catch (error) {
        return codeOf(error);
      } finally {
        product.updatedAt = await setFixtureFields({ chosenSelectionKey: ids.product1 });
        product.chosenSelectionKey = ids.product1;
      }
    },
    async imageDeleteCode() {
      if (!product) throw new Error("Product fixture is unavailable.");
      product.updatedAt = await setFixtureFields({ imageFileId: "phase3w_fake_image" });
      try {
        await productService.deleteProduct({
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          idempotencyKey: `phase3w:image-delete:${suffix}`
        }, admin, product1Context);
        return null;
      } catch (error) {
        return codeOf(error);
      } finally {
        product.updatedAt = await setFixtureFields({ imageFileId: null });
        product.imageFileId = null;
      }
    },
    async referencedCategoryDeleteCode() {
      if (!product || !category2) throw new Error("Reference fixtures are unavailable.");
      try {
        await categoryService.deleteCategory({
          categoryId: category2.id,
          expectedUpdatedAt: category2.updatedAt,
          idempotencyKey: `phase3w:referenced-category:${suffix}`
        }, admin, category2Context);
        return null;
      } catch (error) {
        return codeOf(error);
      }
    },
    async adminDelete() {
      if (!product) throw new Error("Product fixture is unavailable.");
      await productService.deleteProduct({
        productId: product.id,
        expectedUpdatedAt: product.updatedAt,
        idempotencyKey: `phase3w:admin-delete:${suffix}`
      }, admin, product1Context);
      product = null;
    },
    async deleteCategories() {
      if (category1) {
        await categoryService.deleteCategory({
          categoryId: category1.id,
          expectedUpdatedAt: category1.updatedAt,
          idempotencyKey: `phase3w:delete-category1:${suffix}`
        }, admin, category1Context);
        category1 = null;
      }
      if (category2) {
        await categoryService.deleteCategory({
          categoryId: category2.id,
          expectedUpdatedAt: category2.updatedAt,
          idempotencyKey: `phase3w:delete-category2:${suffix}`
        }, admin, category2Context);
        category2 = null;
      }
    },
    async cleanup() {
      await deleteIfPresent(productsTableId, ids.product1);
      await deleteIfPresent(productsTableId, ids.product2);
      await deleteIfPresent(categoriesTableId, ids.category1);
      await deleteIfPresent(categoriesTableId, ids.category2);
    },
    async cleanupIsProven() {
      return (
        await Promise.all([
          missing(productsTableId, ids.product1),
          missing(productsTableId, ids.product2),
          missing(categoriesTableId, ids.category1),
          missing(categoriesTableId, ids.category2)
        ])
      ).every(Boolean);
    }
  });

  console.log(JSON.stringify({
    mode,
    ...result,
    recoveredOrphans,
    logicalEventsPrepared: logicalEvents,
    noFilesCreated: result.starting.files === result.ending.files
  }, null, 2));
}

main().catch((error) => {
  console.error(sanitizeBootstrapText(error, [
    process.env.APPWRITE_DATA_API_KEY ?? "",
    process.env.APPWRITE_BOOTSTRAP_API_KEY ?? "",
    process.env.APPWRITE_AUTH_API_KEY ?? ""
  ]));
  process.exitCode = 1;
});
