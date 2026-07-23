import assert from "node:assert/strict";
import { test } from "node:test";
import {
  handleAppwriteLogin,
  handleRecoveryCompletion,
  handleRecoveryRequest,
  type LoginDiagnosticEvent,
  type RecoveryDiagnosticEvent
} from "@/lib/appwrite/auth/handlers";
import type {
  AppwriteAuthenticationService,
  AppwritePasswordRecoveryService
} from "@/lib/appwrite/auth/services";
import {
  GENERIC_LOGIN_ERROR,
  GENERIC_RECOVERY_ERROR,
  GENERIC_RECOVERY_MESSAGE,
  isSameOriginRequest,
  normalizeLoginEmail,
  validateRecoveryCallback
} from "@/lib/appwrite/auth/validation";
import {
  getAppwriteSessionCookieClearOptions,
  getAppwriteSessionCookieOptions
} from "@/lib/appwrite/auth/session-cookie";

function request(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

function authService(
  overrides: Partial<AppwriteAuthenticationService> = {}
): AppwriteAuthenticationService {
  return {
    async createEmailPasswordSession() {
      return {
        sessionId: "session-id",
        sessionSecret: "session-secret",
        expiresAt: "2030-01-01T00:00:00.000Z"
      };
    },
    async authorizeSession() {
      return {
        ok: true,
        identity: {
          userId: "user-id",
          email: "staff@example.test",
          name: "Staff",
          role: "admin"
        }
      };
    },
    async deleteCurrentSession() {},
    ...overrides
  };
}

test("login normalizes email and returns an authorized session only", async () => {
  let observedEmail = "";
  const result = await handleAppwriteLogin(
    request("/api/auth/login", {
      email: " STAFF@Example.Test ",
      password: "strong-password"
    }),
    authService({
      async createEmailPasswordSession(email) {
        observedEmail = email;
        return {
          sessionId: "session-id",
          sessionSecret: "session-secret",
          expiresAt: "2030-01-01T00:00:00.000Z"
        };
      }
    })
  );
  assert.equal(observedEmail, "staff@example.test");
  assert.equal(result.status, 200);
  assert.equal(result.body.redirectTo, "/admin");
  assert.equal(result.session?.sessionSecret, "session-secret");
});

test("unauthorized login revokes the newly created session and stays generic", async () => {
  let revoked = 0;
  const result = await handleAppwriteLogin(
    request("/api/auth/login", {
      email: "staff@example.test",
      password: "strong-password"
    }),
    authService({
      async authorizeSession() {
        return { ok: false, code: "owner_only" };
      },
      async deleteCurrentSession() {
        revoked += 1;
      }
    })
  );
  assert.equal(revoked, 1);
  assert.deepEqual(result, {
    status: 401,
    body: { ok: false, error: GENERIC_LOGIN_ERROR }
  });
});

test("login diagnostics identify invalid credentials without exposing sensitive input", async () => {
  const email = "owner-sensitive@example.test";
  const password = "password-sensitive-value";
  const sessionSecret = "session-sensitive-value";
  const events: LoginDiagnosticEvent[] = [];
  const result = await handleAppwriteLogin(
    request("/api/auth/login", { email, password }),
    authService({
      async createEmailPasswordSession() {
        throw {
          code: 401,
          type: "user_invalid_credentials",
          message: `${email}-${password}-${sessionSecret}`,
          response: { email, password, sessionSecret }
        };
      }
    }),
    (event) => events.push(event)
  );
  const serializedEvents = JSON.stringify(events);

  assert.deepEqual(result, {
    status: 401,
    body: { ok: false, error: GENERIC_LOGIN_ERROR }
  });
  assert.deepEqual(events, [
    {
      event: "appwrite_admin_login_diagnostic",
      stage: "credential_session_creation",
      outcome: "failure",
      category: "invalid_credentials",
      appwriteCode: 401,
      appwriteType: "user_invalid_credentials"
    }
  ]);
  assert.doesNotMatch(serializedEvents, /owner-sensitive@example\.test/);
  assert.doesNotMatch(serializedEvents, /password-sensitive-value/);
  assert.doesNotMatch(serializedEvents, /session-sensitive-value/);
});

test("login diagnostics identify missing SSR session secrets and stay generic", async () => {
  const events: LoginDiagnosticEvent[] = [];
  const result = await handleAppwriteLogin(
    request("/api/auth/login", {
      email: "staff@example.test",
      password: "strong-password"
    }),
    authService({
      async createEmailPasswordSession() {
        return {
          sessionId: "session-id",
          sessionSecret: "",
          expiresAt: "2030-01-01T00:00:00.000Z"
        };
      }
    }),
    (event) => events.push(event)
  );

  assert.deepEqual(result, {
    status: 401,
    body: { ok: false, error: GENERIC_LOGIN_ERROR }
  });
  assert.deepEqual(events, [
    {
      event: "appwrite_admin_login_diagnostic",
      stage: "session_secret_extraction",
      outcome: "failure",
      category: "missing_session_secret"
    }
  ]);
});

test("login diagnostics preserve the exact sanitized authorization stage", async () => {
  const events: LoginDiagnosticEvent[] = [];
  const result = await handleAppwriteLogin(
    request("/api/auth/login", {
      email: "staff@example.test",
      password: "strong-password"
    }),
    authService({
      async authorizeSession(_secret, reportDiagnosticFailure) {
        reportDiagnosticFailure?.({
          stage: "staff_membership_resolution",
          category: "appwrite_service_failure",
          error: {
            status: 401,
            type: "general_unauthorized_scope",
            message: "must not be logged"
          }
        });
        return { ok: false, code: "no_team_membership" };
      }
    }),
    (event) => events.push(event)
  );

  assert.equal(result.status, 401);
  assert.equal(result.body.error, GENERIC_LOGIN_ERROR);
  assert.deepEqual(events, [
    {
      event: "appwrite_admin_login_diagnostic",
      stage: "staff_membership_resolution",
      outcome: "failure",
      category: "unauthorized_runtime",
      appwriteStatus: 401,
      appwriteType: "general_unauthorized_scope"
    }
  ]);
});

for (const body of [
  { email: "invalid", password: "strong-password" },
  { email: "staff@example.test", password: "short" },
  { email: `${"a".repeat(245)}@example.test`, password: "strong-password" },
  { email: "staff@example.test", password: "x".repeat(257) },
  { email: "staff@example.test", password: "strong-password", signup: true }
]) {
  test("invalid login shape is rejected without service access", async () => {
    let calls = 0;
    const result = await handleAppwriteLogin(
      request("/api/auth/login", body),
      authService({
        async createEmailPasswordSession() {
          calls += 1;
          throw new Error("must not run");
        }
      })
    );
    assert.equal(result.status, 400);
    assert.equal(result.body.error, GENERIC_LOGIN_ERROR);
    assert.equal(calls, 0);
  });
}

test("login rejects non-JSON and cross-origin requests", async () => {
  const service = authService();
  const wrongType = await handleAppwriteLogin(
    request("/api/auth/login", {}, { "Content-Type": "text/plain" }),
    service
  );
  const crossOrigin = await handleAppwriteLogin(
    request("/api/auth/login", {}, { Origin: "https://attacker.example" }),
    service
  );
  assert.equal(wrongType.status, 415);
  assert.equal(crossOrigin.status, 403);
});

test("oversized login body is rejected", async () => {
  const oversized = new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      "Content-Length": "5000"
    },
    body: "{}"
  });
  assert.equal((await handleAppwriteLogin(oversized, authService())).status, 400);
});

