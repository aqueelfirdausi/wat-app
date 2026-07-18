import "server-only";

import type { StaffAuthorizationResult } from "@/lib/appwrite/auth/authorization";
import {
  isJsonContentType,
  isSameOriginRequest,
  readBoundedJson
} from "@/lib/appwrite/auth/validation";
import type { createAppwriteProductLifecycleService } from "@/lib/appwrite/product-lifecycle";
import { prepareProductLifecycleActivityEvent } from "@/lib/appwrite/product-lifecycle";
import {
  MutationContractError,
  type MutationErrorCode
} from "@/lib/appwrite/mutation-design";
import { MutationsDisabledError } from "@/lib/server/mutation-gate";

type LifecycleService = ReturnType<typeof createAppwriteProductLifecycleService>;

export type ProductLifecycleHandlerDependencies = {
  resolveIdentity(): Promise<StaffAuthorizationResult>;
  service: LifecycleService;
  emitActivityEvent?: (
    event: ReturnType<typeof prepareProductLifecycleActivityEvent>
  ) => void | Promise<void>;
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
    case "AUDIT_PERSISTENCE_FAILED":
      return 500;
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
    body: {
      ok: false,
      code: "INTERNAL_ERROR",
      error: "Product lifecycle mutation failed."
    }
  };
}

async function persistHandlerFailure(input: {
  operation: unknown;
  command: Record<string, unknown>;
  identity: Extract<StaffAuthorizationResult, { ok: true }>["identity"];
  error: unknown;
  entityType: "product" | "image";
  emitActivityEvent?: ProductLifecycleHandlerDependencies["emitActivityEvent"];
}) {
  if (
    !input.emitActivityEvent ||
    input.operation === "chosen" ||
    input.operation === "cleanup_orphan" ||
    !(input.error instanceof MutationContractError) ||
    input.error.code === "VALIDATION_FAILED" ||
    input.error.code === "AUTHORIZATION_FAILED" ||
    input.error.code === "AUDIT_PERSISTENCE_FAILED"
  ) {
    return;
  }
  const entityId =
    input.entityType === "image"
      ? input.command.productId
      : input.command.productId ?? input.command.targetProductId;
  const requestId = input.command.idempotencyKey;
  if (
    typeof entityId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(entityId) ||
    typeof requestId !== "string" ||
    !/^[A-Za-z0-9._:-]{8,128}$/.test(requestId)
  ) {
    return;
  }
  const eventType =
    input.entityType === "image"
      ? "image.mutation_failed"
      : input.operation === "chosen_clear"
        ? "product.chosen_failed"
        : "product.visibility_transition_failed";
  await input.emitActivityEvent(
    prepareProductLifecycleActivityEvent({
      eventType,
      entityType: input.entityType,
      entityId,
      identity: input.identity,
      timestamp: new Date().toISOString(),
      requestId,
      before: null,
      after: null,
      result:
        input.error.code === "CLEANUP_FAILED"
          ? "compensation_failed"
          : "failed",
      errorClassification: input.error.code,
      ...(input.error.code === "CLEANUP_FAILED"
        ? { compensationResult: "cleanup outcome unproven" }
        : {}),
      metadata: {
        operation:
          typeof input.operation === "string"
            ? input.operation
            : "unknown"
      }
    })
  );
}

async function authorizedIdentity(
  dependencies: ProductLifecycleHandlerDependencies
): Promise<
  | { ok: true; identity: Extract<StaffAuthorizationResult, { ok: true }>["identity"] }
  | { ok: false; result: HandlerResult }
> {
  const authorization = await dependencies.resolveIdentity();
  if (!authorization.ok) {
    return {
      ok: false,
      result: {
        status: authorization.code === "no_session" ? 401 : 403,
        body: {
          ok: false,
          code: "AUTHORIZATION_FAILED",
          error: "Product lifecycle action is not authorized."
        }
      } satisfies HandlerResult
    };
  }
  return { ok: true, identity: authorization.identity };
}

