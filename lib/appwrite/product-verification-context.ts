import "server-only";

const phase3wVerificationToken = Symbol("phase3w-product-verification");
const phase3xCleanupToken = Symbol("phase3x-product-cleanup-verification");

export type ProductMutationExecutionContext =
  | { kind: "application" }
  | {
      kind: "phase3w_verification";
      token: symbol;
      fixtureProductId: string;
    }
  | {
      kind: "phase3x_cleanup_verification";
      token: symbol;
      fixtureProductIds: readonly string[];
    };

export const APPLICATION_PRODUCT_MUTATION_CONTEXT: ProductMutationExecutionContext = {
  kind: "application"
};

export function createPhase3WProductVerificationContext(
  fixtureProductId: string
): ProductMutationExecutionContext {
  if (!/^phase3w_disposable_p[12]_[a-z0-9]{6,10}$/.test(fixtureProductId)) {
    throw new Error("Phase 3W product verification row ID is invalid.");
  }
  return {
    kind: "phase3w_verification",
    token: phase3wVerificationToken,
    fixtureProductId
  };
}

export function isPhase3WProductVerificationContext(
  value: ProductMutationExecutionContext
) {
  return (
    value.kind === "phase3w_verification" &&
    value.token === phase3wVerificationToken &&
    /^phase3w_disposable_p[12]_[a-z0-9]{6,10}$/.test(value.fixtureProductId)
  );
}

export function createPhase3XProductCleanupVerificationContext(
  fixtureProductIds: readonly string[]
): ProductMutationExecutionContext {
  if (
    fixtureProductIds.length < 2 ||
    !fixtureProductIds.every((id) =>
      /^phase3x_disposable_[a-z0-9_-]{2,15}$/.test(id)
    )
  ) {
    throw new Error("Phase 3X product cleanup verification IDs are invalid.");
  }
  return {
    kind: "phase3x_cleanup_verification",
    token: phase3xCleanupToken,
    fixtureProductIds: [...fixtureProductIds]
  };
}

export function isPhase3XProductCleanupVerificationContext(
  value: ProductMutationExecutionContext
) {
  return (
    value.kind === "phase3x_cleanup_verification" &&
    value.token === phase3xCleanupToken &&
    value.fixtureProductIds.length >= 2 &&
    value.fixtureProductIds.every((id) =>
      /^phase3x_disposable_[a-z0-9_-]{2,15}$/.test(id)
    )
  );
}

export function isProductMutationVerificationContext(
  value: ProductMutationExecutionContext
) {
  return (
    isPhase3WProductVerificationContext(value) ||
    isPhase3XProductCleanupVerificationContext(value)
  );
}
