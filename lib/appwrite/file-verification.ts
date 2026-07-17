import { hasExactPublicReadPermission } from "@/lib/appwrite/public-permissions";

export type FileVerificationMode = {
  apply: boolean;
  holdSeconds: number;
};

export type DisposableVerificationIds = {
  fileId: string;
  categoryId: string;
  productId: string;
  slug: string;
};

type FileRecord = {
  $id?: unknown;
  $permissions?: unknown;
};

type ViewResponse = {
  status: number;
  contentType: string;
  bytes: Uint8Array;
};

export type DisposableFileVerificationDependencies = {
  createPrivateFile(fileId: string, bytes: Uint8Array): Promise<FileRecord>;
  makeFilePublic(fileId: string): Promise<FileRecord>;
  deleteFile(fileId: string): Promise<void>;
  createCategory(categoryId: string): Promise<void>;
  deleteCategory(categoryId: string): Promise<void>;
  createProduct(ids: DisposableVerificationIds): Promise<void>;
  deleteProduct(productId: string): Promise<void>;
  fetchAnonymousView(fileId: string): Promise<ViewResponse>;
  holdForBrowser?(ids: DisposableVerificationIds): Promise<void>;
};

export function parseFileVerificationArguments(argumentsList: string[]): FileVerificationMode {
  let holdSeconds = 0;
  const flags = new Set<string>();

  for (const argument of argumentsList) {
    if (argument.startsWith("--hold-seconds=")) {
      const value = argument.slice("--hold-seconds=".length);
      if (!/^\d+$/.test(value)) throw new Error("Hold seconds must be a whole number.");
      holdSeconds = Number(value);
      if (holdSeconds < 0 || holdSeconds > 120) {
        throw new Error("Hold seconds must be between 0 and 120.");
      }
      continue;
    }
    if (argument !== "--apply" && argument !== "--confirm-disposable-file-check") {
      throw new Error(`Unknown file-verification argument: ${argument}`);
    }
    flags.add(argument);
  }

  const apply = flags.has("--apply");
  const confirmed = flags.has("--confirm-disposable-file-check");
  if (apply !== confirmed) {
    throw new Error("Disposable file verification requires both apply and confirmation flags.");
  }
  if (!apply && holdSeconds !== 0) {
    throw new Error("Browser hold is available only in confirmed apply mode.");
  }

  return { apply, holdSeconds };
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((value, index) => value === right[index]);
}

export async function runDisposableFileVerification(input: {
  ids: DisposableVerificationIds;
  imageBytes: Uint8Array;
  dependencies: DisposableFileVerificationDependencies;
}) {
  const { ids, imageBytes, dependencies } = input;
  let fileCreated = false;
  let categoryCreated = false;
  let productCreated = false;
  const cleanupErrors: string[] = [];
  const result = {
    privateDenied: false,
    publicDelivered: false,
    productCreated: false,
    browserHoldCompleted: false,
    cleanupComplete: false
  };

  try {
    const privateFile = await dependencies.createPrivateFile(ids.fileId, imageBytes);
    fileCreated = true;
    if (
      privateFile.$id !== ids.fileId ||
      !Array.isArray(privateFile.$permissions) ||
      privateFile.$permissions.length !== 0
    ) {
      throw new Error("Private disposable file state could not be verified.");
    }

    const privateView = await dependencies.fetchAnonymousView(ids.fileId);
    if (![401, 403, 404].includes(privateView.status)) {
      throw new Error("Private disposable file did not return an expected anonymous denial.");
    }
    result.privateDenied = true;

    const publicFile = await dependencies.makeFilePublic(ids.fileId);
    if (publicFile.$id !== ids.fileId || !hasExactPublicReadPermission(publicFile.$permissions)) {
      throw new Error("Public disposable file state could not be verified.");
    }

    const publicView = await dependencies.fetchAnonymousView(ids.fileId);
    if (
      publicView.status !== 200 ||
      !publicView.contentType.toLowerCase().startsWith("image/png") ||
      !bytesEqual(publicView.bytes, imageBytes)
    ) {
      throw new Error("Anonymous public file delivery could not be verified.");
    }
    result.publicDelivered = true;

    await dependencies.createCategory(ids.categoryId);
    categoryCreated = true;
    await dependencies.createProduct(ids);
    productCreated = true;
    result.productCreated = true;

    if (dependencies.holdForBrowser) {
      await dependencies.holdForBrowser(ids);
      result.browserHoldCompleted = true;
    }

    return result;
  } finally {
    if (productCreated) {
      try {
        await dependencies.deleteProduct(ids.productId);
      } catch {
        cleanupErrors.push("product");
      }
    }
    if (categoryCreated) {
      try {
        await dependencies.deleteCategory(ids.categoryId);
      } catch {
        cleanupErrors.push("category");
      }
    }
    if (fileCreated) {
      try {
        await dependencies.deleteFile(ids.fileId);
      } catch {
        cleanupErrors.push("file");
      }
    }

    result.cleanupComplete = cleanupErrors.length === 0;
    if (cleanupErrors.length) {
      throw new Error(`Disposable cleanup failed for: ${cleanupErrors.join(", ")}.`);
    }
  }
}
