import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore/lite";

function loadEnvFile(filename) {
  const filePath = resolve(process.cwd(), filename);

  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const FIRESTORE_DATABASE_ID = "watapp";

if (Object.values(firebaseConfig).some((value) => !value)) {
  throw new Error("Missing Firebase environment variables. Add them to .env.local before running npm run seed:demo.");
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, FIRESTORE_DATABASE_ID);
const now = new Date();

const categories = [
  { id: "mobiles", name: "Mobiles", slug: "mobiles", productCount: 1 },
  { id: "slightly-used", name: "Slightly Used", slug: "slightly-used", productCount: 1 },
  { id: "accessories", name: "Accessories", slug: "accessories", productCount: 1 },
  { id: "power-banks", name: "Power Banks", slug: "power-banks", productCount: 0 },
  { id: "perfumes", name: "Perfumes", slug: "perfumes", productCount: 0 }
];

const teamContacts = [
  {
    id: "aqueel-firdausi",
    name: "Aqueel Firdausi",
    label: "Admin",
    localPhone: "03158255777",
    whatsappNumber: "923158255777",
    active: true
  },
  {
    id: "umer-farooq",
    name: "Umer Farooq",
    label: "Sales",
    localPhone: "03312890323",
    whatsappNumber: "923312890323",
    active: true
  },
  {
    id: "abdullah-bin-aqueel",
    name: "Abdullah Bin Aqueel",
    label: "Sales",
    localPhone: "03168232872",
    whatsappNumber: "923168232872",
    active: true
  },
  {
    id: "saaim-shakil",
    name: "Saaim Shakil",
    label: "Sales",
    localPhone: "03253478815",
    whatsappNumber: "923253478815",
    active: true
  }
];

const products = [
  {
    id: "iphone-13-128gb",
    name: "iPhone 13 128GB",
    slug: "iphone-13-128gb",
    description: "Factory unlocked iPhone 13 in clean condition with strong battery health.",
    brand: "univercell",
    assignedContactId: "umer-farooq",
    categoryId: "mobiles",
    categoryName: "Mobiles",
    price: 185000,
    currency: "PKR",
    condition: "Like New",
    stockStatus: "in_stock",
    featured: true,
    imageUrl: "https://images.unsplash.com/photo-1632661674596-df8be070a5c5?auto=format&fit=crop&w=1200&q=80"
  },
  {
    id: "airpods-pro-used",
    name: "AirPods Pro",
    slug: "airpods-pro-used",
    description: "Slightly used AirPods Pro with charging case and excellent sound output.",
    brand: "univercell",
    assignedContactId: "abdullah-bin-aqueel",
    categoryId: "slightly-used",
    categoryName: "Slightly Used",
    price: 32000,
    currency: "PKR",
    condition: "Used",
    stockStatus: "low_stock",
    featured: false,
    imageUrl: "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=1200&q=80"
  },
  {
    id: "anker-fast-charger",
    name: "Anker 30W Fast Charger",
    slug: "anker-fast-charger",
    description: "Compact fast charger for phones and accessories, ideal for daily carry.",
    brand: "univercell",
    assignedContactId: "saaim-shakil",
    categoryId: "accessories",
    categoryName: "Accessories",
    price: 6500,
    currency: "PKR",
    condition: "New",
    stockStatus: "in_stock",
    featured: true,
    imageUrl: "https://images.unsplash.com/photo-1585338107529-13afc5f02586?auto=format&fit=crop&w=1200&q=80"
  }
];

async function seed() {
  for (const category of categories) {
    await setDoc(
      doc(db, "categories", category.id),
      {
        ...category,
        updatedAt: now
      },
      { merge: true }
    );
  }

  for (const contact of teamContacts) {
    await setDoc(
      doc(db, "team_contacts", contact.id),
      {
        ...contact,
        updatedAt: now
      },
      { merge: true }
    );
  }

  for (const product of products) {
    await setDoc(
      doc(db, "products", product.id),
      {
        ...product,
        contactId: product.assignedContactId,
        imagePath: "",
        createdAt: now,
        updatedAt: now,
        createdByUid: "seed-script",
        createdByName: "Seed Script",
        updatedByUid: "seed-script",
        updatedByName: "Seed Script"
      },
      { merge: true }
    );
  }

  await setDoc(
    doc(db, "settings", "general"),
    {
      whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "",
      updatedAt: now
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "logs", "seed-demo"),
    {
      action: "seeded",
      entityType: "setting",
      entityId: "demo-data",
      entityName: "Demo data",
      actorUid: "seed-script",
      actorName: "Seed Script",
      actorEmail: "seed-script@local",
      details: "Inserted initial demo categories, products, and settings.",
      createdAt: now
    },
    { merge: true }
  );

  console.log("Demo Firestore data seeded successfully.");
  console.log("Categories:", categories.map((category) => category.name).join(", "));
  console.log("Team contacts:", teamContacts.map((contact) => contact.name).join(", "));
  console.log("Products:", products.map((product) => product.name).join(", "));
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
