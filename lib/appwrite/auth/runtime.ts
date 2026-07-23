import "server-only";

import { AppwriteException, Query } from "node-appwrite";
import {
  authorizeStaff,
  denyAuthorization,
  type StaffAuthorizationResult
} from "@/lib/appwrite/auth/authorization";
import type {
  AppwriteAuthenticationService,
  AppwritePasswordRecoveryService
} from "@/lib/appwrite/auth/services";
import {
  createAppwriteSessionServices,
  getAppwriteAuthAdminAccount,
  getAppwritePublicAccount
} from "@/lib/appwrite/server";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";

function sessionFailure(error: unknown): StaffAuthorizationResult {
  if (
    error instanceof AppwriteException &&
    error.code === 401 &&
    /expir/i.test(error.message)
  ) {
    return denyAuthorization("expired_session");
  }
  return denyAuthorization("invalid_session");
}

export function createAppwriteAuthenticationService(): AppwriteAuthenticationService &
  AppwritePasswordRecoveryService {
  return {
    async createEmailPasswordSession(email, password) {
      const session = await getAppwriteAuthAdminAccount().createEmailPasswordSession({
        email,
        password
      });
      if (!session.$id || !session.secret || !session.expire) {
        throw new Error("Appwrite returned an incomplete session.");
      }
      return {
        sessionId: session.$id,
        sessionSecret: session.secret,
        expiresAt: session.expire
      };
    },

    async authorizeSession(sessionSecret, reportDiagnosticFailure) {
      const services = createAppwriteSessionServices(sessionSecret);
      let account;
      try {
        account = await services.account.get();
      } catch (error) {
        reportDiagnosticFailure?.({
          stage: "current_user_resolution",
          category:
            error instanceof AppwriteException && error.code === 401
              ? "session_resolution_failure"
              : "user_resolution_failure",
          error
        });
        return sessionFailure(error);
      }

      let membership;
      try {
        const memberships = await services.teams.listMemberships({
          teamId: APPWRITE_DEFAULT_RESOURCE_IDS.team,
          queries: [Query.equal("userId", account.$id), Query.limit(2)],
          total: true
        });
        if (memberships.total === 0) {
          return denyAuthorization("no_team_membership");
        }
        if (memberships.total !== 1 || memberships.memberships.length !== 1) {
          return denyAuthorization("malformed_membership");
        }
        membership = memberships.memberships[0];
      } catch (error) {
        reportDiagnosticFailure?.({
          stage: "staff_membership_resolution",
          category: "appwrite_service_failure",
          error
        });
        return denyAuthorization("no_team_membership");
      }

      return authorizeStaff({
        account: {
          id: account.$id,
          email: account.email,
          name: account.name,
          active: account.status
        },
        membership: {
          teamId: membership.teamId,
          confirmed: membership.confirm,
          roles: membership.roles
        }
      });
    },

    async deleteCurrentSession(sessionSecret) {
      await createAppwriteSessionServices(sessionSecret).account.deleteSession({
        sessionId: "current"
      });
    },

    async requestPasswordRecovery(email, recoveryUrl) {
      await getAppwritePublicAccount().createRecovery({ email, url: recoveryUrl });
    },

    async completePasswordRecovery(userId, secret, password) {
      await getAppwritePublicAccount().updateRecovery({ userId, secret, password });
    }
  };
}

export async function resolveAppwriteStaffIdentity(
  sessionSecret: string | null,
  service: AppwriteAuthenticationService = createAppwriteAuthenticationService()
) {
  if (!sessionSecret) {
    return denyAuthorization("no_session");
  }
  return service.authorizeSession(sessionSecret);
}
