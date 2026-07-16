import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const CONFIRM_FLAG = "--confirm-read-only";
const DATABASE_ID = "watapp";
const MAX_APPWRITE_INTEGER = 2_147_483_647;
const MAX_IMAGE_BYTES = 1_048_576;
const COLLECTION_NAMES = ["products", "categories", "logs", "analyticsEvents", "broadcasts"];
const VALID_EVENT_NAMES = ["storefront_visit", "feed_view", "product_view", "whatsapp_click"];
const VALID_CONTEXTS = ["storefront", "catalog", "feed", "detail"];
const KNOWN_ENTITY_TYPES = ["product", "category", "setting", "user"];

const EXPECTED_FIELDS = {
  products: [
    "name", "slug", "description", "brand", "preferredContactId", "assignedContactId", "contactId",
    "contactName", "contactWhatsappNumber", "categoryId", "categoryName", "price", "currency", "condition",
    "stockStatus", "featured", "statusPick", "chosenForToday", "storefrontVisible", "feedVisible", "sortPriority",
    "imageUrl", "imagePath", "createdAt", "updatedAt", "createdByUid", "createdByName", "updatedByUid", "updatedByName"
  ],
  categories: ["name", "slug", "productCount", "updatedAt"],
  logs: ["action", "entityType", "entityId", "entityName", "actorUid", "actorName", "actorEmail", "details", "createdAt"],
  analyticsEvents: ["eventName", "sessionId", "productId", "productSlug", "category", "context", "createdAt"],
  broadcasts: ["title", "body", "sentAt", "productId", "productImageUrl", "productSlug", "sentByUid", "sentByName", "senderUid", "senderName"]
};

function increment(histogram, key) {
  histogram[key] = (histogram[key] ?? 0) + 1;
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "timestamp";
  if (value && typeof value === "object" && typeof value.toDate === "function") return "timestamp";
  if (value && typeof value === "object" && Number.isInteger(value.seconds)) return "timestamp";
  return typeof value;
}

function hasValue(record, field) {
  return Object.hasOwn(record, field) && record[field] !== null && record[field] !== undefined;
}

function summarizeFields(records, fields) {
  const presence = {};
  const types = {};
  for (const field of fields) {
    let present = 0;
    const fieldTypes = {};
    for (const record of records) {
      if (hasValue(record.data, field)) {
        present += 1;
        increment(fieldTypes, valueType(record.data[field]));
      }
    }
    presence[field] = { present, missing: records.length - present };
    types[field] = fieldTypes;
  }
  return { presence, types };
}

export function hashIdentifier(identifier) {
  return createHash("sha256").update(String(identifier)).digest("hex").slice(0, 12);
}

export function isAppwriteCompatibleId(identifier) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(String(identifier));
}

