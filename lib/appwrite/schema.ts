import type { AppwriteApplicationRole } from "@/lib/appwrite/resources";

export type AppwriteProduct = {
  $id: string;
  name: string;
  slug: string;
  description: string;
  brand: "univercell" | "eko";
  preferredContactId?: string | null;
  categoryId: string;
  categoryName: string;
  price: number;
  currency: "PKR";
  condition: "New" | "Like New" | "Used";
  stockStatus: "in_stock" | "low_stock" | "sold_out";
  featured: boolean;
  statusPick: boolean;
  storefrontVisible: boolean;
  feedVisible: boolean;
  sortPriority: number;
  /** Provisional until the isolated uniqueness and concurrency tests pass. */
  chosenSelectionKey: string;
  imageFileId?: string | null;
  legacyImageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName?: string | null;
  updatedByName?: string | null;
};

export type AppwriteCategory = {
  $id: string;
  name: string;
  slug: string;
  updatedAt: string;
};

export type AppwriteActivityLog = {
  $id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  actorUserId: string;
  legacyActorFirebaseUid: string;
  actorName: string;
  actorEmail: string;
  details: string;
  requestId?: string | null;
  createdAt: string;
};

export type AppwriteAnalyticsEvent = {
  $id: string;
  eventName: string;
  sessionId?: string | null;
  productId?: string | null;
  productSlug?: string | null;
  category?: string | null;
  context?: string | null;
  createdAt: string;
};

export type AppwriteBroadcast = {
  $id: string;
  title: string;
  body: string;
  sentAt: string;
  sentByUserId: string;
  sentByName: string;
  sentByEmail: string;
  productId?: string | null;
  productSlug?: string | null;
  productImageFileId?: string | null;
  legacyProductImageUrl?: string | null;
};

export type AuthenticatedStaffIdentity = {
  userId: string;
  email: string;
  name: string;
  role: AppwriteApplicationRole;
};

export function isAppwriteApplicationRole(value: unknown): value is AppwriteApplicationRole {
  return value === "admin" || value === "product_editor";
}
