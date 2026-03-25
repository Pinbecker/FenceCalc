import type { AuthSessionEnvelope, CustomerSummary, DrawingStatus, DrawingSummary } from "@fence-estimator/contracts";

import { DrawingPreview } from "./DrawingPreview";
import type { PortalRoute } from "./useHashRoute";

const JOB_STATUS_LABELS: Record<DrawingStatus, string> = {
  DRAFT: "Draft",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
  ON_HOLD: "On hold",
};

interface DashboardPageProps {
  session: AuthSessionEnvelope;
  customers: CustomerSummary[];
  drawings: DrawingSummary[];
  onNavigate(this: void, route: PortalRoute, query?: Record<string, string>): void;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function DashboardPage({ session, customers, drawings, onNavigate }: DashboardPageProps) {
  const archivedCustomerIds = new Set(customers.filter((c) => c.isArchived).map((c) => c.id));
  const visibleDrawings = drawings.filter(
    (drawing) => !drawing.isArchived && (!drawing.customerId || !archivedCustomerIds.has(drawing.customerId))
  );
  const myDrawings = visibleDrawings.filter((drawing) => drawing.contributorUserIds.includes(session.user.id));
  const recent = (myDrawings.length > 0 ? myDrawings : visibleDrawings).slice(0, 4);
  const activeCustomers = customers.filter((customer) => !customer.isArchived && customer.activeDrawingCount > 0);

  const recentActivity = [...visibleDrawings]
    .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso))
    .slice(0, 8)
    .map((drawing) => ({
      id: drawing.id,
      name: drawing.name,
      customerName: drawing.customerName,
      user: drawing.updatedByDisplayName || drawing.createdByDisplayName,
      timestamp: drawing.updatedAtIso,
      isNew: drawing.createdAtIso === drawing.updatedAtIso
    }));

  return (
    <section className="portal-page portal-dashboard-page">
      <header className="portal-page-header portal-dashboard-header">
        <div className="portal-dashboard-heading">
          <span className="portal-eyebrow">Workspace overview</span>
          <h1>Welcome, {session.user.displayName}</h1>
          <p>
            You&apos;re working in {session.company.name}. Review active workload, jump back into current drawings, and move into
            customer workspaces when you need contacts and version history.
          </p>
          <div className="portal-dashboard-stat-bar" role="group" aria-label="Workspace summary">
            <div className="portal-dashboard-stat">
              <span>Active library</span>
              <strong>{visibleDrawings.length}</strong>
            </div>
            <div className="portal-dashboard-stat">
              <span>My drawings</span>
              <strong>{myDrawings.length}</strong>
            </div>
            <div className="portal-dashboard-stat">
              <span>Customers</span>
              <strong>{activeCustomers.length}</strong>
            </div>
          </div>
        </div>
        <div className="portal-header-actions portal-dashboard-actions">
          <button type="button" className="portal-primary-button" onClick={() => onNavigate("editor")}>
            New drawing
          </button>
        </div>
      </header>

      <div className="portal-dashboard-layout">
        <section className="portal-surface-card portal-dashboard-primary">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Work queue</span>
              <h2>{myDrawings.length > 0 ? "Recent drawings" : "Latest company drawings"}</h2>
            </div>
            <button type="button" className="portal-secondary-button" onClick={() => onNavigate("customers")}>
              Browse customers
            </button>
          </div>
          {recent.length === 0 ? <p className="portal-empty-copy">No drawings saved yet.</p> : null}
          <div className="portal-dashboard-list">
            {recent.map((drawing) => (
              <button
                type="button"
                key={drawing.id}
                className="portal-dashboard-row"
                onClick={() => onNavigate("editor", { drawingId: drawing.id })}
              >
                <div className="portal-dashboard-preview">
                  <DrawingPreview layout={drawing.previewLayout} label={drawing.name} variant="inline" />
                </div>
                <div className="portal-dashboard-row-copy">
                  <div className="portal-dashboard-row-title">
                    <strong>{drawing.name}</strong>
                    <p>{drawing.customerName}</p>
                  </div>
                  <div className="portal-dashboard-row-meta">
                    <span>Updated {formatTimestamp(drawing.updatedAtIso)}</span>
                    <span>{drawing.updatedByDisplayName || "Unknown user"}</span>
                  </div>
                </div>
                <div className="portal-dashboard-row-trail">
                  <span className={`portal-dashboard-row-status drawing-status-${drawing.status.toLowerCase()}`}>
                    {JOB_STATUS_LABELS[drawing.status]}
                  </span>
                  <span className="portal-dashboard-row-version">v{drawing.versionNumber}</span>
                  <span className="portal-dashboard-row-cta">Open</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <div className="portal-dashboard-side">
          <section className="portal-surface-card portal-dashboard-activity">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Team activity</span>
                <h2>Recent changes</h2>
              </div>
            </div>
            {recentActivity.length === 0 ? <p className="portal-empty-copy">No activity yet.</p> : null}
            <div className="portal-dashboard-activity-list">
              {recentActivity.map((entry) => (
                <button
                  type="button"
                  key={`${entry.id}-${entry.timestamp}`}
                  className="portal-dashboard-activity-row"
                  onClick={() => onNavigate("editor", { drawingId: entry.id })}
                >
                  <div className="portal-dashboard-activity-copy">
                    <strong>{entry.user}</strong>
                    <span>
                      {entry.isNew ? "created" : "updated"}{" "}
                      <em>{entry.name}</em>
                      {entry.customerName ? ` for ${entry.customerName}` : ""}
                    </span>
                  </div>
                  <time className="portal-dashboard-activity-time">{formatTimestamp(entry.timestamp)}</time>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
