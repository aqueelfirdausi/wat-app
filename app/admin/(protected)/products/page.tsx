import { getServerBackendMode } from "@/lib/backend/server";

export default async function AdminProductsPage() {
  if (getServerBackendMode() === "appwrite") {
    const { AppwriteAdminCataloguePage } = await import(
      "@/components/admin/appwrite-admin-catalogue"
    );
    return <AppwriteAdminCataloguePage heading="Product catalogue" />;
  }
  const { FirebaseProductsPage } = await import(
    "@/components/admin/firebase-admin-pages"
  );
  return <FirebaseProductsPage />;
}
