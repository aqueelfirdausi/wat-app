import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseIdentityVerificationArguments,
  runDisposableIdentityLifecycle,
  type DisposableIdentityDependencies
} from "@/lib/appwrite/auth/disposable-identity";

const credentials = {
  userId: "PHASE-3S-DISPOSABLE-fixture",
  email: "phase-3s-disposable-fixture@example.test",
  password: "fixture-only-password",
  name: "PHASE-3S-DISPOSABLE-fixture"
};

function dependencies(overrides: Partial<DisposableIdentityDependencies> = {}) {
  let counts = { users: 0, memberships: 0 };
  const calls: string[] = [];
  const value: DisposableIdentityDependencies = {
    async counts() {
      return { ...counts };
    },
    async createUser(input) {
      counts.users += 1;
      calls.push("create-user");
      return { id: input.userId };
    },
    async createMembership(userId) {
      counts.memberships += 1;
      calls.push("create-membership");
      return {
        id: "membership-id",
        userId,
        teamId: "wat_staff",
        confirmed: true,
        roles: ["admin"]
      };
    },
    async createSession() {
      calls.push("create-session");
      return { secret: "session-secret" };
    },
    async authorizeSession() {
      return {
        ok: true,
        identity: {
          userId: credentials.userId,
          email: credentials.email,
          name: credentials.name,
          role: "admin"
        }
      };
    },
    async deleteCurrentSession() {
      calls.push("revoke-session");
    },
    async sessionIsInvalid() {
      return true;
    },
    async deleteUserSessions() {
      calls.push("delete-sessions");
    },
    async deleteMembership() {
      counts.memberships -= 1;
      calls.push("delete-membership");
    },
    async deleteUser() {
      counts.users -= 1;
      calls.push("delete-user");
    },
    async membershipIsMissing() {
      return true;
    },
    async userIsMissing() {
      return true;
    },
    ...overrides
  };
  return { value, calls };
}

test("disposable identity arguments require both mutation gates", () => {
  assert.deepEqual(parseIdentityVerificationArguments([]), {
    apply: false,
    browserHoldSeconds: 0
  });
  assert.throws(() => parseIdentityVerificationArguments(["--apply"]));
  assert.throws(() =>
    parseIdentityVerificationArguments(["--confirm-disposable-identity"])
  );
  assert.throws(() =>
    parseIdentityVerificationArguments([
      "--apply",
      "--confirm-disposable-identity",
      "--browser-hold-seconds=301"
    ])
  );
  assert.deepEqual(
    parseIdentityVerificationArguments([
      "--apply",
      "--confirm-disposable-identity",
      "--browser-hold-seconds=120"
    ]),
    { apply: true, browserHoldSeconds: 120 }
  );
});

test("disposable identity verifies authorization, revocation, and cleanup", async () => {
  const fixture = dependencies();
  const result = await runDisposableIdentityLifecycle({
    credentials,
    dependencies: fixture.value
  });
  assert.equal(result.roleAuthorized, true);
  assert.equal(result.sessionRevoked, true);
  assert.equal(result.cleanupVerified, true);
  assert.deepEqual(fixture.calls.slice(-3), [
    "delete-sessions",
    "delete-membership",
    "delete-user"
  ]);
});

test("cleanup still runs when authorization fails", async () => {
  const fixture = dependencies({
    async authorizeSession() {
      return { ok: false, code: "owner_only" };
    }
  });
  await assert.rejects(() =>
    runDisposableIdentityLifecycle({ credentials, dependencies: fixture.value })
  );
  assert.ok(fixture.calls.includes("delete-sessions"));
  assert.ok(fixture.calls.includes("delete-membership"));
  assert.ok(fixture.calls.includes("delete-user"));
});
test("cleanup still runs when browser verification fails", async () => {
  const fixture = dependencies({
    async holdForBrowser() {
      throw new Error("browser failure");
    }
  });
  await assert.rejects(() =>
    runDisposableIdentityLifecycle({ credentials, dependencies: fixture.value })
  );
  assert.ok(fixture.calls.includes("delete-membership"));
  assert.ok(fixture.calls.includes("delete-user"));
});
