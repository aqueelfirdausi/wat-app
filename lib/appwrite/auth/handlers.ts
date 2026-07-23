import type {
  AppwriteAuthenticationService,
  AppwritePasswordRecoveryService,
  AppwriteSessionResult
} from "@/lib/appwrite/auth/services";
import {
  GENERIC_LOGIN_ERROR,
  GENERIC_RECOVERY_ERROR,
  GENERIC_RECOVERY_MESSAGE,
  isJsonContentType,
  isSameOriginRequest,
  readBoundedJson,
  validateLoginPayload,
  validateRecoveryCompletionPayload,
  validateRecoveryRequestPayload
} from "@/lib/appwrite/auth/validation";

export type LoginHandlerResult = {
  status: number;
  body: { ok: boolean; error?: string; redirectTo?: string };
  session?: AppwriteSessionResult;
};

export type LoginDiagnosticStage =
  | "credential_session_creation"
  | "session_secret_extraction"
  | "session_cookie_write"
  | "session_resolution"
  | "current_user_resolution"
  | "staff_membership_resolution"
  | "staff_role_validation"
  | "authenticated_redirect";

export type LoginDiagnosticCategory =
  | "login_session_created"
  | "invalid_credentials"
  | "unauthorized_runtime"
  | "missing_session_secret"
  | "cookie_write_failure"
  | "session_resolution_failure"
  | "user_resolution_failure"
  | "membership_not_found"
  | "invalid_staff_role"
  | "appwrite_service_failure"
  | "network_failure"
  | "unknown_sanitized_failure";

export type LoginDiagnosticEvent = {
  event: "appwrite_admin_login_diagnostic";
  stage: LoginDiagnosticStage;
  outcome: "success" | "failure";
  category: LoginDiagnosticCategory;
  appwriteStatus?: number;
  appwriteCode?: number;
  appwriteType?: string;
};

export type LoginDiagnosticLogger = (event: LoginDiagnosticEvent) => void;

export type RecoveryDiagnosticCategory =
  | "appwrite_recovery_accepted"
  | "invalid_recovery_url"
  | "unauthorized_runtime"
  | "user_not_eligible"
  | "rate_limited"
  | "appwrite_service_failure"
  | "network_failure"
  | "unknown_sanitized_failure";

export type RecoveryDiagnosticEvent = {
  event: "appwrite_password_recovery_diagnostic";
  outcome: "success" | "failure";
  category: RecoveryDiagnosticCategory;
  appwriteStatus?: number;
  appwriteCode?: number;
  appwriteType?: string;
};

export type RecoveryDiagnosticLogger = (event: RecoveryDiagnosticEvent) => void;

const SAFE_APPWRITE_TYPES = new Set([
  "general_argument_invalid",
  "general_unauthorized",
  "general_unauthorized_scope",
  "user_invalid_credentials",
  "user_unauthorized",
  "user_session_already_exists",
  "user_not_found",
  "user_blocked",
  "general_rate_limit_exceeded",
  "general_server_error",
  "general_service_unavailable"
]);

function safeHttpCode(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599
    ? Number(value)
    : undefined;
}

export function classifyLoginFailure(
  stage: LoginDiagnosticStage,
  error: unknown,
  fallbackCategory: LoginDiagnosticCategory = "unknown_sanitized_failure"
): LoginDiagnosticEvent {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : undefined;
  const appwriteStatus = safeHttpCode(record?.status);
  const appwriteCode = safeHttpCode(record?.code);
  const appwriteType =
    typeof record?.type === "string" && SAFE_APPWRITE_TYPES.has(record.type)
      ? record.type
      : undefined;
  const effectiveCode = appwriteStatus ?? appwriteCode;

  let category = fallbackCategory;
  if (error instanceof TypeError) {
    category = "network_failure";
  } else if (appwriteType === "user_invalid_credentials") {
    category = "invalid_credentials";
  } else if (
    appwriteType === "general_unauthorized" ||
    appwriteType === "general_unauthorized_scope" ||
    appwriteType === "user_unauthorized" ||
    (effectiveCode === 401 && stage !== "credential_session_creation") ||
    effectiveCode === 403
  ) {
    category = "unauthorized_runtime";
  } else if (
    appwriteType === "general_server_error" ||
    appwriteType === "general_service_unavailable" ||
    appwriteType === "general_rate_limit_exceeded" ||
    appwriteType === "user_session_already_exists" ||
    effectiveCode === 409 ||
    effectiveCode === 429 ||
    (effectiveCode !== undefined && effectiveCode >= 500)
  ) {
    category = "appwrite_service_failure";
  }

  return {
    event: "appwrite_admin_login_diagnostic",
    stage,
    outcome: "failure",
    category,
    ...(appwriteStatus === undefined ? {} : { appwriteStatus }),
    ...(appwriteCode === undefined ? {} : { appwriteCode }),
    ...(appwriteType === undefined ? {} : { appwriteType })
  };
}

