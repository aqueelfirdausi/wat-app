"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResetPasswordForm({ ready }: { ready: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Passwords must match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/recovery/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, passwordConfirmation: confirmation })
      });
      const result = (await response.json()) as { error?: string; redirectTo?: string };
      setPassword("");
      setConfirmation("");
      if (!response.ok) {
        setError(result.error ?? "The password reset link is invalid or expired.");
        return;
      }
      router.replace(result.redirectTo ?? "/admin/login");
      router.refresh();
    } catch {
      setPassword("");
      setConfirmation("");
      setError("The password reset link is invalid or expired.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-card">
      <div>
        <span className="eyebrow">Password recovery</span>
        <h1>Choose a new password</h1>
      </div>
      {!ready ? (
        <div className="form-grid">
          <div className="inline-error">The password reset link is invalid or expired.</div>
          <Link className="primary-link" href="/admin/forgot-password">
            Request a new reset link
          </Link>
        </div>
      ) : (
        <form className="form-grid" onSubmit={submit}>
          {error ? <div className="inline-error">{error}</div> : null}
          <label>
            New password
            <input
              autoComplete="new-password"
              maxLength={256}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <label>
            Confirm password
            <input
              autoComplete="new-password"
              maxLength={256}
              minLength={8}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              type="password"
              value={confirmation}
            />
          </label>
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Updating..." : "Update password"}
          </button>
        </form>
      )}
    </div>
  );
}
