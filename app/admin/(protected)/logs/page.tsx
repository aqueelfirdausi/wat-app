import { getServerBackendMode } from "@/lib/backend/server";

export default async function LogsPage() {
  if (getServerBackendMode() === "appwrite") {
    const { AppwriteActivityLogPage } = await import(
      "@/components/admin/appwrite-activity-log"
    );
    return <AppwriteActivityLogPage />;
  }
  const { ActivityLogTable } = await import(
    "@/components/admin/activity-log"
  );
  return <ActivityLogTable />;
}
