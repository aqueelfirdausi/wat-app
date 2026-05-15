import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminMessaging } from "@/lib/firebase/admin";

const OWNER_EMAILS = ["aqueelfirdausi@gmail.com", "abdullahbinaqueel@gmail.com"];
const FCM_BATCH_SIZE = 500;

export async function POST(request: NextRequest) {
  // Extract and verify Firebase ID token from Authorization header
  const authHeader = request.headers.get("Authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let decodedToken;
  try {
    decodedToken = await adminAuth().verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  if (!OWNER_EMAILS.includes(decodedToken.email ?? "")) {
    return NextResponse.json({ error: "Access denied. Owner accounts only." }, { status: 403 });
  }

  // Parse and validate body
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

  // Resolve product image if a productId was supplied
  const db = adminDb();
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

  // Fetch all stored FCM tokens
  const tokensSnap = await db.collection("fcm_tokens").get();
  const tokens = tokensSnap.docs
    .map((d) => d.data().token as string)
    .filter((t) => typeof t === "string" && t.length > 0);

  if (tokens.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, total: 0, message: "No subscribers yet." });
  }

  // Send in batches (FCM multicast limit: 500 per call)
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
    const batch = tokens.slice(i, i + FCM_BATCH_SIZE);
    const result = await adminMessaging().sendEachForMulticast({
      tokens: batch,
      notification: { title, body: notifBody },
      webpush: {
        notification: {
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "wat-notification",
        },
      },
    });
    sent += result.successCount;
    failed += result.failureCount;
  }

  // Save broadcast to Firestore for the storefront drawer
  const broadcastDoc: Record<string, unknown> = {
    title,
    body: notifBody,
    sentAt: new Date().toISOString(),
    sentBy: decodedToken.email ?? "",
  };
  if (productId && productImageUrl) {
    broadcastDoc.productId = productId;
    broadcastDoc.productImageUrl = productImageUrl;
    if (productSlug) broadcastDoc.productSlug = productSlug;
  }
  await db.collection("broadcasts").add(broadcastDoc);

  return NextResponse.json({ sent, failed, total: tokens.length });
}
