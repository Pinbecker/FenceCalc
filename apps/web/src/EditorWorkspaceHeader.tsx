import { useEffect, useMemo, useState } from "react";

import type { AuthSessionEnvelope, CustomerSummary } from "@fence-estimator/contracts";

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
  canManagePricing: boolean;
  canManageAdmin: boolean;
  onSetCurrentDrawingName: (name: string) => void;
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
  canManagePricing,
  canManageAdmin,
  onSetCurrentDrawingName,
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
  const [customerSearch, setCustomerSearch] = useState(currentCustomerName);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [newCustomerDraft, setNewCustomerDraft] = useState({
    name: "",
    primaryContactName: "",
    primaryEmail: "",
    primaryPhone: "",
    siteAddress: "",
    notes: ""
  });

  useEffect(() => {
    setCustomerSearch(currentCustomerName);
  }, [currentCustomerName]);

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = customerSearch.trim().toLowerCase();
    return customers
      .filter((customer) => !customer.isArchived)
      .filter((customer) => normalizedSearch.length === 0 || customer.name.toLowerCase().includes(normalizedSearch))
      .slice(0, 8);
  }, [customerSearch, customers]);

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
      <div className="editor-header-main">
        <div className="editor-header-copy">
          <span className="portal-eyebrow">Workspace Editor</span>
          <h1>{drawingTitle}</h1>
          <p>
            {session
              ? `${session.company.name} workspace. Keep the canvas central and use the surrounding rails only when you need tooling or estimate detail.`
              : "Review the drawing canvas and sign in when you need to save or reopen company work."}
          </p>
        </div>
        {session ? (
          <div className="editor-document-bar">
            <div className="editor-document-fields">
              <label className="editor-document-name">
                <span>Customer</span>
                <div className="editor-customer-picker">
                  <input
                    type="text"
                    value={customerSearch}
                    placeholder="Search customers"
                    onChange={(event) => setCustomerSearch(event.target.value)}
                  />
                  <select
                    value={currentCustomerId ?? ""}
                    onChange={(event) => onSetCurrentCustomerId(event.target.value || null)}
                  >
                    <option value="">Select customer</option>
                    {filteredCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="ghost" onClick={() => setIsCreatingCustomer((current) => !current)}>
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
                <button type="button" onClick={() => void handleCreateCustomer()} disabled={isSavingCustomer}>
                  {isSavingCustomer ? "Creating..." : "Create Customer"}
                </button>
              </div>
            ) : null}
            <div className="editor-document-actions-compact">
              <button type="button" onClick={onSaveDrawing} disabled={isSavingDrawing}>
                {currentDrawingId ? "Save" : "Save New"}
              </button>
              <button type="button" className="ghost" onClick={onSaveDrawingAsNew} disabled={isSavingDrawing}>
                Save As
              </button>
              <button type="button" className="ghost" onClick={onExportPdf}>
                Export PDF
              </button>
              <button type="button" className="ghost" onClick={onStartNewDraft}>
                New Draft
              </button>
            </div>
          </div>
        ) : (
          <div className="editor-document-bar">
            <button type="button" className="ghost" onClick={onExportPdf}>
              Export PDF
            </button>
            <button type="button" onClick={onGoToLogin}>
              Go To Login
            </button>
          </div>
        )}
      </div>
      <div className="editor-header-meta">
        {session ? (
          <>
            <span className="editor-session-chip">{session.user.displayName}</span>
            <span className="portal-user-chip">{session.user.role}</span>
            <span className={`editor-save-pill${isDirty ? " dirty" : ""}`}>{isDirty ? "Unsaved changes" : "All changes saved"}</span>
          </>
        ) : null}
        <nav className="editor-route-nav" aria-label="Editor navigation">
          <button type="button" className="ghost editor-link-btn" onClick={onNavigateDashboard}>
            Dashboard
          </button>
          <button type="button" className="ghost editor-link-btn" onClick={onNavigateCustomers}>
            Customers
          </button>
          <button
            type="button"
            className="ghost editor-link-btn"
            disabled={!currentDrawingId || isDirty}
            title={estimateTitle}
            onClick={onNavigateEstimate}
          >
            Estimate
          </button>
          {canManagePricing ? (
            <button type="button" className="ghost editor-link-btn" onClick={onNavigatePricing}>
              Pricing
            </button>
          ) : null}
          {canManageAdmin ? (
            <button type="button" className="ghost editor-link-btn" onClick={onNavigateAdmin}>
              Admin
            </button>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
