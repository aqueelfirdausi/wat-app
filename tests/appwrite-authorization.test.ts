import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeStaff } from "@/lib/appwrite/auth/authorization";

const account = { id: "user", email: "staff@example.test", name: "Staff", active: true };
const membership = { teamId: "wat_staff", confirmed: true, roles: ["admin"] };

test("allows exactly admin", () => {
  assert.deepEqual(authorizeStaff({ account, membership }), {
    ok: true,
    identity: { userId: "user", email: "staff@example.test", name: "Staff", role: "admin" }
  });
});

test("allows exactly product_editor", () => {
  assert.equal(
    authorizeStaff({ account, membership: { ...membership, roles: ["product_editor"] } }).ok,
    true
  );
});

const deniedCases = [
  ["no session", { sessionState: "missing" }, "no_session"],
  ["invalid session", { sessionState: "invalid" }, "invalid_session"],
  ["blocked account", { account: { ...account, active: false }, membership }, "blocked_account"],
  ["no Team membership", { account }, "no_team_membership"],
  ["unconfirmed membership", { account, membership: { ...membership, confirmed: false } }, "unconfirmed_membership"],
  ["zero application roles", { account, membership: { ...membership, roles: [] } }, "no_application_role"],
  ["both application roles", { account, membership: { ...membership, roles: ["admin", "product_editor"] } }, "ambiguous_application_role"],
  ["owner only", { account, membership: { ...membership, roles: ["owner"] } }, "owner_only"],
  ["unknown role", { account, membership: { ...membership, roles: ["admin", "auditor"] } }, "unknown_role"]
] as const;

for (const [name, input, code] of deniedCases) {
  test(`denies ${name}`, () => {
    assert.deepEqual(authorizeStaff(input), { ok: false, code });
  });
}
