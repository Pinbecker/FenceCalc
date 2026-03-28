import { useEffect, useMemo, useState } from "react";

import { customerUpdateRequestSchema, type CustomerContact, type CustomerSummary, type DrawingSummary, type JobRecord, type JobStage, type JobSummary } from "@fence-estimator/contracts";
import type { ZodIssue } from "zod";

import { DrawingPreview } from "./DrawingPreview";
import { buildFallbackJobSummaries, hasLegacyJoblessDrawings, resolveJobWorkspaceTarget } from "./jobFallbacks";
import type { PortalRoute } from "./useHashRoute";

type CustomerJobFilter = "ACTIVE" | "ARCHIVED" | "ALL";

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
  jobs?: JobSummary[];
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
  onCreateJob?(this: void, input: { customerId: string; name: string; notes: string }): Promise<JobRecord | null>;
  onSetCustomerArchived(this: void, customerId: string, archived: boolean, cascadeDrawings?: boolean): Promise<boolean>;
  onOpenJob?(this: void, jobId: string): void;
  onOpenDrawing(this: void, drawingId: string): void;
  onOpenEstimate(this: void, jobId: string, drawingId?: string | null): void;
  onCreateDrawing?(this: void): void;
  onToggleDrawingArchived?(this: void, drawingId: string, archived: boolean): Promise<boolean>;
  onChangeDrawingStatus?(this: void, drawingId: string, status: string): Promise<boolean>;
  onDeleteDrawing?(this: void, drawingId: string): Promise<boolean>;
  onSetJobArchived?(this: void, jobId: string, archived: boolean): Promise<boolean>;
  onDeleteJob?(this: void, jobId: string): Promise<boolean>;
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

