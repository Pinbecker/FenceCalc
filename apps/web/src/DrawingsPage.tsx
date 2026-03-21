import { useEffect, useMemo, useState } from "react";

import type { AuthSessionEnvelope, CustomerSummary, DrawingSummary, DrawingVersionRecord } from "@fence-estimator/contracts";

import { DrawingPreview } from "./DrawingPreview";

type DrawingStatusFilter = "ACTIVE" | "ARCHIVED" | "ALL";
type DrawingOwnershipFilter = "COMPANY" | "MINE";

interface DrawingsPageProps {
  query?: Record<string, string>;
  session: AuthSessionEnvelope;
  customers: CustomerSummary[];
  drawings: DrawingSummary[];
  isLoading: boolean;
  onRefresh(this: void): Promise<void>;
  onOpenDrawing(this: void, drawingId: string): void;
  onOpenEstimate(this: void, drawingId: string): void;
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
  query,
  session,
  customers,
  drawings,
  isLoading,
  onRefresh,
  onOpenDrawing,
  onOpenEstimate,
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

  useEffect(() => {
    if (query?.scope === "active") {
      setStatusFilter("ACTIVE");
    } else if (query?.scope === "archived") {
      setStatusFilter("ARCHIVED");
    } else if (query?.scope === "all") {
      setStatusFilter("ALL");
    }

    if (query?.owner === "mine") {
      setOwnershipFilter("MINE");
    } else if (query?.owner === "company") {
      setOwnershipFilter("COMPANY");
    }

    if (query?.customerId) {
      setSelectedCustomer(query.customerId);
    } else if (query && !("customerId" in query)) {
      setSelectedCustomer("ALL_CUSTOMERS");
    }
  }, [query]);

  const customerOptions = useMemo(
    () => customers.slice().sort((left, right) => sortStrings(left.name, right.name)),
    [customers],
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
      .filter((drawing) => selectedCustomer === "ALL_CUSTOMERS" || drawing.customerId === selectedCustomer)
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
  }, [drawings, ownershipFilter, selectedCustomer, session.user.id, statusFilter]);

  const groupedDrawings = useMemo(() => {
    const groups = new Map<string, { label: string; drawings: DrawingSummary[] }>();
    for (const drawing of visibleDrawings) {
      const groupKey = drawing.customerId ?? `snapshot:${drawing.customerName.trim() || "unassigned"}`;
      const customerName = drawing.customerName.trim() || "Unassigned customer";
      const bucket = groups.get(groupKey);
      if (bucket) {
        bucket.drawings.push(drawing);
      } else {
        groups.set(groupKey, { label: customerName, drawings: [drawing] });
      }
    }

    return [...groups.entries()]
      .map(([groupKey, value]) => [groupKey, value.label, value.drawings] as const)
      .sort(([, left], [, right]) => sortStrings(left, right));
  }, [visibleDrawings]);

  const activeCount = drawings.filter((drawing) => !drawing.isArchived).length;
  const mineCount = drawings.filter((drawing) => drawing.contributorUserIds.includes(session.user.id)).length;
  const archivedCount = drawings.length - activeCount;
  const visibleCustomerCount = new Set(
    visibleDrawings.map((drawing) => drawing.customerName.trim() || "Unassigned customer"),
  ).size;

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
    <section className="portal-page portal-drawings-page">
      <header className="portal-page-header portal-drawings-header">
        <div className="portal-drawings-heading">
          <span className="portal-eyebrow">Drawing Library</span>
          <h1>Saved drawings</h1>
          <p>Filter the library quickly, then scan by customer and open the exact drawing you need without fighting oversized cards.</p>
        </div>
        <div className="portal-header-actions portal-drawings-header-actions">
          <button type="button" className="portal-secondary-button" onClick={() => void onRefresh()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" className="portal-primary-button" onClick={onCreateDrawing}>
            New Drawing
          </button>
        </div>
      </header>

      <section className="portal-surface-card drawing-library-toolbar">
        <div className="drawing-library-toolbar-main">
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

          <div className="portal-filter-row drawing-library-ownership-filter" role="tablist" aria-label="Drawing ownership filter">
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

          <label className="drawing-library-customer-filter">
            <span>Customer View</span>
            <select value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}>
              <option value="ALL_CUSTOMERS">All customers</option>
              {customerOptions.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="drawing-library-toolbar-summary">
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
            <strong>{visibleCustomerCount}</strong>
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

        <p className="drawing-library-toolbar-copy">
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
        {groupedDrawings.map(([groupKey, customerName, customerDrawings]) => (
          <section key={groupKey} className="drawing-library-group">
            <header className="drawing-library-group-header">
              <div>
                <span className="portal-section-kicker">Customer</span>
                <h2>{customerName}</h2>
              </div>
              <div className="drawing-library-group-meta">
                <span>{customerDrawings.length} drawings</span>
                <span>{customerDrawings[0] ? formatTimestamp(customerDrawings[0].updatedAtIso) : "No activity"}</span>
              </div>
            </header>

            <div className="drawing-library-list">
              {customerDrawings.map((drawing) => {
                const versions = versionsByDrawingId[drawing.id] ?? [];
                const isLoadingVersions = isLoadingVersionsForId === drawing.id;
                const isMine = drawing.contributorUserIds.includes(session.user.id);

                return (
                  <article key={drawing.id} className={`drawing-library-row${expandedDrawingId === drawing.id ? " is-expanded" : ""}`}>
                    <div className="drawing-library-row-main">
                      <div className="drawing-library-row-preview">
                        <DrawingPreview layout={drawing.previewLayout} label={drawing.name} variant="inline" />
                      </div>

                      <div className="drawing-library-row-copy">
                        <div className="drawing-library-row-head">
                          <div className="drawing-library-card-header">
                            <div>
                              <h2>{drawing.name}</h2>
                              <p>
                                Updated {formatTimestamp(drawing.updatedAtIso)} by {drawing.updatedByDisplayName || "Unknown user"}
                              </p>
                            </div>
                          </div>

                          <div className="drawing-library-badge-stack">
                            <span className="drawing-library-badge">v{drawing.versionNumber}</span>
                            {isMine ? <span className="drawing-library-badge">Mine</span> : null}
                            <span className={`drawing-library-badge${drawing.isArchived ? " archived" : ""}`}>
                              {drawing.isArchived ? "Archived" : "Active"}
                            </span>
                          </div>
                        </div>

                        <div className="drawing-library-row-details">
                          <span>{drawing.segmentCount} segments</span>
                          <span>{drawing.gateCount} gates</span>
                          <span>Created by {drawing.createdByDisplayName || "Unknown user"}</span>
                          <span>Contributors: {drawing.contributorDisplayNames.join(", ") || "Unknown user"}</span>
                        </div>
                      </div>

                      <div className="drawing-library-row-actions">
                        <button type="button" className="portal-primary-button" onClick={() => onOpenDrawing(drawing.id)}>
                          Open In Editor
                        </button>
                        <button type="button" className="portal-secondary-button" onClick={() => onOpenEstimate(drawing.id)}>
                          Estimate
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

                    {expandedDrawingId === drawing.id ? (
                      <div className="drawing-history-panel">
                        {isLoadingVersions ? <p className="portal-empty-copy">Loading versions...</p> : null}
                        {versions.map((version) => (
                          <div key={version.id} className="drawing-history-row">
                            <div>
                              <strong>Version {version.versionNumber}</strong>
                              <span>
                                {version.source} / {version.customerName} / {formatTimestamp(version.createdAtIso)}
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
