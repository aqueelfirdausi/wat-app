export type ProductCondition = "New" | "Like New" | "Used";
export type StockStatus = "In Stock" | "Low Stock" | "Out of Stock";
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
};
