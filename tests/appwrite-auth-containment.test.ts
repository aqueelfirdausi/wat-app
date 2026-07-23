import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const appwriteClientFiles = [
  "components/admin/appwrite-login-form.tsx",
  "components/admin/forgot-password-form.tsx",
  "components/admin/reset-password-form.tsx",
  "components/admin/appwrite-admin-shell.tsx"
];

test("Appwrite admin client files contain no Firebase or Google authentication path", async () => {
  for (const path of appwriteClientFiles) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /firebase|googleauth|signinwithpopup|identitytoolkit/i, path);
    assert.doesNotMatch(source, /APPWRITE_(?:AUTH|DATA|BOOTSTRAP)_API_KEY/, path);
    assert.doesNotMatch(source, /sessionSecret|recovery-secret/i, path);
  }
});
test("Appwrite forms use same-origin server routes and expose no signup UI", async () => {
  const login = await readFile("components/admin/appwrite-login-form.tsx", "utf8");
  assert.match(login, /\/api\/auth\/login/);
  assert.match(login, /forgot-password/);
  assert.doesNotMatch(login, /sign\s*up|oauth|phone login|magic url/i);
});

test("session and authentication runtime remain server-only", async () => {
  for (const path of [
    "lib/appwrite/auth/runtime.ts",
    "lib/appwrite/auth/session-cookie.ts",
    "lib/appwrite/auth/recovery-cookie.ts"
  ]) {
    const source = await readFile(path, "utf8");
    assert.match(source, /^import "server-only";/);
  }
});

test("password recovery uses a project-bound public Account client without an API key", async () => {
  const runtime = await readFile("lib/appwrite/auth/runtime.ts", "utf8");
  const server = await readFile("lib/appwrite/server.ts", "utf8");

  assert.match(
    runtime,
    /getAppwritePublicAccount\(\)\.createRecovery\(\{ email, url: recoveryUrl \}\)/
  );
  assert.match(
    runtime,
    /getAppwritePublicAccount\(\)\.updateRecovery\(\{ userId, secret, password \}\)/
  );
  assert.match(
    server,
    /function createProjectClient\(\)[\s\S]*?\.setEndpoint\(configuration\.endpoint\)[\s\S]*?\.setProject\(configuration\.projectId\)/
  );
  assert.match(
    server,
    /getAppwritePublicAccount\(\)[\s\S]*?new Account\(createProjectClient\(\)\)/
  );
  assert.doesNotMatch(
    runtime,
    /getAppwriteAuthAdminAccount\(\)\.(?:createRecovery|updateRecovery)/
  );
});

test("SSR credential login uses the sessions.write admin client and session-bound follow-up", async () => {
  const runtime = await readFile("lib/appwrite/auth/runtime.ts", "utf8");
  const server = await readFile("lib/appwrite/server.ts", "utf8");
  const route = await readFile("app/api/auth/login/route.ts", "utf8");

  assert.match(
    runtime,
    /getAppwriteAuthAdminAccount\(\)\.createEmailPasswordSession\(\{[\s\S]*?email,[\s\S]*?password/
  );
  assert.doesNotMatch(
    runtime,
    /getAppwritePublicAccount\(\)\.createEmailPasswordSession/
  );
  assert.match(
    server,
    /getAppwriteAuthAdminAccount\(\)[\s\S]*?createKeyClient\("APPWRITE_AUTH_API_KEY"\)/
  );
  assert.match(
    server,
    /createAppwriteSessionServices\(sessionSecret: string\)[\s\S]*?\.setSession\(sessionSecret\)/
  );
  assert.match(runtime, /services\.account\.get\(\)/);
  assert.match(runtime, /services\.teams\.listMemberships\(/);
  assert.match(route, /writeAppwriteSessionCookie\([\s\S]*?sessionSecret/);
  assert.match(route, /deleteCurrentSession\(result\.session\.sessionSecret\)/);
  assert.doesNotMatch(route, /console\.(?:log|info|error)\([^)]*sessionSecret/);
});

test("live identity apply requires numeric zero baselines including platforms", async () => {
  const source = await readFile("scripts/appwrite-auth-verification.ts", "utf8");
  assert.match(source, /typeof startingState\.users !== "number"/);
  assert.match(source, /typeof startingState\.teamMemberships !== "number"/);
  assert.match(source, /typeof startingState\.platforms !== "number"/);
  assert.match(source, /startingState\.platforms !== 0/);
});
