import type { AuthSessionEnvelope, CustomerSummary, DrawingSummary, JobStage, JobSummary } from "@fence-estimator/contracts";

import { DrawingPreview } from "./DrawingPreview";
import { buildFallbackJobSummaries, hasLegacyJoblessDrawings, resolveJobWorkspaceTarget } from "./jobFallbacks";
import type { PortalRoute } from "./useHashRoute";

const JOB_STATUS_LABELS: Record<JobStage, string> = {
  DRAFT: "Draft",
  DESIGNING: "Designing",
  ESTIMATING: "Estimating",
  READY_TO_QUOTE: "Ready to quote",
  QUOTED: "Quoted",
  FOLLOW_UP: "Follow up",
  WON: "Won",
  LOST: "Lost",
  ON_HOLD: "On hold"
};

const EMPTY_LAYOUT = {
  segments: [],
  gates: [],
  basketballPosts: [],
  floodlightColumns: [],
  goalUnits: [],
  kickboards: [],
  pitchDividers: [],
  sideNettings: []
};

interface DashboardPageProps {
  session: AuthSessionEnvelope;
  customers: CustomerSummary[];
  jobs?: JobSummary[];
  drawings?: DrawingSummary[];
  onNavigate(this: void, route: PortalRoute, query?: Record<string, string>): void;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "No activity";
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatMoney(value: number | null): string {
  if (value === null) {
    return "No quote yet";
  }
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

export function DashboardPage({ session, customers, jobs = [], drawings = [], onNavigate }: DashboardPageProps) {
  const archivedCustomerIds = new Set(customers.filter((customer) => customer.isArchived).map((customer) => customer.id));
  const activeDrawings = drawings
    .filter((drawing) => !drawing.isArchived)
    .filter((drawing) => !drawing.customerId || !archivedCustomerIds.has(drawing.customerId));
  const effectiveJobs =
    jobs.length > 0
      ? jobs
      : hasLegacyJoblessDrawings(activeDrawings)
        ? buildFallbackJobSummaries(activeDrawings)
        : [];
  const activeJobs = effectiveJobs.filter((job) => !job.isArchived);
  const myJobs = activeJobs.filter((job) => job.ownerUserId === session.user.id);
  const recent = (myJobs.length > 0 ? myJobs : activeJobs).slice(0, 4);
  const activeCustomers = customers.filter((customer) => !customer.isArchived && customer.activeDrawingCount > 0);
  const recentActivity = [...activeJobs]
    .sort((left, right) => (right.lastActivityAtIso ?? right.updatedAtIso).localeCompare(left.lastActivityAtIso ?? left.updatedAtIso))
    .slice(0, 8);
  const openWorkspace = (job: JobSummary) => {
    const target = resolveJobWorkspaceTarget(job, drawings);
    onNavigate(target.route, target.query);
  };

  return (
    <section className="portal-page portal-dashboard-page">
      <header className="portal-page-header portal-dashboard-header">
        <div className="portal-dashboard-heading">
          <span className="portal-eyebrow">Workspace overview</span>
          <h1>Welcome, {session.user.displayName}</h1>
          <p>
            Review the live job pipeline, jump into the current workspace for each customer, and open drawings in the editor only when design work is needed.
          </p>
          <div className="portal-dashboard-stat-bar" role="group" aria-label="Workspace summary">
            <div className="portal-dashboard-stat">
              <span>Active jobs</span>
              <strong>{activeJobs.length}</strong>
            </div>
            <div className="portal-dashboard-stat">
              <span>My jobs</span>
              <strong>{myJobs.length}</strong>
            </div>
            <div className="portal-dashboard-stat">
              <span>Customers</span>
              <strong>{activeCustomers.length}</strong>
            </div>
          </div>
        </div>
        <div className="portal-header-actions portal-dashboard-actions">
          <button type="button" className="portal-primary-button" onClick={() => onNavigate("customers")}>
            Browse customers
          </button>
        </div>
      </header>

      <div className="portal-dashboard-layout">
        <section className="portal-surface-card portal-dashboard-primary">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Work queue</span>
              <h2>{myJobs.length > 0 ? "My recent jobs" : "Latest company jobs"}</h2>
            </div>
            <button type="button" className="portal-secondary-button" onClick={() => onNavigate("customers")}>
              Browse customers
            </button>
          </div>
          {recent.length === 0 ? <p className="portal-empty-copy">No jobs saved yet.</p> : null}
          <div className="portal-dashboard-list">
            {recent.map((job) => (
              <button type="button" key={job.id} className="portal-dashboard-row" onClick={() => openWorkspace(job)}>
                <div className="portal-dashboard-preview">
                  <DrawingPreview layout={job.primaryPreviewLayout ?? EMPTY_LAYOUT} label={job.name} variant="inline" />
                </div>
                <div className="portal-dashboard-row-copy">
                  <div className="portal-dashboard-row-title">
                    <strong>{job.name}</strong>
                    <p>{job.customerName}</p>
                  </div>
                  <div className="portal-dashboard-row-meta">
                    <span>Updated {formatTimestamp(job.lastActivityAtIso ?? job.updatedAtIso)}</span>
                    <span>{job.ownerDisplayName || session.user.displayName}</span>
                  </div>
                </div>
                <div className="portal-dashboard-row-trail">
                  <span className={`portal-dashboard-row-status drawing-status-${job.stage.toLowerCase()}`}>
                    {JOB_STATUS_LABELS[job.stage]}
                  </span>
                  <span className="portal-dashboard-row-version">{job.drawingCount} drawings</span>
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
                <span className="portal-section-kicker">Pipeline</span>
                <h2>Recent job movement</h2>
              </div>
            </div>
            {recentActivity.length === 0 ? <p className="portal-empty-copy">No activity yet.</p> : null}
            <div className="portal-dashboard-activity-list">
              {recentActivity.map((job) => (
                <button type="button" key={`${job.id}-${job.updatedAtIso}`} className="portal-dashboard-activity-row" onClick={() => openWorkspace(job)}>
                  <div className="portal-dashboard-activity-copy">
                    <strong>{job.name}</strong>
                    <span>
                      {JOB_STATUS_LABELS[job.stage]} for {job.customerName}
                      {job.latestQuoteTotal !== null ? ` | ${formatMoney(job.latestQuoteTotal)}` : ""}
                    </span>
                  </div>
                  <time className="portal-dashboard-activity-time">{formatTimestamp(job.lastActivityAtIso ?? job.updatedAtIso)}</time>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
