import type { CategoryDeleteDto, CategoryMutationDto } from "@/lib/appwrite/category-mutations";
import type { MutationErrorCode } from "@/lib/appwrite/mutation-design";

export const PHASE3V_FIXTURE_SLUG_PREFIX = "wat-phase-3v-disposable-";

export type CategoryMutationVerificationMode =
  | "read-only"
  | "disposable-write"
  | "disposable-recovery";

export function parseCategoryMutationVerificationArguments(
  argumentsList: string[]
): CategoryMutationVerificationMode {
  const allowed = new Set([
    "--run-lifecycle",
    "--recover-disposable-orphans",
    "--confirm-destructive-disposable-category-mutations"
  ]);
  const unknown = argumentsList.find((argument) => !allowed.has(argument));
  if (unknown) throw new Error(`Unknown Phase 3V verification argument: ${unknown}`);
  const authorized = argumentsList.includes("--run-lifecycle");
  const recovery = argumentsList.includes("--recover-disposable-orphans");
  const confirmed = argumentsList.includes(
    "--confirm-destructive-disposable-category-mutations"
  );
  if (authorized && recovery) {
    throw new Error("Phase 3V lifecycle and recovery modes are mutually exclusive.");
  }
  if ((authorized || recovery) !== confirmed) {
    throw new Error("Phase 3V disposable verification requires both explicit gates.");
  }
  if (authorized) return "disposable-write";
  if (recovery) return "disposable-recovery";
  return "read-only";
}

export type CategoryMutationVerificationIds = {
  categoryId: string;
  productId: string;
  originalName: string;
  originalSlug: string;
  renamedName: string;
  renamedSlug: string;
};

type Counts = {
  products: number;
  categories: number;
};

export type CategoryMutationVerificationDependencies = {
  counts(): Promise<Counts>;
  createCategory(ids: CategoryMutationVerificationIds): Promise<CategoryMutationDto>;
  readCategory(categoryId: string): Promise<CategoryMutationDto>;
  renameCategory(
    ids: CategoryMutationVerificationIds,
    expectedUpdatedAt: string
  ): Promise<CategoryMutationDto>;
  staleRenameCode(
    ids: CategoryMutationVerificationIds,
    staleUpdatedAt: string
  ): Promise<MutationErrorCode | null>;
  productEditorDeleteCode(
    categoryId: string,
    expectedUpdatedAt: string
  ): Promise<MutationErrorCode | null>;
  createReferenceProduct(
    ids: CategoryMutationVerificationIds,
    category: CategoryMutationDto
  ): Promise<void>;
  referencedDeleteCode(
    categoryId: string,
    expectedUpdatedAt: string
  ): Promise<MutationErrorCode | null>;
  deleteReferenceProduct(productId: string): Promise<void>;
  deleteCategory(
    categoryId: string,
    expectedUpdatedAt: string
  ): Promise<CategoryDeleteDto>;
  cleanupProduct(productId: string): Promise<void>;
  cleanupCategory(categoryId: string): Promise<void>;
  productIsMissing(productId: string): Promise<boolean>;
  categoryIsMissing(categoryId: string): Promise<boolean>;
  prefixMatches(): Promise<{ products: number; categories: number }>;
};

