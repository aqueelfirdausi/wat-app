import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  MutationsDisabledError,
  mutationDisabledResponse,
  requireMutationEnabled
} from "@/lib/server/mutation-gate";
import { isServerFirebaseMode } from "@/lib/backend/server";

const OWNER_EMAILS = ["aqueelfirdausi@gmail.com", "abdullahbinaqueel@gmail.com"];
const FCM_BATCH_SIZE = 500;
const MAX_TOKEN_LENGTH = 4096;

type AdminServices = {
  auth: ReturnType<typeof import("@/lib/firebase/admin")["adminAuth"]>;
  db: ReturnType<typeof import("@/lib/firebase/admin")["adminDb"]>;
  messaging: ReturnType<typeof import("@/lib/firebase/admin")["adminMessaging"]>;
};

type AdminServicesLoader = () => Promise<AdminServices>;

type TokenStore = {
  saveToken: (token: string, platform: string) => Promise<void>;
};

type TokenStoreLoader = () => Promise<TokenStore>;

async function loadFirebaseAdminServices(): Promise<AdminServices> {
  const { adminAuth, adminDb, adminMessaging } = await import("@/lib/firebase/admin");

  return {
    auth: adminAuth(),
    db: adminDb(),
    messaging: adminMessaging()
  };
}

async function loadFirebaseTokenStore(): Promise<TokenStore> {
  const { adminDb } = await import("@/lib/firebase/admin");
  const db = adminDb();

  return {
    async saveToken(token, platform) {
      const tokensRef = db.collection("fcm_tokens");
      const existing = await tokensRef.where("token", "==", token).limit(1).get();

      if (existing.empty) {
        await tokensRef.add({
          token,
          platform,
          createdAt: new Date()
        });
      }
    }
  };
}

function checkMutationGate() {
  try {
    requireMutationEnabled();
    return null;
  } catch (error) {
    if (error instanceof MutationsDisabledError) {
      return mutationDisabledResponse();
    }

    throw error;
  }
}

function checkFirebaseBackend() {
  if (isServerFirebaseMode()) {
    return null;
  }

  return NextResponse.json(
    { error: "This mutation path is unavailable for the selected backend.", code: "BACKEND_PATH_UNAVAILABLE" },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

export async function handleNotificationPost(
  request: NextRequest,
  loadAdminServices: AdminServicesLoader = loadFirebaseAdminServices
) {
  const disabledResponse = checkMutationGate();
  if (disabledResponse) {
    return disabledResponse;
  }

  const backendResponse = checkFirebaseBackend();
  if (backendResponse) return backendResponse;

  const { auth, db, messaging } = await loadAdminServices();
  const authHeader = request.headers.get("Authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  if (!OWNER_EMAILS.includes(decodedToken.email ?? "")) {
    return NextResponse.json({ error: "Access denied. Owner accounts only." }, { status: 403 });
  }

  let body: { title?: string; body?: string; productId?: string };
  try {
    body = (await request.json()) as { title?: string; body?: string; productId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const title = body.title?.trim();
  const notifBody = body.body?.trim() ?? "";
  const productId: string | null =
    typeof body.productId === "string" && body.productId.trim().length > 0
      ? body.productId.trim()
      : null;

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  let productImageUrl: string | null = null;
  let productSlug: string | null = null;

  if (productId) {
    const productDoc = await db.collection("products").doc(productId).get();
    if (!productDoc.exists) {
      return NextResponse.json({ error: "Selected product not found" }, { status: 400 });
    }
    const imageUrl = productDoc.data()?.imageUrl;
    if (typeof imageUrl !== "string" || imageUrl.trim().length === 0) {
      return NextResponse.json({ error: "Selected product has no image" }, { status: 400 });
    }
    productImageUrl = imageUrl.trim();
    const slug = productDoc.data()?.slug;
    if (typeof slug === "string" && slug.trim().length > 0) {
      productSlug = slug.trim();
    }
  }

  const tokensSnap = await db.collection("fcm_tokens").get();
  const tokens = tokensSnap.docs
    .map((document) => document.data().token as string)
    .filter((token) => typeof token === "string" && token.length > 0);

  if (tokens.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, total: 0, message: "No subscribers yet." });
  }

  let sent = 0;
  let failed = 0;

  for (let index = 0; index < tokens.length; index += FCM_BATCH_SIZE) {
    const batch = tokens.slice(index, index + FCM_BATCH_SIZE);
    const result = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title, body: notifBody },
      webpush: {
        notification: {
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "wat-notification"
        }
      }
    });
    sent += result.successCount;
    failed += result.failureCount;
  }

  const broadcastDoc: Record<string, unknown> = {
    title,
    body: notifBody,
    sentAt: new Date().toISOString(),
    sentBy: decodedToken.email ?? ""
  };
  if (productId && productImageUrl) {
    broadcastDoc.productId = productId;
    broadcastDoc.productImageUrl = productImageUrl;
    if (productSlug) {
      broadcastDoc.productSlug = productSlug;
    }
  }
  await db.collection("broadcasts").add(broadcastDoc);

  return NextResponse.json({ sent, failed, total: tokens.length });
}

export async function handleNotificationSubscriptionPost(
  request: NextRequest,
  loadTokenStore: TokenStoreLoader = loadFirebaseTokenStore
) {
  const disabledResponse = checkMutationGate();
  if (disabledResponse) {
    return disabledResponse;
  }

  const backendResponse = checkFirebaseBackend();
  if (backendResponse) return backendResponse;

  let payload: { token?: unknown; platform?: unknown };

  try {
    payload = (await request.json()) as { token?: unknown; platform?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  const platform = ["android", "ios", "web"].includes(String(payload.platform))
    ? String(payload.platform)
    : "web";

  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return NextResponse.json({ error: "Invalid notification token" }, { status: 400 });
  }

  const tokenStore = await loadTokenStore();
  await tokenStore.saveToken(token, platform);

  return new NextResponse(null, { status: 204 });
}
