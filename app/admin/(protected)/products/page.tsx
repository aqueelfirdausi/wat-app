import { getServerBackendMode } from "@/lib/backend/server";

export default async function AdminProductsPage() {
  if (getServerBackendMode() !== "firebase") return null;
  const { FirebaseProductsPage } = await import(
    "@/components/admin/firebase-admin-pages"
  );
  return <FirebaseProductsPage />;
}