export async function handleProductLifecycleRequest(
  request: Request,
  dependencies: ProductLifecycleHandlerDependencies
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
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      status: 400,
      body: { ok: false, code: "VALIDATION_FAILED", error: "Request is invalid." }
    };
  }
  const { operation, ...command } = payload as Record<string, unknown>;
  const authorization = await authorizedIdentity(dependencies);
  if (!authorization.ok) return authorization.result;
  try {
    const data =
      operation === "visibility"
        ? await dependencies.service.setStorefrontVisibility(
            command,
            authorization.identity
          )
        : operation === "merchandising"
          ? await dependencies.service.setMerchandising(command, authorization.identity)
          : operation === "chosen"
            ? await dependencies.service.selectChosenProduct(
                command,
                authorization.identity
              )
            : operation === "chosen_clear"
              ? await dependencies.service.clearChosenProduct(
                  command,
                  authorization.identity
                )
            : operation === "cleanup_orphan"
              ? await dependencies.service.cleanupOrphanFile(
                  command,
                  authorization.identity
                )
              : (() => {
                  throw new MutationContractError(
                    "VALIDATION_FAILED",
                    "Lifecycle operation is invalid.",
                    "operation"
                  );
                })();
    return { status: 200, body: { ok: true, data } };
  } catch (error) {
    try {
      await persistHandlerFailure({
        operation,
        command,
        identity: authorization.identity,
        error,
        entityType: "product",
        emitActivityEvent: dependencies.emitActivityEvent
      });
    } catch {
      return safeError(
        new MutationContractError(
          "AUDIT_PERSISTENCE_FAILED",
          "Business outcome was preserved but durable audit persistence failed."
        )
      );
    }
    return safeError(error);
  }
}

export async function handleProductImageRequest(
  request: Request,
  dependencies: ProductLifecycleHandlerDependencies
): Promise<HandlerResult> {
  if (!isSameOriginRequest(request)) {
    return {
      status: 403,
      body: { ok: false, code: "AUTHORIZATION_FAILED", error: "Request origin is invalid." }
    };
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return {
      status: 415,
      body: {
        ok: false,
        code: "VALIDATION_FAILED",
        error: "Multipart form data is required."
      }
    };
  }
  const authorization = await authorizedIdentity(dependencies);
  if (!authorization.ok) return authorization.result;
  let auditOperation: FormDataEntryValue | null = null;
  let auditCommand: Record<string, unknown> = {};
  try {
    const form = await request.formData();
    const operation = form.get("operation");
    const productId = form.get("productId");
    const expectedUpdatedAt = form.get("expectedUpdatedAt");
    const idempotencyKey = form.get("idempotencyKey");
    if (
      typeof productId !== "string" ||
      typeof expectedUpdatedAt !== "string" ||
      typeof idempotencyKey !== "string"
    ) {
      throw new MutationContractError(
        "VALIDATION_FAILED",
        "Image mutation fields are invalid."
      );
    }
    const command = { productId, expectedUpdatedAt, idempotencyKey };
    auditOperation = operation;
    auditCommand = command;
    if (operation === "remove") {
      const data = await dependencies.service.removeImage(
        command,
        authorization.identity
      );
      return { status: 200, body: { ok: true, data } };
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new MutationContractError(
        "VALIDATION_FAILED",
        "Image file is required.",
        "file"
      );
    }
    if (file.size > 1024 * 1024) {
      throw new MutationContractError(
        "VALIDATION_FAILED",
        "Image exceeds the 1 MiB limit.",
        "file"
      );
    }
    const image = {
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
      filename: file.name
    };
    const data =
      operation === "upload"
        ? await dependencies.service.uploadAndAttachImage(
            command,
            image,
            authorization.identity
          )
        : operation === "replace"
          ? await dependencies.service.replaceImage(
              command,
              image,
              authorization.identity
            )
          : (() => {
              throw new MutationContractError(
                "VALIDATION_FAILED",
                "Image operation is invalid.",
                "operation"
              );
            })();
    return { status: 200, body: { ok: true, data } };
  } catch (error) {
    try {
      await persistHandlerFailure({
        operation: auditOperation,
        command: auditCommand,
        identity: authorization.identity,
        error,
        entityType: "image",
        emitActivityEvent: dependencies.emitActivityEvent
      });
    } catch {
      return safeError(
        new MutationContractError(
          "AUDIT_PERSISTENCE_FAILED",
          "Business outcome was preserved but durable audit persistence failed."
        )
      );
    }
    return safeError(error);
  }
}