export function logLoginDiagnostic(event: LoginDiagnosticEvent) {
  console.info(JSON.stringify(event));
}

function classifyRecoveryFailure(error: unknown): RecoveryDiagnosticEvent {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : undefined;
  const appwriteStatus = safeHttpCode(record?.status);
  const appwriteCode = safeHttpCode(record?.code);
  const appwriteType =
    typeof record?.type === "string" && SAFE_APPWRITE_TYPES.has(record.type)
      ? record.type
      : undefined;
  const effectiveCode = appwriteStatus ?? appwriteCode;

  let category: RecoveryDiagnosticCategory = "unknown_sanitized_failure";
  if (error instanceof TypeError) {
    category = "network_failure";
  } else if (appwriteType === "general_argument_invalid" || effectiveCode === 400) {
    category = "invalid_recovery_url";
  } else if (
    appwriteType === "general_unauthorized" ||
    appwriteType === "general_unauthorized_scope" ||
    effectiveCode === 401 ||
    effectiveCode === 403
  ) {
    category = "unauthorized_runtime";
  } else if (
    appwriteType === "user_not_found" ||
    appwriteType === "user_blocked" ||
    effectiveCode === 404
  ) {
    category = "user_not_eligible";
  } else if (
    appwriteType === "general_rate_limit_exceeded" ||
    effectiveCode === 429
  ) {
    category = "rate_limited";
  } else if (
    appwriteType === "general_server_error" ||
    appwriteType === "general_service_unavailable" ||
    (effectiveCode !== undefined && effectiveCode >= 500)
  ) {
    category = "appwrite_service_failure";
  }

  return {
    event: "appwrite_password_recovery_diagnostic",
    outcome: "failure",
    category,
    ...(appwriteStatus === undefined ? {} : { appwriteStatus }),
    ...(appwriteCode === undefined ? {} : { appwriteCode }),
    ...(appwriteType === undefined ? {} : { appwriteType })
  };
}

function logRecoveryDiagnostic(event: RecoveryDiagnosticEvent) {
  console.info(JSON.stringify(event));
}

