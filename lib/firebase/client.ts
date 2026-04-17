"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { firebaseConfig, isFirebaseConfigured } from "@/lib/firebase/config";

const FIRESTORE_DATABASE_ID = "watapp";

const app = isFirebaseConfigured()
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app, FIRESTORE_DATABASE_ID) : null;
export const storage = app ? getStorage(app) : null;
