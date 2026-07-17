import "server-only";

import { Account, Client, Storage, TablesDB, Teams } from "node-appwrite";
import { BackendConfigurationError } from "@/lib/backend/mode";
import { getServerBackendMode } from "@/lib/backend/server";

type ServerConfiguration = {
  endpoint: string;
  projectId: string;
};

let dataServices: ReturnType<typeof createDataServices> | null = null;
let authAdminAccount: Account | null = null;

function getBaseConfiguration(): ServerConfiguration {
  if (getServerBackendMode() !== "appwrite") {
    throw new BackendConfigurationError("Appwrite server services are inactive.");
  }

  return {
    endpoint: process.env.APPWRITE_ENDPOINT as string,
    projectId: process.env.APPWRITE_PROJECT_ID as string
  };
}

function createKeyClient(keyName: "APPWRITE_DATA_API_KEY" | "APPWRITE_AUTH_API_KEY") {
  const configuration = getBaseConfiguration();
  const key = process.env[keyName];

  if (!key) {
    throw new BackendConfigurationError(`Selected backend configuration is missing ${keyName}.`);
  }

  return new Client()
    .setEndpoint(configuration.endpoint)
    .setProject(configuration.projectId)
    .setKey(key);
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
