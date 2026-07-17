"use client";

import Link from "next/link";
import { useState } from "react";

const GENERIC_MESSAGE =
  "If that account is eligible, password reset instructions have been sent.";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
    } finally {
      setEmail("");
      setMessage(GENERIC_MESSAGE);
      setSubmitting(false);
    }
  }

  return (
    <div className="login-card">
      <div>
        <span className="eyebrow">Password recovery</span>
        <h1>Reset your password</h1>
        <p>Enter your approved staff email address.</p>
      </div>
      <form className="form-grid" onSubmit={submit}>
        {message ? <div className="notice-banner notice-banner-success">{message}</div> : null}
        <label>
          Email
          <input
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? "Sending..." : "Send reset instructions"}
        </button>
        <Link className="secondary-link" href="/admin/login">
          Back to sign in
        </Link>
      </form>
    </div>
  );
}
