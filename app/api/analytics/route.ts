import { NextRequest, NextResponse } from "next/server";

const FIRESTORE_DATABASE_ID = "watapp";
const ANALYTICS_COLLECTION = "analyticsEvents";
const VALID_EVENT_NAMES = new Set(["storefront_visit", "feed_view", "product_view", "whatsapp_click"]);
const VALID_CONTEXTS = new Set(["storefront", "catalog", "feed", "detail"]);
const MAX_FIELD_LENGTH = 120;

type AnalyticsPayload = {
  eventName?: unknown;
  sessionId?: unknown;
  productId?: unknown;
  productSlug?: unknown;
  category?: unknown;
  context?: unknown;
};

type FirestoreField =
  | { stringValue: string }
  | { timestampValue: string };

function cleanString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_FIELD_LENGTH) : undefined;
}

function getFirestoreConfig() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();

  if (!projectId || !apiKey) {
    return null;
  }

  return { projectId, apiKey };
}

function buildFirestoreFields(payload: Required<Pick<AnalyticsPayload, "eventName">> & AnalyticsPayload) {
  const fields: Record<string, FirestoreField> = {
    eventName: { stringValue: String(payload.eventName) },
    createdAt: { timestampValue: new Date().toISOString() }
  };

  const sessionId = cleanString(payload.sessionId);
  const productId = cleanString(payload.productId);
  const productSlug = cleanString(payload.productSlug);
  const category = cleanString(payload.category);
  const context = cleanString(payload.context);

  if (sessionId) {
    fields.sessionId = { stringValue: sessionId };
  }

  if (productId) {
    fields.productId = { stringValue: productId };
  }

  if (productSlug) {
    fields.productSlug = { stringValue: productSlug };
  }

  if (category) {
    fields.category = { stringValue: category };
  }

  if (context && VALID_CONTEXTS.has(context)) {
    fields.context = { stringValue: context };
  }

  return fields;
}

export async function POST(request: NextRequest) {
  const config = getFirestoreConfig();

  if (!config) {
    return new NextResponse(null, { status: 204 });
  }

  let payload: AnalyticsPayload;

  try {
    payload = (await request.json()) as AnalyticsPayload;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (typeof payload.eventName !== "string" || !VALID_EVENT_NAMES.has(payload.eventName)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${FIRESTORE_DATABASE_ID}/documents/${ANALYTICS_COLLECTION}?key=${config.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: buildFirestoreFields({
            ...payload,
            eventName: payload.eventName
          })
        }),
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return new NextResponse(null, { status: 204 });
    }
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({ ok: true });
}