test("recovery request has the same response when delivery succeeds or fails", async () => {
  const successService: AppwritePasswordRecoveryService = {
    async requestPasswordRecovery() {},
    async completePasswordRecovery() {}
  };
  const failureService: AppwritePasswordRecoveryService = {
    async requestPasswordRecovery() {
      throw new Error("account missing");
    },
    async completePasswordRecovery() {}
  };
  const input = { email: "staff@example.test" };
  const first = await handleRecoveryRequest(
    request("/api/auth/recovery/request", input),
    "http://localhost:3000/admin/reset-password",
    successService
  );
  const second = await handleRecoveryRequest(
    request("/api/auth/recovery/request", input),
    "http://localhost:3000/admin/reset-password",
    failureService
  );
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    status: 202,
    body: { ok: true, message: GENERIC_RECOVERY_MESSAGE }
  });
});

test("recovery request logs only the accepted classification on success", async () => {
  const events: RecoveryDiagnosticEvent[] = [];
  const service: AppwritePasswordRecoveryService = {
    async requestPasswordRecovery() {},
    async completePasswordRecovery() {}
  };
  const result = await handleRecoveryRequest(
    request("/api/auth/recovery/request", { email: "owner@example.test" }),
    "http://localhost:3000/admin/reset-password",
    service,
    (event) => events.push(event)
  );

  assert.deepEqual(result, {
    status: 202,
    body: { ok: true, message: GENERIC_RECOVERY_MESSAGE }
  });
  assert.deepEqual(events, [
    {
      event: "appwrite_password_recovery_diagnostic",
      outcome: "success",
      category: "appwrite_recovery_accepted"
    }
  ]);
});

test("recovery request classifies known Appwrite failures without changing its response", async () => {
  const events: RecoveryDiagnosticEvent[] = [];
  const service: AppwritePasswordRecoveryService = {
    async requestPasswordRecovery() {
      throw {
        code: 429,
        type: "general_rate_limit_exceeded",
        message: "must not be logged"
      };
    },
    async completePasswordRecovery() {}
  };
  const result = await handleRecoveryRequest(
    request("/api/auth/recovery/request", { email: "owner@example.test" }),
    "http://localhost:3000/admin/reset-password",
    service,
    (event) => events.push(event)
  );

  assert.equal(result.status, 202);
  assert.deepEqual(events, [
    {
      event: "appwrite_password_recovery_diagnostic",
      outcome: "failure",
      category: "rate_limited",
      appwriteCode: 429,
      appwriteType: "general_rate_limit_exceeded"
    }
  ]);
});

