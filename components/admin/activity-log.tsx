"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeToActivityLogs } from "@/lib/firebase/firestore";
import { ActivityLog } from "@/lib/types";
import { formatDate } from "@/lib/utils";

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
                  {action}
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
                <span className={`activity-log-action activity-log-action-${log.action.toLowerCase()}`}>{log.action}</span>
                <div>
                  <h3>{log.entityName || "Unknown product"}</h3>
                  <p>{log.details}</p>
                </div>
              </div>
              <div className="activity-log-time">{formatDate(log.createdAt)}</div>
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
          <div className="empty-state">Important activity will appear here as products are added and updated.</div>
        ) : !filteredLogs.length ? (
          <div className="empty-state">
            No activity logs match the current search and filters.
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
