import { useEffect, useMemo, useState } from "react";

import type { CustomerSummary, DrawingSummary, DrawingVersionRecord } from "@fence-estimator/contracts";

import { DrawingPreview } from "./DrawingPreview";
import type { PortalRoute } from "./useHashRoute";

type CustomerDrawingFilter = "ACTIVE" | "ARCHIVED" | "ALL";

interface CustomerDraft {
  name: string;
  primaryContactName: string;
  primaryEmail: string;
  primaryPhone: string;
  siteAddress: string;
  notes: string;
}

interface CustomerPageProps {
  query?: Record<string, string>;
  customers: CustomerSummary[];
  drawings: DrawingSummary[];
  isLoading: boolean;
  isSavingCustomer: boolean;
  isArchivingCustomerId: string | null;
  onRefresh(this: void): Promise<void>;
  onSaveCustomer(
    this: void,
    input: { mode: "update"; customerId: string; customer: Partial<CustomerDraft> },
  ): Promise<{ id: string } | null>;
  onSetCustomerArchived(this: void, customerId: string, archived: boolean): Promise<boolean>;
  onOpenDrawing(this: void, drawingId: string): void;
  onOpenEstimate(this: void, drawingId: string): void;
  onCreateDrawing(this: void): void;
  onToggleDrawingArchived(this: void, drawingId: string, archived: boolean): Promise<boolean>;
  onLoadVersions(this: void, drawingId: string): Promise<DrawingVersionRecord[]>;
  onRestoreVersion(this: void, drawingId: string, versionNumber: number): Promise<boolean>;
  onNavigate(this: void, route: PortalRoute, query?: Record<string, string>): void;
}

