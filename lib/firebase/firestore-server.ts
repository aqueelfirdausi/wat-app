import { isProductVisibleOnStorefront, normalizeStockStatus } from "@/lib/utils";

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
  storefrontVisible: boolean;
  feedVisible: boolean;
  imageUrl: string;
};

type ProductMetadataFetchOptions = {
  revalidate?: number | false;
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
  const rawStorefrontVisible = readFirestoreValue(fields.storefrontVisible);

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
    stockStatus: normalizeStockStatus(readFirestoreValue(fields.stockStatus)),
    featured: Boolean(readFirestoreValue(fields.featured)),
    storefrontVisible: isProductVisibleOnStorefront({
      storefrontVisible: typeof rawStorefrontVisible === "boolean" ? rawStorefrontVisible : true
    }),
    feedVisible: typeof readFirestoreValue(fields.feedVisible) === "boolean" ? Boolean(readFirestoreValue(fields.feedVisible)) : true,
    imageUrl: String(readFirestoreValue(fields.imageUrl) ?? "")
  };
}

export async function fetchProductMetadataBySlug(slug: string, options?: ProductMetadataFetchOptions) {
  const config = getFirestoreRestConfig();

  if (!config || !slug.trim()) {
    return null;
  }

  const fetchOptions: RequestInit & { next?: { revalidate: number } } = {
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
    })
  };

  if (options?.revalidate === false) {
    fetchOptions.cache = "no-store";
  } else {
    fetchOptions.next = {
      revalidate: options?.revalidate ?? 300
    };
  }

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${FIRESTORE_DATABASE_ID}/documents:runQuery?key=${config.apiKey}`,
    fetchOptions
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Array<{ document?: FirestoreDocument }>;
  const document = data.find((entry) => entry.document)?.document;

  if (!document) {
    return null;
  }

  const product = mapMetadataProduct(document);
  return product.storefrontVisible ? product : null;
}
