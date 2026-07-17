export const BACKEND_MODES = ["firebase", "appwrite"] as const;
export type BackendMode = (typeof BACKEND_MODES)[number];

export class BackendConfigurationError extends Error {
  readonly code = "BACKEND_CONFIGURATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "BackendConfigurationError";
  }
}

export function parseBackendMode(value: string | undefined): BackendMode {
  if (value === "firebase" || value === "appwrite") return value;
  throw new BackendConfigurationError(
    "WAT_BACKEND must be exactly \"firebase\" or \"appwrite\"."
  );
}
