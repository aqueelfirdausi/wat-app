const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 256;
const RECOVERY_VALUE_MAX_LENGTH = 512;

export const GENERIC_LOGIN_ERROR = "Invalid email, password, or staff access.";
export const GENERIC_RECOVERY_MESSAGE =
  "If that account is eligible, password reset instructions have been sent.";
export const GENERIC_RECOVERY_ERROR =
  "The password reset link is invalid or expired. Request a new one.";

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function normalizeLoginEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > EMAIL_MAX_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return null;
  }
  return email;
}

export function validatePassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= PASSWORD_MIN_LENGTH &&
    value.length <= PASSWORD_MAX_LENGTH
  );
}

export function validateLoginPayload(value: unknown): ValidationResult<{
  email: string;
  password: string;
}> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => key !== "email" && key !== "password") ||
    !validatePassword(record.password)
  ) {
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  const email = normalizeLoginEmail(record.email);
  if (!email) return { ok: false, error: GENERIC_LOGIN_ERROR };
  return { ok: true, value: { email, password: record.password } };
}

export function validateRecoveryRequestPayload(
  value: unknown
): ValidationResult<{ email: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: GENERIC_RECOVERY_MESSAGE };
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "email")) {
    return { ok: false, error: GENERIC_RECOVERY_MESSAGE };
  }
  const email = normalizeLoginEmail(record.email);
  return email
    ? { ok: true, value: { email } }
    : { ok: false, error: GENERIC_RECOVERY_MESSAGE };
}

export function validateRecoveryCallback(
  userId: unknown,
  secret: unknown
): ValidationResult<{ userId: string; secret: string }> {
  if (
    typeof userId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(userId) ||
    typeof secret !== "string" ||
    secret.length < 8 ||
    secret.length > RECOVERY_VALUE_MAX_LENGTH
  ) {
    return { ok: false, error: GENERIC_RECOVERY_ERROR };
  }
  return { ok: true, value: { userId, secret } };
}

export function validateRecoveryCompletionPayload(
  value: unknown
): ValidationResult<{ password: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: GENERIC_RECOVERY_ERROR };
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => key !== "password" && key !== "passwordConfirmation") ||
    !validatePassword(record.password) ||
    record.password !== record.passwordConfirmation
  ) {
    return { ok: false, error: "Passwords must match and contain 8 to 256 characters." };
  }
  return { ok: true, value: { password: record.password } };
}

export function isJsonContentType(value: string | null) {
  return value?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

export async function readBoundedJson(request: Request, maximumBytes = 4096) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error("Request body is too large.");
  }
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > maximumBytes) {
    throw new Error("Request body is too large.");
  }
  return JSON.parse(body) as unknown;
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
