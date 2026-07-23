import "server-only";

import { Account, Client, Storage, TablesDB, Teams } from "node-appwrite";
import { BackendConfigurationError, parseBackendMode } from "@/lib/backend/mode";

type ServerConfiguration = {
  endpoint: string;
  projectId: string;
};

let dataServices: ReturnType<typeof createDataServices> | null = null;
let authAdminAccount: Account | null = null;
let publicAccount: Account | null = null;

function getBaseConfiguration(): ServerConfiguration {
  if (parseBackendMode(process.env.WAT_BACKEND) !== "appwrite") {
    throw new BackendConfigurationError("Appwrite server services are inactive.");
  }

  const missing = ["APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID"].filter((name) => !process.env[name]);
  if (missing.length) {
    throw new BackendConfigurationError(`Selected backend configuration is incomplete. Missing: ${missing.join(", ")}.`);
  }

  return {
    endpoint: process.env.APPWRITE_ENDPOINT as string,
    projectId: process.env.APPWRITE_PROJECT_ID as string
  };
}

function createProjectClient() {
  const configuration = getBaseConfiguration();

  return new Client()
    .setEndpoint(configuration.endpoint)
    .setProject(configuration.projectId);
}

function createKeyClient(keyName: "APPWRITE_DATA_API_KEY" | "APPWRITE_AUTH_API_KEY") {
  const key = process.env[keyName];

  if (!key) {
    throw new BackendConfigurationError(`Selected backend configuration is missing ${keyName}.`);
  }

  return createProjectClient().setKey(key);
}

function createDataServices() {
  const client = createKeyClient("APPWRITE_DATA_API_KEY");

  return {
    tables: new TablesDB(client),
    storage: new Storage(client)
  };
}

export function getAppwriteDataServices() {
  dataServices ??= createDataServices();
  return dataServices;
}

export function getAppwriteAuthAdminAccount() {
  authAdminAccount ??= new Account(createKeyClient("APPWRITE_AUTH_API_KEY"));
  return authAdminAccount;
}

export function getAppwritePublicAccount() {
  publicAccount ??= new Account(createProjectClient());
  return publicAccount;
}

export function createAppwriteSessionServices(sessionSecret: string) {
  if (!sessionSecret) {
    throw new BackendConfigurationError("An Appwrite session is required.");
  }

  const configuration = getBaseConfiguration();
  const client = new Client()
    .setEndpoint(configuration.endpoint)
    .setProject(configuration.projectId)
    .setSession(sessionSecret);

  return {
    account: new Account(client),
    teams: new Teams(client),
    tables: new TablesDB(client),
    storage: new Storage(client)
  };
}
