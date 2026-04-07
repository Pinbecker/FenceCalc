import { useEffect, useMemo, useState } from "react";

import type { CustomerSummary } from "@fence-estimator/contracts";

interface EditorDrawingSaveModalProps {
  isOpen: boolean;
  customers: CustomerSummary[];
  currentDrawingName: string;
  initialCustomerId: string | null;
  isSavingDrawing: boolean;
  isSavingCustomer: boolean;
  onClose: () => void;
  onCreateCustomer: (input: {
    name: string;
    primaryContactName: string;
    primaryEmail: string;
    primaryPhone: string;
    siteAddress: string;
    notes: string;
  }) => Promise<{ id: string } | null>;
  onSubmit: (input: { name: string; customerId: string }) => Promise<boolean>;
}

function buildCopyName(name: string): string {
  const trimmed = name.trim();
  return trimmed ? `${trimmed} Copy` : "Untitled drawing copy";
}

export function EditorDrawingSaveModal({
  isOpen,
  customers,
  currentDrawingName,
  initialCustomerId,
  isSavingDrawing,
  isSavingCustomer,
  onClose,
  onCreateCustomer,
  onSubmit
}: EditorDrawingSaveModalProps) {
  const [nameDraft, setNameDraft] = useState("");
  const [customerIdDraft, setCustomerIdDraft] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setNameDraft(buildCopyName(currentDrawingName));
    setCustomerIdDraft(initialCustomerId ?? "");
    setValidationMessage(null);
    setIsCreatingCustomer(false);
    setNewCustomerDraft({
      name: "",
      primaryContactName: "",
      primaryEmail: "",
      primaryPhone: "",
      siteAddress: "",
      notes: ""
    });
  }, [currentDrawingName, initialCustomerId, isOpen]);

  if (!isOpen) {
    return null;
  }

  async function handleCreateCustomer() {
    if (!newCustomerDraft.name.trim()) {
      setValidationMessage("Enter a customer name before creating a new customer.");
      return;
    }

    setValidationMessage(null);
    const created = await onCreateCustomer({
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

    setCustomerIdDraft(created.id);
    setIsCreatingCustomer(false);
    setNewCustomerDraft({
      name: "",
      primaryContactName: "",
      primaryEmail: "",
      primaryPhone: "",
      siteAddress: "",
      notes: ""
    });
  }

  async function handleSubmit() {
    const trimmedName = nameDraft.trim();
    if (!trimmedName) {
      setValidationMessage("Enter a drawing name.");
      return;
    }
    if (!customerIdDraft) {
      setValidationMessage("Select a customer.");
      return;
    }

    setValidationMessage(null);
    const didSave = await onSubmit({ name: trimmedName, customerId: customerIdDraft });
    if (didSave) {
      onClose();
    }
  }

  return (
    <div className="editor-drawing-modal-backdrop" role="presentation">
      <div className="editor-drawing-modal" role="dialog" aria-modal="true" aria-labelledby="editor-drawing-modal-title">
        <div className="editor-drawing-modal-head">
          <div>
            <h2 id="editor-drawing-modal-title">Save Drawing As</h2>
            <p>Save a copy with a new name or customer.</p>
          </div>
          <button type="button" className="editor-drawing-modal-btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>

        {validationMessage ? <div className="editor-drawing-modal-validation">{validationMessage}</div> : null}

        <div className="editor-drawing-modal-grid">
          <label className="editor-drawing-modal-field">
            <span>Drawing name</span>
            <input
              type="text"
              value={nameDraft}
              placeholder="Perimeter plan"
              onChange={(event) => setNameDraft(event.target.value)}
            />
          </label>

          <label className="editor-drawing-modal-field">
            <span>Customer</span>
            <select value={customerIdDraft} onChange={(event) => setCustomerIdDraft(event.target.value)}>
              <option value="">Select customer</option>
              {activeCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="editor-drawing-modal-actions">
          <button
            type="button"
            className="editor-drawing-modal-toggle-btn"
            onClick={() => {
              setValidationMessage(null);
              setIsCreatingCustomer((current) => !current);
            }}
          >
            {isCreatingCustomer ? "− Hide new customer" : "+ New customer"}
          </button>
        </div>

        {isCreatingCustomer ? (
          <div className="editor-drawing-modal-customer-grid">
            <label className="editor-drawing-modal-field">
              <span>Customer name</span>
              <input
                type="text"
                value={newCustomerDraft.name}
                onChange={(event) => setNewCustomerDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="editor-drawing-modal-field">
              <span>Contact</span>
              <input
                type="text"
                value={newCustomerDraft.primaryContactName}
                onChange={(event) =>
                  setNewCustomerDraft((current) => ({ ...current, primaryContactName: event.target.value }))
                }
              />
            </label>
            <label className="editor-drawing-modal-field">
              <span>Email</span>
              <input
                type="email"
                value={newCustomerDraft.primaryEmail}
                onChange={(event) => setNewCustomerDraft((current) => ({ ...current, primaryEmail: event.target.value }))}
              />
            </label>
            <label className="editor-drawing-modal-field">
              <span>Phone</span>
              <input
                type="text"
                value={newCustomerDraft.primaryPhone}
                onChange={(event) => setNewCustomerDraft((current) => ({ ...current, primaryPhone: event.target.value }))}
              />
            </label>
            <label className="editor-drawing-modal-field editor-drawing-modal-customer-span">
              <span>Site address</span>
              <input
                type="text"
                value={newCustomerDraft.siteAddress}
                onChange={(event) => setNewCustomerDraft((current) => ({ ...current, siteAddress: event.target.value }))}
              />
            </label>
            <label className="editor-drawing-modal-field editor-drawing-modal-customer-span">
              <span>Notes</span>
              <input
                type="text"
                value={newCustomerDraft.notes}
                onChange={(event) => setNewCustomerDraft((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
            <div className="editor-drawing-modal-inline-actions">
              <button
                type="button"
                className="editor-drawing-modal-btn-secondary"
                onClick={() => void handleCreateCustomer()}
                disabled={isSavingCustomer}
              >
                {isSavingCustomer ? "Creating..." : "Create customer"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="editor-drawing-modal-footer">
          <button type="button" className="editor-drawing-modal-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="editor-drawing-modal-btn-primary"
            onClick={() => void handleSubmit()}
            disabled={isSavingDrawing}
          >
            {isSavingDrawing ? "Saving..." : "Save copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
