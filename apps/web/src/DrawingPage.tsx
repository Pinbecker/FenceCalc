import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AuthSessionEnvelope,
  DrawingSummary,
  JobRecord
} from "@fence-estimator/contracts";

import { DrawingPreview } from "./DrawingPreview";
import {
  createJobDrawing,
  deleteRevision,
  getJob,
  listJobDrawings,
  updateDrawing
} from "./apiClient";
import type { PortalRoute } from "./useHashRoute";

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "No activity";
  }
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function getRevisionLabel(drawing: Pick<DrawingSummary, "revisionNumber">): string {
  return drawing.revisionNumber === 0 ? "Original" : `REV ${drawing.revisionNumber}`;
}

interface DrawingPageProps {
  session: AuthSessionEnvelope;
  query?: Record<string, string>;
  onNavigate(this: void, route: PortalRoute, query?: Record<string, string>): void;
  onRefreshJobs(this: void): Promise<void>;
  onRefreshDrawings(this: void): Promise<void>;
}

export function DrawingPage({
  query,
  onNavigate,
  onRefreshJobs,
  onRefreshDrawings
}: DrawingPageProps) {
  const drawingId = query?.drawingId ?? null;

  const [job, setJob] = useState<JobRecord | null>(null);
  const [rootDrawing, setRootDrawing] = useState<DrawingSummary | null>(null);
  const [revisions, setRevisions] = useState<DrawingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingRevision, setIsAddingRevision] = useState(false);
  const [isDeletingRevision, setIsDeletingRevision] = useState(false);
  const [isRenamingDrawing, setIsRenamingDrawing] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const [editDrawingName, setEditDrawingName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDrawingData = useCallback(async (targetDrawingId: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // We need to find the drawing among all job drawings
      // First, we need to find which job this drawing belongs to
      // We'll load all drawings for the job and filter client-side
      const { getDrawing } = await import("./apiClient");
      const drawing = await getDrawing(targetDrawingId);
      if (!drawing.jobId) {
        setErrorMessage("This drawing is not associated with a job.");
        setIsLoading(false);
        return;
      }

      // Determine the root drawing ID
      const rootId = drawing.parentDrawingId ?? drawing.id;

      const [nextJob, allDrawings] = await Promise.all([
        getJob(drawing.jobId),
        listJobDrawings(drawing.jobId)
      ]);

      setJob(nextJob);

      const root = allDrawings.find((d) => d.id === rootId) ?? null;
      setRootDrawing(root);

      const childRevisions = allDrawings
        .filter((d) => d.parentDrawingId === rootId)
        .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
      setRevisions(childRevisions);
    } catch (error) {
      setErrorMessage((error as Error).message);
      setJob(null);
      setRootDrawing(null);
      setRevisions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!drawingId) {
      setJob(null);
      setRootDrawing(null);
      setRevisions([]);
      setIsLoading(false);
      return;
    }
    void loadDrawingData(drawingId);
  }, [drawingId, loadDrawingData]);

  const handleCreateRevision = async (sourceDrawingId: string) => {
    if (!job) return;
    setIsAddingRevision(true);
    setErrorMessage(null);
    try {
      const newDrawing = await createJobDrawing(job.id, { sourceDrawingId });
      await Promise.all([loadDrawingData(drawingId!), onRefreshJobs(), onRefreshDrawings()]);
      onNavigate("editor", { drawingId: newDrawing.id });
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsAddingRevision(false);
    }
  };

  const handleDeleteRevision = async (revisionId: string) => {
    setIsDeletingRevision(true);
    setErrorMessage(null);
    setConfirmDeleteId(null);
    try {
      await deleteRevision(revisionId);
      await Promise.all([loadDrawingData(drawingId!), onRefreshJobs(), onRefreshDrawings()]);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsDeletingRevision(false);
    }
  };

  const handleOpenRenameModal = (drawing: DrawingSummary) => {
    setEditingDrawingId(drawing.id);
    setEditDrawingName(drawing.name);
  };

  const allDrawings = useMemo(() => {
    if (!rootDrawing) return [];
    return [rootDrawing, ...revisions].sort((left, right) => left.revisionNumber - right.revisionNumber);
  }, [rootDrawing, revisions]);

  const selectedDrawing = useMemo(
    () => allDrawings.find((drawing) => drawing.id === drawingId) ?? rootDrawing,
    [allDrawings, drawingId, rootDrawing]
  );

  const drawingBeingEdited = useMemo(
    () => allDrawings.find((drawing) => drawing.id === editingDrawingId) ?? null,
    [allDrawings, editingDrawingId]
  );

  const latestDrawing = allDrawings[allDrawings.length - 1] ?? null;

  const handleRenameDrawing = async () => {
    if (!drawingBeingEdited || !editDrawingName.trim()) {
      return;
    }
    setIsRenamingDrawing(true);
    setErrorMessage(null);
    try {
      await updateDrawing(drawingBeingEdited.id, {
        expectedVersionNumber: drawingBeingEdited.versionNumber,
        name: editDrawingName.trim()
      });
      setEditingDrawingId(null);
      setEditDrawingName("");
      await Promise.all([loadDrawingData(drawingId!), onRefreshJobs(), onRefreshDrawings()]);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsRenamingDrawing(false);
    }
  };

  if (!drawingId) {
    return (
      <section className="portal-page">
        <p className="portal-empty-copy">No drawing selected.</p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="portal-page">
        <p className="portal-empty-copy">Loading drawing...</p>
      </section>
    );
  }

  if (errorMessage || !rootDrawing) {
    return (
      <section className="portal-page">
        <header className="portal-page-header">
          <div>
            <h1>Drawing not found</h1>
          </div>
        </header>
        {errorMessage ? <p className="portal-empty-copy">{errorMessage}</p> : null}
        <button type="button" className="portal-secondary-button" onClick={() => onNavigate("dashboard")}>
          Back to dashboard
        </button>
      </section>
    );
  }

  return (
    <section className="portal-page">
      <header className="portal-page-header">
        <div>
          {job ? (
            <span className="portal-section-kicker">
              <button
                type="button"
                className="portal-text-button"
                style={{ fontSize: "inherit", padding: 0, border: "none", background: "none", color: "inherit", cursor: "pointer", textDecoration: "underline" }}
                onClick={() => onNavigate("job", { jobId: job.id })}
              >
                ← {job.name}
              </button>
            </span>
          ) : null}
          <h1>{rootDrawing.name}</h1>
          <p className="portal-header-description">
            Original drawing and {revisions.length} revision{revisions.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="portal-header-actions">
          <button
            type="button"
            className="portal-secondary-button portal-compact-button"
            onClick={() => {
              const source = latestDrawing ?? rootDrawing;
              if (source) {
                void handleCreateRevision(source.id);
              }
            }}
            disabled={isAddingRevision}
          >
            {isAddingRevision ? "Creating..." : "New revision"}
          </button>
        </div>
      </header>

      {selectedDrawing?.status === "QUOTED" ? (
        <div className="portal-inline-message portal-inline-notice">
          This revision has already been quoted and is locked for changes. Create a new revision to continue editing.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="portal-notice is-error">{errorMessage}</div>
      ) : null}

      <div className="portal-customer-drawing-grid">
        {allDrawings.map((drawing) => {
          const isLastRevision = latestDrawing?.id === drawing.id && drawing.revisionNumber > 0;
          const isActiveDrawing = drawing.id === drawingId;
          return (
            <article
              key={drawing.id}
              className={`portal-customer-drawing-card${drawing.isArchived ? " is-archived" : ""}${isActiveDrawing ? " is-active" : ""}`}
            >
              <div
                className="portal-customer-drawing-card-preview"
                role="button"
                tabIndex={0}
                onClick={() => onNavigate("editor", { drawingId: drawing.id })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    onNavigate("editor", { drawingId: drawing.id });
                  }
                }}
              >
                <DrawingPreview layout={drawing.previewLayout} label={drawing.name} variant="card" />
              </div>
              <div className="portal-customer-drawing-card-body">
                <div className="portal-customer-drawing-card-head">
                  <div className="portal-customer-drawing-card-copy">
                    <h3>{getRevisionLabel(drawing)}</h3>
                    <span>{drawing.name}</span>
                  </div>
                  <div className="portal-customer-drawing-card-badges">
                    {isActiveDrawing ? (
                      <span className="portal-customer-drawing-badge is-current">Current</span>
                    ) : null}
                    {drawing.status === "QUOTED" ? (
                      <span className="portal-customer-drawing-badge is-quoted">Quoted</span>
                    ) : null}
                    {drawing.isArchived ? (
                      <span className="portal-customer-drawing-badge is-archived">Archived</span>
                    ) : null}
                  </div>
                </div>
                <div className="portal-customer-drawing-card-meta">
                  <span>{drawing.segmentCount} segments | {drawing.gateCount} gates</span>
                  <span>Updated {formatTimestamp(drawing.updatedAtIso)}</span>
                </div>
                <div className="portal-customer-drawing-card-footer">
                  <button
                    type="button"
                    className="portal-text-button"
                    onClick={() => onNavigate("editor", { drawingId: drawing.id })}
                  >
                    Open editor
                  </button>
                  <button
                    type="button"
                    className="portal-text-button"
                    onClick={() => handleOpenRenameModal(drawing)}
                    disabled={isRenamingDrawing || drawing.status === "QUOTED"}
                    title={drawing.status === "QUOTED" ? "Quoted drawings are locked. Create a new revision to continue." : undefined}
                  >
                    Rename
                  </button>
                  {job ? (
                    <button
                      type="button"
                      className="portal-text-button"
                      onClick={() => onNavigate("job", { jobId: job.id, tab: "estimate", drawingId: drawing.id })}
                    >
                      Estimate
                    </button>
                  ) : null}
                  {drawing.status === "QUOTED" && latestDrawing?.id === drawing.id ? (
                    <button
                      type="button"
                      className="portal-text-button"
                      onClick={() => void handleCreateRevision(drawing.id)}
                      disabled={isAddingRevision}
                    >
                      {isAddingRevision ? "Creating..." : "Create next revision"}
                    </button>
                  ) : null}
                  {isLastRevision ? (
                    <button
                      type="button"
                      className="portal-text-button portal-text-danger"
                      style={{ color: "#a33" }}
                      onClick={() => setConfirmDeleteId(drawing.id)}
                      disabled={isDeletingRevision}
                    >
                      {isDeletingRevision ? "Deleting..." : "Delete"}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {confirmDeleteId ? (
        <div className="portal-customer-edit-backdrop portal-modal-backdrop" onClick={() => setConfirmDeleteId(null)}>
          <div
            className="portal-customer-edit-modal portal-confirm-modal portal-modal-card"
            role="dialog"
            aria-label="Confirm delete revision"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="portal-customer-edit-modal-header portal-modal-header">
              <h2>Delete this revision?</h2>
              <button type="button" className="portal-text-button" onClick={() => setConfirmDeleteId(null)}>Close</button>
            </div>
            <div className="portal-customer-edit-modal-body portal-modal-body">
              <p>This will permanently remove this revision. This action cannot be undone.</p>
            </div>
            <div className="portal-customer-edit-modal-footer portal-modal-footer">
              <button type="button" className="portal-secondary-button portal-compact-button" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="portal-danger-button portal-compact-button"
                onClick={() => void handleDeleteRevision(confirmDeleteId)}
                disabled={isDeletingRevision}
              >
                {isDeletingRevision ? "Deleting..." : "Delete revision"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {drawingBeingEdited ? (
        <div className="portal-customer-edit-backdrop portal-modal-backdrop" onClick={() => setEditingDrawingId(null)}>
          <div
            className="portal-customer-edit-modal portal-modal-card"
            role="dialog"
            aria-label="Rename drawing"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="portal-customer-edit-modal-header portal-modal-header">
              <h2>Rename drawing</h2>
              <button type="button" className="portal-text-button" onClick={() => setEditingDrawingId(null)}>Close</button>
            </div>
            <div className="portal-customer-edit-modal-body portal-modal-body">
              <label className="portal-customer-edit-field">
                <span>Drawing title</span>
                <input
                  value={editDrawingName}
                  onChange={(event) => setEditDrawingName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && editDrawingName.trim()) {
                      void handleRenameDrawing();
                    }
                  }}
                  autoFocus
                />
              </label>
            </div>
            <div className="portal-customer-edit-modal-footer portal-modal-footer">
              <button type="button" className="portal-secondary-button portal-compact-button" onClick={() => setEditingDrawingId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="portal-primary-button portal-compact-button"
                disabled={isRenamingDrawing || !editDrawingName.trim()}
                onClick={() => void handleRenameDrawing()}
              >
                {isRenamingDrawing ? "Saving..." : "Save name"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
