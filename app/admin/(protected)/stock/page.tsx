import { getServerBackendMode } from "@/lib/backend/server";

export default async function AdminStockPage() {
  if (getServerBackendMode() !== "firebase") return null;
  const { FirebaseStockPage } = await import(
    "@/components/admin/firebase-admin-pages"
  );
  return <FirebaseStockPage />;
}
