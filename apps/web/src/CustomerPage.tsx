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
}

interface CustomerPageProps {
  query?: Record<string, string>;
  customers: CustomerSummary[];
  drawings: DrawingSummary[];
  isSavingCustomer: boolean;
  isArchivingCustomerId: string | null;
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
  isSavingCustomer,
  isArchivingCustomerId,
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
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft | null>(null);
  const [expandedDrawingId, setExpandedDrawingId] = useState<string | null>(null);
  const [versionsByDrawingId, setVersionsByDrawingId] = useState<Record<string, DrawingVersionRecord[]>>({});
  const [isLoadingVersionsForId, setIsLoadingVersionsForId] = useState<string | null>(null);

  const customer = useMemo(
    () => customers.find((entry) => entry.id === customerId) ?? null,
    [customerId, customers],
  );

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

  const activeCount = useMemo(
    () => drawings.filter((drawing) => drawing.customerId === customer?.id && !drawing.isArchived).length,
    [customer?.id, drawings],
  );

  useEffect(() => {
    if (!isEditOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsEditOpen(false);
        setDraft(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditOpen]);

  const openEditModal = () => {
    if (!customer) {
      return;
    }
    setDraft(buildDraft(customer));
    setIsEditOpen(true);
  };

  const closeEditModal = () => {
    setIsEditOpen(false);
    setDraft(null);
  };

  const updateDraftField = (field: keyof CustomerDraft, value: string) => {
    if (!customer) {
      return;
    }
    setDraft((current) => ({ ...(current ?? buildDraft(customer)), [field]: value }));
  };

  const handleSave = async () => {
    if (!customer || !draft) {
      return;
    }
    await onSaveCustomer({
      mode: "update",
      customerId: customer.id,
      customer: {
        name: draft.name.trim(),
        primaryContactName: draft.primaryContactName.trim(),
        primaryEmail: draft.primaryEmail.trim(),
        primaryPhone: draft.primaryPhone.trim(),
        siteAddress: draft.siteAddress.trim(),
      },
    });
    setIsEditOpen(false);
    setDraft(null);
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
          <button type="button" className="portal-secondary-button portal-compact-button" onClick={() => onNavigate("customers")}>
            Browse customers
          </button>
        </div>
      </section>
    );
  }

  const contactParts = [
    customer.primaryContactName,
    customer.primaryEmail,
    customer.primaryPhone,
  ].filter(Boolean);

  return (
    <section className="portal-page portal-customer-page">
      <header className="portal-page-header portal-customer-page-header">
        <div className="portal-customer-page-heading-shell">
          <div className="portal-customer-page-heading">
            <span className="portal-eyebrow">Customer workspace</span>
            <h1>{customer.name}</h1>
            {contactParts.length > 0 ? (
              <p className="portal-customer-contact-line">{contactParts.join(" · ")}</p>
            ) : (
              <p className="portal-customer-contact-line portal-customer-contact-empty">No contact details recorded</p>
            )}
            {customer.siteAddress ? (
              <p className="portal-customer-address-line">{customer.siteAddress}</p>
            ) : null}
            <div className="portal-dashboard-stat-bar" role="group" aria-label="Customer summary">
              <div className="portal-dashboard-stat">
                <span>Active drawings</span>
                <strong>{activeCount}</strong>
              </div>
              <div className="portal-dashboard-stat">
                <span>Last activity</span>
                <strong className="portal-customer-stat-timestamp">{formatTimestamp(customer.lastActivityAtIso)}</strong>
              </div>
              {customer.isArchived ? (
                <div className="portal-dashboard-stat portal-customer-stat-archived">
                  <span>Status</span>
                  <strong>Archived</strong>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="portal-header-actions portal-customer-page-actions">
          <button type="button" className="portal-secondary-button portal-compact-button" onClick={openEditModal}>
            Edit profile
          </button>
          <button
            type="button"
            className="portal-secondary-button portal-compact-button"
            onClick={() => void onSetCustomerArchived(customer.id, !customer.isArchived)}
            disabled={isArchivingCustomerId === customer.id}
          >
            {isArchivingCustomerId === customer.id ? "Updating..." : customer.isArchived ? "Restore" : "Archive"}
          </button>
          <button type="button" className="portal-primary-button portal-compact-button" onClick={onCreateDrawing}>
            New drawing
          </button>
        </div>
      </header>

      <section className="portal-surface-card portal-customer-drawings-panel">
        <div className="portal-section-heading">
          <div>
            <span className="portal-section-kicker">Customer drawings</span>
            <h2>Drawings</h2>
          </div>
          <div className="portal-filter-row" role="tablist" aria-label="Drawing filter">
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
        ) : (
          <div className="portal-customer-drawing-grid">
            {customerDrawings.map((drawing) => {
              const versions = versionsByDrawingId[drawing.id] ?? [];
              const isLoadingVersions = isLoadingVersionsForId === drawing.id;
              const isExpanded = expandedDrawingId === drawing.id;

              return (
                <article
                  key={drawing.id}
                  className={`portal-customer-drawing-card${drawing.isArchived ? " is-archived" : ""}${isExpanded ? " is-expanded" : ""}`}
                >
                  <div className="portal-customer-drawing-card-preview">
                    <DrawingPreview layout={drawing.previewLayout} label={drawing.name} variant="card" />
                  </div>

                  <div className="portal-customer-drawing-card-body">
                    <div className="portal-customer-drawing-card-head">
                      <h3>{drawing.name}</h3>
                      <div className="portal-customer-drawing-card-badges">
                        <span className="portal-customer-drawing-badge">v{drawing.versionNumber}</span>
                        {drawing.isArchived ? (
                          <span className="portal-customer-drawing-badge is-archived">Archived</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="portal-customer-drawing-card-meta">
                      <span>{drawing.segmentCount} segments · {drawing.gateCount} gates</span>
                      <span>Updated {formatTimestamp(drawing.updatedAtIso)}</span>
                      <span>by {drawing.updatedByDisplayName || "Unknown user"}</span>
                    </div>

                    <div className="portal-customer-drawing-card-actions">
                      <button type="button" className="portal-primary-button portal-compact-button" onClick={() => onOpenDrawing(drawing.id)}>
                        Open editor
                      </button>
                      <button type="button" className="portal-secondary-button portal-compact-button" onClick={() => onOpenEstimate(drawing.id)}>
                        Estimate
                      </button>
                    </div>

                    <div className="portal-customer-drawing-card-utility">
                      <button
                        type="button"
                        className="portal-text-button"
                        onClick={() => void onToggleDrawingArchived(drawing.id, !drawing.isArchived)}
                      >
                        {drawing.isArchived ? "Unarchive" : "Archive"}
                      </button>
                      <button
                        type="button"
                        className="portal-text-button"
                        onClick={() => void handleToggleHistory(drawing.id)}
                      >
                        {isExpanded ? "Hide history" : "History"}
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="portal-customer-drawing-card-history">
                      {isLoadingVersions ? <p className="portal-empty-copy">Loading...</p> : null}
                      {versions.length === 0 && !isLoadingVersions ? (
                        <p className="portal-empty-copy">No previous versions.</p>
                      ) : null}
                      {versions.map((version) => (
                        <div key={version.id} className="portal-customer-version-row">
                          <div>
                            <strong>v{version.versionNumber}</strong>
                            <span>{formatTimestamp(version.createdAtIso)}</span>
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
        )}
      </section>

      {isEditOpen ? (
        <div className="portal-customer-edit-backdrop" onClick={closeEditModal}>
          <div className="portal-customer-edit-modal" role="dialog" aria-label="Edit customer profile" onClick={(event) => event.stopPropagation()}>
            <div className="portal-customer-edit-modal-header">
              <h2>Edit customer profile</h2>
              <button type="button" className="portal-text-button" onClick={closeEditModal}>Close</button>
            </div>
            <div className="portal-customer-edit-modal-body">
              <label className="portal-customer-edit-field">
                <span>Name</span>
                <input value={draft?.name ?? ""} onChange={(event) => updateDraftField("name", event.target.value)} />
              </label>
              <div className="portal-customer-edit-field-row">
                <label className="portal-customer-edit-field">
                  <span>Primary contact</span>
                  <input value={draft?.primaryContactName ?? ""} onChange={(event) => updateDraftField("primaryContactName", event.target.value)} />
                </label>
                <label className="portal-customer-edit-field">
                  <span>Phone</span>
                  <input value={draft?.primaryPhone ?? ""} onChange={(event) => updateDraftField("primaryPhone", event.target.value)} />
                </label>
              </div>
              <label className="portal-customer-edit-field">
                <span>Email</span>
                <input value={draft?.primaryEmail ?? ""} onChange={(event) => updateDraftField("primaryEmail", event.target.value)} />
              </label>
              <label className="portal-customer-edit-field">
                <span>Site address</span>
                <textarea value={draft?.siteAddress ?? ""} onChange={(event) => updateDraftField("siteAddress", event.target.value)} />
              </label>
            </div>
            <div className="portal-customer-edit-modal-footer">
              <button type="button" className="portal-secondary-button portal-compact-button" onClick={closeEditModal}>
                Cancel
              </button>
              <button
                type="button"
                className="portal-primary-button portal-compact-button"
                onClick={() => void handleSave()}
                disabled={isSavingCustomer}
              >
                {isSavingCustomer ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
