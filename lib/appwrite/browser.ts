"use client";

import { Account, Client } from "appwrite";
import { getBrowserBackendMode } from "@/lib/backend/browser";
import { BackendConfigurationError } from "@/lib/backend/mode";

let browserClient: Client | null = null;
let browserAccount: Account | null = null;

function getBrowserConfiguration() {
  if (getBrowserBackendMode() !== "appwrite") {
    throw new BackendConfigurationError("Appwrite browser services are inactive.");
  }

  return {
    endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT as string,
    projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID as string
  };
}

export function getAppwriteBrowserClient() {
  if (!browserClient) {
    const configuration = getBrowserConfiguration();
    browserClient = new Client()
      .setEndpoint(configuration.endpoint)
      .setProject(configuration.projectId);
  }

  return browserClient;
}

export function getAppwriteBrowserAccount() {
  if (!browserAccount) {
    browserAccount = new Account(getAppwriteBrowserClient());
  }

  return browserAccount;
}
