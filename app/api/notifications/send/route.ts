import { NextRequest } from "next/server";
import { handleNotificationPost } from "@/lib/server/notification-mutations";

export async function POST(request: NextRequest) {
  return handleNotificationPost(request);
}
