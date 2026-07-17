import { getServerBackendMode } from "@/lib/backend/server";

export default async function NewProductPage() {
  if (getServerBackendMode() !== "firebase") return null;
  const { FirebaseNewProductPage } = await import(
    "@/components/admin/firebase-admin-pages"
  );
  return <FirebaseNewProductPage />;
}
