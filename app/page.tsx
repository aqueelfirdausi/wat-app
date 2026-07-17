import { HomepageClient } from "@/components/homepage-client";
import { NotificationPrompt } from "@/components/storefront/notification-prompt";
import { isMutationEnabled } from "@/lib/server/mutation-gate";
import { isServerFirebaseMode } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <HomepageClient />
      {isMutationEnabled() && isServerFirebaseMode() ? <NotificationPrompt /> : null}
    </>
  );
}
