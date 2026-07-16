import { HomepageClient } from "@/components/homepage-client";
import { NotificationPrompt } from "@/components/storefront/notification-prompt";
import { isMutationEnabled } from "@/lib/server/mutation-gate";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <HomepageClient />
      {isMutationEnabled() ? <NotificationPrompt /> : null}
    </>
  );
}
