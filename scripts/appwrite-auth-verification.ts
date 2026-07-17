import { randomBytes } from "node:crypto";
import {
  access,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import {
  Account,
  AppwriteException,
  Client,
  Project,
  Query,
  Teams,
  Users
} from "node-appwrite";
import { sanitizeBootstrapText, validateBootstrapEnvironment } from "@/lib/appwrite/bootstrap";
import {
  parseIdentityVerificationArguments,
  runDisposableIdentityLifecycle
} from "@/lib/appwrite/auth/disposable-identity";
import { createAppwriteAuthenticationService } from "@/lib/appwrite/auth/runtime";
import { createAppwriteSessionServices } from "@/lib/appwrite/server";
import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";

loadEnvConfig(process.cwd());

const HANDOFF_PATH = join(tmpdir(), "wat-phase-3s-auth-handoff.json");
const DONE_PATH = `${HANDOFF_PATH}.done`;
const sensitiveValues: string[] = [];

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing authentication-verification configuration: ${name}.`);
  return value;
}

function clientWithKey(endpoint: string, projectId: string, key: string) {
  return new Client().setEndpoint(endpoint).setProject(projectId).setKey(key);
}

function notFound(error: unknown) {
  return error instanceof AppwriteException && error.code === 404;
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const mode = parseIdentityVerificationArguments(process.argv.slice(2));
  const configuration = validateBootstrapEnvironment(process.env);
  const endpointUrl = new URL(configuration.endpoint);
  if (
    endpointUrl.protocol !== "https:" ||
    endpointUrl.hostname !== "fra.cloud.appwrite.io" ||
    endpointUrl.pathname.replace(/\/+$/, "") !== "/v1"
  ) {
    throw new Error("Authentication verification is locked to the Frankfurt Appwrite endpoint.");
  }
  if (process.env.WAT_BACKEND !== "appwrite") {
    throw new Error("Authentication verification requires WAT_BACKEND=appwrite.");
  }
  if (process.env.WAT_MUTATIONS_ENABLED !== "false") {
    throw new Error("Authentication verification requires WAT_MUTATIONS_ENABLED=false.");
  }
  if ((process.env.APPWRITE_TEAM_ID ?? APPWRITE_DEFAULT_RESOURCE_IDS.team) !== "wat_staff") {
    throw new Error("Authentication verification is locked to Team wat_staff.");
  }

  const bootstrapKey = required("APPWRITE_BOOTSTRAP_API_KEY");
  const bootstrapClient = clientWithKey(
    configuration.endpoint,
    configuration.projectId,
    bootstrapKey
  );
  const users = new Users(bootstrapClient);
  const teams = new Teams(bootstrapClient);
  const project = new Project(bootstrapClient);

  async function scopedTotal(
    read: () => Promise<{ total: number }>,
    scope: string
  ): Promise<number | `requires-${string}`> {
    try {
      return (await read()).total;
    } catch (error) {
      if (
        error instanceof AppwriteException &&
        error.code === 401 &&
        error.message.includes(scope)
      ) {
        return `requires-${scope}`;
      }
      throw error;
    }
  }
  const [userTotal, membershipTotal] = await Promise.all([
    scopedTotal(
      () => users.list({ queries: [Query.limit(1)], total: true }),
      "users.read"
    ),
    scopedTotal(
      () =>
        teams.listMemberships({
          teamId: APPWRITE_DEFAULT_RESOURCE_IDS.team,
          queries: [Query.limit(1)],
          total: true
        }),
      "teams.read"
    )
  ]);
  let platformTotal: number | "requires-console-verification";
  try {
    platformTotal = (
      await project.listPlatforms({ queries: [Query.limit(1)], total: true })
    ).total;
  } catch (error) {
    if (
      error instanceof AppwriteException &&
      error.code === 401 &&
      /platforms\.read/.test(error.message)
    ) {
      platformTotal = "requires-console-verification";
    } else {
      throw error;
    }
  }
  const startingState = {
    users: userTotal,
    teamMemberships: membershipTotal,
    platforms: platformTotal
  };

  if (!mode.apply) {
    console.log(JSON.stringify({
      mode: "read-only",
      startingState,
      writeActions: [],
      summary: "Identity inventory complete; no writes were performed."
    }, null, 2));
    return;
  }
  if (
    typeof startingState.users !== "number" ||
    typeof startingState.teamMemberships !== "number" ||
    typeof startingState.platforms !== "number" ||
    startingState.users !== 0 ||
    startingState.teamMemberships !== 0 ||
    startingState.platforms !== 0
  ) {
    throw new Error("Disposable identity verification requires zero users, memberships, and platforms.");
  }

  const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`.slice(-12);
  const credentials = {
    userId: `PHASE-3S-DISPOSABLE-${suffix}`.slice(0, 36),
    email: `phase-3s-disposable-${suffix}@example.test`,
    password: `${randomBytes(32).toString("base64url")}aA1!`,
    name: `PHASE-3S-DISPOSABLE-${suffix}`
  };
  sensitiveValues.push(credentials.email, credentials.password);
  const authService = createAppwriteAuthenticationService();

  try {
    const result = await runDisposableIdentityLifecycle({
      credentials,
      dependencies: {
        counts: async () => {
          const [currentUsers, currentMemberships] = await Promise.all([
            users.list({ queries: [Query.limit(1)], total: true }),
            teams.listMemberships({
              teamId: APPWRITE_DEFAULT_RESOURCE_IDS.team,
              queries: [Query.limit(1)],
              total: true
            })
          ]);
          return { users: currentUsers.total, memberships: currentMemberships.total };
        },
        createUser: async (input) => {
          const user = await users.create({
            userId: input.userId,
            email: input.email,
            password: input.password,
            name: input.name
          });
          return { id: user.$id };
        },
        createMembership: async (userId) => {
          const membership = await teams.createMembership({
            teamId: APPWRITE_DEFAULT_RESOURCE_IDS.team,
            userId,
            roles: ["admin"]
          });
          return {
            id: membership.$id,
            userId: membership.userId,
            teamId: membership.teamId,
            confirmed: membership.confirm,
            roles: membership.roles
          };
        },
        createSession: async (email, password) => {
          const session = await new Account(
            clientWithKey(
              configuration.endpoint,
              configuration.projectId,
              required("APPWRITE_AUTH_API_KEY")
            )
          ).createEmailPasswordSession({ email, password });
          return { secret: session.secret };
        },
        authorizeSession: (secret) => authService.authorizeSession(secret),
        deleteCurrentSession: (secret) => authService.deleteCurrentSession(secret),
        sessionIsInvalid: async (secret) => {
          try {
            await createAppwriteSessionServices(secret).account.get();
            return false;
          } catch (error) {
            return error instanceof AppwriteException && error.code === 401;
          }
        },
        holdForBrowser: mode.browserHoldSeconds
          ? async (input) => {
              await rm(HANDOFF_PATH, { force: true });
              await rm(DONE_PATH, { force: true });
              await writeFile(
                HANDOFF_PATH,
                JSON.stringify({ email: input.email, password: input.password }),
                { encoding: "utf8", mode: 0o600 }
              );
              console.log(JSON.stringify({
                event: "browser-ready",
                handoffPath: HANDOFF_PATH,
                timeoutSeconds: mode.browserHoldSeconds
              }));
              const deadline = Date.now() + mode.browserHoldSeconds * 1000;
              while (Date.now() < deadline && !(await exists(DONE_PATH))) {
                await new Promise((resolve) => setTimeout(resolve, 250));
              }
              if (!(await exists(DONE_PATH))) {
                throw new Error("Browser verification did not complete before the bounded timeout.");
              }
            }
          : undefined,
        deleteUserSessions: async (userId) => {
          await users.deleteSessions({ userId });
        },
        deleteMembership: async (membershipId) => {
          await teams.deleteMembership({
            teamId: APPWRITE_DEFAULT_RESOURCE_IDS.team,
            membershipId
          });
        },
        deleteUser: async (userId) => {
          await users.delete({ userId });
        },
        membershipIsMissing: async (membershipId) => {
          try {
            await teams.getMembership({
              teamId: APPWRITE_DEFAULT_RESOURCE_IDS.team,
              membershipId
            });
            return false;
          } catch (error) {
            return notFound(error);
          }
        },
        userIsMissing: async (userId) => {
          try {
            await users.get({ userId });
            return false;
          } catch (error) {
            return notFound(error);
          }
        }
      }
    });

    console.log(JSON.stringify({
      mode: "disposable-identity-verification",
      userCreated: result.userCreated,
      membershipConfirmed: result.membershipConfirmed,
      roleAuthorized: result.roleAuthorized,
      accountResolved: result.accountResolved,
      sessionRevoked: result.sessionRevoked,
      browserHoldCompleted: result.browserHoldCompleted,
      cleanupVerified: result.cleanupVerified,
      finalState: {
        users: 0,
        teamMemberships: 0,
        platforms: startingState.platforms
      }
    }, null, 2));
  } finally {
    credentials.password = "";
    credentials.email = "";
    await rm(HANDOFF_PATH, { force: true });
    await rm(DONE_PATH, { force: true });
  }
}

main().catch((error) => {
  console.error(sanitizeBootstrapText(error, [
    process.env.APPWRITE_BOOTSTRAP_API_KEY ?? "",
    process.env.APPWRITE_DATA_API_KEY ?? "",
    process.env.APPWRITE_AUTH_API_KEY ?? "",
    ...sensitiveValues
  ]));
  process.exitCode = 1;
});
