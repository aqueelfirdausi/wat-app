import { getServerBackendMode } from "@/lib/backend/server";

export default async function EditProductPage() {
  if (getServerBackendMode() !== "firebase") return null;
  const { FirebaseEditProductPage } = await import(
    "@/components/admin/firebase-admin-pages"
  );
  return <FirebaseEditProductPage />;
}
