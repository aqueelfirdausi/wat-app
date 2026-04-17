"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithGoogle } from "@/lib/firebase/auth";
import { isFirebaseConfigured } from "@/lib/firebase/config";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleGoogleSignIn() {
    setError("");
    setSubmitting(true);

    try {
      await loginWithGoogle();
      router.replace("/admin");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-card">
      <div>
        <span className="eyebrow">Owner access</span>
        <h1>Sign in to WAT App Admin</h1>
        <p>Continue with an approved Google account to manage uploads, pricing, stock, and daily product updates.</p>
      </div>
      {!isFirebaseConfigured() ? <div className="inline-error">Firebase environment variables are missing. Add them before using admin access.</div> : null}
      <div className="form-grid">
        {error ? <div className="inline-error">{error}</div> : null}
        <button className="primary-button" type="button" disabled={submitting || !isFirebaseConfigured()} onClick={handleGoogleSignIn}>
          {submitting ? "Continuing..." : "Continue with Google"}
        </button>
      </div>
    </div>
  );
}
