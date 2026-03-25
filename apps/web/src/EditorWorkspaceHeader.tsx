import { useMemo, useState } from "react";

import type { AuthSessionEnvelope, CustomerSummary, DrawingStatus } from "@fence-estimator/contracts";
import { DRAWING_STATUSES } from "@fence-estimator/contracts";

const JOB_STATUS_LABELS: Record<DrawingStatus, string> = {
  DRAFT: "Draft",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
  ON_HOLD: "On hold",
};

interface EditorWorkspaceHeaderProps {
  session: AuthSessionEnvelope | null;
  customers: CustomerSummary[];
  drawingTitle: string;
  currentDrawingId: string | null;
  currentDrawingName: string;
  currentCustomerId: string | null;
  currentCustomerName: string;
  isDirty: boolean;
  isSavingCustomer: boolean;
  isSavingDrawing: boolean;
  currentDrawingStatus: DrawingStatus | null;
  isChangingStatus: boolean;
  canManagePricing: boolean;
  canManageAdmin: boolean;
  onSetCurrentDrawingName: (name: string) => void;
  onChangeDrawingStatus: (status: DrawingStatus) => void;
  onSetCurrentCustomerId: (customerId: string | null) => void;
  onSaveCustomer: (input: {
    name: string;
    primaryContactName: string;
    primaryEmail: string;
    primaryPhone: string;
    siteAddress: string;
    notes: string;
  }) => Promise<{ id: string } | null>;
  onSaveDrawing: () => void;
  onSaveDrawingAsNew: () => void;
  onExportPdf: () => void;
  onStartNewDraft: () => void;
  onGoToLogin: () => void;
  onNavigateDashboard: () => void;
  onNavigateCustomers: () => void;
  onNavigateEstimate: () => void;
  onNavigatePricing: () => void;
  onNavigateAdmin: () => void;
}

