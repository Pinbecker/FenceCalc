import { useMemo, useState } from "react";

import type { AuthSessionEnvelope, DrawingSummary, DrawingVersionRecord } from "@fence-estimator/contracts";

import { DrawingPreview } from "./DrawingPreview";

type DrawingStatusFilter = "ACTIVE" | "ARCHIVED" | "ALL";
type DrawingOwnershipFilter = "COMPANY" | "MINE";

interface DrawingsPageProps {
  session: AuthSessionEnvelope;
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

function sortStrings(left: string, right: string): number {
  return left.localeCompare(right, "en-GB", { sensitivity: "base" });
}

export function DrawingsPage({
  session,
  drawings,
  isLoading,
  onRefresh,
  onOpenDrawing,
  onCreateDrawing,
  onToggleArchive,
  onLoadVersions,
  onRestoreVersion
}: DrawingsPageProps) {
  const [statusFilter, setStatusFilter] = useState<DrawingStatusFilter>("ACTIVE");
  const [ownershipFilter, setOwnershipFilter] = useState<DrawingOwnershipFilter>("COMPANY");
  const [selectedCustomer, setSelectedCustomer] = useState("ALL_CUSTOMERS");
  const [expandedDrawingId, setExpandedDrawingId] = useState<string | null>(null);
  const [versionsByDrawingId, setVersionsByDrawingId] = useState<Record<string, DrawingVersionRecord[]>>({});
  const [isLoadingVersionsForId, setIsLoadingVersionsForId] = useState<string | null>(null);

  const customerNames = useMemo(
    () =>
      [...new Set(drawings.map((drawing) => drawing.customerName.trim()).filter((customerName) => customerName.length > 0))].sort(
        sortStrings,
      ),
    [drawings],
  );

  const visibleDrawings = useMemo(() => {
    return drawings
      .filter((drawing) => {
        if (statusFilter === "ACTIVE") {
          return !drawing.isArchived;
        }
        if (statusFilter === "ARCHIVED") {
          return drawing.isArchived;
        }
        return true;
      })
      .filter((drawing) => {
        if (ownershipFilter === "MINE") {
          return drawing.contributorUserIds.includes(session.user.id);
        }
        return true;
      })
      .filter((drawing) => selectedCustomer === "ALL_CUSTOMERS" || drawing.customerName === selectedCustomer)
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
  }, [drawings, ownershipFilter, selectedCustomer, session.user.id, statusFilter]);

  const groupedDrawings = useMemo(() => {
    const groups = new Map<string, DrawingSummary[]>();
    for (const drawing of visibleDrawings) {
      const customerName = drawing.customerName.trim() || "Unassigned customer";
      const bucket = groups.get(customerName);
      if (bucket) {
        bucket.push(drawing);
      } else {
        groups.set(customerName, [drawing]);
      }
    }

    return [...groups.entries()].sort(([left], [right]) => sortStrings(left, right));
  }, [visibleDrawings]);

  const activeCount = drawings.filter((drawing) => !drawing.isArchived).length;
  const mineCount = drawings.filter((drawing) => drawing.contributorUserIds.includes(session.user.id)).length;

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
          <p>Switch between the whole company library and the drawings you have touched, then narrow the queue by customer.</p>
        </div>
        <div className="portal-header-actions">
          <div className="portal-filter-row" role="tablist" aria-label="Drawing status filter">
            {(["ACTIVE", "ARCHIVED", "ALL"] as DrawingStatusFilter[]).map((option) => (
              <button
                type="button"
                key={option}
                className={statusFilter === option ? "is-active" : undefined}
                onClick={() => setStatusFilter(option)}
              >
                {option === "ACTIVE" ? "Active" : option === "ARCHIVED" ? "Archived" : "All"}
              </button>
            ))}
          </div>
          <div className="portal-filter-row" role="tablist" aria-label="Drawing ownership filter">
            {(["COMPANY", "MINE"] as DrawingOwnershipFilter[]).map((option) => (
              <button
                type="button"
                key={option}
                className={ownershipFilter === option ? "is-active" : undefined}
                onClick={() => setOwnershipFilter(option)}
              >
                {option === "COMPANY" ? "Company" : "Mine"}
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
          <h2>{ownershipFilter === "MINE" ? "Your customer work" : "Company customer archive"}</h2>
          <p className="portal-empty-copy">
            Customer is now separate from the drawing title, so you can scan by client first and still keep each drawing named precisely.
          </p>
        </div>
        <div className="drawing-library-overview-metrics">
          <article className="drawing-library-overview-metric">
            <span>Visible</span>
            <strong>{visibleDrawings.length}</strong>
          </article>
          <article className="drawing-library-overview-metric">
            <span>Mine</span>
            <strong>{mineCount}</strong>
          </article>
          <article className="drawing-library-overview-metric">
            <span>Customers</span>
            <strong>{customerNames.length}</strong>
          </article>
          <article className="drawing-library-overview-metric">
            <span>Active</span>
            <strong>{activeCount}</strong>
          </article>
        </div>
      </section>

      <section className="portal-surface-card drawing-library-filter-panel">
        <label className="drawing-library-customer-filter">
          <span>Customer View</span>
          <select value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}>
            <option value="ALL_CUSTOMERS">All customers</option>
            {customerNames.map((customerName) => (
              <option key={customerName} value={customerName}>
                {customerName}
              </option>
            ))}
          </select>
        </label>
        <p className="portal-empty-copy">
          {ownershipFilter === "MINE"
            ? "Mine includes drawings you created, updated, or otherwise touched through version history."
            : "Company view includes every drawing stored for the current company workspace."}
        </p>
      </section>

      {groupedDrawings.length === 0 ? (
        <div className="portal-empty-state">
          <h2>No drawings in this view</h2>
          <p>Create or restore a drawing to populate the library.</p>
        </div>
      ) : null}

      <div className="drawing-library-groups">
        {groupedDrawings.map(([customerName, customerDrawings]) => (
          <section key={customerName} className="drawing-library-group">
            <header className="drawing-library-group-header">
              <div>
                <span className="portal-section-kicker">Customer</span>
                <h2>{customerName}</h2>
              </div>
              <span className="drawing-library-group-count">{customerDrawings.length}</span>
            </header>

            <div className="drawing-library-grid">
              {customerDrawings.map((drawing) => {
                const versions = versionsByDrawingId[drawing.id] ?? [];
                const isLoadingVersions = isLoadingVersionsForId === drawing.id;
                const isMine = drawing.contributorUserIds.includes(session.user.id);

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
                            <p>
                              Updated {formatTimestamp(drawing.updatedAtIso)} by {drawing.updatedByDisplayName || "Unknown user"}
                            </p>
                          </div>
                          <div className="drawing-library-badge-stack">
                            <span className="drawing-library-badge">v{drawing.versionNumber}</span>
                            {isMine ? <span className="drawing-library-badge">Mine</span> : null}
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
                        <span>Created by {drawing.createdByDisplayName || "Unknown user"}</span>
                        <span>{drawing.contributorDisplayNames.length} contributors</span>
                      </div>
                      <p className="drawing-library-meta-line">
                        Contributors: {drawing.contributorDisplayNames.join(", ") || "Unknown user"}
                      </p>
                      {expandedDrawingId === drawing.id ? (
                        <div className="drawing-history-panel">
                          {isLoadingVersions ? <p className="portal-empty-copy">Loading versions...</p> : null}
                          {versions.map((version) => (
                            <div key={version.id} className="drawing-history-row">
                              <div>
                                <strong>Version {version.versionNumber}</strong>
                                <span>
                                  {version.source} · {version.customerName} · {formatTimestamp(version.createdAtIso)}
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
        ))}
      </div>
    </section>
  );
}
