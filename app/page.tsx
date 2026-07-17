import { HomepageClient } from "@/components/homepage-client";
import { NotificationPrompt } from "@/components/storefront/notification-prompt";
import { loadPublicCatalogue } from "@/lib/catalogue/read";
import { isMutationEnabled } from "@/lib/server/mutation-gate";
import { isServerFirebaseMode } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  try {
    const catalogue = await loadPublicCatalogue();

    return (
      <>
        <HomepageClient
          readMode={catalogue.mode}
          initialProducts={catalogue.products}
          initialCategories={catalogue.categories}
        />
        {isMutationEnabled() && isServerFirebaseMode() ? <NotificationPrompt /> : null}
      </>
    );
  } catch {
    return (
      <HomepageClient
        readMode="unavailable"
        initialProducts={[]}
        initialCategories={[]}
        initialError="The catalogue is temporarily unavailable."
      />
    );
  }
}
