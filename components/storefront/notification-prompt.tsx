"use client";

import { useEffect, useState } from "react";
import { requestNotificationPermission } from "@/lib/firebase/messaging";

const PROMPT_DISMISSED_KEY = "watapp-notification-prompt-dismissed";
const SHOW_DELAY_MS = 5000;

export function NotificationPrompt() {
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<"idle" | "requesting">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (window.localStorage.getItem(PROMPT_DISMISSED_KEY) === "true") return;

    const timer = setTimeout(() => setShow(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PROMPT_DISMISSED_KEY, "true");
    }
    setShow(false);
  }

  async function handleEnable() {
    setStatus("requesting");
    const result = await requestNotificationPermission();
    if (result === "granted") {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(PROMPT_DISMISSED_KEY, "true");
      }
      setShow(false);
    } else {
      setStatus("idle");
      dismiss();
    }
  }

  if (!show) return null;

  return (
    <div className="notification-prompt" role="status" aria-live="polite">
      <div className="notification-prompt-copy">
        <strong>Get notified when new stock drops</strong>
        <p>We send one update a day at most. Tap Enable to stay in the loop.</p>
      </div>
      <div className="notification-prompt-actions">
        <button
          type="button"
          className="secondary-link"
          onClick={dismiss}
          disabled={status === "requesting"}
        >
          Not now
        </button>
        <button
          type="button"
          className="primary-link"
          onClick={handleEnable}
          disabled={status === "requesting"}
        >
          {status === "requesting" ? "Enabling…" : "Enable"}
        </button>
      </div>
    </div>
  );
}
