import type { StaffAuthorizationResult } from "@/lib/appwrite/auth/authorization";

export type IdentityVerificationMode = {
  apply: boolean;
  browserHoldSeconds: number;
};

export type IdentityCounts = {
  users: number;
  memberships: number;
};

export type DisposableIdentityCredentials = {
  userId: string;
  email: string;
  password: string;
  name: string;
};

export type DisposableIdentityDependencies = {
  counts(): Promise<IdentityCounts>;
  createUser(credentials: DisposableIdentityCredentials): Promise<{ id: string }>;
  createMembership(userId: string): Promise<{
    id: string;
    userId: string;
    teamId: string;
    confirmed: boolean;
    roles: unknown;
  }>;
  createSession(email: string, password: string): Promise<{ secret: string }>;
  authorizeSession(secret: string): Promise<StaffAuthorizationResult>;
  deleteCurrentSession(secret: string): Promise<void>;
  sessionIsInvalid(secret: string): Promise<boolean>;
  holdForBrowser?(credentials: DisposableIdentityCredentials): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  deleteMembership(membershipId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  membershipIsMissing(membershipId: string): Promise<boolean>;
  userIsMissing(userId: string): Promise<boolean>;
};

export function parseIdentityVerificationArguments(
  argumentsList: string[]
): IdentityVerificationMode {
  let browserHoldSeconds = 0;
  const flags = new Set<string>();
  for (const argument of argumentsList) {
    if (argument.startsWith("--browser-hold-seconds=")) {
      const value = argument.slice("--browser-hold-seconds=".length);
      if (!/^\d+$/.test(value)) throw new Error("Browser hold seconds must be a whole number.");
      browserHoldSeconds = Number(value);
      if (browserHoldSeconds < 0 || browserHoldSeconds > 300) {
        throw new Error("Browser hold seconds must be between 0 and 300.");
      }
      continue;
    }
    if (argument !== "--apply" && argument !== "--confirm-disposable-identity") {
      throw new Error(`Unknown identity-verification argument: ${argument}`);
    }
    flags.add(argument);
  }
  const apply = flags.has("--apply");
  const confirmed = flags.has("--confirm-disposable-identity");
  if (apply !== confirmed) {
    throw new Error(
      "Disposable identity verification requires both --apply and --confirm-disposable-identity."
    );
  }
  if (!apply && browserHoldSeconds !== 0) {
    throw new Error("Browser hold is available only in confirmed apply mode.");
  }
  return { apply, browserHoldSeconds };
}

export async function runDisposableIdentityLifecycle(input: {
  credentials: DisposableIdentityCredentials;
  dependencies: DisposableIdentityDependencies;
}) {
  const { credentials, dependencies } = input;
  const baseline = await dependencies.counts();
  let userCreated = false;
  let membershipCreated = false;
  let membershipId = "";
  let sessionSecret = "";
  const cleanupErrors: string[] = [];
  const result = {
    userCreated: false,
    membershipConfirmed: false,
    roleAuthorized: false,
    accountResolved: false,
    sessionRevoked: false,
    browserHoldCompleted: false,
    cleanupVerified: false
  };

  try {
    const user = await dependencies.createUser(credentials);
    if (user.id !== credentials.userId) {
      throw new Error("Disposable user creation could not be verified.");
    }
    userCreated = true;
    result.userCreated = true;

    const membership = await dependencies.createMembership(credentials.userId);
    membershipCreated = true;
    membershipId = membership.id;
    if (
      !membership.id ||
      membership.userId !== credentials.userId ||
      membership.teamId !== "wat_staff" ||
      membership.confirmed !== true ||
      !Array.isArray(membership.roles) ||
      membership.roles.length !== 1 ||
      membership.roles[0] !== "admin"
    ) {
      throw new Error("Disposable Team membership could not be verified.");
    }
    result.membershipConfirmed = true;

    const session = await dependencies.createSession(credentials.email, credentials.password);
    if (!session.secret) throw new Error("Disposable session secret was missing.");
    sessionSecret = session.secret;
    const authorization = await dependencies.authorizeSession(sessionSecret);
    if (
      !authorization.ok ||
      authorization.identity.userId !== credentials.userId ||
      authorization.identity.role !== "admin"
    ) {
      throw new Error("Disposable staff authorization could not be verified.");
    }
    result.accountResolved = true;
    result.roleAuthorized = true;

    await dependencies.deleteCurrentSession(sessionSecret);
    result.sessionRevoked = await dependencies.sessionIsInvalid(sessionSecret);
    if (!result.sessionRevoked) {
      throw new Error("Disposable session remained valid after revocation.");
    }
    sessionSecret = "";

    if (dependencies.holdForBrowser) {
      await dependencies.holdForBrowser(credentials);
      result.browserHoldCompleted = true;
    }
  } finally {
    if (userCreated) {
      try {
        await dependencies.deleteUserSessions(credentials.userId);
      } catch {
        cleanupErrors.push("sessions");
      }
    }
    if (membershipCreated) {
      try {
        await dependencies.deleteMembership(membershipId);
      } catch {
        cleanupErrors.push("membership");
      }
    }
    if (userCreated) {
      try {
        await dependencies.deleteUser(credentials.userId);
      } catch {
        cleanupErrors.push("user");
      }
    }

    const finalCounts = await dependencies.counts();
    const cleanupVerified =
      finalCounts.users === baseline.users &&
      finalCounts.memberships === baseline.memberships &&
      (!membershipCreated || (await dependencies.membershipIsMissing(membershipId))) &&
      (!userCreated || (await dependencies.userIsMissing(credentials.userId)));
    result.cleanupVerified = cleanupVerified;
    if (!cleanupVerified) cleanupErrors.push("verification");
    if (cleanupErrors.length) {
      throw new Error(`Disposable identity cleanup failed for: ${cleanupErrors.join(", ")}.`);
    }
  }

  return { ...result, baseline };
}
