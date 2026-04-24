"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeToActivityLogs } from "@/lib/firebase/firestore";
import { ActivityLog } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  created: "Product created",
  updated: "Product updated",
  deleted: "Product deleted"
};

function getActionLabel(log: Pick<ActivityLog, "action" | "entityType">) {
  const normalizedAction = log.action.trim().toLowerCase();

  if (ACTION_LABELS[normalizedAction]) {
    return ACTION_LABELS[normalizedAction];
  }

  const readableAction = normalizedAction
    ? normalizedAction.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Activity recorded";
  const readableEntity = log.entityType ? log.entityType.charAt(0).toUpperCase() + log.entityType.slice(1) : "";

  return readableEntity && readableAction !== "Activity recorded" ? `${readableEntity} ${readableAction.toLowerCase()}` : readableAction;
}

function getActionClassName(action: string) {
  const normalizedAction = action.trim().toLowerCase();

  if (["created", "updated", "deleted"].includes(normalizedAction)) {
    return normalizedAction;
  }

  return "other";
}

function formatFriendlyLogTime(value?: Date | null) {
  if (!value) {
    return "Just now";
  }

  const now = new Date();
  const diffMs = now.getTime() - value.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const isToday =
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate();

  if (isToday) {
    return `Today, ${new Intl.DateTimeFormat("en-PK", { timeStyle: "short" }).format(value)}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    value.getFullYear() === yesterday.getFullYear() &&
    value.getMonth() === yesterday.getMonth() &&
    value.getDate() === yesterday.getDate();

  if (isYesterday) {
    return `Yesterday, ${new Intl.DateTimeFormat("en-PK", { timeStyle: "short" }).format(value)}`;
  }

  return formatDate(value);
}

export function ActivityLogTable() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    try {
      return subscribeToActivityLogs(setLogs);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load activity logs.";
      setError(message);
      return () => undefined;
    }
  }, []);

  const actionOptions = useMemo(
    () => Array.from(new Set(logs.map((log) => log.action).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return logs.filter((log) => {
      const matchesAction = actionFilter === "all" || log.action === actionFilter;
      const matchesQuery =
        !normalizedQuery ||
        log.entityName.toLowerCase().includes(normalizedQuery) ||
        getActionLabel(log).toLowerCase().includes(normalizedQuery) ||
        log.actorName.toLowerCase().includes(normalizedQuery) ||
        log.details.toLowerCase().includes(normalizedQuery);

      return matchesAction && matchesQuery;
    });
  }, [actionFilter, logs, searchQuery]);

  const hasActiveFilters = searchQuery.trim().length > 0 || actionFilter !== "all";

  function clearFilters() {
    setSearchQuery("");
    setActionFilter("all");
  }

  return (
    <section className="panel-card">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Accountability</p>
          <h1>Activity log</h1>
          <p className="form-intro">Track product updates, pricing changes, and recent owner actions in one place.</p>
        </div>
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      <div className="manager-controls">
        <label className="manager-search">
          <span>Search logs</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by product name"
          />
        </label>
        <div className="activity-log-filters">
          <label>
            <span>Action type</span>
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
              <option value="all">All actions</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {getActionLabel({ action, entityType: "product" })}
                </option>
              ))}
            </select>
          </label>
          {hasActiveFilters ? (
            <button className="secondary-button manager-clear" type="button" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
      <div className="log-list">
        {filteredLogs.map((log) => (
          <article key={log.id} className="log-item activity-log-card">
            <div className="activity-log-head">
              <div className="activity-log-title">
                <span className={`activity-log-action activity-log-action-${getActionClassName(log.action)}`}>
                  {getActionLabel(log)}
                </span>
                <div className="activity-log-body">
                  <h3>{log.entityName || "Product no longer available"}</h3>
                  <p>{log.details || "No extra details were recorded for this activity."}</p>
                </div>
              </div>
              <time className="activity-log-time" dateTime={log.createdAt?.toISOString()} title={formatDate(log.createdAt)}>
                {formatFriendlyLogTime(log.createdAt)}
              </time>
            </div>
            <div className="activity-log-meta">
              <span>
                <strong>Actor</strong>
                {log.actorName || "Unknown admin"}
              </span>
              {log.actorEmail ? (
                <span>
                  <strong>Email</strong>
                  {log.actorEmail}
                </span>
              ) : null}
            </div>
          </article>
        ))}
        {!logs.length ? (
          <div className="empty-state">No admin activity yet. Product changes will appear here once the team starts making updates.</div>
        ) : !filteredLogs.length ? (
          <div className="empty-state">
            No matching activity found. Try a product name, action type, or admin name.
            {hasActiveFilters ? (
              <>
                {" "}
                <button className="text-button inline-action" type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
