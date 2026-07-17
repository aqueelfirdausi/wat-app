import { APPWRITE_DEFAULT_RESOURCE_IDS } from "@/lib/appwrite/resources";

const team = APPWRITE_DEFAULT_RESOURCE_IDS.team;

export const APPWRITE_CATEGORY_STAFF_READ_PERMISSIONS = [
  `read("team:${team}/admin")`,
  `read("team:${team}/product_editor")`
] as const;

export const APPWRITE_CATEGORY_PUBLIC_READ_PERMISSIONS = [
  'read("any")',
  ...APPWRITE_CATEGORY_STAFF_READ_PERMISSIONS
] as const;

export type AppwriteCategoryPermissionMode = "public" | "private_fixture";

export function categoryPermissions(mode: AppwriteCategoryPermissionMode) {
  return mode === "public"
    ? [...APPWRITE_CATEGORY_PUBLIC_READ_PERMISSIONS]
    : [...APPWRITE_CATEGORY_STAFF_READ_PERMISSIONS];
}

export function hasExactCategoryPermissions(
  value: unknown,
  mode: AppwriteCategoryPermissionMode
) {
  if (!Array.isArray(value) || value.some((permission) => typeof permission !== "string")) {
    return false;
  }
  const expected = categoryPermissions(mode);
  return (
    value.length === expected.length &&
    expected.every((permission) => value.includes(permission))
  );
}
