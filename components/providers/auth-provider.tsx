"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import { hasAdminAccess, logoutUser, subscribeToAuth } from "@/lib/firebase/auth";

type AuthContextValue = {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAdmin: false,
  loading: true
});

const ADMIN_ACCESS_TIMEOUT_MS = 8000;

function withAccessTimeout<T>(promise: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Admin access check timed out."));
    }, ADMIN_ACCESS_TIMEOUT_MS);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((nextUser) => {
      if (!nextUser) {
        setUser(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setLoading(true);

      withAccessTimeout(hasAdminAccess(nextUser))
        .then(async (allowed) => {
          if (!allowed) {
            await logoutUser();
            setUser(null);
            setIsAdmin(false);
            setLoading(false);
            return;
          }

          setUser(nextUser);
          setIsAdmin(true);
          setLoading(false);
        })
        .catch(() => {
          setUser(null);
          setIsAdmin(false);
          setLoading(false);
        });
    });

    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAdmin,
      loading
    }),
    [isAdmin, loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