export async function handleAppwriteLogin(
  request: Request,
  service: AppwriteAuthenticationService,
  logger: LoginDiagnosticLogger = logLoginDiagnostic
): Promise<LoginHandlerResult> {
  if (!isSameOriginRequest(request)) {
    return { status: 403, body: { ok: false, error: GENERIC_LOGIN_ERROR } };
  }
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return { status: 415, body: { ok: false, error: GENERIC_LOGIN_ERROR } };
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(request);
  } catch {
    return { status: 400, body: { ok: false, error: GENERIC_LOGIN_ERROR } };
  }
  const validated = validateLoginPayload(payload);
  if (!validated.ok) {
    return { status: 400, body: { ok: false, error: GENERIC_LOGIN_ERROR } };
  }

  let session: AppwriteSessionResult | undefined;
  try {
    session = await service.createEmailPasswordSession(
      validated.value.email,
      validated.value.password
    );
    const expiration = new Date(session.expiresAt);
    if (!session.sessionSecret) {
      logger({
        event: "appwrite_admin_login_diagnostic",
        stage: "session_secret_extraction",
        outcome: "failure",
        category: "missing_session_secret"
      });
      return { status: 401, body: { ok: false, error: GENERIC_LOGIN_ERROR } };
    }
    if (!Number.isFinite(expiration.getTime()) || expiration <= new Date()) {
      logger({
        event: "appwrite_admin_login_diagnostic",
        stage: "session_secret_extraction",
        outcome: "failure",
        category: "appwrite_service_failure"
      });
      try {
        await service.deleteCurrentSession(session.sessionSecret);
      } catch {
        // The invalid session is never returned or stored.
      }
      return { status: 401, body: { ok: false, error: GENERIC_LOGIN_ERROR } };
    }

    let authorizationFailureReported = false;
    const authorization = await service.authorizeSession(
      session.sessionSecret,
      (failure) => {
        authorizationFailureReported = true;
        logger(classifyLoginFailure(failure.stage, failure.error, failure.category));
      }
    );
    if (!authorization.ok) {
      if (!authorizationFailureReported) {
        const roleFailure = new Set([
          "no_application_role",
          "ambiguous_application_role",
          "owner_only",
          "unknown_role"
        ]).has(authorization.code);
        const membershipFailure = new Set([
          "no_team_membership",
          "unconfirmed_membership",
          "malformed_membership"
        ]).has(authorization.code);
        logger({
          event: "appwrite_admin_login_diagnostic",
          stage: roleFailure
            ? "staff_role_validation"
            : membershipFailure
              ? "staff_membership_resolution"
              : authorization.code === "blocked_account"
                ? "current_user_resolution"
                : "session_resolution",
          outcome: "failure",
          category: roleFailure
            ? "invalid_staff_role"
            : membershipFailure
              ? "membership_not_found"
              : authorization.code === "blocked_account"
                ? "user_resolution_failure"
                : "session_resolution_failure"
        });
      }
      try {
        await service.deleteCurrentSession(session.sessionSecret);
      } catch {
        // The cookie is never written, so the unauthorized session cannot reach the browser.
      }
      return { status: 401, body: { ok: false, error: GENERIC_LOGIN_ERROR } };
    }

    return {
      status: 200,
      body: { ok: true, redirectTo: "/admin" },
      session
    };
  } catch (error) {
    logger(
      classifyLoginFailure(
        "credential_session_creation",
        error,
        "unknown_sanitized_failure"
      )
    );
    if (session?.sessionSecret) {
      try {
        await service.deleteCurrentSession(session.sessionSecret);
      } catch {
        // Best effort; no session value is returned or stored.
      }
    }
    return { status: 401, body: { ok: false, error: GENERIC_LOGIN_ERROR } };
  }
}
export async function handleRecoveryRequest(
  request: Request,
  recoveryUrl: string,
  service: AppwritePasswordRecoveryService,
  logger: RecoveryDiagnosticLogger = logRecoveryDiagnostic
) {
  if (!isSameOriginRequest(request)) {
    return { status: 403, body: { ok: false, message: GENERIC_RECOVERY_MESSAGE } };
  }
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return { status: 415, body: { ok: false, message: GENERIC_RECOVERY_MESSAGE } };
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(request);
  } catch {
    return { status: 400, body: { ok: false, message: GENERIC_RECOVERY_MESSAGE } };
  }
  const validated = validateRecoveryRequestPayload(payload);
  if (!validated.ok) {
    return { status: 400, body: { ok: false, message: GENERIC_RECOVERY_MESSAGE } };
  }

  try {
    await service.requestPasswordRecovery(validated.value.email, recoveryUrl);
    logger({
      event: "appwrite_password_recovery_diagnostic",
      outcome: "success",
      category: "appwrite_recovery_accepted"
    });
  } catch (error) {
    // Deliberately suppress account existence and mail-delivery details.
    logger(classifyRecoveryFailure(error));
  }
  return { status: 202, body: { ok: true, message: GENERIC_RECOVERY_MESSAGE } };
}

export async function handleRecoveryCompletion(
  request: Request,
  recoveryState: { userId: string; secret: string } | null,
  service: AppwritePasswordRecoveryService
) {
  if (!isSameOriginRequest(request)) {
    return { status: 403, body: { ok: false, error: GENERIC_RECOVERY_ERROR } };
  }
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return { status: 415, body: { ok: false, error: GENERIC_RECOVERY_ERROR } };
  }
  if (!recoveryState) {
    return { status: 400, body: { ok: false, error: GENERIC_RECOVERY_ERROR } };
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(request);
  } catch {
    return { status: 400, body: { ok: false, error: GENERIC_RECOVERY_ERROR } };
  }
  const validated = validateRecoveryCompletionPayload(payload);
  if (!validated.ok) {
    return { status: 400, body: { ok: false, error: validated.error } };
  }

  try {
    await service.completePasswordRecovery(
      recoveryState.userId,
      recoveryState.secret,
      validated.value.password
    );
    return {
      status: 200,
      body: { ok: true, redirectTo: "/admin/login?passwordReset=complete" }
    };
  } catch {
    return { status: 400, body: { ok: false, error: GENERIC_RECOVERY_ERROR } };
  }
}
