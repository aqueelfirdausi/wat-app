export const PHASE_3X_RUN_GATE = "--run-lifecycle";
export const PHASE_3X_CONFIRM_GATE =
  "--confirm-destructive-disposable-product-lifecycle";

export function parseProductLifecycleVerificationArguments(args: readonly string[]) {
  const run = args.includes(PHASE_3X_RUN_GATE);
  const confirm = args.includes(PHASE_3X_CONFIRM_GATE);
  if (run !== confirm) {
    throw new Error("Phase 3X lifecycle requires both explicit disposable-write gates.");
  }
  const unknown = args.filter(
    (argument) =>
      argument !== PHASE_3X_RUN_GATE && argument !== PHASE_3X_CONFIRM_GATE
  );
  if (unknown.length) {
    throw new Error(`Unknown Phase 3X lifecycle argument: ${unknown[0]}`);
  }
  return { apply: run && confirm };
}

export function phase3XCleanupOrder(input: {
  publicProductIds: readonly string[];
  fileIds: readonly string[];
  productIds: readonly string[];
  categoryIds: readonly string[];
}) {
  return [
    ...input.publicProductIds.map((id) => `hide:${id}`),
    ...input.fileIds.map((id) => `privatize-file:${id}`),
    ...input.fileIds.map((id) => `delete-file:${id}`),
    ...input.productIds.map((id) => `delete-product:${id}`),
    ...input.categoryIds.map((id) => `delete-category:${id}`)
  ];
}
