export const APPWRITE_PUBLIC_READ_PERMISSION = 'read("any")';

export function hasExactPublicReadPermission(value: unknown) {
  return (
    Array.isArray(value) &&
    value.every((permission) => typeof permission === "string") &&
    value.includes(APPWRITE_PUBLIC_READ_PERMISSION)
  );
}
