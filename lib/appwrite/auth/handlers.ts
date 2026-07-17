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

export async function handleAppwriteLogin(
  request: Request,
  service: AppwriteAuthenticationService
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
    if (!session.sessionSecret || !Number.isFinite(expiration.getTime()) || expiration <= new Date()) {
      throw new Error("Invalid Appwrite session.");
    }

    const authorization = await service.authorizeSession(session.sessionSecret);
    if (!authorization.ok) {
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
  } catch {
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
  service: AppwritePasswordRecoveryService
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
  } catch {
    // Deliberately suppress account existence and mail-delivery details.
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
