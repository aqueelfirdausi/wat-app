import {
  APPWRITE_APPLICATION_ROLES,
  APPWRITE_DEFAULT_RESOURCE_IDS,
  type AppwriteApplicationRole
} from "@/lib/appwrite/resources";
import type { AuthenticatedStaffIdentity } from "@/lib/appwrite/schema";

export type AppwriteAccountSnapshot = {
  id: string;
  email: string;
  name: string;
  active: boolean;
};

export type AppwriteMembershipSnapshot = {
  teamId: string;
  confirmed: boolean;
  roles: readonly string[];
};

export type AuthorizationFailureCode =
  | "no_session"
  | "invalid_session"
  | "blocked_account"
  | "no_team_membership"
  | "unconfirmed_membership"
  | "no_application_role"
  | "ambiguous_application_role"
  | "owner_only"
  | "unknown_role";

export type StaffAuthorizationResult =
  | { ok: true; identity: AuthenticatedStaffIdentity }
  | { ok: false; code: AuthorizationFailureCode };

const BUILT_IN_TEAM_ROLES = new Set(["owner"]);
const APPLICATION_ROLES = new Set<string>(APPWRITE_APPLICATION_ROLES);

export function denyAuthorization(code: AuthorizationFailureCode): StaffAuthorizationResult {
  return { ok: false, code };
}

export function authorizeStaff(input: {
  account?: AppwriteAccountSnapshot | null;
  membership?: AppwriteMembershipSnapshot | null;
  sessionState?: "valid" | "missing" | "invalid";
  expectedTeamId?: string;
}): StaffAuthorizationResult {
  if (input.sessionState === "missing") {
    return denyAuthorization("no_session");
  }

  if (input.sessionState === "invalid") {
    return denyAuthorization("invalid_session");
  }

  if (!input.account) {
    return denyAuthorization("invalid_session");
  }

  if (!input.account.active) {
    return denyAuthorization("blocked_account");
  }

  const membership = input.membership;
  const expectedTeamId = input.expectedTeamId ?? APPWRITE_DEFAULT_RESOURCE_IDS.team;

  if (!membership || membership.teamId !== expectedTeamId) {
    return denyAuthorization("no_team_membership");
  }

  if (!membership.confirmed) {
    return denyAuthorization("unconfirmed_membership");
  }

  const unknownRoles = membership.roles.filter(
    (role) => !APPLICATION_ROLES.has(role) && !BUILT_IN_TEAM_ROLES.has(role)
  );
  if (unknownRoles.length > 0) {
    return denyAuthorization("unknown_role");
  }

  const applicationRoles = membership.roles.filter((role): role is AppwriteApplicationRole =>
    APPLICATION_ROLES.has(role)
  );

  if (applicationRoles.length === 0) {
    return denyAuthorization(membership.roles.includes("owner") ? "owner_only" : "no_application_role");
  }

  if (applicationRoles.length !== 1) {
    return denyAuthorization("ambiguous_application_role");
  }

  return {
    ok: true,
    identity: {
      userId: input.account.id,
      email: input.account.email,
      name: input.account.name,
      role: applicationRoles[0]
    }
  };
}
