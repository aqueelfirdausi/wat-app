"use client";

import { NotificationsPanel } from "@/components/admin/notifications-panel";
import { useAuth } from "@/components/providers/auth-provider";

export default function AdminNotificationsPage() {
  const { role } = useAuth();

  if (role !== "admin") {
    return <div className="panel-card">Access denied. This page is for owners only.</div>;
  }

  return <NotificationsPanel />;
}
