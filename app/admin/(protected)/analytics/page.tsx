import { getServerBackendMode } from "@/lib/backend/server";

export default async function AdminAnalyticsPage() {
  if (getServerBackendMode() !== "firebase") return null;
  const { AnalyticsSummary } = await import(
    "@/components/admin/analytics-summary"
  );
  return <AnalyticsSummary />;
}
