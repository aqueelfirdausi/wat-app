import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BackendConfigurationError,
  parseBackendMode
} from "@/lib/backend/mode";
import { getServerBackendMode } from "@/lib/backend/server";

const completeAppwriteServerEnvironment = {
  WAT_BACKEND: "appwrite",
  APPWRITE_ENDPOINT: "https://fra.cloud.appwrite.io/v1",
  APPWRITE_PROJECT_ID: "project-id",
  APPWRITE_DATA_API_KEY: "data-key",
  APPWRITE_AUTH_API_KEY: "auth-key"
};

test("valid Firebase mode", () => {
  assert.equal(getServerBackendMode({ WAT_BACKEND: "firebase" }), "firebase");
});

test("valid Appwrite mode", () => {
  assert.equal(getServerBackendMode(completeAppwriteServerEnvironment), "appwrite");
});

test("missing backend fails closed", () => {
  assert.throws(() => parseBackendMode(undefined), BackendConfigurationError);
});

for (const value of ["unknown", "FIREBASE", "APPWRITE", " appwrite", "appwrite "]) {
  test(`${JSON.stringify(value)} backend is rejected`, () => {
    assert.throws(() => parseBackendMode(value), BackendConfigurationError);
  });
}

test("Appwrite mode with missing required configuration fails closed", () => {
  assert.throws(
    () => getServerBackendMode({ WAT_BACKEND: "appwrite" }),
    /NEXT_PUBLIC|APPWRITE_ENDPOINT/
  );
});

test("Firebase mode does not require Appwrite configuration", () => {
  assert.doesNotThrow(() => getServerBackendMode({ WAT_BACKEND: "firebase" }));
});

test("one selector cannot express mixed writes", () => {
  assert.throws(() => parseBackendMode("firebase,appwrite"), BackendConfigurationError);
});
