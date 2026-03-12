import type { AuthSessionEnvelope, DrawingSummary } from "@fence-estimator/contracts";

import { DrawingPreview } from "./DrawingPreview";
import type { PortalRoute } from "./useHashRoute";

interface DashboardPageProps {
  session: AuthSessionEnvelope;
  drawings: DrawingSummary[];
  onNavigate(this: void, route: PortalRoute, query?: Record<string, string>): void;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function DashboardPage({ session, drawings, onNavigate }: DashboardPageProps) {
  const activeDrawings = drawings.filter((drawing) => !drawing.isArchived);
  const archivedDrawings = drawings.filter((drawing) => drawing.isArchived);
  const recent = activeDrawings.slice(0, 3);
  const totalSegments = activeDrawings.reduce((sum, drawing) => sum + drawing.segmentCount, 0);
  const totalGates = activeDrawings.reduce((sum, drawing) => sum + drawing.gateCount, 0);

  return (
    <section className="portal-page portal-dashboard-page">
      <header className="portal-page-header">
        <div>
          <span className="portal-eyebrow">Company Dashboard</span>
          <h1>{session.company.name}</h1>
          <p>Start from the work that matters now: reopen the latest drawings, create a clean draft, or head to operations.</p>
        </div>
        <div className="portal-header-actions">
          <button type="button" className="portal-secondary-button" onClick={() => onNavigate("drawings")}>
            Open Library
          </button>
          <button type="button" className="portal-primary-button" onClick={() => onNavigate("editor")}>
            New Drawing
          </button>
        </div>
      </header>

      <div className="portal-dashboard-grid">
        <section className="portal-surface-card">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Recent drawings</span>
              <h2>Continue where the team left off</h2>
            </div>
            <button type="button" className="portal-text-button" onClick={() => onNavigate("drawings")}>
              View all
            </button>
          </div>
          {recent.length === 0 ? <p className="portal-empty-copy">No drawings saved yet.</p> : null}
          <div className="portal-recent-list">
            {recent.map((drawing) => (
              <button
                type="button"
                key={drawing.id}
                className="portal-recent-item"
                onClick={() => onNavigate("editor", { drawingId: drawing.id })}
              >
                <div className="portal-recent-preview">
                  <DrawingPreview layout={drawing.previewLayout} label={drawing.name} variant="inline" />
                </div>
                <div className="portal-recent-copy">
                  <strong>{drawing.name}</strong>
                  <span>{formatTimestamp(drawing.updatedAtIso)}</span>
                  <span>
                    {drawing.segmentCount} segments · {drawing.gateCount} gates
                  </span>
                </div>
                <span className="portal-recent-version">v{drawing.versionNumber}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="portal-surface-card portal-ops-card">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Operations</span>
              <h2>Company workspace controls</h2>
            </div>
          </div>
          <div className="portal-action-list">
            <button type="button" className="portal-action-card" onClick={() => onNavigate("drawings")}>
              <strong>Drawing library</strong>
              <span>Scan saved work in a denser queue and open only the drawings you need to continue.</span>
            </button>
            <button type="button" className="portal-action-card" onClick={() => onNavigate("editor")}>
              <strong>Open editor</strong>
              <span>Start a fresh layout in the dedicated workspace with tools, canvas, and estimate rails separated.</span>
            </button>
            {(session.user.role === "OWNER" || session.user.role === "ADMIN") ? (
              <button type="button" className="portal-action-card" onClick={() => onNavigate("admin")}>
                <strong>User administration</strong>
                <span>Add team members and control who gets into the company workspace.</span>
              </button>
            ) : null}
          </div>
        </section>
      </div>

      <div className="portal-stat-grid portal-stat-grid-secondary">
        <article className="portal-stat-card">
          <span className="portal-stat-label">Saved Drawings</span>
          <strong>{activeDrawings.length}</strong>
        </article>
        <article className="portal-stat-card">
          <span className="portal-stat-label">Segments Tracked</span>
          <strong>{totalSegments}</strong>
        </article>
        <article className="portal-stat-card">
          <span className="portal-stat-label">Gate Openings</span>
          <strong>{totalGates}</strong>
        </article>
        <article className="portal-stat-card">
          <span className="portal-stat-label">Archived</span>
          <strong>{archivedDrawings.length}</strong>
        </article>
      </div>
    </section>
  );
}
