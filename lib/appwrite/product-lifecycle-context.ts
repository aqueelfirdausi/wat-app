import "server-only";

const phase3xVerificationToken = Symbol("phase3x-product-lifecycle-verification");
const PHASE_3X_ID = /^phase3x_disposable_[a-z0-9_-]{2,15}$/;

export type ProductLifecycleExecutionContext =
  | { kind: "application" }
  | {
      kind: "phase3x_verification";
      token: symbol;
      fixtureProductIds: readonly string[];
      fixtureFileIds: readonly string[];
    };

export const APPLICATION_PRODUCT_LIFECYCLE_CONTEXT: ProductLifecycleExecutionContext = {
  kind: "application"
};

export function createPhase3XProductLifecycleVerificationContext(input: {
  productIds: readonly string[];
  fileIds: readonly string[];
}): ProductLifecycleExecutionContext {
  if (
    input.productIds.length < 2 ||
    input.fileIds.length < 1 ||
    !input.productIds.every((id) => PHASE_3X_ID.test(id)) ||
    !input.fileIds.every((id) => PHASE_3X_ID.test(id))
  ) {
    throw new Error("Phase 3X verification resource IDs are invalid.");
  }
  return {
    kind: "phase3x_verification",
    token: phase3xVerificationToken,
    fixtureProductIds: [...input.productIds],
    fixtureFileIds: [...input.fileIds]
  };
}

export function isPhase3XProductLifecycleVerificationContext(
  value: ProductLifecycleExecutionContext
) {
  return (
    value.kind === "phase3x_verification" &&
    value.token === phase3xVerificationToken &&
    value.fixtureProductIds.length >= 2 &&
    value.fixtureFileIds.length >= 1 &&
    value.fixtureProductIds.every((id) => PHASE_3X_ID.test(id)) &&
    value.fixtureFileIds.every((id) => PHASE_3X_ID.test(id))
  );
}

export function assertPhase3XResourceAllowed(
  context: ProductLifecycleExecutionContext,
  kind: "product" | "file",
  id: string
) {
  if (context.kind !== "phase3x_verification") return;
  const allowed = kind === "product" ? context.fixtureProductIds : context.fixtureFileIds;
  if (!allowed.includes(id)) {
    throw new Error(`Phase 3X verification ${kind} is outside the disposable allow-list.`);
  }
}
