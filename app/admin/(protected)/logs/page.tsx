import { getServerBackendMode } from "@/lib/backend/server";

export default async function LogsPage() {
  if (getServerBackendMode() !== "firebase") return null;
  const { ActivityLogTable } = await import(
    "@/components/admin/activity-log"
  );
  return <ActivityLogTable />;
}
