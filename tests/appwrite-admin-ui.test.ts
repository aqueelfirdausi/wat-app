import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isRoleAuthorizedForAction } from "@/lib/appwrite/mutation-design";

async function source(relative: string) {
  return readFile(path.join(process.cwd(), relative), "utf8");
}

test("client mutation UI uses only server-mediated same-origin endpoints", async () => {
  const text = await source("components/admin/appwrite-admin-mutations.tsx");
  assert.match(text, /^"use client";/);
  assert.doesNotMatch(text, /node-appwrite|APPWRITE_API_KEY|createRow|updateRow/);
  for (const endpoint of [
    "/api/admin/categories",
    "/api/admin/products",
    "/api/admin/product-images",
    "/api/admin/product-lifecycle"
  ]) {
    assert.match(text, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
});

test("disabled gate removes ordinary mutation controls", async () => {
  const text = await source("components/admin/appwrite-admin-mutations.tsx");
  const gate = text.indexOf("if (!enabled)");
  const firstMutationForm = text.indexOf("<form", gate);
  const disabledReturnEnd = text.indexOf("return (", gate + 1);
  assert.ok(gate >= 0);
  assert.ok(disabledReturnEnd >= 0);
  assert.ok(firstMutationForm > disabledReturnEnd);
  assert.match(text, /Catalogue mutations are disabled/);
});

test("editor cannot delete or read activity through the server boundary", () => {
  assert.equal(isRoleAuthorizedForAction("product_editor", "delete_category"), false);
  assert.equal(isRoleAuthorizedForAction("product_editor", "delete_product"), false);
  assert.equal(isRoleAuthorizedForAction("product_editor", "read_activity_logs"), false);
  assert.equal(isRoleAuthorizedForAction("product_editor", "create_category"), true);
  assert.equal(isRoleAuthorizedForAction("product_editor", "edit_product"), true);
});

test("Appwrite shell omits activity navigation for product editors", async () => {
  const text = await source("components/admin/appwrite-admin-shell.tsx");
  assert.match(
    text,
    /\.\.\.\(!productEditor \? \[\{ href: "\/admin\/logs", label: "Activity log" \}\] : \[\]\)/
  );
});

test("activity UI and API contain no update or delete controls", async () => {
  const [page, route] = await Promise.all([
    source("components/admin/appwrite-activity-log.tsx"),
    source("app/api/admin/activity/route.ts")
  ]);
  assert.doesNotMatch(page, /Delete activity|Edit activity|updateRow|deleteRow/);
  assert.doesNotMatch(route, /export async function (POST|PATCH|DELETE)/);
  assert.match(route, /Cache-Control": "no-store"/);
});

test("image form enforces accepted MIME types and one MiB before upload", async () => {
  const text = await source("components/admin/appwrite-admin-mutations.tsx");
  assert.match(text, /image\/jpeg/);
  assert.match(text, /image\/png/);
  assert.match(text, /image\/webp/);
  assert.match(text, /1024 \* 1024/);
  assert.match(text, /disabled=\{pending\}/);
});
