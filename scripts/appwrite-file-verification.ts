import { loadEnvConfig } from "@next/env";
import {
  AppwriteException,
  Client,
  Permission,
  Role,
  Storage,
  TablesDB
} from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { sanitizeBootstrapText } from "@/lib/appwrite/bootstrap";
import {
  parseFileVerificationArguments,
  runDisposableFileVerification,
  type DisposableVerificationIds
} from "@/lib/appwrite/file-verification";
import { buildPublicAppwriteFileViewUrl } from "@/lib/appwrite/product-image";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";

loadEnvConfig(process.cwd());

const DISPOSABLE_PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nH0AAAAASUVORK5CYII=",
  "base64"
));

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing file-verification configuration: ${name}.`);
  return value;
}

function publicReadPermissions() {
  return [
    Permission.read(Role.any()),
    Permission.read(Role.team(APPWRITE_DEFAULT_RESOURCE_IDS.team, "admin")),
    Permission.read(Role.team(APPWRITE_DEFAULT_RESOURCE_IDS.team, "product_editor"))
  ];
}

async function main() {
  const mode = parseFileVerificationArguments(process.argv.slice(2));
  if (!mode.apply) {
    console.log(JSON.stringify({
      mode: "read-only",
      writeActions: [],
      summary: "Disposable file verification is double-gated; no writes were performed."
    }, null, 2));
    return;
  }

  if (process.env.WAT_BACKEND !== "appwrite") {
    throw new Error("Disposable file verification requires WAT_BACKEND=appwrite.");
  }
  if (process.env.WAT_MUTATIONS_ENABLED !== "false") {
    throw new Error("Disposable file verification requires WAT_MUTATIONS_ENABLED=false.");
  }

  const endpoint = requiredEnvironment("APPWRITE_ENDPOINT");
  const projectId = requiredEnvironment("APPWRITE_PROJECT_ID");
  const dataKey = requiredEnvironment("APPWRITE_DATA_API_KEY");
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(dataKey);
  const storage = new Storage(client);
  const tables = new TablesDB(client);
  const suffix = Date.now().toString(36);
  const ids: DisposableVerificationIds = {
    fileId: `p3r-file-${suffix}`,
    categoryId: `p3r-cat-${suffix}`,
    productId: `p3r-product-${suffix}`,
    slug: `phase-3r-disposable-${suffix}`
  };
  const databaseId = APPWRITE_DEFAULT_RESOURCE_IDS.database;
  const bucketId = APPWRITE_DEFAULT_RESOURCE_IDS.productImagesBucket;
  const categoriesTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories;
  const productsTableId = APPWRITE_DEFAULT_RESOURCE_IDS.tables.products;
  const fileViewUrl = buildPublicAppwriteFileViewUrl(ids.fileId, { endpoint, projectId });
  if (!fileViewUrl) throw new Error("Configured public file-view URL could not be constructed.");
  const now = new Date().toISOString();

  const result = await runDisposableFileVerification({
    ids,
    imageBytes: DISPOSABLE_PNG,
    dependencies: {
      createPrivateFile: (fileId, bytes) => storage.createFile({
        bucketId,
        fileId,
        file: InputFile.fromBuffer(bytes, "PHASE-3R-DISPOSABLE.png"),
        permissions: []
      }),
      makeFilePublic: (fileId) => storage.updateFile({
        bucketId,
        fileId,
        permissions: publicReadPermissions()
      }),
      deleteFile: async (fileId) => {
        await storage.deleteFile({ bucketId, fileId });
      },
      createCategory: async (categoryId) => {
        await tables.createRow({
          databaseId,
          tableId: categoriesTableId,
          rowId: categoryId,
          data: {
            name: "PHASE 3R DISPOSABLE",
            slug: ids.slug,
            updatedAt: now
          },
          permissions: publicReadPermissions()
        });
      },
      deleteCategory: async (categoryId) => {
        await tables.deleteRow({ databaseId, tableId: categoriesTableId, rowId: categoryId });
      },
      createProduct: async (fixtureIds) => {
        await tables.createRow({
          databaseId,
          tableId: productsTableId,
          rowId: fixtureIds.productId,
          data: {
            name: "PHASE 3R DISPOSABLE IMAGE CHECK",
            slug: fixtureIds.slug,
            description: "Temporary live verification row. Do not use.",
            brand: "eko",
            categoryId: fixtureIds.categoryId,
            categoryName: "PHASE 3R DISPOSABLE",
            price: 1,
            currency: "PKR",
            condition: "New",
            stockStatus: "in_stock",
            featured: true,
            statusPick: false,
            storefrontVisible: true,
            feedVisible: true,
            sortPriority: 0,
            chosenSelectionKey: fixtureIds.productId,
            imageFileId: fixtureIds.fileId,
            createdAt: now,
            updatedAt: now
          },
          permissions: publicReadPermissions()
        });
      },
      deleteProduct: async (productId) => {
        await tables.deleteRow({ databaseId, tableId: productsTableId, rowId: productId });
      },
      fetchAnonymousView: async () => {
        const response = await fetch(fileViewUrl, {
          headers: { Accept: "image/png" },
          cache: "no-store",
          redirect: "error"
        });
        return {
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
          bytes: new Uint8Array(await response.arrayBuffer())
        };
      },
      holdForBrowser: mode.holdSeconds > 0
        ? async () => {
            console.log(JSON.stringify({
              event: "browser-ready",
              slug: ids.slug,
              fileViewUrl,
              holdSeconds: mode.holdSeconds
            }));
            await new Promise((resolve) => setTimeout(resolve, mode.holdSeconds * 1000));
          }
        : undefined
    }
  });

  async function deleted(promise: Promise<unknown>) {
    try {
      await promise;
      return false;
    } catch (error) {
      return error instanceof AppwriteException && error.code === 404;
    }
  }

  const cleanupVerified = (
    await deleted(storage.getFile({ bucketId, fileId: ids.fileId }))
    && await deleted(tables.getRow({ databaseId, tableId: productsTableId, rowId: ids.productId }))
    && await deleted(tables.getRow({ databaseId, tableId: categoriesTableId, rowId: ids.categoryId }))
  );
  if (!cleanupVerified) throw new Error("Disposable cleanup could not be independently verified.");

  console.log(JSON.stringify({
    mode: "disposable-file-verification",
    privateDenied: result.privateDenied,
    publicDelivered: result.publicDelivered,
    productCreated: result.productCreated,
    browserHoldCompleted: result.browserHoldCompleted,
    cleanupComplete: result.cleanupComplete,
    cleanupVerified
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
