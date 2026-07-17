export type AdminCatalogueVerificationMode = {
  apply: boolean;
  holdSeconds: number;
};

export type DisposableAdminCatalogueIds = {
  categoryId: string;
  publicProductId: string;
  hiddenProductId: string;
  publicSlug: string;
  hiddenSlug: string;
};

export type AdminCatalogueCounts = {
  products: number;
  categories: number;
};

export type AdminCatalogueVerificationDependencies = {
  counts(): Promise<AdminCatalogueCounts>;
  createCategory(ids: DisposableAdminCatalogueIds): Promise<void>;
  createPublicProduct(ids: DisposableAdminCatalogueIds): Promise<void>;
  createHiddenProduct(ids: DisposableAdminCatalogueIds): Promise<void>;
  verifyRows(ids: DisposableAdminCatalogueIds): Promise<boolean>;
  holdForBrowser?(ids: DisposableAdminCatalogueIds): Promise<void>;
  deleteProduct(id: string): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  productIsMissing(id: string): Promise<boolean>;
  categoryIsMissing(id: string): Promise<boolean>;
};

export function parseAdminCatalogueVerificationArguments(
  argumentsList: string[]
): AdminCatalogueVerificationMode {
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
    if (
      argument !== "--apply" &&
      argument !== "--confirm-disposable-admin-catalogue"
    ) {
      throw new Error(`Unknown admin-catalogue verification argument: ${argument}`);
    }
    flags.add(argument);
  }
  const apply = flags.has("--apply");
  const confirmed = flags.has("--confirm-disposable-admin-catalogue");
  if (apply !== confirmed) {
    throw new Error(
      "Disposable admin catalogue verification requires both mutation gates."
    );
  }
  if (!apply && holdSeconds !== 0) {
    throw new Error("Browser hold is available only in confirmed apply mode.");
  }
  return { apply, holdSeconds };
}

export async function runDisposableAdminCatalogueLifecycle(input: {
  ids: DisposableAdminCatalogueIds;
  dependencies: AdminCatalogueVerificationDependencies;
}) {
  const { ids, dependencies } = input;
  const baseline = await dependencies.counts();
  let categoryCreated = false;
  let publicProductCreated = false;
  let hiddenProductCreated = false;
  const cleanupErrors: string[] = [];
  const result = {
    categoryCreated: false,
    publicProductCreated: false,
    hiddenProductCreated: false,
    rowsVerified: false,
    browserHoldCompleted: false,
    cleanupVerified: false
  };

  try {
    await dependencies.createCategory(ids);
    categoryCreated = true;
    result.categoryCreated = true;
    await dependencies.createPublicProduct(ids);
    publicProductCreated = true;
    result.publicProductCreated = true;
    await dependencies.createHiddenProduct(ids);
    hiddenProductCreated = true;
    result.hiddenProductCreated = true;
    result.rowsVerified = await dependencies.verifyRows(ids);
    if (!result.rowsVerified) throw new Error("Disposable catalogue rows were invalid.");
    const during = await dependencies.counts();
    if (
      during.products !== baseline.products + 2 ||
      during.categories !== baseline.categories + 1
    ) {
      throw new Error("Disposable catalogue totals did not match the bounded lifecycle.");
    }
    if (dependencies.holdForBrowser) {
      await dependencies.holdForBrowser(ids);
      result.browserHoldCompleted = true;
    }
  } finally {
    if (hiddenProductCreated) {
      try {
        await dependencies.deleteProduct(ids.hiddenProductId);
      } catch {
        cleanupErrors.push("hidden product");
      }
    }
    if (publicProductCreated) {
      try {
        await dependencies.deleteProduct(ids.publicProductId);
      } catch {
        cleanupErrors.push("public product");
      }
    }
    if (categoryCreated) {
      try {
        await dependencies.deleteCategory(ids.categoryId);
      } catch {
        cleanupErrors.push("category");
      }
    }

    const finalCounts = await dependencies.counts();
    result.cleanupVerified =
      finalCounts.products === baseline.products &&
      finalCounts.categories === baseline.categories &&
      (!hiddenProductCreated ||
        await dependencies.productIsMissing(ids.hiddenProductId)) &&
      (!publicProductCreated ||
        await dependencies.productIsMissing(ids.publicProductId)) &&
      (!categoryCreated || await dependencies.categoryIsMissing(ids.categoryId));
    if (!result.cleanupVerified) cleanupErrors.push("verification");
    if (cleanupErrors.length) {
      throw new Error(`Disposable admin catalogue cleanup failed: ${cleanupErrors.join(", ")}.`);
    }
  }

  return { ...result, baseline };
}
