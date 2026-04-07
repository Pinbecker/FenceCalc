import type { DrawingWorkspaceRecord } from "@fence-estimator/contracts";

interface WorkspaceHeaderProps {
  workspace: DrawingWorkspaceRecord;
  workspaceTitle: string;
  customerSiteAddress: string | null;
  activeStatusLabel: string;
  revisionCount: number;
  openTaskCount: number;
  lastActivityLabel: string;
  canDeleteWorkspace: boolean;
  canCreateRevision: boolean;
  isAddingRevision: boolean;
  isSavingStage: boolean;
  isDeletingWorkspace: boolean;
  onBackToCustomer: () => void;
  onCreateRevision: () => void;
  onOpenEditDetails: () => void;
  onToggleArchive: () => void;
  onDeleteWorkspace: () => void;
}

export function WorkspaceHeader({
  workspace,
  workspaceTitle,
  customerSiteAddress,
  activeStatusLabel,
  revisionCount,
  openTaskCount,
  lastActivityLabel,
  canDeleteWorkspace,
  canCreateRevision,
  isAddingRevision,
  isSavingStage,
  isDeletingWorkspace,
  onBackToCustomer,
  onCreateRevision,
  onOpenEditDetails,
  onToggleArchive,
  onDeleteWorkspace,
}: WorkspaceHeaderProps) {
  return (
    <header className="portal-page-header">
      <div className="portal-job-heading">
        <span className="portal-eyebrow">Drawing workspace</span>
        <h1>{workspaceTitle}</h1>
        <p>
          {workspace.customerName}
          {customerSiteAddress ? ` | ${customerSiteAddress}` : ""}
          {workspace.ownerDisplayName ? ` | Owner: ${workspace.ownerDisplayName}` : ""}
        </p>
        <div className="workbook-summary-strip portal-job-summary-strip">
          <article>
            <span>Status</span>
            <strong>{activeStatusLabel}</strong>
          </article>
          <article>
            <span>Revisions</span>
            <strong>{revisionCount}</strong>
          </article>
          <article>
            <span>Open tasks</span>
            <strong>{openTaskCount}</strong>
          </article>
          <article>
            <span>Last activity</span>
            <strong>{lastActivityLabel}</strong>
          </article>
        </div>
      </div>
      <div className="portal-header-actions">
        <button
          type="button"
          className="portal-secondary-button portal-compact-button"
          onClick={onBackToCustomer}
        >
          Back to customer
        </button>
        <button
          type="button"
          className="portal-primary-button portal-compact-button"
          onClick={onCreateRevision}
          disabled={isAddingRevision || !canCreateRevision}
        >
          {isAddingRevision ? "Creating..." : "Create revision"}
        </button>
        <button
          type="button"
          className="portal-secondary-button portal-compact-button"
          onClick={onOpenEditDetails}
        >
          Edit details
        </button>
        <button
          type="button"
          className="portal-secondary-button portal-compact-button"
          onClick={onToggleArchive}
          disabled={isSavingStage}
        >
          {workspace.isArchived ? "Restore workspace" : "Archive workspace"}
        </button>
        {workspace.isArchived && canDeleteWorkspace ? (
          <button
            type="button"
            className="portal-danger-button portal-compact-button"
            onClick={onDeleteWorkspace}
            disabled={isDeletingWorkspace}
          >
            {isDeletingWorkspace ? "Deleting..." : "Delete workspace"}
          </button>
        ) : null}
      </div>
    </header>
  );
}
