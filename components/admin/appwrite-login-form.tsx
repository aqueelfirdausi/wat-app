"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AppwriteLoginForm({
  passwordResetComplete = false
}: {
  passwordResetComplete?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const result = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };
      setPassword("");
      if (!response.ok) {
        setError(result.error ?? "Invalid email, password, or staff access.");
        return;
      }
      router.replace(result.redirectTo ?? "/admin");
      router.refresh();
    } catch {
      setPassword("");
      setError("Unable to sign in. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-card">
      <div>
        <span className="eyebrow">Staff access</span>
        <h1>Sign in to WAT App Admin</h1>
        <p>Use your approved staff email and password.</p>
      </div>
      <form className="form-grid" onSubmit={submit}>
        {passwordResetComplete ? (
          <div className="notice-banner notice-banner-success">
            Password updated. Sign in with your new password.
          </div>
        ) : null}
        {error ? <div className="inline-error">{error}</div> : null}
        <label>
          Email
          <input
            autoComplete="username"
            inputMode="email"
            maxLength={254}
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          Password
          <input
            autoComplete="current-password"
            maxLength={256}
            minLength={8}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? "Signing in..." : "Sign in"}
        </button>
        <Link className="secondary-link" href="/admin/forgot-password">
          Forgot password?
        </Link>
      </form>
    </div>
  );
}
