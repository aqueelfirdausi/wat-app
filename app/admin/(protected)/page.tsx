import { getServerBackendMode } from "@/lib/backend/server";

export default async function AdminDashboardPage() {
  if (getServerBackendMode() !== "firebase") return null;
  const { DashboardOverview } = await import(
    "@/components/admin/dashboard-overview"
  );
  return <DashboardOverview />;
}