test("recovery request sanitizes unknown failures and excludes sensitive values", async () => {
  const email = "owner-sensitive@example.test";
  const secret = "recovery-secret-sensitive";
  const events: RecoveryDiagnosticEvent[] = [];
  const service: AppwritePasswordRecoveryService = {
    async requestPasswordRecovery() {
      throw {
        code: "not-a-number",
        type: `${email}-${secret}`,
        message: `${email}-${secret}`,
        response: JSON.stringify({ email, secret })
      };
    },
    async completePasswordRecovery() {}
  };
  const result = await handleRecoveryRequest(
    request("/api/auth/recovery/request", { email }),
    "http://localhost:3000/admin/reset-password",
    service,
    (event) => events.push(event)
  );
  const serializedEvents = JSON.stringify(events);

  assert.deepEqual(result, {
    status: 202,
    body: { ok: true, message: GENERIC_RECOVERY_MESSAGE }
  });
  assert.deepEqual(events, [
    {
      event: "appwrite_password_recovery_diagnostic",
      outcome: "failure",
      category: "unknown_sanitized_failure"
    }
  ]);
  assert.doesNotMatch(serializedEvents, /owner-sensitive@example\.test/);
  assert.doesNotMatch(serializedEvents, /recovery-secret-sensitive/);
});

test("recovery completion requires matching bounded passwords", async () => {
  let calls = 0;
  const service: AppwritePasswordRecoveryService = {
    async requestPasswordRecovery() {},
    async completePasswordRecovery() {
      calls += 1;
    }
  };
  const result = await handleRecoveryCompletion(
    request("/api/auth/recovery/complete", {
      password: "new-password",
      passwordConfirmation: "different-password"
    }),
    { userId: "user-id", secret: "recovery-secret" },
    service
  );
  assert.equal(result.status, 400);
  assert.equal(calls, 0);
});

test("invalid or expired recovery completion is generic", async () => {
  const service: AppwritePasswordRecoveryService = {
    async requestPasswordRecovery() {},
    async completePasswordRecovery() {
      throw new Error("expired");
    }
  };
  const result = await handleRecoveryCompletion(
    request("/api/auth/recovery/complete", {
      password: "new-password",
      passwordConfirmation: "new-password"
    }),
    { userId: "user-id", secret: "recovery-secret" },
    service
  );
  assert.deepEqual(result, {
    status: 400,
    body: { ok: false, error: GENERIC_RECOVERY_ERROR }
  });
});

test("recovery callback validates required bounded parameters", () => {
  assert.equal(validateRecoveryCallback("user-id", "valid-secret").ok, true);
  assert.equal(validateRecoveryCallback(null, "valid-secret").ok, false);
  assert.equal(validateRecoveryCallback("user-id", null).ok, false);
  assert.equal(validateRecoveryCallback("../user", "valid-secret").ok, false);
});

test("session cookie is HTTP-only, same-site, bounded, and environment-aware", () => {
  const now = new Date("2026-07-17T00:00:00.000Z");
  const expires = new Date("2026-07-18T00:00:00.000Z");
  const local = getAppwriteSessionCookieOptions(expires, { NODE_ENV: "development" }, now);
  const production = getAppwriteSessionCookieOptions(
    expires,
    { NODE_ENV: "production" },
    now
  );
  assert.equal(local.httpOnly, true);
  assert.equal(local.sameSite, "lax");
  assert.equal(local.path, "/");
  assert.equal(local.secure, false);
  assert.equal(local.maxAge, 86400);
  assert.equal(production.secure, true);
  assert.throws(() => getAppwriteSessionCookieOptions(now, {}, now));
});

test("session cookie clearing expires the same secure server-only cookie", () => {
  const local = getAppwriteSessionCookieClearOptions({ NODE_ENV: "development" });
  const production = getAppwriteSessionCookieClearOptions({ NODE_ENV: "production" });

  assert.equal(local.httpOnly, true);
  assert.equal(local.sameSite, "lax");
  assert.equal(local.path, "/");
  assert.equal(local.secure, false);
  assert.equal(local.maxAge, 0);
  assert.equal(local.expires.getTime(), 0);
  assert.equal(production.secure, true);
});

test("same-origin helper fails closed when Origin is absent or malformed", () => {
  assert.equal(isSameOriginRequest(new Request("http://localhost:3000")), false);
  assert.equal(normalizeLoginEmail(" USER@Example.Test "), "user@example.test");
});
