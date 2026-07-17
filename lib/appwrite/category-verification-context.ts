import "server-only";

const phase3vVerificationToken = Symbol("phase3v-category-verification");
const phase3wVerificationToken = Symbol("phase3w-category-verification");

export type CategoryMutationExecutionContext =
  | { kind: "application" }
  | {
      kind: "phase3v_verification";
      token: symbol;
      fixtureRowId: string;
    }
  | {
      kind: "phase3w_verification";
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

export function createPhase3WCategoryVerificationContext(
  fixtureRowId: string
): CategoryMutationExecutionContext {
  if (!/^phase3w_disposable_c[12]_[a-z0-9]{6,10}$/.test(fixtureRowId)) {
    throw new Error("Phase 3W category verification row ID is invalid.");
  }
  return {
    kind: "phase3w_verification",
    token: phase3wVerificationToken,
    fixtureRowId
  };
}

export function isPhase3WCategoryVerificationContext(
  value: CategoryMutationExecutionContext
) {
  return (
    value.kind === "phase3w_verification" &&
    value.token === phase3wVerificationToken &&
    /^phase3w_disposable_c[12]_[a-z0-9]{6,10}$/.test(value.fixtureRowId)
  );
}

export function isCategoryMutationVerificationContext(
  value: CategoryMutationExecutionContext
) {
  return (
    isPhase3VCategoryVerificationContext(value) ||
    isPhase3WCategoryVerificationContext(value)
  );
}
