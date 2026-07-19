export type AppwriteColumnBlueprint = {
  key: string;
  kind: "varchar" | "text" | "enum" | "url" | "integer" | "boolean" | "datetime";
  required: boolean;
  size?: number;
  elements?: readonly string[];
  default?: string | number | boolean;
};

export type AppwriteIndexBlueprint = {
  key: string;
  type: "key" | "unique";
  columns: readonly string[];
};

export type AppwriteTableBlueprint = {
  createInPhase3L: boolean;
  schemaLocked: boolean;
  expectedColumnKeys?: readonly string[];
  columns: readonly AppwriteColumnBlueprint[];
  indexes: readonly AppwriteIndexBlueprint[];
};

export const APPWRITE_TABLE_BLUEPRINTS = {
  products: {
    createInPhase3L: true,
    schemaLocked: true,
    columns: [
      { key: "name", kind: "varchar", size: 160, required: true },
      { key: "slug", kind: "varchar", size: 160, required: true },
      { key: "description", kind: "text", required: true },
      { key: "brand", kind: "enum", elements: ["univercell", "eko"], required: true },
      { key: "preferredContactId", kind: "varchar", size: 64, required: false },
      { key: "categoryId", kind: "varchar", size: 36, required: true },
      { key: "categoryName", kind: "varchar", size: 160, required: true },
      { key: "price", kind: "integer", required: true },
      { key: "currency", kind: "enum", elements: ["PKR"], required: false, default: "PKR" },
      { key: "condition", kind: "enum", elements: ["New", "Like New", "Used"], required: true },
      { key: "stockStatus", kind: "enum", elements: ["in_stock", "low_stock", "sold_out"], required: true },
      { key: "featured", kind: "boolean", required: false, default: false },
      { key: "statusPick", kind: "boolean", required: false, default: false },
      { key: "storefrontVisible", kind: "boolean", required: false, default: false },
      { key: "feedVisible", kind: "boolean", required: false, default: false },
      { key: "sortPriority", kind: "integer", required: false, default: 0 },
      { key: "chosenSelectionKey", kind: "varchar", size: 36, required: true },
      { key: "imageFileId", kind: "varchar", size: 36, required: false },
      { key: "legacyImageUrl", kind: "url", required: false },
      { key: "createdAt", kind: "datetime", required: true },
      { key: "updatedAt", kind: "datetime", required: true },
      { key: "createdByName", kind: "varchar", size: 160, required: false },
      { key: "updatedByName", kind: "varchar", size: 160, required: false }
    ],
    indexes: [
      { key: "products_slug_unique", type: "unique", columns: ["slug"] },
      { key: "products_updated_at", type: "key", columns: ["updatedAt"] },
      { key: "products_chosen_unique", type: "unique", columns: ["chosenSelectionKey"] }
    ]
  },
  categories: {
    createInPhase3L: true,
    schemaLocked: true,
    columns: [
      { key: "name", kind: "varchar", size: 160, required: true },
      { key: "slug", kind: "varchar", size: 160, required: true },
      { key: "updatedAt", kind: "datetime", required: true }
    ],
    indexes: [
      { key: "categories_slug_unique", type: "unique", columns: ["slug"] },
      { key: "categories_name", type: "key", columns: ["name"] }
    ]
  },
  activity_logs: {
    createInPhase3L: false,
    schemaLocked: true,
    columns: [
      { key: "eventId", kind: "varchar", size: 96, required: true },
      { key: "eventType", kind: "varchar", size: 96, required: true },
      {
        key: "entityType",
        kind: "enum",
        elements: ["product", "category", "image"],
        required: true
      },
      { key: "entityId", kind: "varchar", size: 36, required: true },
      { key: "actorUserId", kind: "varchar", size: 36, required: true },
      { key: "actorDisplayName", kind: "varchar", size: 160, required: true },
      {
        key: "actorRole",
        kind: "enum",
        elements: ["admin", "product_editor"],
        required: true
      },
      { key: "occurredAt", kind: "datetime", required: true },
      { key: "requestId", kind: "varchar", size: 128, required: true },
      {
        key: "result",
        kind: "enum",
        elements: ["succeeded", "failed", "compensated", "compensation_failed"],
        required: true
      },
      { key: "changedFields", kind: "varchar", size: 1024, required: true },
      { key: "beforeState", kind: "text", required: false },
      { key: "afterState", kind: "text", required: false },
      { key: "errorClassification", kind: "varchar", size: 64, required: false },
      {
        key: "compensationClassification",
        kind: "varchar",
        size: 160,
        required: false
      },
      { key: "metadataSummary", kind: "text", required: false },
      {
        key: "fixtureClassification",
        kind: "enum",
        elements: [
          "ordinary",
          "phase3y_verification",
          "phase3z_staging_verification",
          "phase3zr_blocker_closure"
        ],
        required: true
      }
    ],
    indexes: [
      { key: "activity_event_unique", type: "unique", columns: ["eventId"] },
      { key: "activity_occurred_at", type: "key", columns: ["occurredAt"] },
      {
        key: "activity_entity",
        type: "key",
        columns: ["entityType", "entityId"]
      },
      { key: "activity_actor", type: "key", columns: ["actorUserId"] },
      { key: "activity_event_type", type: "key", columns: ["eventType"] },
      { key: "activity_request", type: "key", columns: ["requestId"] }
    ]
  },
  analytics_events: {
    createInPhase3L: false,
    schemaLocked: false,
    expectedColumnKeys: ["eventName", "sessionId", "productId", "productSlug", "category", "context", "createdAt"],
    columns: [],
    indexes: [{ key: "analytics_events_created_at", type: "key", columns: ["createdAt"] }]
  },
  broadcasts: {
    createInPhase3L: false,
    schemaLocked: false,
    expectedColumnKeys: [
      "title", "body", "sentAt", "sentByUserId", "sentByName", "sentByEmail",
      "productId", "productSlug", "productImageFileId", "legacyProductImageUrl"
    ],
    columns: [],
    indexes: [{ key: "broadcasts_sent_at", type: "key", columns: ["sentAt"] }]
  }
} as const satisfies Record<string, AppwriteTableBlueprint>;
