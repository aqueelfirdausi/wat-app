export const PHASE3W_FIXTURE_NAME_PREFIX = "__wat_phase_3w_disposable__";
export const PHASE3W_FIXTURE_SLUG_PREFIX = "wat-phase-3w-disposable-";

export type ProductMutationVerificationMode =
  | "read_only"
  | "lifecycle"
  | "recover";

export function parseProductMutationVerificationArguments(
  arguments_: readonly string[]
): ProductMutationVerificationMode {
  const lifecycle = arguments_.includes("--run-lifecycle");
  const recover = arguments_.includes("--recover-disposable-orphans");
  const confirmation = arguments_.includes(
    "--confirm-destructive-disposable-product-mutations"
  );
  const known = new Set([
    "--run-lifecycle",
    "--recover-disposable-orphans",
    "--confirm-destructive-disposable-product-mutations"
  ]);
  if (arguments_.some((argument) => !known.has(argument))) {
    throw new Error("Unknown Phase 3W verification argument.");
  }
  if (lifecycle && recover) {
    throw new Error("Lifecycle and recovery modes are mutually exclusive.");
  }
  if ((lifecycle || recover) && !confirmation) {
    throw new Error("Both explicit Phase 3W mutation gates are required.");
  }
  if (confirmation && !lifecycle && !recover) {
    throw new Error("Confirmation alone cannot enable Phase 3W writes.");
  }
  return lifecycle ? "lifecycle" : recover ? "recover" : "read_only";
}

export type ProductMutationVerificationCounts = {
  products: number;
  categories: number;
  files: number;
};

export type ProductMutationVerificationDependencies = {
  counts(): Promise<ProductMutationVerificationCounts>;
  prefixMatches(): Promise<{ products: string[]; categories: string[] }>;
  createFirstCategory(): Promise<{ id: string; updatedAt: string }>;
  createSecondCategory(): Promise<{ id: string; updatedAt: string }>;
  createProduct(): Promise<{ id: string; updatedAt: string }>;
  verifyCreatedProduct(): Promise<void>;
  retryCreate(): Promise<void>;
  duplicateSlugCode(): Promise<string | null>;
  updateProduct(): Promise<{ updatedAt: string }>;
  reassignProduct(): Promise<{ updatedAt: string }>;
  staleUpdateCode(): Promise<string | null>;
  forbiddenInputCodes(): Promise<string[]>;
  editorDeleteCode(): Promise<string | null>;
  selectedDeleteCode(): Promise<string | null>;
  imageDeleteCode(): Promise<string | null>;
  referencedCategoryDeleteCode(): Promise<string | null>;
  adminDelete(): Promise<void>;
  deleteCategories(): Promise<void>;
  cleanup(): Promise<void>;
  cleanupIsProven(): Promise<boolean>;
};

export async function runProductMutationVerificationLifecycle(
  dependencies: ProductMutationVerificationDependencies
) {
  const starting = await dependencies.counts();
  if (starting.products !== 0 || starting.categories !== 0 || starting.files !== 0) {
    throw new Error("Phase 3W lifecycle requires zero starting rows and files.");
  }
  const startingPrefixes = await dependencies.prefixMatches();
  if (startingPrefixes.products.length || startingPrefixes.categories.length) {
    throw new Error("Phase 3W lifecycle found pre-existing disposable fixtures.");
  }
  const proof: string[] = [];
  try {
    await dependencies.createFirstCategory();
    await dependencies.createSecondCategory();
    await dependencies.createProduct();
    await dependencies.verifyCreatedProduct();
    proof.push("private product create");
    await dependencies.retryCreate();
    proof.push("idempotent create retry");
    if ((await dependencies.duplicateSlugCode()) !== "CONFLICT") {
      throw new Error("Duplicate slug was not rejected.");
    }
    await dependencies.updateProduct();
    await dependencies.reassignProduct();
    proof.push("ordinary update and canonical category reassignment");
    if ((await dependencies.staleUpdateCode()) !== "STALE_WRITE") {
      throw new Error("Stale update was not rejected.");
    }
    const forbiddenCodes = await dependencies.forbiddenInputCodes();
    if (
      forbiddenCodes.length !== 3 ||
      forbiddenCodes.some((code) => code !== "VALIDATION_FAILED")
    ) {
      throw new Error("Forbidden chosen/image/public input was not rejected.");
    }
    if ((await dependencies.editorDeleteCode()) !== "AUTHORIZATION_FAILED") {
      throw new Error("Product editor deletion was not rejected.");
    }
    if ((await dependencies.selectedDeleteCode()) !== "REFERENCE_CONFLICT") {
      throw new Error("Selected-product deletion was not blocked.");
    }
    if ((await dependencies.imageDeleteCode()) !== "REFERENCE_CONFLICT") {
      throw new Error("Image-linked deletion was not blocked.");
    }
    if ((await dependencies.referencedCategoryDeleteCode()) !== "REFERENCE_CONFLICT") {
      throw new Error("Referenced-category deletion was not blocked.");
    }
    proof.push("stale, forbidden, role, selected, image, and reference denials");
    await dependencies.adminDelete();
    await dependencies.deleteCategories();
  } finally {
    await dependencies.cleanup();
  }
  const ending = await dependencies.counts();
  const endingPrefixes = await dependencies.prefixMatches();
  if (
    ending.products !== starting.products ||
    ending.categories !== starting.categories ||
    ending.files !== starting.files ||
    endingPrefixes.products.length ||
    endingPrefixes.categories.length ||
    !(await dependencies.cleanupIsProven())
  ) {
    throw new Error("Phase 3W cleanup could not be proven.");
  }
  return { starting, ending, proof, cleanupProven: true as const };
}
