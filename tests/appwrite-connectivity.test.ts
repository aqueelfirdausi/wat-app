import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseConnectivityCheckArguments,
  runDisposableCategoryLifecycle
} from "@/lib/appwrite/connectivity";

test("connectivity check is metadata-only by default and double-gates writes", () => {
  assert.equal(parseConnectivityCheckArguments([]), "metadata-only");
  assert.equal(
    parseConnectivityCheckArguments(["--apply", "--confirm-disposable-check"]),
    "disposable-write"
  );
  assert.throws(() => parseConnectivityCheckArguments(["--apply"]), /requires both/);
  assert.throws(() => parseConnectivityCheckArguments(["--confirm-disposable-check"]), /requires both/);
});

test("disposable lifecycle creates a private row and verifies deletion", async () => {
  let row: Record<string, unknown> | null = null;
  const permissions: string[][] = [];
  const result = await runDisposableCategoryLifecycle({
    rowId: "migration-disposable-test",
    now: () => "2026-07-17T00:00:00.000Z",
    isNotFound: (error) => error instanceof Error && error.message === "not found",
    rows: {
      async createRow(input) {
        permissions.push(input.permissions);
        row = { $id: input.rowId, ...input.data };
        return row;
      },
      async getRow() {
        if (!row) throw new Error("not found");
        return row;
      },
      async updateRow(input) {
        permissions.push(input.permissions);
        row = { ...row, ...input.data };
        return row;
      },
      async deleteRow() {
        row = null;
      }
    }
  });
  assert.equal(result.cleanupVerified, true);
  assert.deepEqual(permissions, [[], []]);
  assert.equal(row, null);
});

test("disposable lifecycle attempts cleanup after a failed verification", async () => {
  let deletes = 0;
  await assert.rejects(() => runDisposableCategoryLifecycle({
    rowId: "migration-disposable-test",
    now: () => "2026-07-17T00:00:00.000Z",
    isNotFound: () => false,
    rows: {
      async createRow(input) { return { $id: input.rowId, ...input.data }; },
      async getRow() { return { $id: "wrong" }; },
      async updateRow() { return {}; },
      async deleteRow() { deletes += 1; }
    }
  }), /read could not be verified/);
  assert.equal(deletes, 1);
});
