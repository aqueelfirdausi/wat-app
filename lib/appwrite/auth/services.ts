import type { StaffAuthorizationResult } from "@/lib/appwrite/auth/authorization";

export type AppwriteSessionResult = {
  sessionId: string;
  sessionSecret: string;
  expiresAt: string;
};

export interface AppwriteAuthenticationService {
  createEmailPasswordSession(email: string, password: string): Promise<AppwriteSessionResult>;
  authorizeSession(sessionSecret: string): Promise<StaffAuthorizationResult>;
  deleteCurrentSession(sessionSecret: string): Promise<void>;
}

export interface AppwritePasswordRecoveryService {
  requestPasswordRecovery(email: string, recoveryUrl: string): Promise<void>;
  completePasswordRecovery(userId: string, secret: string, password: string): Promise<void>;
}
