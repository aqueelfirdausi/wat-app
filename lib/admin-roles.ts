export type AdminRole = "admin" | "product_editor";

const OWNER_ADMIN_EMAILS = ["aqueelfirdausi@gmail.com", "abdullahbinaqueel@gmail.com"];
const PRODUCT_EDITOR_EMAILS = ["saaimshakil@gmail.com", "axrbruh@gmail.com"];

export function normalizeAdminEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

export function getAdminRoleForEmail(email?: string | null): AdminRole | null {
  const normalizedEmail = normalizeAdminEmail(email);

  if (OWNER_ADMIN_EMAILS.includes(normalizedEmail)) {
    return "admin";
  }

  if (PRODUCT_EDITOR_EMAILS.includes(normalizedEmail)) {
    return "product_editor";
  }

  return null;
}

export function canAccessAdminPath(role: AdminRole | null, pathname: string) {
  if (role === "admin") {
    return true;
  }

  if (role === "product_editor") {
    return pathname === "/admin/products" || pathname.startsWith("/admin/products/");
  }

  return false;
}

export function canDeleteProducts(role: AdminRole | null) {
  return role === "admin";
}
