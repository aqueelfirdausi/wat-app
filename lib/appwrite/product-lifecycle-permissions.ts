import { APPWRITE_PUBLIC_READ_PERMISSION } from "@/lib/appwrite/public-permissions";
import {
  APPWRITE_PRODUCT_PRIVATE_PERMISSIONS,
  productPrivatePermissions
} from "@/lib/appwrite/product-permissions";

export const APPWRITE_PRODUCT_PUBLIC_PERMISSIONS = [
  APPWRITE_PUBLIC_READ_PERMISSION,
  ...APPWRITE_PRODUCT_PRIVATE_PERMISSIONS
] as const;

export const APPWRITE_PRODUCT_IMAGE_PRIVATE_PERMISSIONS = [
  ...APPWRITE_PRODUCT_PRIVATE_PERMISSIONS
] as const;

export const APPWRITE_PRODUCT_IMAGE_PUBLIC_PERMISSIONS = [
  APPWRITE_PUBLIC_READ_PERMISSION,
  ...APPWRITE_PRODUCT_IMAGE_PRIVATE_PERMISSIONS
] as const;

function hasExactPermissions(value: unknown, expected: readonly string[]) {
  return (
    Array.isArray(value) &&
    value.every((permission) => typeof permission === "string") &&
    value.length === expected.length &&
    expected.every((permission) => value.includes(permission))
  );
}

export function productPublicPermissions() {
  return [...APPWRITE_PRODUCT_PUBLIC_PERMISSIONS];
}

export function productImagePrivatePermissions() {
  return [...APPWRITE_PRODUCT_IMAGE_PRIVATE_PERMISSIONS];
}

export function productImagePublicPermissions() {
  return [...APPWRITE_PRODUCT_IMAGE_PUBLIC_PERMISSIONS];
}

export function hasExactProductPublicPermissions(value: unknown) {
  return hasExactPermissions(value, APPWRITE_PRODUCT_PUBLIC_PERMISSIONS);
}

export function hasExactProductImagePrivatePermissions(value: unknown) {
  return hasExactPermissions(value, APPWRITE_PRODUCT_IMAGE_PRIVATE_PERMISSIONS);
}

export function hasExactProductImagePublicPermissions(value: unknown) {
  return hasExactPermissions(value, APPWRITE_PRODUCT_IMAGE_PUBLIC_PERMISSIONS);
}

export function productPermissionsForVisibility(publiclyVisible: boolean) {
  return publiclyVisible ? productPublicPermissions() : productPrivatePermissions();
}
