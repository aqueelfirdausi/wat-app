"use client";

import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { inferBrandFromCategory } from "@/lib/brands";
import { db, storage } from "@/lib/firebase/client";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { getTeamContactById } from "@/lib/team-contacts";
import { ActivityLog, Category, Product, ProductFormValues } from "@/lib/types";
import { isProductVisibleOnStorefront, normalizeStockStatus, parseFirebaseDate, slugify } from "@/lib/utils";

type Actor = {
  uid: string;
  name: string;
  email: string;
};

function ensureDb() {
  if (!db) {
    throw new Error("Firebase is not configured. Add your environment variables to continue.");
  }

  return db;
}

function ensureStorage() {
  if (!storage) {
    throw new Error("Firebase Storage is not configured. Add your environment variables to continue.");
  }

  return storage;
}

const STORAGE_TIMEOUT_MS = 20000;

function getFirebaseErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    const code = error.code.replace("storage/", "").replace(/-/g, " ");
    return code.charAt(0).toUpperCase() + code.slice(1);
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown Firebase error";
}

async function withTimeout<T>(promise: Promise<T>, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, STORAGE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function mapProduct(id: string, data: Record<string, unknown>): Product {
  const categoryName = String(data.categoryName ?? "");

  return {
    id,
    name: String(data.name ?? ""),
    slug: String(data.slug ?? ""),
    description: String(data.description ?? ""),
    brand: (data.brand as Product["brand"]) ?? inferBrandFromCategory(categoryName),
    preferredContactId: data.preferredContactId
      ? String(data.preferredContactId)
      : data.assignedContactId
        ? String(data.assignedContactId)
        : data.contactId
          ? String(data.contactId)
          : undefined,
    assignedContactId: data.assignedContactId ? String(data.assignedContactId) : data.contactId ? String(data.contactId) : undefined,
    contactId: data.contactId ? String(data.contactId) : undefined,
    contactName: data.contactName ? String(data.contactName) : undefined,
    contactWhatsappNumber: data.contactWhatsappNumber ? String(data.contactWhatsappNumber) : undefined,
    categoryId: String(data.categoryId ?? ""),
    categoryName,
    price: Number(data.price ?? 0),
    currency: String(data.currency ?? DEFAULT_CURRENCY),
    condition: (data.condition as Product["condition"]) ?? "Used",
    stockStatus: normalizeStockStatus(data.stockStatus),
    featured: Boolean(data.featured),
    statusPick: Boolean(data.statusPick),
    chosenForToday: Boolean(data.chosenForToday),
    storefrontVisible: isProductVisibleOnStorefront({
      storefrontVisible: typeof data.storefrontVisible === "boolean" ? data.storefrontVisible : true
    }),
    feedVisible: typeof data.feedVisible === "boolean" ? data.feedVisible : true,
    sortPriority: Number(data.sortPriority ?? 0),
    imageUrl: String(data.imageUrl ?? ""),
    imagePath: data.imagePath ? String(data.imagePath) : undefined,
    createdAt: parseFirebaseDate(data.createdAt),
    updatedAt: parseFirebaseDate(data.updatedAt),
    createdByName: data.createdByName ? String(data.createdByName) : undefined,
    updatedByName: data.updatedByName ? String(data.updatedByName) : undefined
  };
}

function mapCategory(id: string, data: Record<string, unknown>): Category {
  return {
    id,
    name: String(data.name ?? ""),
    slug: String(data.slug ?? ""),
    productCount: Number(data.productCount ?? 0)
  };
}

function mapLog(id: string, data: Record<string, unknown>): ActivityLog {
  return {
    id,
    action: String(data.action ?? ""),
    entityType: (data.entityType as ActivityLog["entityType"]) ?? "product",
    entityId: String(data.entityId ?? ""),
    entityName: String(data.entityName ?? ""),
    actorUid: String(data.actorUid ?? ""),
    actorName: String(data.actorName ?? "Unknown user"),
    actorEmail: String(data.actorEmail ?? ""),
    details: String(data.details ?? ""),
    createdAt: parseFirebaseDate(data.createdAt)
  };
}

export async function ensureUserProfile(actor: Actor) {
  const firestore = ensureDb();
  await setDoc(
    doc(firestore, "users", actor.uid),
    {
      uid: actor.uid,
      name: actor.name,
      email: actor.email,
      lastSeenAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function logActivity(input: Omit<ActivityLog, "id" | "createdAt">) {
  const firestore = ensureDb();
  await addDoc(collection(firestore, "logs"), {
    ...input,
    createdAt: serverTimestamp()
  });
}

export async function uploadProductImage(file: File, slug: string) {
  const firebaseStorage = ensureStorage();
  const imageRef = ref(firebaseStorage, `products/${slug}-${Date.now()}-${file.name}`);

  try {
    await withTimeout(
      uploadBytes(imageRef, file),
      "Image upload timed out. Check Firebase Storage setup and Storage rules, then try again."
    );
    const imageUrl = await withTimeout(
      getDownloadURL(imageRef),
      "Image upload finished but the download URL could not be fetched in time. Check Firebase Storage setup and Storage rules."
    );

    return { imageUrl, imagePath: imageRef.fullPath };
  } catch (error) {
    throw new Error(`Image upload failed: ${getFirebaseErrorMessage(error)}.`);
  }
}

export async function deleteProductImage(imagePath?: string) {
  if (!imagePath) {
    return;
  }

  const firebaseStorage = ensureStorage();

  try {
    await withTimeout(
      deleteObject(ref(firebaseStorage, imagePath)),
      "Existing image removal timed out. Check Firebase Storage setup and Storage rules, then try again."
    );
  } catch (error) {
    throw new Error(`Existing image removal failed: ${getFirebaseErrorMessage(error)}.`);
  }
}

async function upsertCategory(categoryName: string) {
  const firestore = ensureDb();
  const trimmed = categoryName.trim();
  const categorySlug = slugify(trimmed);
  const categoryRef = doc(firestore, "categories", categorySlug);

  await setDoc(
    categoryRef,
    {
      name: trimmed,
      slug: categorySlug,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  return {
    categoryId: categorySlug,
    categoryName: trimmed
  };
}

export async function createProduct(values: ProductFormValues, actor: Actor, file?: File | null) {
  const firestore = ensureDb();
  const category = await upsertCategory(values.categoryName);
  const slug = slugify(values.name);
  const brand = values.brand || inferBrandFromCategory(category.categoryName);
  const preferredContact = getTeamContactById(values.preferredContactId);
  const image = file ? await uploadProductImage(file, slug) : { imageUrl: "", imagePath: "" };
  const sortPriority = Math.max(0, Math.trunc(Number(values.sortPriority) || 0));

  const productRef = await addDoc(collection(firestore, "products"), {
    name: values.name.trim(),
    slug,
    description: values.description.trim(),
    ...(brand ? { brand } : {}),
    ...(values.preferredContactId ? { preferredContactId: values.preferredContactId } : {}),
    ...(values.preferredContactId ? { assignedContactId: values.preferredContactId } : {}),
    ...(preferredContact ? { contactId: preferredContact.id } : {}),
    ...(preferredContact ? { contactName: preferredContact.name } : {}),
    ...(preferredContact ? { contactWhatsappNumber: preferredContact.whatsappNumber } : {}),
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    price: Number(values.price),
    currency: DEFAULT_CURRENCY,
    condition: values.condition,
    stockStatus: normalizeStockStatus(values.stockStatus),
    featured: values.featured,
    statusPick: false,
    chosenForToday: false,
    storefrontVisible: true,
    feedVisible: true,
    sortPriority,
    imageUrl: image.imageUrl,
    imagePath: image.imagePath,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: actor.uid,
    createdByName: actor.name,
    updatedByUid: actor.uid,
    updatedByName: actor.name
  });

  await ensureUserProfile(actor);
  await logActivity({
    action: "created",
    entityType: "product",
    entityId: productRef.id,
    entityName: values.name.trim(),
    actorUid: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    details: `Added ${values.name.trim()} at ${Number(values.price)} PKR.`
  });
}

export async function updateProduct(
  productId: string,
  previousProduct: Product,
  values: ProductFormValues,
  actor: Actor,
  file?: File | null
) {
  const firestore = ensureDb();
  const category = await upsertCategory(values.categoryName);
  const slug = slugify(values.name);
  const brand = values.brand || inferBrandFromCategory(category.categoryName);
  const preferredContact = getTeamContactById(values.preferredContactId);
  const sortPriority = Math.max(0, Math.trunc(Number(values.sortPriority) || 0));
  let imagePayload: { imageUrl?: string; imagePath?: string } = {};

  if (file) {
    if (previousProduct.imagePath) {
      await deleteProductImage(previousProduct.imagePath);
    }

    imagePayload = await uploadProductImage(file, slug);
  }

  try {
    await updateDoc(doc(firestore, "products", productId), {
      name: values.name.trim(),
      slug,
      description: values.description.trim(),
      ...(brand ? { brand } : {}),
      preferredContactId: values.preferredContactId || null,
      assignedContactId: values.preferredContactId || null,
      contactId: preferredContact?.id ?? null,
      contactName: preferredContact?.name ?? null,
      contactWhatsappNumber: preferredContact?.whatsappNumber ?? null,
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      price: Number(values.price),
      condition: values.condition,
      stockStatus: normalizeStockStatus(values.stockStatus),
      featured: values.featured,
      statusPick: previousProduct.statusPick ?? false,
      chosenForToday: previousProduct.chosenForToday ?? false,
      storefrontVisible: previousProduct.storefrontVisible ?? true,
      feedVisible: previousProduct.feedVisible ?? true,
      sortPriority,
      ...imagePayload,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name
    });
  } catch (error) {
    throw new Error(`Product update failed in Firestore: ${getFirebaseErrorMessage(error)}.`);
  }

  await ensureUserProfile(actor);
  await logActivity({
    action: "updated",
    entityType: "product",
    entityId: productId,
    entityName: values.name.trim(),
    actorUid: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    details: `Updated ${values.name.trim()} and set price to ${Number(values.price)} PKR.`
  });
}

export async function updateProductStockStatus(product: Product, stockStatus: Product["stockStatus"], actor: Actor) {
  return updateProductOperationalState(
    product,
    {
      stockStatus: normalizeStockStatus(stockStatus)
    },
    actor,
    `Updated ${product.name} stock status to ${normalizeStockStatus(stockStatus)}.`
  );
}

export async function updateProductOperationalState(
  product: Product,
  updates: Partial<Pick<Product, "stockStatus" | "featured" | "statusPick" | "chosenForToday" | "storefrontVisible" | "feedVisible" | "sortPriority">>,
  actor: Actor,
  details: string
) {
  const firestore = ensureDb();
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByName: actor.name
  };

  if (updates.stockStatus) {
    payload.stockStatus = normalizeStockStatus(updates.stockStatus);
  }

  if (typeof updates.featured === "boolean") {
    payload.featured = updates.featured;
  }

  if (typeof updates.statusPick === "boolean") {
    payload.statusPick = updates.statusPick;
  }

  if (typeof updates.chosenForToday === "boolean") {
    payload.chosenForToday = updates.chosenForToday;
  }

  if (typeof updates.storefrontVisible === "boolean") {
    payload.storefrontVisible = updates.storefrontVisible;
  }

  if (typeof updates.feedVisible === "boolean") {
    payload.feedVisible = updates.feedVisible;
  }

  if (typeof updates.sortPriority === "number" && Number.isFinite(updates.sortPriority)) {
    payload.sortPriority = Math.max(0, Math.trunc(updates.sortPriority));
  }

  try {
    await updateDoc(doc(firestore, "products", product.id), payload);
  } catch (error) {
    throw new Error(`Product update failed in Firestore: ${getFirebaseErrorMessage(error)}.`);
  }

  await ensureUserProfile(actor);
  await logActivity({
    action: "updated",
    entityType: "product",
    entityId: product.id,
    entityName: product.name,
    actorUid: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    details
  });
}

export async function updateChosenForToday(product: Product, nextChosen: boolean, actor: Actor) {
  const firestore = ensureDb();
  const batch = writeBatch(firestore);
  const updates: string[] = [];

  if (nextChosen) {
    const chosenQuery = query(collection(firestore, "products"), where("chosenForToday", "==", true));
    const chosenSnapshot = await getDocs(chosenQuery);

    chosenSnapshot.docs.forEach((document) => {
      if (document.id === product.id) {
        return;
      }

      batch.update(document.ref, {
        chosenForToday: false,
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.name
      });
      updates.push(`replaced ${String(document.data().name ?? "previous main pick")}`);
    });
  }

  batch.update(doc(firestore, "products", product.id), {
    chosenForToday: nextChosen,
    statusPick: nextChosen ? true : product.statusPick,
    updatedAt: serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByName: actor.name
  });

  try {
    await batch.commit();
  } catch (error) {
    throw new Error(`Product update failed in Firestore: ${getFirebaseErrorMessage(error)}.`);
  }

  await ensureUserProfile(actor);
  await logActivity({
    action: "updated",
    entityType: "product",
    entityId: product.id,
    entityName: product.name,
    actorUid: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    details: nextChosen
      ? `Chosen ${product.name} as today's main pick${updates.length ? ` and ${updates.join(", ")}.` : "."}`
      : `Cleared ${product.name} as today's main pick.`
  });
}

export async function removeProduct(product: Product, actor: Actor) {
  const firestore = ensureDb();

  if (product.imagePath) {
    await deleteProductImage(product.imagePath);
  }

  await deleteDoc(doc(firestore, "products", product.id));
  await ensureUserProfile(actor);
  await logActivity({
    action: "deleted",
    entityType: "product",
    entityId: product.id,
    entityName: product.name,
    actorUid: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    details: `Deleted ${product.name}.`
  });
}

export async function fetchProducts() {
  const firestore = ensureDb();
  const snapshot = await getDocs(query(collection(firestore, "products"), orderBy("updatedAt", "desc")));
  return snapshot.docs.map((item) => mapProduct(item.id, item.data()));
}

export async function fetchProductBySlug(slug: string) {
  const firestore = ensureDb();
  const snapshot = await getDocs(query(collection(firestore, "products"), where("slug", "==", slug), limit(1)));
  const productDoc = snapshot.docs[0];

  if (!productDoc) {
    return null;
  }

  const product = mapProduct(productDoc.id, productDoc.data());
  return product.storefrontVisible ? product : null;
}

export async function fetchCategories() {
  const firestore = ensureDb();
  const snapshot = await getDocs(query(collection(firestore, "categories"), orderBy("name", "asc")));
  return snapshot.docs.map((item) => mapCategory(item.id, item.data()));
}

export function subscribeToProducts(callback: (products: Product[]) => void) {
  const firestore = ensureDb();
  return onSnapshot(query(collection(firestore, "products"), orderBy("updatedAt", "desc")), (snapshot) => {
    callback(snapshot.docs.map((item) => mapProduct(item.id, item.data())));
  });
}

export function subscribeToCategories(callback: (categories: Category[]) => void) {
  const firestore = ensureDb();
  return onSnapshot(query(collection(firestore, "categories"), orderBy("name", "asc")), (snapshot) => {
    callback(snapshot.docs.map((item) => mapCategory(item.id, item.data())));
  });
}

export function subscribeToActivityLogs(callback: (logs: ActivityLog[]) => void) {
  const firestore = ensureDb();
  return onSnapshot(query(collection(firestore, "logs"), orderBy("createdAt", "desc"), limit(50)), (snapshot) => {
    callback(snapshot.docs.map((item) => mapLog(item.id, item.data())));
  });
}

export async function seedSettings() {
  const firestore = ensureDb();
  await setDoc(
    doc(firestore, "settings", "general"),
    {
      whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "",
      updatedAt: Timestamp.now()
    },
    { merge: true }
  );
}
