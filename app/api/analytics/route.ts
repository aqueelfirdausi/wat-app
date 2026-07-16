import { NextRequest } from "next/server";
import { handleAnalyticsPost } from "@/lib/server/analytics-mutation";

export async function POST(request: NextRequest) {
  return handleAnalyticsPost(request);
}
