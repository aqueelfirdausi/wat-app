import "server-only";

const phase3vVerificationToken = Symbol("phase3v-category-verification");

export type CategoryMutationExecutionContext =
  | { kind: "application" }
  | {
      kind: "phase3v_verification";
      token: symbol;
      fixtureRowId: string;
    };

export const APPLICATION_CATEGORY_MUTATION_CONTEXT: CategoryMutationExecutionContext = {
  kind: "application"
};

export function createPhase3VCategoryVerificationContext(
  fixtureRowId: string
): CategoryMutationExecutionContext {
  if (!/^phase3v_disposable_c_[a-z0-9]{6,12}$/.test(fixtureRowId)) {
    throw new Error("Phase 3V category verification row ID is invalid.");
  }
  return {
    kind: "phase3v_verification",
    token: phase3vVerificationToken,
    fixtureRowId
  };
}

export function isPhase3VCategoryVerificationContext(
  value: CategoryMutationExecutionContext
) {
  return (
    value.kind === "phase3v_verification" &&
    value.token === phase3vVerificationToken &&
    /^phase3v_disposable_c_[a-z0-9]{6,12}$/.test(value.fixtureRowId)
  );
}
