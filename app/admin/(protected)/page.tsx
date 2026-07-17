import { getServerBackendMode } from "@/lib/backend/server";

export default async function AdminDashboardPage() {
  if (getServerBackendMode() === "appwrite") {
    const { AppwriteAdminCataloguePage } = await import(
      "@/components/admin/appwrite-admin-catalogue"
    );
    return <AppwriteAdminCataloguePage heading="Catalogue overview" />;
  }
  const { DashboardOverview } = await import(
    "@/components/admin/dashboard-overview"
  );
  return <DashboardOverview />;
}
