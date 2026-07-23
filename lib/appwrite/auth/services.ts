import type { StaffAuthorizationResult } from "@/lib/appwrite/auth/authorization";

export type AppwriteSessionResult = {
  sessionId: string;
  sessionSecret: string;
  expiresAt: string;
};

export type AppwriteAuthorizationDiagnosticFailure = {
  stage: "current_user_resolution" | "staff_membership_resolution";
  category:
    | "user_resolution_failure"
    | "session_resolution_failure"
    | "appwrite_service_failure";
  error: unknown;
};

export type AppwriteAuthorizationDiagnosticReporter = (
  failure: AppwriteAuthorizationDiagnosticFailure
) => void;

export interface AppwriteAuthenticationService {
  createEmailPasswordSession(email: string, password: string): Promise<AppwriteSessionResult>;
  authorizeSession(
    sessionSecret: string,
    reportDiagnosticFailure?: AppwriteAuthorizationDiagnosticReporter
  ): Promise<StaffAuthorizationResult>;
  deleteCurrentSession(sessionSecret: string): Promise<void>;
}

export interface AppwritePasswordRecoveryService {
  requestPasswordRecovery(email: string, recoveryUrl: string): Promise<void>;
  completePasswordRecovery(userId: string, secret: string, password: string): Promise<void>;
}
