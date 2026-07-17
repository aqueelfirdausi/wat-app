import "server-only";

import type { StaffAuthorizationResult } from "@/lib/appwrite/auth/authorization";
import {
  isJsonContentType,
  isSameOriginRequest,
  readBoundedJson
} from "@/lib/appwrite/auth/validation";
import type { createAppwriteProductMutationService } from "@/lib/appwrite/product-mutations";
import { MutationContractError, type MutationErrorCode } from "@/lib/appwrite/mutation-design";
import { MutationsDisabledError } from "@/lib/server/mutation-gate";

type ProductMutationService = ReturnType<typeof createAppwriteProductMutationService>;

export type ProductMutationHandlerDependencies = {
  resolveIdentity(): Promise<StaffAuthorizationResult>;
  service: ProductMutationService;
};

type HandlerResult = {
  status: number;
  body: Record<string, unknown>;
};

function errorStatus(code: MutationErrorCode) {
  switch (code) {
    case "VALIDATION_FAILED":
      return 400;
    case "AUTHORIZATION_FAILED":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "STALE_WRITE":
    case "REFERENCE_CONFLICT":
      return 409;
    case "DEPENDENCY_FAILED":
      return 424;
    case "CLEANUP_FAILED":
    case "INTERNAL_ERROR":
      return 500;
  }
}

function safeError(error: unknown): HandlerResult {
  if (error instanceof MutationsDisabledError) {
    return {
      status: error.status,
      body: { ok: false, code: error.code, error: error.message }
    };
  }
  if (error instanceof MutationContractError) {
    return {
      status: errorStatus(error.code),
      body: {
        ok: false,
        code: error.code,
        error: error.message,
        ...(error.field ? { field: error.field } : {})
      }
    };
  }
  return {
    status: 500,
    body: { ok: false, code: "INTERNAL_ERROR", error: "Product mutation failed." }
  };
}

export async function handleProductMutationRequest(
  request: Request,
  operation: "create" | "update" | "delete",
  dependencies: ProductMutationHandlerDependencies
): Promise<HandlerResult> {
  if (!isSameOriginRequest(request)) {
    return {
      status: 403,
      body: { ok: false, code: "AUTHORIZATION_FAILED", error: "Request origin is invalid." }
    };
  }
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return {
      status: 415,
      body: { ok: false, code: "VALIDATION_FAILED", error: "JSON is required." }
    };
  }
  let payload: unknown;
  try {
    payload = await readBoundedJson(request, 32_768);
  } catch {
    return {
      status: 400,
      body: { ok: false, code: "VALIDATION_FAILED", error: "Request is invalid." }
    };
  }
  const authorization = await dependencies.resolveIdentity();
  if (!authorization.ok) {
    return {
      status: authorization.code === "no_session" ? 401 : 403,
      body: {
        ok: false,
        code: "AUTHORIZATION_FAILED",
        error: "Product action is not authorized."
      }
    };
  }
  try {
    const data =
      operation === "create"
        ? await dependencies.service.createProduct(payload, authorization.identity)
        : operation === "update"
          ? await dependencies.service.updateProduct(payload, authorization.identity)
          : await dependencies.service.deleteProduct(payload, authorization.identity);
    return {
      status: operation === "create" ? 201 : 200,
      body: { ok: true, data }
    };
  } catch (error) {
    return safeError(error);
  }
}
