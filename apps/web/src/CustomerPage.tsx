import { useEffect, useMemo, useState } from "react";

import {
  customerUpdateRequestSchema,
  type CustomerContact,
  type CustomerSummary,
  type DrawingRecord,
  type DrawingSummary,
  type DrawingWorkspaceSummary,
} from "@fence-estimator/contracts";
import type { ZodIssue } from "zod";

import { DrawingPreview } from "./DrawingPreview";
import {
  buildCustomerWorkspaceCards,
  buildWorkspaceNavigationQuery,
  getRevisionLabel,
} from "./drawingWorkspace";
import type { PortalRoute } from "./useHashRoute";

type CustomerDrawingFilter = "ACTIVE" | "ARCHIVED" | "ALL";

const DRAWING_STATUS_LABELS: Record<DrawingSummary["status"], string> = {
  DRAFT: "Draft",
  QUOTED: "Quoted",
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

interface CustomerDraft {
  name: string;
  primaryContactName: string;
  primaryEmail: string;
  primaryPhone: string;
  siteAddress: string;
}

interface CustomerProfileInput {
  name: string;
  primaryContactName: string;
  primaryEmail: string;
  primaryPhone: string;
  siteAddress: string;
  additionalContacts: CustomerContact[];
}

interface SaveCustomerProfileSuccess {
  ok: true;
}

interface SaveCustomerProfileFailure {
  ok: false;
  message: string | null;
}

type SaveCustomerProfileResult = SaveCustomerProfileSuccess | SaveCustomerProfileFailure;

interface CustomerPageProps {
  query?: Record<string, string>;
  customers: CustomerSummary[];
  workspaces: DrawingWorkspaceSummary[];
  drawings?: DrawingSummary[];
  userRole: string;
  isSavingCustomer: boolean;
  isArchivingCustomerId: string | null;
  errorMessage: string | null;
  noticeMessage: string | null;
  onSaveCustomer(
    this: void,
    input: { mode: "update"; customerId: string; customer: Partial<CustomerDraft> & { additionalContacts?: CustomerContact[] } },
  ): Promise<{ id: string } | null>;
  onCreateDrawing(this: void, input: { customerId: string; name: string }): Promise<DrawingRecord | null>;
  onSetCustomerArchived(this: void, customerId: string, archived: boolean, cascadeDrawings?: boolean): Promise<boolean>;
  onSetWorkspaceArchived(this: void, workspaceId: string, archived: boolean): Promise<boolean>;
  onDeleteWorkspace(this: void, workspaceId: string): Promise<boolean>;
  onDeleteCustomer(this: void, customerId: string): Promise<boolean>;
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

function buildNextDrawingName(customer: CustomerSummary, count: number): string {
  return `${customer.name} Drawing ${count + 1}`;
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

function formatMoney(value: number | null): string {
  if (value === null) {
    return "No quote yet";
  }
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function buildCustomerProfileInput(draft: CustomerDraft, contactsDraft: CustomerContact[]): CustomerProfileInput {
  return {
    name: draft.name.trim(),
    primaryContactName: draft.primaryContactName.trim(),
    primaryEmail: draft.primaryEmail.trim(),
    primaryPhone: draft.primaryPhone.trim(),
    siteAddress: draft.siteAddress.trim(),
    additionalContacts: contactsDraft
      .map((contact) => ({ name: contact.name.trim(), phone: contact.phone.trim(), email: contact.email.trim() }))
      .filter((contact) => contact.name || contact.phone || contact.email),
  };
}

function toFriendlyCustomerValidationMessage(issue: ZodIssue): string {
  const [fieldName, index, nestedFieldName] = issue.path;

  if (fieldName === "name") {
    return "Enter a customer name.";
  }

  if (fieldName === "primaryEmail") {
    return "Enter a valid primary email address or leave it blank.";
  }

  if (fieldName === "additionalContacts" && typeof index === "number" && nestedFieldName === "email") {
    return `Enter a valid email address for additional contact ${index + 1}, or leave it blank.`;
  }

  if (fieldName === "additionalContacts" && typeof index === "number") {
    return `Check the details for additional contact ${index + 1}.`;
  }

  return "Check the customer details and try again.";
}

export function validateCustomerProfileInput(input: CustomerProfileInput): string | null {
  const parsed = customerUpdateRequestSchema.safeParse(input);
  if (parsed.success) {
    return null;
  }
  const firstIssue = parsed.error.issues[0];
  return firstIssue ? toFriendlyCustomerValidationMessage(firstIssue) : "Check the customer details and try again.";
}

export async function saveCustomerProfile(
  customer: CustomerSummary | null,
  draft: CustomerDraft | null,
  contactsDraft: CustomerContact[],
  onSaveCustomer: CustomerPageProps["onSaveCustomer"],
): Promise<SaveCustomerProfileResult> {
  if (!customer || !draft) {
    return { ok: false, message: null };
  }

  const input = buildCustomerProfileInput(draft, contactsDraft);
  const validationMessage = validateCustomerProfileInput(input);
  if (validationMessage) {
    return { ok: false, message: validationMessage };
  }

  const savedCustomer = await onSaveCustomer({
    mode: "update",
    customerId: customer.id,
    customer: input,
  });

  if (!savedCustomer) {
    return { ok: false, message: null };
  }

  return { ok: true };
}

export function CustomerPage({
  query,
  customers,
  workspaces,
  drawings = [],
  userRole,
  isSavingCustomer,
  isArchivingCustomerId,
  errorMessage,
  noticeMessage,
  onSaveCustomer,
  onCreateDrawing,
  onSetCustomerArchived,
  onSetWorkspaceArchived,
  onDeleteWorkspace,
  onDeleteCustomer,
  onNavigate,
}: CustomerPageProps) {
  const customerId = query?.customerId ?? null;
  const isAdmin = userRole === "OWNER" || userRole === "ADMIN";
  const [drawingFilter, setDrawingFilter] = useState<CustomerDrawingFilter>("ACTIVE");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft | null>(null);
  const [contactsDraft, setContactsDraft] = useState<CustomerContact[]>([]);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);
  const [confirmDeleteCustomer, setConfirmDeleteCustomer] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [isCreatingDrawing, setIsCreatingDrawing] = useState(false);
  const [isNewDrawingOpen, setIsNewDrawingOpen] = useState(false);
  const [newDrawingName, setNewDrawingName] = useState("");

  const customer = useMemo(
    () => customers.find((entry) => entry.id === customerId) ?? null,
    [customerId, customers],
  );

  const workspaceCards = useMemo(
    () => (customer ? buildCustomerWorkspaceCards(customer.id, workspaces, drawings) : []),
    [customer, drawings, workspaces],
  );

  const visibleWorkspaceCards = useMemo(
    () =>
      workspaceCards.filter((card) => {
        if (drawingFilter === "ACTIVE") {
          return !card.workspace.isArchived;
        }
        if (drawingFilter === "ARCHIVED") {
          return card.workspace.isArchived;
        }
        return true;
      }),
    [drawingFilter, workspaceCards],
  );

  const activeWorkspaceCount = useMemo(
    () => workspaceCards.filter((card) => !card.workspace.isArchived).length,
    [workspaceCards],
  );

  const totalRevisionCount = useMemo(
    () => workspaceCards.reduce((count, card) => count + card.revisionCount, 0),
    [workspaceCards],
  );

  useEffect(() => {
    if (!isEditOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsEditOpen(false);
        setDraft(null);
        setEditErrorMessage(null);
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
    setContactsDraft(customer.additionalContacts.map((contact) => ({ ...contact })));
    setEditErrorMessage(null);
    setIsEditOpen(true);
  };

  const closeEditModal = () => {
    setIsEditOpen(false);
    setDraft(null);
    setContactsDraft([]);
    setEditErrorMessage(null);
  };

  const updateDraftField = (field: keyof CustomerDraft, value: string) => {
    if (!customer) {
      return;
    }
    setEditErrorMessage(null);
    setDraft((current) => ({ ...(current ?? buildDraft(customer)), [field]: value }));
  };

  const handleSave = async () => {
    const result = await saveCustomerProfile(customer, draft, contactsDraft, onSaveCustomer);
    if (!result.ok) {
      setEditErrorMessage(result.message);
      return;
    }
    closeEditModal();
  };

  const openNewDrawingModal = () => {
    if (!customer) return;
    setNewDrawingName(buildNextDrawingName(customer, workspaceCards.length));
    setIsNewDrawingOpen(true);
  };

  const handleCreateDrawing = async () => {
    if (!customer) return;
    const name = newDrawingName.trim() || buildNextDrawingName(customer, workspaceCards.length);
    setIsCreatingDrawing(true);
    const drawing = await onCreateDrawing({
      customerId: customer.id,
      name,
    });
    setIsCreatingDrawing(false);
    setIsNewDrawingOpen(false);
    if (drawing?.workspaceId) {
      onNavigate("drawing", { workspaceId: drawing.workspaceId, drawingId: drawing.id });
    }
  };

  const openDrawingWorkspace = (
    workspace: DrawingWorkspaceSummary,
    options?: { drawingId?: string; tab?: "workspace" | "estimate" | "history" },
  ) => {
    onNavigate("drawing", buildWorkspaceNavigationQuery(workspace, drawings, options));
  };

  if (!customerId || !customer) {
    return (
      <section className="portal-page portal-customer-page">
        <div className="portal-empty-state">
          <h1>Customer not found</h1>
          <p>Select a customer from the directory to view their drawings and revisions.</p>
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
              <p className="portal-customer-contact-line">{contactParts.join(" | ")}</p>
            ) : (
              <p className="portal-customer-contact-line portal-customer-contact-empty">No contact details recorded</p>
            )}
            {customer.siteAddress ? (
              <p className="portal-customer-address-line">{customer.siteAddress}</p>
            ) : null}
            <div className="portal-dashboard-stat-bar" role="group" aria-label="Customer summary">
              <div className="portal-dashboard-stat">
                <span>Active workspaces</span>
                <strong>{activeWorkspaceCount}</strong>
              </div>
              <div className="portal-dashboard-stat">
                <span>Total revisions</span>
                <strong>{totalRevisionCount}</strong>
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
            onClick={() => {
              if (!customer.isArchived && activeWorkspaceCount > 0) {
                setConfirmArchive(true);
              } else {
                void onSetCustomerArchived(customer.id, !customer.isArchived, !customer.isArchived);
              }
            }}
            disabled={isArchivingCustomerId === customer.id}
          >
            {isArchivingCustomerId === customer.id ? "Updating..." : customer.isArchived ? "Restore customer" : "Archive customer"}
          </button>
          {isAdmin && customer.isArchived ? (
            <button
              type="button"
              className="portal-danger-button portal-compact-button"
              onClick={() => setConfirmDeleteCustomer(true)}
              disabled={isDeletingCustomer}
            >
              {isDeletingCustomer ? "Deleting..." : "Delete customer"}
            </button>
          ) : null}
          <button type="button" className="portal-primary-button portal-compact-button" onClick={openNewDrawingModal} disabled={isCreatingDrawing}>
            {isCreatingDrawing ? "Creating..." : "New drawing"}
          </button>
        </div>
      </header>

      {customer.isArchived ? (
        <div className="portal-inline-message portal-inline-warning" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <span>This customer is archived. Restore the customer to make it active again.</span>
          <button
            type="button"
            className="portal-secondary-button portal-compact-button"
            disabled={isArchivingCustomerId === customer.id}
            onClick={() => void onSetCustomerArchived(customer.id, false, false)}
          >
            {isArchivingCustomerId === customer.id ? "Restoring..." : "Restore customer"}
          </button>
        </div>
      ) : null}

      {errorMessage ? <div className="portal-inline-message portal-inline-error">{errorMessage}</div> : null}
      {noticeMessage ? <div className="portal-inline-message portal-inline-notice">{noticeMessage}</div> : null}

      {customer.additionalContacts.length > 0 ? (
        <section className="portal-surface-card portal-customer-contacts-section">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">People</span>
              <h2>Additional contacts</h2>
            </div>
          </div>
          <div className="portal-customer-contacts-list">
            {customer.additionalContacts.map((contact, index) => (
              <div key={index} className="portal-customer-contact-card">
                {contact.name ? <strong>{contact.name}</strong> : null}
                {contact.phone ? <span>{contact.phone}</span> : null}
                {contact.email ? <span>{contact.email}</span> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="portal-surface-card portal-customer-drawings-panel">
        <div className="portal-section-heading">
          <div>
            <span className="portal-section-kicker">Customer workspaces</span>
            <h2>Drawing workspaces</h2>
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

        {visibleWorkspaceCards.length === 0 ? (
          <div className="portal-empty-state portal-customer-drawings-empty">
            <h2>No workspaces in this view</h2>
            <p>Create the first drawing workspace for this customer or switch filters to review archived work.</p>
          </div>
        ) : (
          <div className="portal-customer-drawing-grid">
            {visibleWorkspaceCards.map((card) => {
              const latestRevision = card.latestRevision ?? card.rootDrawing;
              if (!latestRevision || !card.rootDrawing) {
                return null;
              }
              return (
              <article
                key={card.workspace.id}
                className={`portal-customer-drawing-card${card.workspace.isArchived ? " is-archived" : ""}`}
              >
                <div
                  className="portal-customer-drawing-card-preview"
                  role="button"
                  tabIndex={0}
                  onClick={() => openDrawingWorkspace(card.workspace)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      openDrawingWorkspace(card.workspace);
                    }
                  }}
                >
                  <DrawingPreview
                    layout={latestRevision.previewLayout ?? EMPTY_LAYOUT}
                    label={card.workspace.name}
                    variant="card"
                  />
                </div>

                <div className="portal-customer-drawing-card-body">
                  <div className="portal-customer-drawing-card-head">
                    <div className="portal-customer-drawing-card-copy">
                      <h3>{card.workspace.name}</h3>
                      <span>Latest revision: {getRevisionLabel(latestRevision)}</span>
                    </div>
                    <div className="portal-customer-drawing-card-badges">
                      <span className="portal-customer-drawing-badge">
                        {card.revisionCount} revision{card.revisionCount === 1 ? "" : "s"}
                      </span>
                      {card.workspace.isArchived ? (
                        <span className="portal-customer-drawing-badge is-archived">Archived</span>
                      ) : null}
                      <span className={`portal-customer-drawing-badge drawing-status-${latestRevision.status.toLowerCase()}`}>
                        {DRAWING_STATUS_LABELS[latestRevision.status]}
                      </span>
                    </div>
                  </div>

                  <div className="portal-customer-drawing-card-meta">
                    <span>{formatMoney(card.workspace.latestQuoteTotal ?? null)}</span>
                    <span>{card.workspace.openTaskCount} open tasks</span>
                    <span>Updated {formatTimestamp(card.lastActivityAtIso)}</span>
                  </div>

                  <div className="portal-customer-drawing-card-meta">
                    {card.drawings.map((drawing) => (
                      <button
                        type="button"
                        key={drawing.id}
                        className="portal-text-button"
                        onClick={() =>
                          openDrawingWorkspace(card.workspace, { drawingId: drawing.id })
                        }
                      >
                        {getRevisionLabel(drawing)}
                      </button>
                    ))}
                  </div>

                  <div className="portal-customer-drawing-card-footer">
                    <button
                      type="button"
                      className="portal-text-button"
                      onClick={() => openDrawingWorkspace(card.workspace)}
                    >
                      Open workspace
                    </button>
                    <button
                      type="button"
                      className="portal-text-button"
                      onClick={() =>
                        void onSetWorkspaceArchived(card.workspace.id, !card.workspace.isArchived)
                      }
                    >
                      {card.workspace.isArchived ? "Restore workspace" : "Archive workspace"}
                    </button>
                    {isAdmin && card.workspace.isArchived ? (
                      <button
                        type="button"
                        className="portal-text-button portal-danger-text"
                        onClick={() => {
                          if (!window.confirm(`Delete workspace "${card.workspace.name}" permanently?`)) {
                            return;
                          }
                          void onDeleteWorkspace(card.workspace.id);
                        }}
                      >
                        Delete workspace
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
            })}
          </div>
        )}
      </section>

      {isNewDrawingOpen ? (
        <div className="portal-customer-edit-backdrop portal-modal-backdrop" onClick={() => setIsNewDrawingOpen(false)}>
          <div
            className="portal-customer-edit-modal portal-modal-card"
            role="dialog"
            aria-label="New drawing"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="portal-customer-edit-modal-header portal-modal-header">
              <h2>New drawing</h2>
              <button type="button" className="portal-text-button" onClick={() => setIsNewDrawingOpen(false)}>Close</button>
            </div>
            <div className="portal-customer-edit-modal-body portal-modal-body">
              <label className="portal-customer-edit-field">
                <span>Drawing name</span>
                <input
                  value={newDrawingName}
                  onChange={(event) => setNewDrawingName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && newDrawingName.trim()) {
                      void handleCreateDrawing();
                    }
                  }}
                  autoFocus
                />
              </label>
            </div>
            <div className="portal-customer-edit-modal-footer portal-modal-footer">
              <button type="button" className="portal-secondary-button portal-compact-button" onClick={() => setIsNewDrawingOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="portal-primary-button portal-compact-button"
                disabled={isCreatingDrawing || !newDrawingName.trim()}
                onClick={() => void handleCreateDrawing()}
              >
                {isCreatingDrawing ? "Creating..." : "Create drawing"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeleteCustomer ? (
        <div className="portal-customer-edit-backdrop portal-modal-backdrop" onClick={() => setConfirmDeleteCustomer(false)}>
          <div
            className="portal-customer-edit-modal portal-confirm-modal portal-modal-card"
            role="dialog"
            aria-label="Confirm delete customer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="portal-customer-edit-modal-header portal-modal-header">
              <h2>Permanently delete customer?</h2>
              <button type="button" className="portal-text-button" onClick={() => setConfirmDeleteCustomer(false)}>Close</button>
            </div>
            <div className="portal-customer-edit-modal-body portal-modal-body">
              <p>This will permanently remove the customer and all their archived drawing work. This action cannot be undone.</p>
            </div>
            <div className="portal-customer-edit-modal-footer portal-modal-footer">
              <button type="button" className="portal-secondary-button portal-compact-button" onClick={() => setConfirmDeleteCustomer(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="portal-danger-button portal-compact-button"
                disabled={isDeletingCustomer}
                onClick={() => {
                  void (async () => {
                    setIsDeletingCustomer(true);
                    const deleted = await onDeleteCustomer(customer.id);
                    setIsDeletingCustomer(false);
                    setConfirmDeleteCustomer(false);
                    if (deleted) {
                      onNavigate("customers");
                    }
                  })();
                }}
              >
                {isDeletingCustomer ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmArchive && customer ? (
        <div className="portal-customer-edit-backdrop portal-modal-backdrop" onClick={() => setConfirmArchive(false)}>
          <div
            className="portal-customer-edit-modal portal-confirm-modal portal-modal-card"
            role="dialog"
            aria-label="Confirm archive customer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="portal-customer-edit-modal-header portal-modal-header">
              <h2>Archive customer?</h2>
              <button type="button" className="portal-text-button" onClick={() => setConfirmArchive(false)}>Close</button>
            </div>
            <div className="portal-customer-edit-modal-body portal-modal-body">
              <p>
                This customer has <strong>{activeWorkspaceCount}</strong> active workspace
                {activeWorkspaceCount === 1 ? "" : "s"}.
              </p>
              <p>Archiving the customer will archive every active workspace under this customer.</p>
            </div>
            <div className="portal-customer-edit-modal-footer portal-modal-footer">
              <button type="button" className="portal-secondary-button portal-compact-button" onClick={() => setConfirmArchive(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="portal-primary-button portal-compact-button"
                disabled={isArchivingCustomerId === customer.id}
                onClick={() => {
                  setConfirmArchive(false);
                  void onSetCustomerArchived(customer.id, true, true);
                }}
              >
                Archive customer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isEditOpen ? (
        <div className="portal-customer-edit-backdrop portal-modal-backdrop" onClick={closeEditModal}>
          <div className="portal-customer-edit-modal portal-modal-card" role="dialog" aria-label="Edit customer profile" onClick={(event) => event.stopPropagation()}>
            <div className="portal-customer-edit-modal-header portal-modal-header">
              <h2>Edit customer profile</h2>
              <button type="button" className="portal-text-button" onClick={closeEditModal}>Close</button>
            </div>
            {editErrorMessage ? <div className="portal-inline-message portal-inline-error">{editErrorMessage}</div> : null}
            <div className="portal-customer-edit-modal-body portal-modal-body">
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
                <input type="email" value={draft?.primaryEmail ?? ""} onChange={(event) => updateDraftField("primaryEmail", event.target.value)} />
              </label>
              <label className="portal-customer-edit-field">
                <span>Site address</span>
                <textarea value={draft?.siteAddress ?? ""} onChange={(event) => updateDraftField("siteAddress", event.target.value)} />
              </label>
            </div>
            <div className="portal-customer-edit-contacts">
              <div className="portal-customer-edit-contacts-heading">
                <h3>Additional contacts</h3>
                <button
                  type="button"
                  className="portal-text-button"
                  onClick={() => {
                    setEditErrorMessage(null);
                    setContactsDraft((current) => [...current, { name: "", phone: "", email: "" }]);
                  }}
                >
                  + Add contact
                </button>
              </div>
              {contactsDraft.map((contact, index) => (
                <div key={index} className="portal-customer-edit-contact-row">
                  <input
                    placeholder="Name"
                    value={contact.name}
                    onChange={(event) => {
                      setEditErrorMessage(null);
                      setContactsDraft((current) => current.map((entry, i) => (i === index ? { ...entry, name: event.target.value } : entry)));
                    }}
                  />
                  <input
                    placeholder="Phone"
                    value={contact.phone}
                    onChange={(event) => {
                      setEditErrorMessage(null);
                      setContactsDraft((current) => current.map((entry, i) => (i === index ? { ...entry, phone: event.target.value } : entry)));
                    }}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={contact.email}
                    onChange={(event) => {
                      setEditErrorMessage(null);
                      setContactsDraft((current) => current.map((entry, i) => (i === index ? { ...entry, email: event.target.value } : entry)));
                    }}
                  />
                  <button
                    type="button"
                    className="portal-customer-edit-contact-remove"
                    onClick={() => {
                      setEditErrorMessage(null);
                      setContactsDraft((current) => current.filter((_, i) => i !== index));
                    }}
                    aria-label="Remove contact"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
            <div className="portal-customer-edit-modal-footer portal-modal-footer">
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
