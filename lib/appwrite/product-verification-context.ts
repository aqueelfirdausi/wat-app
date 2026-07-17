import "server-only";

const phase3wVerificationToken = Symbol("phase3w-product-verification");

export type ProductMutationExecutionContext =
  | { kind: "application" }
  | {
      kind: "phase3w_verification";
      token: symbol;
      fixtureProductId: string;
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
