export const APPWRITE_DEFAULT_RESOURCE_IDS = {
  database: "wat_app",
  team: "wat_staff",
  productImagesBucket: "product_images",
  tables: {
    products: "products",
    categories: "categories",
    activityLogs: "activity_logs",
    analyticsEvents: "analytics_events",
    broadcasts: "broadcasts"
  }
} as const;

export const APPWRITE_APPLICATION_ROLES = ["admin", "product_editor"] as const;
export type AppwriteApplicationRole = (typeof APPWRITE_APPLICATION_ROLES)[number];

function fixedResourceId(
  environment: Record<string, string | undefined>,
  variableName: string,
  expected: string
) {
  const configured = environment[variableName] ?? expected;
  if (configured !== expected) {
    throw new Error(`${variableName} must remain the fixed ID ${expected}.`);
  }
  return configured;
}

export function getAppwriteResourceIds(
  environment: Record<string, string | undefined> = process.env
) {
  return {
    database: fixedResourceId(environment, "APPWRITE_DATABASE_ID", APPWRITE_DEFAULT_RESOURCE_IDS.database),
    team: fixedResourceId(environment, "APPWRITE_TEAM_ID", APPWRITE_DEFAULT_RESOURCE_IDS.team),
    productImagesBucket: fixedResourceId(
      environment,
      "APPWRITE_PRODUCT_IMAGES_BUCKET_ID",
      APPWRITE_DEFAULT_RESOURCE_IDS.productImagesBucket
    ),
    tables: {
      products: fixedResourceId(environment, "APPWRITE_PRODUCTS_TABLE_ID", APPWRITE_DEFAULT_RESOURCE_IDS.tables.products),
      categories: fixedResourceId(environment, "APPWRITE_CATEGORIES_TABLE_ID", APPWRITE_DEFAULT_RESOURCE_IDS.tables.categories),
      activityLogs: fixedResourceId(environment, "APPWRITE_ACTIVITY_LOGS_TABLE_ID", APPWRITE_DEFAULT_RESOURCE_IDS.tables.activityLogs),
      analyticsEvents: fixedResourceId(environment, "APPWRITE_ANALYTICS_EVENTS_TABLE_ID", APPWRITE_DEFAULT_RESOURCE_IDS.tables.analyticsEvents),
      broadcasts: fixedResourceId(environment, "APPWRITE_BROADCASTS_TABLE_ID", APPWRITE_DEFAULT_RESOURCE_IDS.tables.broadcasts)
    }
  } as const;
}

export const APPWRITE_PERMANENT_TABLE_IDS = Object.values(
  APPWRITE_DEFAULT_RESOURCE_IDS.tables
);
