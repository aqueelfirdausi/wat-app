import { listAppwriteActivityLogs } from "@/lib/appwrite/activity-logs";
import { requireCurrentAppwriteStaffIdentity } from "@/lib/appwrite/auth/current-staff";
import { MutationContractError } from "@/lib/appwrite/mutation-design";
import { notFound } from "next/navigation";

export async function AppwriteActivityLogPage() {
  const identity = await requireCurrentAppwriteStaffIdentity();
  if (identity.role !== "admin") notFound();
  let activity;
  try {
    activity = await listAppwriteActivityLogs({ identity, pageSize: 50 });
  } catch (error) {
    if (
      error instanceof MutationContractError &&
      error.code === "AUTHORIZATION_FAILED"
    ) {
      notFound();
    }
    throw error;
  }
  return (
    <div className="dashboard-stack">
      <section className="panel-card">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Appwrite · admin only</p>
            <h1>Activity log</h1>
            <p>Immutable, newest-first catalogue mutation evidence.</p>
          </div>
          <span className="admin-readonly-badge">Read only</span>
        </div>
      </section>
      <section className="panel-card">
        {activity.items.length === 0 ? (
          <div className="admin-catalogue-empty">
            <strong>No activity yet</strong>
            <span>Read-only requests are intentionally not logged.</span>
          </div>
        ) : (
          <div className="admin-catalogue-product-list">
            {activity.items.map((event) => (
              <article className="admin-catalogue-product" key={event.id}>
                <div className="admin-catalogue-product-heading">
                  <div>
                    <h3>{event.eventType}</h3>
                    <span>
                      {event.entityType} · {event.entityId}
                    </span>
                  </div>
                  <span className="admin-state-pill">{event.result}</span>
                </div>
                <dl className="admin-catalogue-product-grid">
                  <div>
                    <dt>Actor</dt>
                    <dd>{event.actorDisplayName}</dd>
                  </div>
                  <div>
                    <dt>Role</dt>
                    <dd>{event.actorRole.replace("_", " ")}</dd>
                  </div>
                  <div>
                    <dt>Time</dt>
                    <dd>{new Date(event.occurredAt).toLocaleString("en-PK")}</dd>
                  </div>
                  <div>
                    <dt>Changed</dt>
                    <dd>{event.changedFields.join(", ") || "None"}</dd>
                  </div>
                  <div>
                    <dt>Compensation</dt>
                    <dd>{event.compensationClassification ?? "Not applicable"}</dd>
                  </div>
                  <div>
                    <dt>Error</dt>
                    <dd>{event.errorClassification ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Classification</dt>
                    <dd>{event.fixtureClassification.replaceAll("_", " ")}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
