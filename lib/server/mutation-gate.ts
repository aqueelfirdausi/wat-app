import "server-only";

export const MUTATIONS_DISABLED_CODE = "MUTATIONS_DISABLED";

export class MutationsDisabledError extends Error {
  readonly code = MUTATIONS_DISABLED_CODE;
  readonly status = 503;

  constructor() {
    super("Backend mutations are temporarily disabled.");
    this.name = "MutationsDisabledError";
  }
}

export function isMutationEnabled() {
  return process.env.WAT_MUTATIONS_ENABLED === "true";
}

export function requireMutationEnabled() {
  if (!isMutationEnabled()) {
    throw new MutationsDisabledError();
  }
}

export function mutationDisabledResponse() {
  return Response.json(
    {
      error: "Backend mutations are temporarily disabled.",
      code: MUTATIONS_DISABLED_CODE
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
