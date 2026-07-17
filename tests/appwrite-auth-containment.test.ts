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

test("live identity apply requires numeric zero baselines including platforms", async () => {
  const source = await readFile("scripts/appwrite-auth-verification.ts", "utf8");
  assert.match(source, /typeof startingState\.users !== "number"/);
  assert.match(source, /typeof startingState\.teamMemberships !== "number"/);
  assert.match(source, /typeof startingState\.platforms !== "number"/);
  assert.match(source, /startingState\.platforms !== 0/);
});
