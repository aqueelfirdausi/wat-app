import { loadEnvConfig } from "@next/env";
import {
  AppwriteException,
  Client,
  Query,
  Storage,
  TablesDB
} from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { sanitizeBootstrapText } from "@/lib/appwrite/bootstrap";
import { categoryPermissions } from "@/lib/appwrite/category-permissions";
import {
  createAppwriteProductLifecycleService
} from "@/lib/appwrite/product-lifecycle";
import {
  createPhase3XProductLifecycleVerificationContext
} from "@/lib/appwrite/product-lifecycle-context";
import {
  parseProductLifecycleVerificationArguments
} from "@/lib/appwrite/product-lifecycle-verification";
import {
  productImagePrivatePermissions,
  productImagePublicPermissions,
  productPermissionsForVisibility
} from "@/lib/appwrite/product-lifecycle-permissions";
import {
  createAppwriteProductMutationService
} from "@/lib/appwrite/product-mutations";
import {
  createPhase3XProductCleanupVerificationContext
} from "@/lib/appwrite/product-verification-context";
import {
  buildPublicAppwriteFileViewUrl
} from "@/lib/appwrite/product-image";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";
import { listAppwriteProducts } from "@/lib/appwrite/read";

loadEnvConfig(process.cwd());

const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nH0AAAAASUVORK5CYII=",
    "base64"
  )
);
const PNG_TWO = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  )
);
const PREFIX = "phase3x_disposable_";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing Phase 3X configuration: ${name}.`);
  return value;
}

function sdkCode(error: unknown, code: number) {
  return (
    (error instanceof AppwriteException && error.code === code) ||
    (!!error && typeof error === "object" && "code" in error && error.code === code)
  );
}

async function terminalCommit(tables: TablesDB, transactionId: string) {
  let transaction = await tables.updateTransaction({ transactionId, commit: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (transaction.status === "committed") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return;
    }
    if (transaction.status === "failed" || transaction.status === "rolled_back") {
      throw new Error("Phase 3X cleanup transaction did not commit.");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    transaction = await tables.getTransaction({ transactionId });
  }
  throw new Error("Phase 3X cleanup transaction outcome is unknown.");
}

async function main() {
  const mode = parseProductLifecycleVerificationArguments(process.argv.slice(2));
  if (!mode.apply) {
    console.log(
      JSON.stringify(
        {
          mode: "read-only",
          writeActions: [],
          summary: "Phase 3X disposable lifecycle is double-gated; no writes were performed."
        },
        null,
        2
      )
    );
    return;
  }
  if (process.env.WAT_BACKEND !== "appwrite") {
    throw new Error("Phase 3X lifecycle requires WAT_BACKEND=appwrite.");
  }
  if (process.env.WAT_MUTATIONS_ENABLED !== "false") {
    throw new Error("Phase 3X lifecycle requires WAT_MUTATIONS_ENABLED=false.");
  }

  const endpoint = required("APPWRITE_ENDPOINT");
  const projectId = required("APPWRITE_PROJECT_ID");
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(required("APPWRITE_DATA_API_KEY"));
  const tables = new TablesDB(client);
  const storage = new Storage(client);
  const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
  const productsTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.products;
  const categoriesTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories;
  const bucketId = APPWRITE_DEFAULT_RESOURCE_IDS.productImagesBucket;
  const suffix = Date.now().toString(36).slice(-8);
  const categoryId = `${PREFIX}c_${suffix}`;
  const productIds = [1, 2, 3].map((n) => `${PREFIX}p${n}_${suffix}`);
  const fileIds = [1, 2, 3, 4].map((n) => `${PREFIX}f${n}_${suffix}`);
  const slugs = productIds.map((_, index) => `phase-3x-disposable-${index + 1}-${suffix}`);
  const context = createPhase3XProductLifecycleVerificationContext({
    productIds,
    fileIds
  });
  const cleanupContext = createPhase3XProductCleanupVerificationContext(productIds);
  const admin: AuthenticatedStaffIdentity = {
    userId: "phase3x_admin",
    email: "phase3x-admin@example.invalid",
    name: "PHASE 3X DISPOSABLE ADMIN",
    role: "admin"
  };
  const editor: AuthenticatedStaffIdentity = {
    ...admin,
    userId: "phase3x_editor",
    email: "phase3x-editor@example.invalid",
    name: "PHASE 3X DISPOSABLE EDITOR",
    role: "product_editor"
  };
  const viewUrls = new Map(
    fileIds.map((fileId) => [
      fileId,
      buildPublicAppwriteFileViewUrl(fileId, { endpoint, projectId })
    ])
  );
  if (Array.from(viewUrls.values()).some((url) => !url)) {
    throw new Error("Phase 3X anonymous file URL construction failed.");
  }

  const counts = async () => {
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
    return {
      products: products.total,
      categories: categories.total,
      files: files.total
    };
  };
  const baseline = await counts();
  if (baseline.products !== 0 || baseline.categories !== 0 || baseline.files !== 0) {
    throw new Error("Phase 3X requires a zero product/category/file baseline.");
  }

  const events: Array<Record<string, unknown>> = [];
  const lifecycle = createAppwriteProductLifecycleService({
    tables: tables as never,
    storage: storage as never,
    emitActivityEvent(event) {
      events.push(event);
    }
  });
  const productMutations = createAppwriteProductMutationService({
    tables: tables as never
  });
  const createdProducts = new Set<string>();
  const createdFiles = new Set<string>();
  let createdCategory = false;
  let publicFileId: string | null = null;
  const evidence: Record<string, unknown> = {};

  const row = async (productId: string) =>
    tables.getRow({ databaseId, tableId: productsTableId, rowId: productId });
  const token = (value: unknown) => new Date(String(value)).toISOString();

  async function deleteIfPresentFile(fileId: string) {
    try {
      await storage.updateFile({
        bucketId,
        fileId,
        permissions: productImagePrivatePermissions()
      });
    } catch (error) {
      if (!sdkCode(error, 404)) throw error;
    }
    try {
      await storage.deleteFile({ bucketId, fileId });
    } catch (error) {
      if (!sdkCode(error, 404)) throw error;
    }
  }

  async function cleanupProductsAtomically() {
    const existing = [];
    for (const productId of productIds) {
      try {
        existing.push(await row(productId));
      } catch (error) {
        if (!sdkCode(error, 404)) throw error;
      }
    }
    if (!existing.length) return;
    const transaction = await tables.createTransaction({ ttl: 60 });
    for (const product of existing) {
      if (product.chosenSelectionKey === "current") {
        await tables.updateRow({
          databaseId,
          tableId: productsTableId,
          rowId: product.$id,
          data: { chosenSelectionKey: product.$id },
          permissions: productPermissionsForVisibility(false),
          transactionId: transaction.$id
        });
      }
      await tables.deleteRow({
        databaseId,
        tableId: productsTableId,
        rowId: product.$id,
        transactionId: transaction.$id
      });
    }
    await terminalCommit(tables, transaction.$id);
  }

  try {
    const now = new Date().toISOString();
    await tables.createRow({
      databaseId,
      tableId: categoriesTableId,
      rowId: categoryId,
      data: {
        name: "PHASE 3X DISPOSABLE",
        slug: `phase-3x-disposable-${suffix}`,
        updatedAt: now
      },
      permissions: categoryPermissions("private_fixture")
    });
    createdCategory = true;
    for (let index = 0; index < productIds.length; index++) {
      const productId = productIds[index];
      await tables.createRow({
        databaseId,
        tableId: productsTableId,
        rowId: productId,
        data: {
          name: `PHASE 3X DISPOSABLE PRODUCT ${index + 1}`,
          slug: slugs[index],
          description: "Temporary Phase 3X lifecycle fixture. Do not use.",
          brand: "eko",
          categoryId,
          categoryName: "PHASE 3X DISPOSABLE",
          price: 1,
          currency: "PKR",
          condition: "New",
          stockStatus: "in_stock",
          featured: false,
          statusPick: false,
          storefrontVisible: false,
          feedVisible: false,
          sortPriority: index,
          chosenSelectionKey: productId,
          createdAt: now,
          updatedAt: now,
          createdByName: admin.name,
          updatedByName: admin.name
        },
        permissions: productPermissionsForVisibility(false)
      });
      createdProducts.add(productId);
    }

    const attached = await lifecycle.uploadAndAttachImage(
      {
        productId: productIds[0],
        expectedUpdatedAt: token((await row(productIds[0])).updatedAt),
        idempotencyKey: `p3x-upload-${suffix}`
      },
      { bytes: PNG, mimeType: "image/png", filename: "phase3x-one.png" },
      editor,
      context,
      fileIds[0]
    );
    createdFiles.add(fileIds[0]);
    const privateMetadata = await storage.getFile({ bucketId, fileId: fileIds[0] });
    const privateDownload = new Uint8Array(
      await storage.getFileDownload({ bucketId, fileId: fileIds[0] })
    );
    if (!Buffer.from(privateDownload).equals(Buffer.from(PNG))) {
      throw new Error("Phase 3X private upload bytes differ.");
    }
    const retry = await lifecycle.uploadAndAttachImage(
      {
        productId: productIds[0],
        expectedUpdatedAt: now,
        idempotencyKey: `p3x-upload-${suffix}`
      },
      { bytes: PNG, mimeType: "image/png", filename: "phase3x-one.png" },
      editor,
      context,
      fileIds[0]
    );
    evidence.privateUpload = {
      attached: attached.product.imageFileId === fileIds[0],
      exactSize: privateMetadata.sizeOriginal === PNG.length,
      retry: retry.product.imageFileId === fileIds[0]
    };

    const replaced = await lifecycle.replaceImage(
      {
        productId: productIds[0],
        expectedUpdatedAt: attached.product.updatedAt,
        idempotencyKey: `p3x-replace-${suffix}`
      },
      { bytes: PNG_TWO, mimeType: "image/png", filename: "phase3x-two.png" },
      editor,
      context,
      fileIds[1]
    );
    createdFiles.delete(fileIds[0]);
    createdFiles.add(fileIds[1]);
    evidence.replacement = {
      linked: replaced.product.imageFileId === fileIds[1],
      oldDeleted: await storage
        .getFile({ bucketId, fileId: fileIds[0] })
        .then(() => false, (error) => sdkCode(error, 404))
    };

    const removed = await lifecycle.removeImage(
      {
        productId: productIds[0],
        expectedUpdatedAt: replaced.product.updatedAt,
        idempotencyKey: `p3x-remove-${suffix}`
      },
      editor,
      context
    );
    createdFiles.delete(fileIds[1]);
    evidence.removal = removed.product.imageFileId === null;

    for (const invalid of [
      {
        bytes: PNG,
        mimeType: "image/gif",
        filename: "invalid.gif",
        key: "mime"
      },
      {
        bytes: new Uint8Array(1024 * 1024 + 1),
        mimeType: "image/png",
        filename: "large.png",
        key: "large"
      }
    ]) {
      let rejected = false;
      try {
        await lifecycle.uploadAndAttachImage(
          {
            productId: productIds[0],
            expectedUpdatedAt: token((await row(productIds[0])).updatedAt),
            idempotencyKey: `p3x-invalid-${invalid.key}-${suffix}`
          },
          invalid,
          admin,
          context,
          fileIds[2]
        );
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error("Phase 3X invalid image was accepted.");
    }
    const invalidResidual = await storage
      .getFile({ bucketId, fileId: fileIds[2] })
      .then(() => true, (error) => !sdkCode(error, 404));
    if (invalidResidual) {
      throw new Error("Phase 3X invalid image rejection left a residual file.");
    }

    await storage.createFile({
      bucketId,
      fileId: fileIds[2],
      file: InputFile.fromBuffer(PNG, "phase3x-orphan.png"),
      permissions: productImagePrivatePermissions()
    });
    createdFiles.add(fileIds[2]);
    let editorDenied = false;
    try {
      await lifecycle.cleanupOrphanFile(
        { fileId: fileIds[2], idempotencyKey: `p3x-orphan-editor-${suffix}` },
        editor,
        context
      );
    } catch {
      editorDenied = true;
    }
    if (!editorDenied) throw new Error("Phase 3X editor orphan cleanup was allowed.");
    await lifecycle.cleanupOrphanFile(
      { fileId: fileIds[2], idempotencyKey: `p3x-orphan-admin-${suffix}` },
      admin,
      context
    );
    createdFiles.delete(fileIds[2]);
    evidence.orphanCleanup = { editorDenied, adminDeleted: true };

    const visibleAttached = await lifecycle.uploadAndAttachImage(
      {
        productId: productIds[0],
        expectedUpdatedAt: token((await row(productIds[0])).updatedAt),
        idempotencyKey: `p3x-visible-upload-${suffix}`
      },
      { bytes: PNG, mimeType: "image/png", filename: "phase3x-visible.png" },
      admin,
      context,
      fileIds[3]
    );
    createdFiles.add(fileIds[3]);
    const published = await lifecycle.setStorefrontVisibility(
      {
        productId: productIds[0],
        expectedUpdatedAt: visibleAttached.product.updatedAt,
        storefrontVisible: true,
        idempotencyKey: `p3x-publish-${suffix}`
      },
      editor,
      context
    );
    publicFileId = fileIds[3];
    const publicCatalogue = await listAppwriteProducts(
      tables as never,
      storage as never
    );
    if (!publicCatalogue.some((product) => product.slug === slugs[0])) {
      throw new Error("Phase 3X public catalogue did not include the published product.");
    }
    const fed = await lifecycle.setMerchandising(
      {
        productId: productIds[0],
        expectedUpdatedAt: published.updatedAt,
        feedVisible: true,
        featured: true,
        statusPick: true,
        idempotencyKey: `p3x-flags-${suffix}`
      },
      editor,
      context
    );
    const hidden = await lifecycle.setStorefrontVisibility(
      {
        productId: productIds[0],
        expectedUpdatedAt: fed.updatedAt,
        storefrontVisible: false,
        idempotencyKey: `p3x-hide-${suffix}`
      },
      editor,
      context
    );
    publicFileId = null;
    const hiddenCatalogue = await listAppwriteProducts(
      tables as never,
      storage as never
    );
    if (hiddenCatalogue.some((product) => product.slug === slugs[0])) {
      throw new Error("Phase 3X public catalogue still included the hidden product.");
    }
    evidence.visibility = {
      published: published.storefrontVisible,
      feed: fed.feedVisible,
      featured: fed.featured,
      statusPick: fed.statusPick,
      chosenUnchanged: fed.chosenSelectionKey === productIds[0],
      hidden: !hidden.storefrontVisible && !hidden.feedVisible,
      publicCatalogueIncluded: true,
      hiddenCatalogueExcluded: true
    };

    const selectedA = await lifecycle.selectChosenProduct(
      {
        targetProductId: productIds[0],
        expectedTargetUpdatedAt: hidden.updatedAt,
        idempotencyKey: `p3x-chosen-a-${suffix}`
      },
      editor,
      context
    );
    let selectedDeleteBlocked = false;
    try {
      await productMutations.deleteProduct(
        {
          productId: productIds[0],
          expectedUpdatedAt: selectedA.selectedProduct.updatedAt,
          idempotencyKey: `p3x-delete-selected-${suffix}`
        },
        admin,
        cleanupContext
      );
    } catch {
      selectedDeleteBlocked = true;
    }
    if (!selectedDeleteBlocked) {
      throw new Error("Phase 3X selected product deletion was not blocked.");
    }
    const selectedB = await lifecycle.selectChosenProduct(
      {
        targetProductId: productIds[1],
        expectedTargetUpdatedAt: token((await row(productIds[1])).updatedAt),
        idempotencyKey: `p3x-chosen-b-${suffix}`
      },
      admin,
      context
    );
    const chosenRetry = await lifecycle.selectChosenProduct(
      {
        targetProductId: productIds[1],
        expectedTargetUpdatedAt: now,
        idempotencyKey: `p3x-chosen-b-${suffix}`
      },
      admin,
      context
    );
    let staleRejected = false;
    try {
      await lifecycle.selectChosenProduct(
        {
          targetProductId: productIds[2],
          expectedTargetUpdatedAt: "2026-01-01T00:00:00.000Z",
          idempotencyKey: `p3x-chosen-stale-${suffix}`
        },
        admin,
        context
      );
    } catch {
      staleRejected = true;
    }
    const imageRemoved = await lifecycle.removeImage(
      {
        productId: productIds[0],
        expectedUpdatedAt: token((await row(productIds[0])).updatedAt),
        idempotencyKey: `p3x-final-image-remove-${suffix}`
      },
      admin,
      context
    );
    createdFiles.delete(fileIds[3]);
    await productMutations.deleteProduct(
      {
        productId: productIds[0],
        expectedUpdatedAt: imageRemoved.product.updatedAt,
        idempotencyKey: `p3x-delete-former-${suffix}`
      },
      admin,
      cleanupContext
    );
    createdProducts.delete(productIds[0]);

    const currentTwo = await row(productIds[1]);
    const currentThree = await row(productIds[2]);
    const concurrent = await Promise.allSettled([
      lifecycle.selectChosenProduct(
        {
          targetProductId: productIds[1],
          expectedTargetUpdatedAt: token(currentTwo.updatedAt),
          idempotencyKey: `p3x-concurrent-b-${suffix}`
        },
        editor,
        context
      ),
      lifecycle.selectChosenProduct(
        {
          targetProductId: productIds[2],
          expectedTargetUpdatedAt: token(currentThree.updatedAt),
          idempotencyKey: `p3x-concurrent-c-${suffix}`
        },
        admin,
        context
      )
    ]);
    const chosenRows = await tables.listRows({
      databaseId,
      tableId: productsTableId,
      queries: [Query.equal("chosenSelectionKey", "current"), Query.limit(3)],
      total: false,
      ttl: 0
    });
    if (chosenRows.rows.length !== 1) {
      throw new Error("Phase 3X concurrent chosen invariant failed.");
    }
    evidence.chosen = {
      first: selectedA.selectedProduct.id,
      second: selectedB.selectedProduct.id,
      retry: chosenRetry.outcome,
      staleRejected,
      selectedDeleteBlocked,
      concurrentFulfilled: concurrent.filter((result) => result.status === "fulfilled").length,
      finalSelectedCount: chosenRows.rows.length
    };
  } finally {
    if (publicFileId) {
      try {
        const current = await row(productIds[0]);
        if (current.storefrontVisible) {
          await tables.updateRow({
            databaseId,
            tableId: productsTableId,
            rowId: current.$id,
            data: { storefrontVisible: false, feedVisible: false },
            permissions: productPermissionsForVisibility(false)
          });
        }
      } catch (error) {
        if (!sdkCode(error, 404)) throw error;
      }
    }
    for (const fileId of fileIds) await deleteIfPresentFile(fileId);
    await cleanupProductsAtomically();
    if (createdCategory) {
      try {
        await tables.deleteRow({
          databaseId,
          tableId: categoriesTableId,
          rowId: categoryId
        });
      } catch (error) {
        if (!sdkCode(error, 404)) throw error;
      }
    }
  }

  const finalCounts = await counts();
  const [productPrefix, categoryPrefix, filePrefix, selectedFixture] =
    await Promise.all([
      tables.listRows({
        databaseId,
        tableId: productsTableId,
        queries: [Query.startsWith("$id", PREFIX), Query.limit(100)],
        total: false,
        ttl: 0
      }),
      tables.listRows({
        databaseId,
        tableId: categoriesTableId,
        queries: [Query.startsWith("$id", PREFIX), Query.limit(100)],
        total: false,
        ttl: 0
      }),
      storage.listFiles({
        bucketId,
        queries: [Query.startsWith("$id", PREFIX), Query.limit(100)],
        total: false
      }),
      tables.listRows({
        databaseId,
        tableId: productsTableId,
        queries: [
          Query.equal("chosenSelectionKey", "current"),
          Query.startsWith("$id", PREFIX),
          Query.limit(100)
        ],
        total: false,
        ttl: 0
      })
    ]);
  const publicUrlsDenied = await Promise.all(
    Array.from(viewUrls.values()).map(async (url) => {
      const response = await fetch(url, { cache: "no-store", redirect: "error" });
      return [401, 403, 404].includes(response.status);
    })
  );
  const cleanupVerified =
    finalCounts.products === baseline.products &&
    finalCounts.categories === baseline.categories &&
    finalCounts.files === baseline.files &&
    productPrefix.rows.length === 0 &&
    categoryPrefix.rows.length === 0 &&
    filePrefix.files.length === 0 &&
    selectedFixture.rows.length === 0 &&
    publicUrlsDenied.every(Boolean);
  if (!cleanupVerified) {
    throw new Error("Phase 3X disposable cleanup could not be independently proven.");
  }

  console.log(
    JSON.stringify(
      {
        mode: "phase3x-disposable-product-lifecycle",
        baseline,
        evidence,
        logicalEventCount: events.length,
        finalCounts,
        prefixMatches: {
          products: productPrefix.rows.length,
          categories: categoryPrefix.rows.length,
          files: filePrefix.files.length,
          selected: selectedFixture.rows.length
        },
        publicUrlsDenied: publicUrlsDenied.every(Boolean),
        cleanupVerified
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    sanitizeBootstrapText(error, [
      process.env.APPWRITE_DATA_API_KEY ?? "",
      process.env.APPWRITE_AUTH_API_KEY ?? "",
      process.env.APPWRITE_BOOTSTRAP_API_KEY ?? ""
    ])
  );
  process.exitCode = 1;
});
