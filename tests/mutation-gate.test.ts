import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { GET as getImageProxy } from "@/app/api/image-proxy/route";
import { handleAnalyticsPost } from "@/lib/server/analytics-mutation";
import {
  handleNotificationPost,
  handleNotificationSubscriptionPost
} from "@/lib/server/notification-mutations";
import {
  MutationsDisabledError,
  isMutationEnabled,
  requireMutationEnabled
} from "@/lib/server/mutation-gate";

const originalMutationSetting = process.env.WAT_MUTATIONS_ENABLED;
const originalBackendSetting = process.env.WAT_BACKEND;

afterEach(() => {
  if (originalMutationSetting === undefined) {
    delete process.env.WAT_MUTATIONS_ENABLED;
  } else {
    process.env.WAT_MUTATIONS_ENABLED = originalMutationSetting;
  }

  if (originalBackendSetting === undefined) {
    delete process.env.WAT_BACKEND;
  } else {
    process.env.WAT_BACKEND = originalBackendSetting;
  }
});

test("missing mutation variable is disabled", () => {
  delete process.env.WAT_MUTATIONS_ENABLED;
  assert.equal(isMutationEnabled(), false);
  assert.throws(() => requireMutationEnabled(), MutationsDisabledError);
});

for (const value of ["false", "0", "TRUE", "yes", " true ", "malformed"]) {
  test(`${JSON.stringify(value)} is disabled`, () => {
    process.env.WAT_MUTATIONS_ENABLED = value;
    assert.equal(isMutationEnabled(), false);
  });
}

test('"true" is enabled', () => {
  process.env.WAT_MUTATIONS_ENABLED = "true";
  assert.equal(isMutationEnabled(), true);
  assert.doesNotThrow(() => requireMutationEnabled());
});

test("analytics returns 204 without calling its writer when disabled", async () => {
  delete process.env.WAT_MUTATIONS_ENABLED;
  let writes = 0;
  const request = new NextRequest("https://preview.example/api/analytics", {
    method: "POST",
    body: JSON.stringify({ eventName: "storefront_visit" }),
    headers: { "Content-Type": "application/json" }
  });

  const response = await handleAnalyticsPost(request, async () => {
    writes += 1;
  });

  assert.equal(response.status, 204);
  assert.equal(writes, 0);
  assert.equal(await response.text(), "");
});

test("protected notification mutation returns 503 before loading write services", async () => {
  process.env.WAT_MUTATIONS_ENABLED = "false";
  let serviceLoads = 0;
  const request = new NextRequest("https://preview.example/api/notifications/send", {
    method: "POST",
    body: JSON.stringify({ title: "Fresh stock" }),
    headers: { "Content-Type": "application/json" }
  });

  const response = await handleNotificationPost(request, async () => {
    serviceLoads += 1;
    throw new Error("write services must not load");
  });

  assert.equal(response.status, 503);
  assert.equal(serviceLoads, 0);
  assert.deepEqual(await response.json(), {
    error: "Backend mutations are temporarily disabled.",
    code: "MUTATIONS_DISABLED"
  });
});

test("notification token storage returns 503 before loading its writer", async () => {
  process.env.WAT_MUTATIONS_ENABLED = "0";
  let storeLoads = 0;
  const request = new NextRequest("https://preview.example/api/notifications/subscribe", {
    method: "POST",
    body: JSON.stringify({ token: "preview-token", platform: "web" }),
    headers: { "Content-Type": "application/json" }
  });

  const response = await handleNotificationSubscriptionPost(request, async () => {
    storeLoads += 1;
    throw new Error("token store must not load");
  });

  assert.equal(response.status, 503);
  assert.equal(storeLoads, 0);
});

test("read-only image proxy remains available when mutations are disabled", async () => {
  process.env.WAT_MUTATIONS_ENABLED = "false";
  const request = new NextRequest("https://preview.example/api/image-proxy");
  const response = await getImageProxy(request);

  assert.equal(response.status, 400);
  assert.equal(await response.text(), "Missing image URL.");
});

test("Appwrite mode never calls the Firebase analytics writer", async () => {
  process.env.WAT_BACKEND = "appwrite";
  process.env.WAT_MUTATIONS_ENABLED = "true";
  let writes = 0;
  const request = new NextRequest("https://local.example/api/analytics", {
    method: "POST",
    body: JSON.stringify({ eventName: "storefront_visit" }),
    headers: { "Content-Type": "application/json" }
  });

  const response = await handleAnalyticsPost(request, async () => {
    writes += 1;
  });

  assert.equal(response.status, 204);
  assert.equal(writes, 0);
});

test("Appwrite mode never loads Firebase notification services", async () => {
  process.env.WAT_BACKEND = "appwrite";
  process.env.WAT_MUTATIONS_ENABLED = "true";
  let loads = 0;
  const request = new NextRequest("https://local.example/api/notifications/send", {
    method: "POST",
    body: JSON.stringify({ title: "Fresh stock" }),
    headers: { "Content-Type": "application/json" }
  });

  const response = await handleNotificationPost(request, async () => {
    loads += 1;
    throw new Error("Firebase must not load");
  });

  assert.equal(response.status, 503);
  assert.equal(loads, 0);
  assert.equal((await response.json()).code, "BACKEND_PATH_UNAVAILABLE");
});

test("Appwrite mode blocks the legacy Firebase image proxy before any fetch", async () => {
  process.env.WAT_BACKEND = "appwrite";
  const request = new NextRequest(
    "https://local.example/api/image-proxy?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fprivate.jpg"
  );

  const response = await getImageProxy(request);
  assert.equal(response.status, 404);
});
