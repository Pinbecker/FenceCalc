import { useMemo, useState } from "react";

import type { DrawingSummary, DrawingVersionRecord } from "@fence-estimator/contracts";

import { DrawingPreview } from "./DrawingPreview";

type DrawingFilter = "ACTIVE" | "ARCHIVED" | "ALL";

interface DrawingsPageProps {
  drawings: DrawingSummary[];
  isLoading: boolean;
  onRefresh(this: void): Promise<void>;
  onOpenDrawing(this: void, drawingId: string): void;
  onCreateDrawing(this: void): void;
  onToggleArchive(this: void, drawingId: string, archived: boolean): Promise<boolean>;
  onLoadVersions(this: void, drawingId: string): Promise<DrawingVersionRecord[]>;
  onRestoreVersion(this: void, drawingId: string, versionNumber: number): Promise<boolean>;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function DrawingsPage({
  drawings,
  isLoading,
  onRefresh,
  onOpenDrawing,
  onCreateDrawing,
  onToggleArchive,
  onLoadVersions,
  onRestoreVersion
}: DrawingsPageProps) {
  const [filter, setFilter] = useState<DrawingFilter>("ACTIVE");
  const [expandedDrawingId, setExpandedDrawingId] = useState<string | null>(null);
  const [versionsByDrawingId, setVersionsByDrawingId] = useState<Record<string, DrawingVersionRecord[]>>({});
  const [isLoadingVersionsForId, setIsLoadingVersionsForId] = useState<string | null>(null);

  const visibleDrawings = useMemo(() => {
    if (filter === "ACTIVE") {
      return drawings.filter((drawing) => !drawing.isArchived);
    }
    if (filter === "ARCHIVED") {
      return drawings.filter((drawing) => drawing.isArchived);
    }
    return drawings;
  }, [drawings, filter]);
  const activeCount = drawings.filter((drawing) => !drawing.isArchived).length;
  const archivedCount = drawings.length - activeCount;

  const handleToggleHistory = async (drawingId: string) => {
    if (expandedDrawingId === drawingId) {
      setExpandedDrawingId(null);
      return;
    }

    setExpandedDrawingId(drawingId);
    if (versionsByDrawingId[drawingId]) {
      return;
    }

    setIsLoadingVersionsForId(drawingId);
    const versions = await onLoadVersions(drawingId);
    setVersionsByDrawingId((current) => ({ ...current, [drawingId]: versions }));
    setIsLoadingVersionsForId(null);
  };

  return (
    <section className="portal-page">
      <header className="portal-page-header">
        <div>
          <span className="portal-eyebrow">Drawing Library</span>
          <h1>Saved drawings</h1>
          <p>Scan active work quickly, jump back into a draft, and open history only when you need to restore a version.</p>
        </div>
        <div className="portal-header-actions">
          <div className="portal-filter-row" role="tablist" aria-label="Drawing filter">
            {(["ACTIVE", "ARCHIVED", "ALL"] as DrawingFilter[]).map((option) => (
              <button
                type="button"
                key={option}
                className={filter === option ? "is-active" : undefined}
                onClick={() => setFilter(option)}
              >
                {option === "ACTIVE" ? "Active" : option === "ARCHIVED" ? "Archived" : "All"}
              </button>
            ))}
          </div>
          <button type="button" className="portal-secondary-button" onClick={() => void onRefresh()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" className="portal-primary-button" onClick={onCreateDrawing}>
            New Drawing
          </button>
        </div>
      </header>

      <section className="portal-surface-card drawing-library-overview">
        <div className="drawing-library-overview-copy">
          <span className="portal-section-kicker">Library Focus</span>
          <h2>{filter === "ACTIVE" ? "Current work queue" : filter === "ARCHIVED" ? "Archived reference set" : "Full company archive"}</h2>
          <p className="portal-empty-copy">
            Keep the library dense and scannable. Open a drawing to continue work, or expand history only when you need
            to restore a previous revision.
          </p>
        </div>
        <div className="drawing-library-overview-metrics">
          <article className="drawing-library-overview-metric">
            <span>Visible</span>
            <strong>{visibleDrawings.length}</strong>
          </article>
          <article className="drawing-library-overview-metric">
            <span>Active</span>
            <strong>{activeCount}</strong>
          </article>
          <article className="drawing-library-overview-metric">
            <span>Archived</span>
            <strong>{archivedCount}</strong>
          </article>
        </div>
      </section>

      {visibleDrawings.length === 0 ? (
        <div className="portal-empty-state">
          <h2>No drawings in this view</h2>
          <p>Create or restore a drawing to populate the library.</p>
        </div>
      ) : null}

      <div className="drawing-library-grid">
        {visibleDrawings.map((drawing) => {
          const versions = versionsByDrawingId[drawing.id] ?? [];
          const isLoadingVersions = isLoadingVersionsForId === drawing.id;
          return (
            <article key={drawing.id} className={`drawing-library-card${expandedDrawingId === drawing.id ? " is-expanded" : ""}`}>
              <div className="drawing-library-preview-cell">
                <DrawingPreview layout={drawing.previewLayout} label={drawing.name} />
              </div>
              <div className="drawing-library-card-body">
                <div className="drawing-library-row-top">
                  <div className="drawing-library-card-header">
                    <div>
                      <h2>{drawing.name}</h2>
                      <p>Updated {formatTimestamp(drawing.updatedAtIso)}</p>
                    </div>
                    <div className="drawing-library-badge-stack">
                      <span className="drawing-library-badge">v{drawing.versionNumber}</span>
                      <span className={`drawing-library-badge${drawing.isArchived ? " archived" : ""}`}>
                        {drawing.isArchived ? "Archived" : "Active"}
                      </span>
                    </div>
                  </div>
                  <div className="drawing-library-card-actions">
                    <button type="button" className="portal-primary-button" onClick={() => onOpenDrawing(drawing.id)}>
                      Open In Editor
                    </button>
                    <button
                      type="button"
                      className="portal-secondary-button"
                      onClick={() => void onToggleArchive(drawing.id, !drawing.isArchived)}
                    >
                      {drawing.isArchived ? "Unarchive" : "Archive"}
                    </button>
                    <button type="button" className="portal-secondary-button" onClick={() => void handleToggleHistory(drawing.id)}>
                      {expandedDrawingId === drawing.id ? "Hide History" : "Version History"}
                    </button>
                  </div>
                </div>
                <div className="drawing-library-card-metrics">
                  <span>{drawing.segmentCount} segments</span>
                  <span>{drawing.gateCount} gates</span>
                  <span>{drawing.schemaVersion > 0 ? `Schema ${drawing.schemaVersion}` : "Schema pending"}</span>
                </div>
                {expandedDrawingId === drawing.id ? (
                  <div className="drawing-history-panel">
                    {isLoadingVersions ? <p className="portal-empty-copy">Loading versions...</p> : null}
                    {versions.map((version) => (
                      <div key={version.id} className="drawing-history-row">
                        <div>
                          <strong>Version {version.versionNumber}</strong>
                          <span>
                            {version.source} · {formatTimestamp(version.createdAtIso)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="portal-text-button"
                          onClick={() => void onRestoreVersion(drawing.id, version.versionNumber)}
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