function buildNextJobName(customer: CustomerSummary, count: number): string {
  return `${customer.name} Job ${count + 1}`;
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
  jobs = [],
  drawings = [],
  userRole,
  isSavingCustomer,
  isArchivingCustomerId,
  errorMessage,
  noticeMessage,
  onSaveCustomer,
  onCreateJob,
  onSetCustomerArchived,
  onOpenJob,
  onOpenDrawing,
  onOpenEstimate,
  onCreateDrawing,
  onSetJobArchived,
  onDeleteJob,
  onDeleteCustomer,
  onNavigate,
}: CustomerPageProps) {
  const customerId = query?.customerId ?? null;
  const isAdmin = userRole === "OWNER" || userRole === "ADMIN";
  const [jobFilter, setJobFilter] = useState<CustomerJobFilter>("ACTIVE");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft | null>(null);
  const [contactsDraft, setContactsDraft] = useState<CustomerContact[]>([]);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);
  const [confirmDeleteCustomer, setConfirmDeleteCustomer] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [cascadeOnArchive, setCascadeOnArchive] = useState(false);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);
  const [newJobName, setNewJobName] = useState("");
  const [newJobNotes, setNewJobNotes] = useState("");
  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState<string | null>(null);
  const [isDeletingJob, setIsDeletingJob] = useState(false);
  const [archivingJobId, setArchivingJobId] = useState<string | null>(null);

  const customer = useMemo(
    () => customers.find((entry) => entry.id === customerId) ?? null,
    [customerId, customers],
  );

  const customerJobs = useMemo(() => {
    if (!customer) {
      return [];
    }
    const shouldUseFallbackJobs = jobs.length === 0 && hasLegacyJoblessDrawings(drawings, customer.id);
    if (shouldUseFallbackJobs) {
      return buildFallbackJobSummaries(drawings, customer.id)
        .filter((job) => {
          if (jobFilter === "ACTIVE") {
            return !job.isArchived;
          }
          if (jobFilter === "ARCHIVED") {
            return job.isArchived;
          }
          return true;
        });
    }
    return jobs
      .filter((job) => job.customerId === customer.id)
      .filter((job) => {
        if (jobFilter === "ACTIVE") {
          return !job.isArchived;
        }
        if (jobFilter === "ARCHIVED") {
          return job.isArchived;
        }
        return true;
      })
      .sort((left, right) => (right.lastActivityAtIso ?? right.updatedAtIso).localeCompare(left.lastActivityAtIso ?? left.updatedAtIso));
  }, [customer, drawings, jobFilter, jobs]);

  const fallbackJobs = useMemo(
    () => (customer && hasLegacyJoblessDrawings(drawings, customer.id) ? buildFallbackJobSummaries(drawings, customer.id) : []),
    [customer, drawings],
  );

  const activeJobCount = useMemo(
    () =>
      jobs.length > 0
        ? jobs.filter((job) => job.customerId === customer?.id && !job.isArchived).length
        : fallbackJobs.filter((job) => !job.isArchived).length,
    [customer?.id, fallbackJobs, jobs],
  );

  const totalDrawingCount = useMemo(
    () =>
      jobs.length > 0
        ? jobs.filter((job) => job.customerId === customer?.id).reduce((sum, job) => sum + job.drawingCount, 0)
        : drawings.filter((drawing) => drawing.customerId === customer?.id).length,
    [customer?.id, drawings, jobs],
  );

  const existingJobCount = useMemo(
    () => (jobs.length > 0 ? jobs.filter((job) => job.customerId === customer?.id).length : fallbackJobs.length),
    [customer?.id, fallbackJobs.length, jobs],
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

  const openNewJobModal = () => {
    if (!customer) return;
    setNewJobName(buildNextJobName(customer, existingJobCount));
    setNewJobNotes("");
    setIsNewJobOpen(true);
  };

  const handleCreateJob = async () => {
    if (!customer) return;
    if (!onCreateJob) {
      onCreateDrawing?.();
      return;
    }
    const name = newJobName.trim() || buildNextJobName(customer, existingJobCount);
    setIsCreatingJob(true);
    const job = await onCreateJob({
      customerId: customer.id,
      name,
      notes: newJobNotes.trim()
    });
    setIsCreatingJob(false);
    setIsNewJobOpen(false);
    if (job) {
      if (onOpenJob) {
        onOpenJob(job.id);
      } else {
        onNavigate("job", { jobId: job.id });
      }
    }
  };

  const openJobWorkspace = (job: JobSummary) => {
    const target = resolveJobWorkspaceTarget(job, drawings);
    if (target.route === "job") {
      if (onOpenJob) {
        onOpenJob(target.query.jobId);
      } else {
        onNavigate("job", target.query);
      }
      return;
    }
    onOpenDrawing(target.query.drawingId);
  };

  const openJobEstimate = (job: JobSummary) => {
    const target = resolveJobWorkspaceTarget(job, drawings);
    if (target.route === "job") {
      onOpenEstimate(target.query.jobId, job.primaryDrawingId);
      return;
    }
    if (job.primaryDrawingId) {
      onNavigate("estimate", { drawingId: job.primaryDrawingId });
    }
  };

  if (!customerId || !customer) {
    return (
      <section className="portal-page portal-customer-page">
        <div className="portal-empty-state">
          <h1>Customer not found</h1>
          <p>Select a customer from the directory to view their details and jobs.</p>
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
                <span>Active jobs</span>
                <strong>{activeJobCount}</strong>
              </div>
              <div className="portal-dashboard-stat">
                <span>Total drawings</span>
                <strong>{totalDrawingCount}</strong>
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
              if (!customer.isArchived && activeJobCount > 0) {
                setCascadeOnArchive(false);
                setConfirmArchive(true);
              } else {
                void onSetCustomerArchived(customer.id, !customer.isArchived, false);
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
          <button type="button" className="portal-primary-button portal-compact-button" onClick={openNewJobModal} disabled={isCreatingJob}>
            {isCreatingJob ? "Creating..." : "New job"}
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
            <span className="portal-section-kicker">Customer jobs</span>
            <h2>Jobs</h2>
          </div>
          <div className="portal-filter-row" role="tablist" aria-label="Job filter">
            {(["ACTIVE", "ARCHIVED", "ALL"] as CustomerJobFilter[]).map((option) => (
              <button
                type="button"
                key={option}
                className={jobFilter === option ? "is-active" : undefined}
                onClick={() => setJobFilter(option)}
              >
                {option === "ACTIVE" ? "Active" : option === "ARCHIVED" ? "Archived" : "All"}
              </button>
            ))}
          </div>
        </div>

        {customerJobs.length === 0 ? (
          <div className="portal-empty-state portal-customer-drawings-empty">
            <h2>No jobs in this view</h2>
            <p>Create the first job for this customer or switch filters to review archived work.</p>
          </div>
        ) : (
          <div className="portal-customer-drawing-grid">
            {customerJobs.map((job) => (
              <article key={job.id} className={`portal-customer-drawing-card${job.isArchived ? " is-archived" : ""}`}>
                <div
                  className="portal-customer-drawing-card-preview"
                  role="button"
                  tabIndex={0}
                  onClick={() => openJobWorkspace(job)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      openJobWorkspace(job);
                    }
                  }}
                >
                  <DrawingPreview layout={job.primaryPreviewLayout ?? EMPTY_LAYOUT} label={job.name} variant="card" />
                </div>

                <div className="portal-customer-drawing-card-body">
                  <div className="portal-customer-drawing-card-head">
                    <div className="portal-customer-drawing-card-copy">
                      <h3>{job.name}</h3>
                    </div>
                    <div className="portal-customer-drawing-card-badges">
                      {drawings.find((drawing) => drawing.id === job.primaryDrawingId)?.versionNumber ? (
                        <span className="portal-customer-drawing-badge">v{drawings.find((drawing) => drawing.id === job.primaryDrawingId)?.versionNumber}</span>
                      ) : null}
                      <span className="portal-customer-drawing-badge">{job.drawingCount} drawings</span>
                      {job.isArchived ? <span className="portal-customer-drawing-badge is-archived">Archived</span> : null}
                      <span className={`portal-customer-drawing-badge drawing-status-${job.stage.toLowerCase()}`}>
                        {JOB_STATUS_LABELS[job.stage]}
                      </span>
                    </div>
                  </div>

                  <div className="portal-customer-drawing-card-meta">
                    <span>{formatMoney(job.latestQuoteTotal)}</span>
                    <span>Updated {formatTimestamp(job.lastActivityAtIso ?? job.updatedAtIso)}</span>
                  </div>

                  <div className="portal-customer-drawing-card-footer">
                    <button type="button" className="portal-text-button" onClick={() => openJobWorkspace(job)}>
                      Open
                    </button>
                    {onSetJobArchived ? (
                      <button
                        type="button"
                        className="portal-text-button"
                        disabled={archivingJobId === job.id}
                        onClick={() => {
                          setArchivingJobId(job.id);
                          void onSetJobArchived(job.id, !job.isArchived).finally(() => setArchivingJobId(null));
                        }}
                      >
                        {archivingJobId === job.id ? "Updating..." : job.isArchived ? "Restore" : "Archive"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {isNewJobOpen ? (
        <div className="portal-customer-edit-backdrop portal-modal-backdrop" onClick={() => setIsNewJobOpen(false)}>
          <div
            className="portal-customer-edit-modal portal-modal-card"
            role="dialog"
            aria-label="New job"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="portal-customer-edit-modal-header portal-modal-header">
              <h2>New job</h2>
              <button type="button" className="portal-text-button" onClick={() => setIsNewJobOpen(false)}>Close</button>
            </div>
            <div className="portal-customer-edit-modal-body portal-modal-body">
              <label className="portal-customer-edit-field">
                <span>Job name</span>
                <input
                  value={newJobName}
                  onChange={(event) => setNewJobName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && newJobName.trim()) {
                      void handleCreateJob();
                    }
                  }}
                  autoFocus
                />
              </label>
              <label className="portal-customer-edit-field">
                <span>Notes (optional)</span>
                <textarea
                  value={newJobNotes}
                  onChange={(event) => setNewJobNotes(event.target.value)}
                  rows={3}
                />
              </label>
            </div>
            <div className="portal-customer-edit-modal-footer portal-modal-footer">
              <button type="button" className="portal-secondary-button portal-compact-button" onClick={() => setIsNewJobOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="portal-primary-button portal-compact-button"
                disabled={isCreatingJob || !newJobName.trim()}
                onClick={() => void handleCreateJob()}
              >
                {isCreatingJob ? "Creating..." : "Create job"}
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
              <p>This will permanently remove the customer and all their archived jobs and drawings. This action cannot be undone.</p>
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

      {confirmDeleteJobId && onDeleteJob ? (
        <div className="portal-customer-edit-backdrop portal-modal-backdrop" onClick={() => setConfirmDeleteJobId(null)}>
          <div
            className="portal-customer-edit-modal portal-confirm-modal portal-modal-card"
            role="dialog"
            aria-label="Confirm delete job"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="portal-customer-edit-modal-header portal-modal-header">
              <h2>Permanently delete job?</h2>
              <button type="button" className="portal-text-button" onClick={() => setConfirmDeleteJobId(null)}>Close</button>
            </div>
            <div className="portal-customer-edit-modal-body portal-modal-body">
              <p>This will permanently remove the job and all its drawings, estimates, and history. This action cannot be undone.</p>
            </div>
            <div className="portal-customer-edit-modal-footer portal-modal-footer">
              <button type="button" className="portal-secondary-button portal-compact-button" onClick={() => setConfirmDeleteJobId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="portal-danger-button portal-compact-button"
                disabled={isDeletingJob}
                onClick={() => {
                  void (async () => {
                    setIsDeletingJob(true);
                    await onDeleteJob(confirmDeleteJobId);
                    setIsDeletingJob(false);
                    setConfirmDeleteJobId(null);
                  })();
                }}
              >
                {isDeletingJob ? "Deleting..." : "Delete permanently"}
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
              <p>This customer has <strong>{activeJobCount}</strong> active {activeJobCount === 1 ? "job" : "jobs"}.</p>
              <label className="portal-checkbox-label">
                <input type="checkbox" checked={cascadeOnArchive} onChange={(event) => setCascadeOnArchive(event.target.checked)} />
                Also archive all active drawings under this customer
              </label>
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
                  void onSetCustomerArchived(customer.id, true, cascadeOnArchive);
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
