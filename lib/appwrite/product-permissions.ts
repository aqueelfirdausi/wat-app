import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";

const team = APPWRITE_DEFAULT_RESOURCE_IDS.team;

export const APPWRITE_PRODUCT_PRIVATE_PERMISSIONS = [
  `read("team:${team}/admin")`,
  `read("team:${team}/product_editor")`
] as const;

export function productPrivatePermissions() {
  return [...APPWRITE_PRODUCT_PRIVATE_PERMISSIONS];
}

export function hasExactProductPrivatePermissions(value: unknown) {
  if (!Array.isArray(value) || value.some((permission) => typeof permission !== "string")) {
    return false;
  }
  return (
    value.length === APPWRITE_PRODUCT_PRIVATE_PERMISSIONS.length &&
    APPWRITE_PRODUCT_PRIVATE_PERMISSIONS.every((permission) => value.includes(permission))
  );
}
