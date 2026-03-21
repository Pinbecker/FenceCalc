import type { AuthSessionEnvelope, CustomerSummary, DrawingSummary } from "@fence-estimator/contracts";

import { DrawingPreview } from "./DrawingPreview";
import type { PortalRoute } from "./useHashRoute";

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
  const activeDrawings = drawings.filter((drawing) => !drawing.isArchived);
  const archivedDrawings = drawings.filter((drawing) => drawing.isArchived);
  const myDrawings = activeDrawings.filter((drawing) => drawing.contributorUserIds.includes(session.user.id));
  const recent = (myDrawings.length > 0 ? myDrawings : activeDrawings).slice(0, 4);
  const activeCustomers = customers.filter((customer) => !customer.isArchived && customer.activeDrawingCount > 0);
  const topCustomers = [...activeCustomers]
    .map((customer) => {
      const customerDrawings = activeDrawings
        .filter((drawing) => drawing.customerId === customer.id)
        .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));

      return {
        customerId: customer.id,
        customerName: customer.name,
        drawingCount: customerDrawings.length,
        latestDrawingName: customerDrawings[0]?.name ?? "",
        updatedAtIso: customerDrawings[0]?.updatedAtIso ?? ""
      };
    })
    .sort((left, right) => {
      if (right.drawingCount !== left.drawingCount) {
        return right.drawingCount - left.drawingCount;
      }
      return right.updatedAtIso.localeCompare(left.updatedAtIso);
    })
    .slice(0, 4);

  return (
    <section className="portal-page portal-dashboard-page">
      <header className="portal-page-header portal-dashboard-header">
        <div className="portal-dashboard-heading">
          <span className="portal-eyebrow">Company Dashboard</span>
          <h1>{session.company.name}</h1>
          <p>Pick up active customer work quickly, then jump into the wider library only when you need to branch out.</p>
        </div>
        <div className="portal-header-actions portal-dashboard-actions">
          <div className="portal-dashboard-user-chip">
            <span className="portal-section-kicker">Signed in</span>
            <strong>{session.user.displayName}</strong>
            <span>{session.user.role.toLowerCase()}</span>
          </div>
          <button type="button" className="portal-secondary-button" onClick={() => onNavigate("drawings")}>
            Open Library
          </button>
          <button type="button" className="portal-primary-button" onClick={() => onNavigate("editor")}>
            New Drawing
          </button>
        </div>
      </header>

      <div className="portal-dashboard-strip">
        <article className="portal-dashboard-metric">
          <span>Your Drawings</span>
          <strong>{myDrawings.length}</strong>
          <small>Active jobs you have touched</small>
        </article>
        <article className="portal-dashboard-metric">
          <span>Active Library</span>
          <strong>{activeDrawings.length}</strong>
          <small>Current live drawings</small>
        </article>
        <article className="portal-dashboard-metric">
          <span>Customers</span>
          <strong>{activeCustomers.length}</strong>
          <small>Clients with active work</small>
        </article>
        <article className="portal-dashboard-metric">
          <span>Archived</span>
          <strong>{archivedDrawings.length}</strong>
          <small>Stored reference drawings</small>
        </article>
      </div>

      <div className="portal-dashboard-layout">
        <section className="portal-surface-card portal-dashboard-primary">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Continue work</span>
              <h2>{myDrawings.length > 0 ? "Your latest drawings" : "Latest company drawings"}</h2>
            </div>
            <button type="button" className="portal-text-button" onClick={() => onNavigate("drawings")}>
              View all
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
                  <div className="portal-dashboard-row-head">
                    <strong>{drawing.name}</strong>
                    <span className="portal-dashboard-row-version">v{drawing.versionNumber}</span>
                  </div>
                  <p>{drawing.customerName}</p>
                  <div className="portal-dashboard-row-meta">
                    <span>Updated {formatTimestamp(drawing.updatedAtIso)}</span>
                    <span>{drawing.segmentCount} segments</span>
                    <span>{drawing.gateCount} gates</span>
                  </div>
                </div>
                <span className="portal-dashboard-row-cta">Open</span>
              </button>
            ))}
          </div>
        </section>

        <div className="portal-dashboard-side">
          <section className="portal-surface-card portal-dashboard-customers">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Customer activity</span>
                <h2>Where work is concentrated</h2>
              </div>
            </div>
            {topCustomers.length === 0 ? <p className="portal-empty-copy">No active customer work yet.</p> : null}
            <div className="portal-dashboard-customer-list">
              {topCustomers.map((customer) => (
                <button
                  type="button"
                  key={customer.customerName}
                  className="portal-dashboard-customer-row"
                  onClick={() => onNavigate("drawings", { customerId: customer.customerId, scope: "active" })}
                >
                  <div>
                    <strong>{customer.customerName}</strong>
                    <span>{customer.latestDrawingName}</span>
                  </div>
                  <div className="portal-dashboard-customer-meta">
                    <strong>{customer.drawingCount}</strong>
                    <span>{customer.updatedAtIso ? formatTimestamp(customer.updatedAtIso) : "No activity"}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="portal-surface-card portal-dashboard-quick-actions">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Workspace actions</span>
                <h2>Fast routes</h2>
              </div>
            </div>
            <div className="portal-dashboard-action-grid">
              <button type="button" className="portal-dashboard-action" onClick={() => onNavigate("drawings", { owner: "mine" })}>
                <strong>My drawings</strong>
                <span>Jump straight to the drawings you have contributed to.</span>
              </button>
              <button type="button" className="portal-dashboard-action" onClick={() => onNavigate("customers")}>
                <strong>Customer library</strong>
                <span>Browse by client and reopen older company work quickly.</span>
              </button>
              <button type="button" className="portal-dashboard-action" onClick={() => onNavigate("editor")}>
                <strong>Start new drawing</strong>
                <span>Create a new layout with customer and drawing names captured separately.</span>
              </button>
              {(session.user.role === "OWNER" || session.user.role === "ADMIN") ? (
                <button type="button" className="portal-dashboard-action" onClick={() => onNavigate("admin")}>
                  <strong>User administration</strong>
                  <span>Manage company access and reset user passwords.</span>
                </button>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
