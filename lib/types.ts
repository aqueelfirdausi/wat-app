export type ProductCondition = "New" | "Like New" | "Used";
export type StockStatus = "in_stock" | "low_stock" | "sold_out";
export type ProductBrand = "univercell" | "eko";

export type TeamContact = {
  id: string;
  name: string;
  label: "Admin" | "Sales";
  localPhone: string;
  whatsappNumber: string;
  brand?: ProductBrand;
  active: boolean;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  brand?: ProductBrand;
  preferredContactId?: string;
  assignedContactId?: string;
  contactId?: string;
  contactName?: string;
  contactWhatsappNumber?: string;
  categoryId: string;
  categoryName: string;
  price: number;
  currency: string;
  condition: ProductCondition;
  stockStatus: StockStatus;
  featured: boolean;
  statusPick: boolean;
  chosenForToday: boolean;
  storefrontVisible: boolean;
  feedVisible: boolean;
  sortPriority?: number;
  imageUrl: string;
  imagePath?: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  createdByName?: string;
  updatedByName?: string;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  productCount?: number;
};

export type PublicProduct = Pick<
  Product,
  | "name"
  | "slug"
  | "description"
  | "brand"
  | "preferredContactId"
  | "categoryName"
  | "price"
  | "currency"
  | "condition"
  | "stockStatus"
  | "featured"
  | "storefrontVisible"
  | "feedVisible"
  | "sortPriority"
  | "imageUrl"
  | "createdAt"
  | "updatedAt"
> & {
  /**
   * Public presentation key. Appwrite row IDs are deliberately not exposed;
   * the unique public slug is used instead.
   */
  id: string;
};

export type PublicCategory = Pick<Category, "name" | "slug"> & {
  /** Public presentation key derived from the category slug. */
  id: string;
};

export type ActivityLog = {
  id: string;
  action: string;
  entityType: "product" | "category" | "setting" | "user";
  entityId: string;
  entityName: string;
  actorUid: string;
  actorName: string;
  actorEmail: string;
  details: string;
  createdAt?: Date | null;
};

export type AnalyticsEventName = "storefront_visit" | "feed_view" | "product_view" | "whatsapp_click";

export type AnalyticsEvent = {
  id: string;
  eventName: AnalyticsEventName;
  sessionId?: string;
  productId?: string;
  productSlug?: string;
  category?: string;
  context?: "storefront" | "catalog" | "feed" | "detail";
  createdAt?: Date | null;
};

export type ProductFormValues = {
  name: string;
  description: string;
  brand: ProductBrand | "";
  preferredContactId: string;
  categoryName: string;
  price: string;
  condition: ProductCondition;
  stockStatus: StockStatus;
  featured: boolean;
  sortPriority: string;
};
