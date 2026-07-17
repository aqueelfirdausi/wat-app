import { getServerBackendMode } from "@/lib/backend/server";

export default async function AdminNotificationsPage() {
  if (getServerBackendMode() !== "firebase") return null;
  const { FirebaseNotificationsPage } = await import(
    "@/components/admin/firebase-admin-pages"
  );
  return <FirebaseNotificationsPage />;
}