export function EditorWorkspaceHeader({
  session,
  customers,
  drawingTitle,
  currentDrawingId,
  currentDrawingName,
  currentCustomerId,
  currentCustomerName,
  isDirty,
  isSavingCustomer,
  isSavingDrawing,
  currentDrawingStatus,
  isChangingStatus,
  canManagePricing,
  canManageAdmin,
  onSetCurrentDrawingName,
  onChangeDrawingStatus,
  onSetCurrentCustomerId,
  onSaveCustomer,
  onSaveDrawing,
  onSaveDrawingAsNew,
  onExportPdf,
  onStartNewDraft,
  onGoToLogin,
  onNavigateDashboard,
  onNavigateCustomers,
  onNavigateEstimate,
  onNavigatePricing,
  onNavigateAdmin
}: EditorWorkspaceHeaderProps) {
  const estimateTitle = currentDrawingId
    ? isDirty
      ? "Save the drawing before opening its estimate."
      : "Open estimate"
    : "Save this drawing first to open its estimate.";
  const workspaceSummary = session
    ? `${session.company.name} workspace. Keep the canvas central and use the surrounding rails only when you need tooling or estimate detail.`
    : "Review the drawing canvas and sign in when you need to save or reopen company work.";
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [newCustomerDraft, setNewCustomerDraft] = useState({
    name: "",
    primaryContactName: "",
    primaryEmail: "",
    primaryPhone: "",
    siteAddress: "",
    notes: ""
  });

  const activeCustomers = useMemo(() => {
    return customers
      .filter((customer) => !customer.isArchived)
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [customers]);

  const handleCreateCustomer = async () => {
    const created = await onSaveCustomer({
      name: newCustomerDraft.name.trim(),
      primaryContactName: newCustomerDraft.primaryContactName.trim(),
      primaryEmail: newCustomerDraft.primaryEmail.trim(),
      primaryPhone: newCustomerDraft.primaryPhone.trim(),
      siteAddress: newCustomerDraft.siteAddress.trim(),
      notes: newCustomerDraft.notes.trim()
    });
    if (!created) {
      return;
    }
    setIsCreatingCustomer(false);
    setNewCustomerDraft({
      name: "",
      primaryContactName: "",
      primaryEmail: "",
      primaryPhone: "",
      siteAddress: "",
      notes: ""
    });
  };

  return (
    <header className="editor-header">
      <div className="portal-topbar editor-workspace-topbar">
        <div className="portal-topbar-main">
          <div className="portal-brand-block">
            <span className="portal-logo">FE</span>
            <div className="portal-brand-copy">
              <strong>{session?.company.name ?? "Fence Estimator"}</strong>
              <span>{session?.user.displayName ?? "Guest workspace"}</span>
            </div>
          </div>
          <nav className="portal-nav-links editor-route-nav" aria-label="Editor navigation">
            <button type="button" onClick={onNavigateDashboard}>
              Dashboard
            </button>
            <button type="button" onClick={onNavigateCustomers}>
              Customers
            </button>
            <button type="button" className="is-active">
              Editor
            </button>
            <button type="button" disabled={!currentDrawingId || isDirty} title={estimateTitle} onClick={onNavigateEstimate}>
              Estimate
            </button>
            {canManagePricing ? (
              <button type="button" onClick={onNavigatePricing}>
                Pricing
              </button>
            ) : null}
            {canManageAdmin ? (
              <button type="button" onClick={onNavigateAdmin}>
                Admin
              </button>
            ) : null}
          </nav>
        </div>
        <div className="portal-topbar-actions">
          {session ? <span className={`editor-save-pill${isDirty ? " dirty" : ""}`}>{isDirty ? "Unsaved changes" : "All changes saved"}</span> : null}
          {session ? <span className="portal-user-chip">{session.user.role}</span> : null}
          {!session ? (
            <button type="button" className="portal-logout-button" onClick={onGoToLogin}>
              Go To Login
            </button>
          ) : null}
        </div>
      </div>

      <div className="editor-header-main">
        <div className="editor-header-copy">
          <span className="portal-section-kicker">Workspace Editor</span>
          <h1>{drawingTitle}</h1>
          <p>{workspaceSummary}</p>
        </div>
        {session ? (
          <div className="editor-document-bar">
            <div className="editor-document-fields">
              <label className="editor-document-name">
                <span>Customer</span>
                <div className="editor-customer-picker">
                  <select
                    value={currentCustomerId ?? ""}
                    title={currentCustomerName || "No customer selected"}
                    onChange={(event) => onSetCurrentCustomerId(event.target.value || null)}
                  >
                    <option value="">Select customer</option>
                    {activeCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="portal-secondary-button"
                    onClick={() => setIsCreatingCustomer((current) => !current)}
                  >
                    {isCreatingCustomer ? "Cancel" : "New Customer"}
                  </button>
                </div>
              </label>
              <label className="editor-document-name">
                <span>Drawing Name</span>
                <input
                  type="text"
                  value={currentDrawingName}
                  placeholder="Name this drawing"
                  onChange={(event) => onSetCurrentDrawingName(event.target.value)}
                />
              </label>
              {currentDrawingId && currentDrawingStatus ? (
                <label className="editor-document-name">
                  <span>Job Status</span>
                  <select
                    value={currentDrawingStatus}
                    disabled={isChangingStatus}
                    onChange={(event) => onChangeDrawingStatus(event.target.value as DrawingStatus)}
                  >
                    {DRAWING_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {JOB_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {isCreatingCustomer ? (
              <div className="editor-customer-create">
                <input
                  type="text"
                  value={newCustomerDraft.name}
                  placeholder="Customer name"
                  onChange={(event) => setNewCustomerDraft((current) => ({ ...current, name: event.target.value }))}
                />
                <input
                  type="text"
                  value={newCustomerDraft.primaryContactName}
                  placeholder="Primary contact"
                  onChange={(event) =>
                    setNewCustomerDraft((current) => ({ ...current, primaryContactName: event.target.value }))
                  }
                />
                <input
                  type="email"
                  value={newCustomerDraft.primaryEmail}
                  placeholder="Email"
                  onChange={(event) => setNewCustomerDraft((current) => ({ ...current, primaryEmail: event.target.value }))}
                />
                <input
                  type="text"
                  value={newCustomerDraft.primaryPhone}
                  placeholder="Phone"
                  onChange={(event) => setNewCustomerDraft((current) => ({ ...current, primaryPhone: event.target.value }))}
                />
                <button
                  type="button"
                  className="portal-primary-button"
                  onClick={() => void handleCreateCustomer()}
                  disabled={isSavingCustomer}
                >
                  {isSavingCustomer ? "Creating..." : "Create Customer"}
                </button>
              </div>
            ) : null}
            <div className="editor-document-actions-compact">
              <button type="button" className="portal-primary-button" onClick={onSaveDrawing} disabled={isSavingDrawing}>
                {currentDrawingId ? "Save" : "Save New"}
              </button>
              <button
                type="button"
                className="portal-secondary-button"
                onClick={onSaveDrawingAsNew}
                disabled={isSavingDrawing}
              >
                Save As
              </button>
              <button type="button" className="portal-secondary-button" onClick={onExportPdf}>
                Export PDF
              </button>
              <button type="button" className="portal-secondary-button" onClick={onStartNewDraft}>
                New Draft
              </button>
            </div>
          </div>
        ) : (
          <div className="editor-document-bar editor-document-bar-guest">
            <button type="button" className="portal-secondary-button" onClick={onExportPdf}>
              Export PDF
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
