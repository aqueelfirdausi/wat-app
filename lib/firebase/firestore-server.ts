const FIRESTORE_DATABASE_ID = "watapp";

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { nullValue: null };

type FirestoreDocument = {
  name: string;
  fields?: Record<string, FirestoreValue>;
};

export type ProductMetadataRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  categoryName: string;
  brand?: string;
  price: number;
  currency: string;
  condition: string;
  stockStatus: string;
  featured: boolean;
  imageUrl: string;
};

function getFirestoreRestConfig() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();

  if (!projectId || !apiKey) {
    return null;
  }

  return { projectId, apiKey };
}

function readFirestoreValue(value?: FirestoreValue) {
  if (!value) {
    return undefined;
  }

  if ("stringValue" in value) {
    return value.stringValue;
  }

  if ("integerValue" in value) {
    return Number(value.integerValue);
  }

  if ("doubleValue" in value) {
    return Number(value.doubleValue);
  }

  if ("booleanValue" in value) {
    return value.booleanValue;
  }

  if ("timestampValue" in value) {
    return value.timestampValue;
  }

  return undefined;
}

function mapMetadataProduct(document: FirestoreDocument): ProductMetadataRecord {
  const fields = document.fields ?? {};
  const nameSegments = document.name.split("/");

  return {
    id: nameSegments[nameSegments.length - 1] ?? "",
    slug: String(readFirestoreValue(fields.slug) ?? ""),
    name: String(readFirestoreValue(fields.name) ?? ""),
    description: String(readFirestoreValue(fields.description) ?? ""),
    categoryName: String(readFirestoreValue(fields.categoryName) ?? ""),
    brand: readFirestoreValue(fields.brand) ? String(readFirestoreValue(fields.brand)) : undefined,
    price: Number(readFirestoreValue(fields.price) ?? 0),
    currency: String(readFirestoreValue(fields.currency) ?? "PKR"),
    condition: String(readFirestoreValue(fields.condition) ?? "Used"),
    stockStatus: String(readFirestoreValue(fields.stockStatus) ?? "In Stock"),
    featured: Boolean(readFirestoreValue(fields.featured)),
    imageUrl: String(readFirestoreValue(fields.imageUrl) ?? "")
  };
}

export async function fetchProductMetadataBySlug(slug: string) {
  const config = getFirestoreRestConfig();

  if (!config || !slug.trim()) {
    return null;
  }

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${FIRESTORE_DATABASE_ID}/documents:runQuery?key=${config.apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "products" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "slug" },
              op: "EQUAL",
              value: { stringValue: slug }
            }
          },
          limit: 1
        }
      }),
      next: { revalidate: 300 }
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Array<{ document?: FirestoreDocument }>;
  const document = data.find((entry) => entry.document)?.document;

  if (!document) {
    return null;
  }

  return mapMetadataProduct(document);
}
