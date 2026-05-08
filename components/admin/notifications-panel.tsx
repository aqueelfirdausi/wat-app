"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";

type SendStatus =
  | { type: "idle" }
  | { type: "sending" }
  | { type: "success"; sent: number }
  | { type: "error"; message: string };

export function NotificationsPanel() {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<SendStatus>({ type: "idle" });

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !user) return;
    setStatus({ type: "sending" });

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      });
      const data = (await res.json()) as { sent?: number; message?: string; error?: string };
      if (!res.ok) {
        setStatus({ type: "error", message: data.error ?? "Failed to send." });
        return;
      }
      setStatus({ type: "success", sent: data.sent ?? 0 });
      setTitle("");
      setBody("");
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Unexpected error.",
      });
    }
  }

  return (
    <div className="dashboard-stack">
      <section className="panel-card">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Owner only</p>
            <h1>Send notification</h1>
          </div>
        </div>
        <p className="notification-panel-hint">
          Sends a push notification to all subscribers. Use only when fresh stock is ready. Maximum one per day.
        </p>
        <form className="notification-form" onSubmit={handleSend}>
          <div className="notification-form-field">
            <label className="notification-form-label" htmlFor="notif-title">
              Title
            </label>
            <input
              id="notif-title"
              type="text"
              className="notification-form-input"
              placeholder="e.g. Fresh stock just dropped"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              required
              disabled={status.type === "sending"}
            />
          </div>
          <div className="notification-form-field">
            <label className="notification-form-label" htmlFor="notif-body">
              Body <span className="notification-form-optional">(optional)</span>
            </label>
            <textarea
              id="notif-body"
              className="notification-form-input notification-form-textarea"
              placeholder="e.g. New fragrances and accessories available now."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={200}
              rows={3}
              disabled={status.type === "sending"}
            />
          </div>
          {status.type === "error" && <div className="inline-error">{status.message}</div>}
          {status.type === "success" && (
            <div className="notice-banner notice-banner-success">
              Sent to {status.sent} subscriber{status.sent !== 1 ? "s" : ""}.
            </div>
          )}
          <button
            type="submit"
            className="primary-button notification-form-submit"
            disabled={!title.trim() || status.type === "sending"}
          >
            {status.type === "sending" ? "Sending…" : "Send notification"}
          </button>
        </form>
      </section>
    </div>
  );
}
