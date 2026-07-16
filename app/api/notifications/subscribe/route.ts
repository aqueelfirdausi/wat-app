import { NextRequest } from "next/server";
import { handleNotificationSubscriptionPost } from "@/lib/server/notification-mutations";

export async function POST(request: NextRequest) {
  return handleNotificationSubscriptionPost(request);
}