function buildDraft(customer: CustomerSummary): CustomerDraft {
  return {
    name: customer.name,
    primaryContactName: customer.primaryContactName,
    primaryEmail: customer.primaryEmail,
    primaryPhone: customer.primaryPhone,
    siteAddress: customer.siteAddress,
    notes: customer.notes,
  };
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "No activity";
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CustomerPage({
  query,
  customers,
  drawings,
  isLoading,
  isSavingCustomer,
  isArchivingCustomerId,
  onRefresh,
  onSaveCustomer,
  onSetCustomerArchived,
  onOpenDrawing,
  onOpenEstimate,
  onCreateDrawing,
  onToggleDrawingArchived,
  onLoadVersions,
  onRestoreVersion,
  onNavigate,
}: CustomerPageProps) {
  const customerId = query?.customerId ?? null;
  const [drawingFilter, setDrawingFilter] = useState<CustomerDrawingFilter>("ACTIVE");
  const [draft, setDraft] = useState<CustomerDraft | null>(null);
  const [expandedDrawingId, setExpandedDrawingId] = useState<string | null>(null);
  const [versionsByDrawingId, setVersionsByDrawingId] = useState<Record<string, DrawingVersionRecord[]>>({});
  const [isLoadingVersionsForId, setIsLoadingVersionsForId] = useState<string | null>(null);

  const customer = useMemo(
    () => customers.find((entry) => entry.id === customerId) ?? null,
    [customerId, customers],
  );

  useEffect(() => {
    if (!customer) {
      setDraft(null);
      return;
    }
    setDraft(buildDraft(customer));
  }, [customer]);

  const customerDrawings = useMemo(() => {
    if (!customer) {
      return [];
    }

    return drawings
      .filter((drawing) => drawing.customerId === customer.id)
      .filter((drawing) => {
        if (drawingFilter === "ACTIVE") {
          return !drawing.isArchived;
        }
        if (drawingFilter === "ARCHIVED") {
          return drawing.isArchived;
        }
        return true;
      })
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
  }, [customer, drawingFilter, drawings]);

  const totalCustomerDrawings = useMemo(
    () => drawings.filter((drawing) => drawing.customerId === customer?.id),
    [customer?.id, drawings],
  );
  const activeDrawings = totalCustomerDrawings.filter((drawing) => !drawing.isArchived);
  const archivedDrawings = totalCustomerDrawings.filter((drawing) => drawing.isArchived);
  const primaryContact = customer
    ? (customer.primaryContactName || customer.primaryEmail || customer.primaryPhone || "Unassigned")
    : "Unassigned";

  const updateDraftField = (field: keyof CustomerDraft, value: string) => {
    if (!customer) {
      return;
    }

    setDraft((current) => ({ ...(current ?? buildDraft(customer)), [field]: value }));
  };

  const handleSave = async () => {
    if (!customer) {
      return;
    }

    const customerDraft = draft ?? buildDraft(customer);
    await onSaveCustomer({
      mode: "update",
      customerId: customer.id,
      customer: {
        name: customerDraft.name.trim(),
        primaryContactName: customerDraft.primaryContactName.trim(),
        primaryEmail: customerDraft.primaryEmail.trim(),
        primaryPhone: customerDraft.primaryPhone.trim(),
        siteAddress: customerDraft.siteAddress.trim(),
        notes: customerDraft.notes.trim(),
      },
    });
  };

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

  if (!customerId || !customer) {
    return (
      <section className="portal-page portal-customer-page">
        <div className="portal-empty-state">
          <h1>Customer not found</h1>
          <p>Select a customer from the directory to view their details and drawings.</p>
          <button type="button" className="portal-primary-button" onClick={() => onNavigate("customers")}>
            Back to customers
          </button>
        </div>
      </section>
    );
  }
  const customerDraft = draft ?? buildDraft(customer);

  return (
    <section className="portal-page portal-customer-page">
      <header className="portal-page-header portal-customer-page-header">
        <div className="portal-customer-page-heading-shell">
          <div className="portal-customer-page-heading">
            <span className="portal-eyebrow">Customer workspace</span>
            <h1>{customer.name}</h1>
            <p>Maintain customer profile details and manage all drawings from one workspace.</p>
          </div>
          <aside className="portal-customer-top-form" aria-label="Customer information">
            <div className="portal-customer-top-form-head">
              <span className="portal-section-kicker">Customer profile</span>
              <span className={`portal-customer-status${customer.isArchived ? " is-archived" : ""}`}>
                {customer.isArchived ? "Archived" : "Active"}
              </span>
            </div>
            <div className="portal-customer-top-form-grid">
              <label className="drawing-library-customer-filter">
                <span>Name</span>
                <input value={customerDraft.name} onChange={(event) => updateDraftField("name", event.target.value)} />
              </label>
              <label className="drawing-library-customer-filter">
                <span>Primary contact</span>
                <input
                  value={customerDraft.primaryContactName}
                  onChange={(event) => updateDraftField("primaryContactName", event.target.value)}
                />
              </label>
              <label className="drawing-library-customer-filter">
                <span>Phone</span>
                <input value={customerDraft.primaryPhone} onChange={(event) => updateDraftField("primaryPhone", event.target.value)} />
              </label>
              <label className="drawing-library-customer-filter">
                <span>Email</span>
                <input value={customerDraft.primaryEmail} onChange={(event) => updateDraftField("primaryEmail", event.target.value)} />
              </label>
            </div>
          </aside>
        </div>
        <div className="portal-header-actions portal-customer-page-actions">
          <button type="button" className="portal-secondary-button" onClick={() => onNavigate("customers")}>
            Back to customers
          </button>
          <button type="button" className="portal-secondary-button" onClick={() => void onRefresh()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" className="portal-primary-button" onClick={onCreateDrawing}>
            New drawing
          </button>
        </div>
      </header>

      <div className="portal-dashboard-strip portal-customer-page-strip">
        <article className="portal-dashboard-metric">
          <span>Status</span>
          <strong>{customer.isArchived ? "Archived" : "Active"}</strong>
          <small>{formatTimestamp(customer.lastActivityAtIso)}</small>
        </article>
        <article className="portal-dashboard-metric">
          <span>Active drawings</span>
          <strong>{activeDrawings.length}</strong>
          <small>Current drawings for this customer</small>
        </article>
        <article className="portal-dashboard-metric">
          <span>Archived drawings</span>
          <strong>{archivedDrawings.length}</strong>
          <small>Stored drawing history</small>
        </article>
        <article className="portal-dashboard-metric">
          <span>Primary contact</span>
          <strong>{primaryContact}</strong>
          <small>{customer.siteAddress || "No site address recorded"}</small>
        </article>
      </div>

      <div className="portal-customer-page-layout">
        <section className="portal-surface-card portal-customer-detail">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Customer record</span>
              <h2>Site and notes</h2>
            </div>
          </div>

          <div className="portal-customer-detail-body">
              <section className="portal-customer-form-section">
                <div className="portal-customer-form-section-head">
                  <span className="portal-section-kicker">Site</span>
                  <h3>Address information</h3>
                </div>
                <div className="portal-customer-form-grid">
                  <label className="drawing-library-customer-filter">
                    <span>Site Address</span>
                    <textarea
                      value={customerDraft.siteAddress}
                      onChange={(event) => updateDraftField("siteAddress", event.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="portal-customer-form-section">
                <div className="portal-customer-form-section-head">
                  <span className="portal-section-kicker">Notes</span>
                  <h3>Internal context</h3>
                </div>
                <div className="portal-customer-form-grid">
                  <label className="drawing-library-customer-filter">
                    <span>Notes</span>
                    <textarea
                      value={customerDraft.notes}
                      onChange={(event) => updateDraftField("notes", event.target.value)}
                    />
                  </label>
                </div>
              </section>

              <div className="portal-customer-detail-footer">
                <button type="button" className="portal-primary-button" onClick={() => void handleSave()} disabled={isSavingCustomer}>
                  {isSavingCustomer ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  className="portal-secondary-button"
                  onClick={() => void onSetCustomerArchived(customer.id, !customer.isArchived)}
                  disabled={isArchivingCustomerId === customer.id}
                >
                  {isArchivingCustomerId === customer.id ? "Updating..." : customer.isArchived ? "Restore customer" : "Archive customer"}
                </button>
              </div>
            </div>
        </section>

        <section className="portal-surface-card portal-customer-drawings-panel">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Customer drawings</span>
              <h2>Drawing history</h2>
            </div>
            <div className="portal-filter-row" role="tablist" aria-label="Customer drawing filter">
              {(["ACTIVE", "ARCHIVED", "ALL"] as CustomerDrawingFilter[]).map((option) => (
                <button
                  type="button"
                  key={option}
                  className={drawingFilter === option ? "is-active" : undefined}
                  onClick={() => setDrawingFilter(option)}
                >
                  {option === "ACTIVE" ? "Active" : option === "ARCHIVED" ? "Archived" : "All"}
                </button>
              ))}
            </div>
          </div>

          {customerDrawings.length === 0 ? (
            <div className="portal-empty-state portal-customer-drawings-empty">
              <h2>No drawings in this view</h2>
              <p>Create the first drawing for this customer or switch filters to review archived work.</p>
            </div>
          ) : null}

          <div className="drawing-library-list">
            {customerDrawings.map((drawing) => {
              const versions = versionsByDrawingId[drawing.id] ?? [];
              const isLoadingVersions = isLoadingVersionsForId === drawing.id;

              return (
                <article
                  key={drawing.id}
                  className={`drawing-library-row${expandedDrawingId === drawing.id ? " is-expanded" : ""}${drawing.isArchived ? " is-archived" : ""}`}
                >
                  <div className="drawing-library-row-main">
                    <div className="drawing-library-row-preview">
                      <DrawingPreview layout={drawing.previewLayout} label={drawing.name} variant="inline" />
                    </div>

                    <div className="drawing-library-row-copy">
                      <div className="drawing-library-row-head">
                        <div className="drawing-library-card-header drawing-library-row-header">
                          <div>
                            <h2>{drawing.name}</h2>
                            <p>Updated {formatTimestamp(drawing.updatedAtIso)} by {drawing.updatedByDisplayName || "Unknown user"}</p>
                          </div>
                        </div>

                        <div className="drawing-library-badge-stack">
                          <span className="drawing-library-badge">v{drawing.versionNumber}</span>
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
                        Open editor
                      </button>
                      <button type="button" className="portal-secondary-button" onClick={() => onOpenEstimate(drawing.id)}>
                        Estimate
                      </button>
                      <div className="drawing-library-row-utility-actions">
                        <button
                          type="button"
                          className="portal-secondary-button drawing-library-utility-button"
                          onClick={() => void onToggleDrawingArchived(drawing.id, !drawing.isArchived)}
                        >
                          {drawing.isArchived ? "Unarchive" : "Archive"}
                        </button>
                        <button
                          type="button"
                          className="portal-secondary-button drawing-library-utility-button"
                          onClick={() => void handleToggleHistory(drawing.id)}
                        >
                          {expandedDrawingId === drawing.id ? "Hide history" : "Version history"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {expandedDrawingId === drawing.id ? (
                    <div className="drawing-history-panel">
                      <div className="drawing-history-panel-heading">
                        <span className="portal-section-kicker">History</span>
                        <strong>{drawing.name}</strong>
                      </div>
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
      </div>
    </section>
  );
}