export function normalizeSlug(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidSlug(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function duplicateSlugSummary(records) {
  const groups = new Map();
  for (const record of records) {
    const normalized = normalizeSlug(record.data.slug);
    if (!normalized) continue;
    const ids = groups.get(normalized) ?? [];
    ids.push(record.id);
    groups.set(normalized, ids);
  }
  const duplicates = [...groups.values()].filter((ids) => ids.length > 1);
  return {
    groupCount: duplicates.length,
    documentCount: duplicates.reduce((total, ids) => total + ids.length, 0),
    identifiers: duplicates.flatMap((ids) => ids.map(hashIdentifier))
  };
}

function idCompatibility(records) {
  const invalid = records.filter((record) => !isAppwriteCompatibleId(record.id));
  return { invalidCount: invalid.length, identifiers: invalid.map((record) => hashIdentifier(record.id)) };
}

function countPresence(records, fields) {
  const result = {};
  for (const field of fields) {
    result[field] = {
      present: records.filter((record) => hasValue(record.data, field)).length,
      missing: records.filter((record) => !hasValue(record.data, field)).length
    };
  }
  return result;
}

function timestampSummary(records, field) {
  const histogram = { present: 0, missing: 0, timestamp: 0, other: 0 };
  for (const record of records) {
    if (!hasValue(record.data, field)) {
      histogram.missing += 1;
      continue;
    }
    histogram.present += 1;
    if (valueType(record.data[field]) === "timestamp") histogram.timestamp += 1;
    else histogram.other += 1;
  }
  return histogram;
}

function boundedHistogram(records, field, allowed) {
  const histogram = Object.fromEntries(allowed.map((value) => [value, 0]));
  histogram.missing = 0;
  histogram.other = 0;
  for (const record of records) {
    const value = record.data[field];
    if (!hasValue(record.data, field)) histogram.missing += 1;
    else if (allowed.includes(value)) histogram[value] += 1;
    else histogram.other += 1;
  }
  return histogram;
}

function extractStoragePath(imageUrl) {
  if (typeof imageUrl !== "string" || !imageUrl) return null;
  try {
    const url = new URL(imageUrl);
    const marker = "/o/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return imageUrl.startsWith("gs://") ? imageUrl.split("/").slice(3).join("/") || null : null;
  }
}

function analyzeStorage(products, storageObjects) {
  const referenceCounts = new Map();
  let noImageReference = 0;
  let remoteOnly = 0;
  let pathBacked = 0;
  for (const product of products) {
    const explicitPath = typeof product.data.imagePath === "string" ? product.data.imagePath.trim() : "";
    const inferredPath = extractStoragePath(product.data.imageUrl);
    const path = explicitPath || inferredPath;
    if (path) {
      pathBacked += 1;
      referenceCounts.set(path, (referenceCounts.get(path) ?? 0) + 1);
    } else if (typeof product.data.imageUrl === "string" && product.data.imageUrl.trim()) {
      remoteOnly += 1;
    } else {
      noImageReference += 1;
    }
  }

  const objectMap = new Map(storageObjects.map((object) => [object.name, object]));
  const missing = [...referenceCounts.keys()].filter((path) => !objectMap.has(path));
  const sharedReferenceCount = [...referenceCounts.values()].filter((count) => count > 1).length;
  const orphanCount = storageObjects.filter((object) => !referenceCounts.has(object.name)).length;
  const mimeHistogram = {};
  const sizeHistogram = { zeroBytes: 0, upTo500KB: 0, from500KBTo1MB: 0, over1MB: 0 };
  for (const object of storageObjects) {
    const mime = typeof object.contentType === "string" && object.contentType ? object.contentType.toLowerCase() : "missing";
    increment(mimeHistogram, /^image\/[a-z0-9.+-]+$/.test(mime) ? mime : "other-or-missing");
    const size = Number(object.size);
    if (!Number.isFinite(size) || size <= 0) sizeHistogram.zeroBytes += 1;
    else if (size <= 512_000) sizeHistogram.upTo500KB += 1;
    else if (size <= MAX_IMAGE_BYTES) sizeHistogram.from500KBTo1MB += 1;
    else sizeHistogram.over1MB += 1;
  }

  return {
    classification: { pathBacked, remoteOnly, noImageReference },
    referencedObjectCount: referenceCounts.size,
    missingObjectCount: missing.length,
    missingIdentifiers: missing.map(hashIdentifier),
    sharedReferenceCount,
    orphanObjectCount: orphanCount,
    objectCount: storageObjects.length,
    mimeHistogram,
    sizeHistogram
  };
}

export function analyzeInventory(fixtures) {
  const collections = Object.fromEntries(COLLECTION_NAMES.map((name) => [name, fixtures.collections?.[name] ?? []]));
  const products = collections.products;
  const categories = collections.categories;
  const logs = collections.logs;
  const analytics = collections.analyticsEvents;
  const broadcasts = collections.broadcasts;

  const productDuplicates = duplicateSlugSummary(products);
  const productIds = idCompatibility(products);
  const invalidSlugRecords = products.filter((record) => !isValidSlug(record.data.slug));
  const invalidPriceRecords = products.filter((record) => {
    const price = record.data.price;
    return typeof price !== "number" || !Number.isInteger(price) || price <= 0 || price > MAX_APPWRITE_INTEGER;
  });
  const chosen = products.filter((record) => record.data.chosenForToday === true);
  const chosenInconsistent = chosen.filter((record) =>
    record.data.statusPick !== true || record.data.storefrontVisible === false || record.data.feedVisible === false
  );
  const contactConflicts = products.filter((record) => {
    const selectors = [record.data.preferredContactId, record.data.assignedContactId, record.data.contactId]
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => value.trim().toLowerCase());
    return new Set(selectors).size > 1;
  });
  const legacyChosenTypes = {};
  for (const product of products.filter((record) => hasValue(record.data, "chosenForToday"))) {
    increment(legacyChosenTypes, valueType(product.data.chosenForToday));
  }

  const categoryDuplicates = duplicateSlugSummary(categories);
  const categoryIds = idCompatibility(categories);
  const storage = analyzeStorage(products, fixtures.storageObjects ?? []);
  const blockerCount = productDuplicates.groupCount + productIds.invalidCount + invalidSlugRecords.length +
    invalidPriceRecords.length + Math.max(0, chosen.length - 1) + chosenInconsistent.length + contactConflicts.length +
    categoryDuplicates.groupCount + categoryIds.invalidCount + storage.missingObjectCount + storage.sizeHistogram.over1MB;

  return {
    blockerCount,
    products: {
      count: products.length,
      fields: summarizeFields(products, EXPECTED_FIELDS.products),
      invalidSlugCount: invalidSlugRecords.length,
      invalidSlugIdentifiers: invalidSlugRecords.map((record) => hashIdentifier(record.id)),
      duplicateSlugs: productDuplicates,
      invalidPriceCount: invalidPriceRecords.length,
      invalidPriceIdentifiers: invalidPriceRecords.map((record) => hashIdentifier(record.id)),
      ids: productIds,
      legacyChosen: { presentCount: products.filter((record) => hasValue(record.data, "chosenForToday")).length, types: legacyChosenTypes },
      chosenCount: chosen.length,
      chosenInconsistentCount: chosenInconsistent.length,
      chosenInconsistentIdentifiers: chosenInconsistent.map((record) => hashIdentifier(record.id)),
      contactConflictCount: contactConflicts.length,
      contactConflictIdentifiers: contactConflicts.map((record) => hashIdentifier(record.id)),
      imageClassification: storage.classification
    },
    categories: {
      count: categories.length,
      fields: summarizeFields(categories, EXPECTED_FIELDS.categories),
      presence: countPresence(categories, ["name", "slug"]),
      duplicateSlugs: categoryDuplicates,
      ids: categoryIds,
      updatedAt: timestampSummary(categories, "updatedAt")
    },
    logs: {
      count: logs.length,
      fields: summarizeFields(logs, EXPECTED_FIELDS.logs),
      timestamp: timestampSummary(logs, "createdAt"),
      entityTypes: boundedHistogram(logs, "entityType", KNOWN_ENTITY_TYPES),
      actorIdentity: countPresence(logs, ["actorUid", "actorName", "actorEmail"])
    },
    analytics: {
      count: analytics.length,
      fields: summarizeFields(analytics, EXPECTED_FIELDS.analyticsEvents),
      eventNames: boundedHistogram(analytics, "eventName", VALID_EVENT_NAMES),
      invalidEventNameCount: analytics.filter((record) => hasValue(record.data, "eventName") && !VALID_EVENT_NAMES.includes(record.data.eventName)).length,
      contexts: boundedHistogram(analytics, "context", VALID_CONTEXTS),
      timestamp: timestampSummary(analytics, "createdAt")
    },
    broadcasts: {
      count: broadcasts.length,
      fields: summarizeFields(broadcasts, EXPECTED_FIELDS.broadcasts),
      presence: countPresence(broadcasts, ["title", "sentAt"]),
      productReferences: countPresence(broadcasts, ["productId", "productSlug"]),
      legacyImageReferences: countPresence(broadcasts, ["productImageUrl"]),
      senderFields: countPresence(broadcasts, ["sentByUid", "sentByName", "senderUid", "senderName"])
    },
    storage
  };
}

function json(value) {
  return JSON.stringify(value);
}

export function formatInventoryReport(report) {
  return [
    "Firebase migration inventory (aggregate, read-only)",
    `Blockers: ${report.blockerCount}`,
    "",
    `[Products] documents=${report.products.count}`,
    `fieldPresence=${json(report.products.fields.presence)}`,
    `fieldTypes=${json(report.products.fields.types)}`,
    `slugValidity invalid=${report.products.invalidSlugCount} ids=${json(report.products.invalidSlugIdentifiers)}`,
    `duplicateNormalizedSlugs=${json(report.products.duplicateSlugs)}`,
    `priceCompatibility invalid=${report.products.invalidPriceCount} ids=${json(report.products.invalidPriceIdentifiers)}`,
    `documentIdCompatibility=${json(report.products.ids)}`,
    `legacyChosenForToday=${json(report.products.legacyChosen)}`,
    `chosenConsistency chosen=${report.products.chosenCount} inconsistent=${report.products.chosenInconsistentCount} ids=${json(report.products.chosenInconsistentIdentifiers)}`,
    `contactSelectorConflicts count=${report.products.contactConflictCount} ids=${json(report.products.contactConflictIdentifiers)}`,
    `imageClassification=${json(report.products.imageClassification)}`,
    "",
    `[Categories] documents=${report.categories.count}`,
    `fieldPresence=${json(report.categories.fields.presence)}`,
    `fieldTypes=${json(report.categories.fields.types)}`,
    `requiredPresence=${json(report.categories.presence)}`,
    `duplicateNormalizedSlugs=${json(report.categories.duplicateSlugs)}`,
    `documentIdCompatibility=${json(report.categories.ids)}`,
    `updatedAt=${json(report.categories.updatedAt)}`,
    "",
    `[Logs] documents=${report.logs.count}`,
    `fieldPresence=${json(report.logs.fields.presence)}`,
    `fieldTypes=${json(report.logs.fields.types)}`,
    `timestamp=${json(report.logs.timestamp)}`,
    `entityTypes=${json(report.logs.entityTypes)}`,
    `actorIdentityPresence=${json(report.logs.actorIdentity)}`,
    "",
    `[Analytics] documents=${report.analytics.count}`,
    `fieldPresence=${json(report.analytics.fields.presence)}`,
    `fieldTypes=${json(report.analytics.fields.types)}`,
    `eventNames=${json(report.analytics.eventNames)}`,
    `invalidEventNames=${report.analytics.invalidEventNameCount}`,
    `contexts=${json(report.analytics.contexts)}`,
    `timestamp=${json(report.analytics.timestamp)}`,
    "",
    `[Broadcasts] documents=${report.broadcasts.count}`,
    `fieldPresence=${json(report.broadcasts.fields.presence)}`,
    `fieldTypes=${json(report.broadcasts.fields.types)}`,
    `titleAndSentAt=${json(report.broadcasts.presence)}`,
    `productReferences=${json(report.broadcasts.productReferences)}`,
    `legacyImageReferences=${json(report.broadcasts.legacyImageReferences)}`,
    `senderFieldPresence=${json(report.broadcasts.senderFields)}`,
    "",
    `[Storage] objects=${report.storage.objectCount}`,
    `mimeHistogram=${json(report.storage.mimeHistogram)}`,
    `sizeHistogram=${json(report.storage.sizeHistogram)}`,
    `referenced=${report.storage.referencedObjectCount} missing=${report.storage.missingObjectCount} missingIds=${json(report.storage.missingIdentifiers)}`,
    `sharedReferences=${report.storage.sharedReferenceCount} orphaned=${report.storage.orphanObjectCount}`
  ].join("\n");
}

async function readFirebaseInventory() {
  const [{ getApps, initializeApp }, { getFirestore }, { getStorage }] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/firestore"),
    import("firebase-admin/storage")
  ]);
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!storageBucket) throw new Error("missing-storage-configuration");
  const app = getApps()[0] ?? initializeApp({ storageBucket });
  const database = getFirestore(app, DATABASE_ID);
  const storage = getStorage(app).bucket(storageBucket);
  const snapshots = await Promise.all(COLLECTION_NAMES.map((name) => database.collection(name).get()));
  const [files] = await storage.getFiles({ autoPaginate: true });
  const collections = Object.fromEntries(snapshots.map((snapshot, index) => [
    COLLECTION_NAMES[index],
    snapshot.docs.map((document) => ({ id: document.id, data: document.data() }))
  ]));
  const storageObjects = files.map((file) => ({
    name: file.name,
    contentType: file.metadata.contentType,
    size: Number(file.metadata.size ?? 0)
  }));
  return { collections, storageObjects };
}

async function main() {
  if (!process.argv.slice(2).includes(CONFIRM_FLAG)) {
    console.error(`Refusing to run. Reinvoke with ${CONFIRM_FLAG} after confirming read-only access.`);
    process.exitCode = 1;
    return;
  }
  try {
    const inventory = await readFirebaseInventory();
    const report = analyzeInventory(inventory);
    console.log(formatInventoryReport(report));
    process.exitCode = report.blockerCount > 0 ? 2 : 0;
  } catch (error) {
    const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "configuration-or-read-error";
    console.error(`Inventory failed safely (${String(code).replace(/[^a-zA-Z0-9._/-]/g, "-")}). No data was exported.`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) await main();
