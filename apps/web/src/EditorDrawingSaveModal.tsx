import { useEffect, useMemo, useState } from "react";

import type { CustomerSummary } from "@fence-estimator/contracts";

interface EditorDrawingSaveModalProps {
  isOpen: boolean;
  mode: "create" | "saveAs";
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
  mode,
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

    setNameDraft(mode === "saveAs" ? buildCopyName(currentDrawingName) : currentDrawingName.trim());
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
  }, [currentDrawingName, initialCustomerId, isOpen, mode]);

  if (!isOpen) {
    return null;
  }

  const isCreateMode = mode === "create";

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
      <div className="editor-drawing-modal optimization-modal" role="dialog" aria-modal="true" aria-labelledby="editor-drawing-modal-title">
        <div className="editor-drawing-modal-head">
          <div>
            <h2 id="editor-drawing-modal-title">{isCreateMode ? "Create Drawing" : "Save Drawing As"}</h2>
            <p>
              {isCreateMode
                ? "Choose the customer and name before this drawing can be edited."
                : "Save a copy to an explicit customer and name. The current drawing stays unchanged until the copy is created."}
            </p>
          </div>
          {!isCreateMode ? (
            <button type="button" className="portal-secondary-button" onClick={onClose}>
              Cancel
            </button>
          ) : null}
        </div>

        {validationMessage ? <div className="portal-inline-message portal-inline-error">{validationMessage}</div> : null}

        <div className="editor-drawing-modal-grid">
          <label className="portal-field">
            <span>Drawing name</span>
            <input
              type="text"
              value={nameDraft}
              placeholder="Perimeter plan"
              onChange={(event) => setNameDraft(event.target.value)}
            />
          </label>

          <label className="portal-field">
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
            className="portal-text-button"
            onClick={() => {
              setValidationMessage(null);
              setIsCreatingCustomer((current) => !current);
            }}
          >
            {isCreatingCustomer ? "Hide new customer fields" : "Create customer"}
          </button>
        </div>

        {isCreatingCustomer ? (
          <div className="editor-drawing-modal-customer-grid">
            <label className="portal-field">
              <span>Customer name</span>
              <input
                type="text"
                value={newCustomerDraft.name}
                onChange={(event) => setNewCustomerDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="portal-field">
              <span>Contact</span>
              <input
                type="text"
                value={newCustomerDraft.primaryContactName}
                onChange={(event) =>
                  setNewCustomerDraft((current) => ({ ...current, primaryContactName: event.target.value }))
                }
              />
            </label>
            <label className="portal-field">
              <span>Email</span>
              <input
                type="email"
                value={newCustomerDraft.primaryEmail}
                onChange={(event) => setNewCustomerDraft((current) => ({ ...current, primaryEmail: event.target.value }))}
              />
            </label>
            <label className="portal-field">
              <span>Phone</span>
              <input
                type="text"
                value={newCustomerDraft.primaryPhone}
                onChange={(event) => setNewCustomerDraft((current) => ({ ...current, primaryPhone: event.target.value }))}
              />
            </label>
            <label className="portal-field editor-drawing-modal-customer-span">
              <span>Site address</span>
              <input
                type="text"
                value={newCustomerDraft.siteAddress}
                onChange={(event) => setNewCustomerDraft((current) => ({ ...current, siteAddress: event.target.value }))}
              />
            </label>
            <label className="portal-field editor-drawing-modal-customer-span">
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
                className="portal-secondary-button"
                onClick={() => void handleCreateCustomer()}
                disabled={isSavingCustomer}
              >
                {isSavingCustomer ? "Creating..." : "Create customer"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="editor-drawing-modal-footer">
          {!isCreateMode ? (
            <button type="button" className="portal-secondary-button" onClick={onClose}>
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className="portal-primary-button"
            onClick={() => void handleSubmit()}
            disabled={isSavingDrawing}
          >
            {isSavingDrawing ? "Saving..." : isCreateMode ? "Create drawing" : "Save copy"}
          </button>
        </div>
      </div>
    </div>
  );
}