"use client";

import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

const APPROVED_ADMIN_EMAILS = ["aqueelfirdausi@gmail.com", "abdullahbinaqueel@gmail.com"];

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

export async function hasAdminAccess(user: Pick<User, "uid" | "email" | "displayName">) {
  const normalizedEmail = normalizeEmail(user.email);

  if (!APPROVED_ADMIN_EMAILS.includes(normalizedEmail)) {
    return false;
  }

  if (!db) {
    throw new Error("Firebase Firestore is not configured.");
  }

  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    await setDoc(
      userRef,
      {
        uid: user.uid,
        email: normalizedEmail,
        name: user.displayName ?? normalizedEmail,
        isAdmin: true,
        active: true,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    return true;
  }

  const data = snapshot.data();
  if (data.active === false || data.isAdmin === false) {
    return false;
  }

  await setDoc(
    userRef,
    {
      uid: user.uid,
      email: normalizedEmail,
      name: user.displayName ?? data.name ?? normalizedEmail,
      isAdmin: true,
      active: true,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  return true;
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  if (!auth) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogle() {
  if (!auth) {
    throw new Error("Firebase Auth is not configured.");
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account"
  });

  const credential = await signInWithPopup(auth, provider);
  const allowed = await hasAdminAccess(credential.user);

  if (!allowed) {
    await signOut(auth);
    throw new Error("This Google account is not approved for admin access.");
  }

  return credential;
}

export async function logoutUser() {
  if (!auth) {
    return;
  }

  await signOut(auth);
}