export async function runCategoryMutationVerificationLifecycle(input: {
  ids: CategoryMutationVerificationIds;
  dependencies: CategoryMutationVerificationDependencies;
}) {
  const { ids, dependencies } = input;
  const baseline = await dependencies.counts();
  let categoryCreated = false;
  let categoryDeleted = false;
  let productCreated = false;
  let productDeleted = false;
  const cleanupErrors: string[] = [];
  const result = {
    createVerified: false,
    normalizedReadVerified: false,
    renameVerified: false,
    staleUpdateRejected: false,
    productEditorDeleteRejected: false,
    referenceDeleteRejected: false,
    adminDeleteVerified: false,
    cleanupVerified: false
  };

  try {
    const created = await dependencies.createCategory(ids);
    categoryCreated = true;
    result.createVerified =
      created.id === ids.categoryId &&
      created.name === ids.originalName &&
      created.slug === ids.originalSlug &&
      Number.isFinite(Date.parse(created.updatedAt));
    if (!result.createVerified) throw new Error("Disposable category create verification failed.");

    const read = await dependencies.readCategory(ids.categoryId);
    result.normalizedReadVerified =
      read.id === created.id &&
      read.name === created.name &&
      read.slug === created.slug &&
      read.updatedAt === created.updatedAt;
    if (!result.normalizedReadVerified) {
      throw new Error("Disposable category read verification failed.");
    }

    const renamed = await dependencies.renameCategory(ids, created.updatedAt);
    result.renameVerified =
      renamed.id === ids.categoryId &&
      renamed.name === ids.renamedName &&
      renamed.slug === ids.renamedSlug &&
      renamed.updatedAt !== created.updatedAt &&
      Number.isFinite(Date.parse(renamed.updatedAt));
    if (!result.renameVerified) throw new Error("Disposable category rename failed.");

    const staleCode = await dependencies.staleRenameCode(ids, created.updatedAt);
    result.staleUpdateRejected = staleCode === "STALE_WRITE";
    if (!result.staleUpdateRejected) {
      throw new Error(`Stale category update was not rejected as STALE_WRITE (${staleCode ?? "none"}).`);
    }

    result.productEditorDeleteRejected =
      (await dependencies.productEditorDeleteCode(ids.categoryId, renamed.updatedAt)) ===
      "AUTHORIZATION_FAILED";
    if (!result.productEditorDeleteRejected) {
      throw new Error("Product editor category deletion was not rejected.");
    }

    await dependencies.createReferenceProduct(ids, renamed);
    productCreated = true;
    const during = await dependencies.counts();
    if (
      during.categories !== baseline.categories + 1 ||
      during.products !== baseline.products + 1
    ) {
      throw new Error("Disposable reference totals are invalid.");
    }

    result.referenceDeleteRejected =
      (await dependencies.referencedDeleteCode(ids.categoryId, renamed.updatedAt)) ===
      "REFERENCE_CONFLICT";
    if (!result.referenceDeleteRejected) {
      throw new Error("Referenced category deletion was not rejected.");
    }

    await dependencies.deleteReferenceProduct(ids.productId);
    productDeleted = true;
    const deleted = await dependencies.deleteCategory(ids.categoryId, renamed.updatedAt);
    categoryDeleted = true;
    result.adminDeleteVerified =
      deleted.id === ids.categoryId && deleted.deleted === true;
    if (!result.adminDeleteVerified) throw new Error("Admin category delete failed.");
  } finally {
    if (!productDeleted) {
      try {
        await dependencies.cleanupProduct(ids.productId);
      } catch {
        cleanupErrors.push("product");
      }
    }
    if (!categoryDeleted) {
      try {
        await dependencies.cleanupCategory(ids.categoryId);
      } catch {
        cleanupErrors.push("category");
      }
    }
    const [finalCounts, productMissing, categoryMissing, prefixMatches] =
      await Promise.all([
        dependencies.counts(),
        dependencies.productIsMissing(ids.productId),
        dependencies.categoryIsMissing(ids.categoryId),
        dependencies.prefixMatches()
      ]);
    result.cleanupVerified =
      finalCounts.products === baseline.products &&
      finalCounts.categories === baseline.categories &&
      productMissing &&
      categoryMissing &&
      prefixMatches.products === 0 &&
      prefixMatches.categories === 0;
    if (!result.cleanupVerified) {
      cleanupErrors.push(
        `independent verification (final=${finalCounts.products}/${finalCounts.categories}, ` +
        `missing=${productMissing}/${categoryMissing}, ` +
        `prefix=${prefixMatches.products}/${prefixMatches.categories}, ` +
        `created=${productCreated}/${categoryCreated}, deleted=${productDeleted}/${categoryDeleted})`
      );
    }
    if (cleanupErrors.length > 0) {
      throw new Error(`Phase 3V cleanup failed: ${cleanupErrors.join(", ")}.`);
    }
  }

  return { ...result, baseline };
}
