"use client";

import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getAdminRoleForEmail, normalizeAdminEmail } from "@/lib/admin-roles";
import { auth, db } from "@/lib/firebase/client";

export async function getAdminAccessRole(user: Pick<User, "uid" | "email" | "displayName">) {
  const normalizedEmail = normalizeAdminEmail(user.email);
  const role = getAdminRoleForEmail(normalizedEmail);

  if (!role) {
    return null;
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
        role,
        isAdmin: role === "admin",
        active: true,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    return role;
  }

  const data = snapshot.data();
  if (data.active === false || (role === "admin" && data.isAdmin === false)) {
    return null;
  }

  await setDoc(
    userRef,
    {
      uid: user.uid,
      email: normalizedEmail,
      name: user.displayName ?? data.name ?? normalizedEmail,
      role,
      isAdmin: role === "admin",
      active: true,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  return role;
}

export async function hasAdminAccess(user: Pick<User, "uid" | "email" | "displayName">) {
  return Boolean(await getAdminAccessRole(user));
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
  const role = await getAdminAccessRole(credential.user);

  if (!role) {
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
