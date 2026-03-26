import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AuthSessionEnvelope, CustomerSummary, DrawingStatus } from "@fence-estimator/contracts";
import { DRAWING_STATUSES } from "@fence-estimator/contracts";

const JOB_STATUS_LABELS: Record<DrawingStatus, string> = {
  DRAFT: "Draft",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
  ON_HOLD: "On hold",
};

interface EditorMenuBarProps {
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
  canUndo: boolean;
  canRedo: boolean;
  canDeleteSelection: boolean;
  isItemCountsVisible: boolean;
  isPostKeyVisible: boolean;
  isOptimizationVisible: boolean;
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
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelection: () => void;
  onClearLayout: () => void;
  onToggleItemCounts: () => void;
  onTogglePostKey: () => void;
  onToggleOptimization: () => void;
  onGoToLogin: () => void;
  onNavigateDashboard: () => void;
  onNavigateCustomers: () => void;
  onNavigateEstimate: () => void;
  onNavigatePricing: () => void;
  onNavigateAdmin: () => void;
  canNavigateEstimate: boolean;
  estimateTitle: string;
}

type MenuId = "file" | "edit" | "view" | null;

function useMenuDismiss(onDismiss: () => void, isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onDismiss]);
}

export function EditorMenuBar({
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
  canUndo,
  canRedo,
  canDeleteSelection,
  isItemCountsVisible,
  isPostKeyVisible,
  isOptimizationVisible,
  onSetCurrentDrawingName,
  onChangeDrawingStatus,
  onSetCurrentCustomerId,
  onSaveCustomer,
  onSaveDrawing,
  onSaveDrawingAsNew,
  onExportPdf,
  onStartNewDraft,
  onUndo,
  onRedo,
  onDeleteSelection,
  onClearLayout,
  onToggleItemCounts,
  onTogglePostKey,
  onToggleOptimization,
  onGoToLogin,
  onNavigateDashboard,
  onNavigateCustomers,
  onNavigateEstimate,
  onNavigatePricing,
  onNavigateAdmin,
  canNavigateEstimate,
  estimateTitle
}: EditorMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [newCustomerDraft, setNewCustomerDraft] = useState({
    name: "",
    primaryContactName: "",
    primaryEmail: "",
    primaryPhone: "",
    siteAddress: "",
    notes: ""
  });
  const barRef = useRef<HTMLElement>(null);

  const activeCustomers = useMemo(() => {
    return customers
      .filter((customer) => !customer.isArchived)
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [customers]);

  const closeAll = useCallback(() => {
    setOpenMenu(null);
    setIsCustomerPickerOpen(false);
    setIsCreatingCustomer(false);
  }, []);

  useMenuDismiss(closeAll, openMenu !== null || isCustomerPickerOpen);

  useEffect(() => {
    if (!openMenu && !isCustomerPickerOpen) return;
    function handleClick(event: MouseEvent) {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        closeAll();
      }
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [openMenu, isCustomerPickerOpen, closeAll]);

  function toggleMenu(id: MenuId) {
    setOpenMenu((current) => (current === id ? null : id));
    setIsCustomerPickerOpen(false);
  }

  function menuAction(fn: () => void) {
    fn();
    closeAll();
  }

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleCreateCustomer = async () => {
    const created = await onSaveCustomer({
      name: newCustomerDraft.name.trim(),
      primaryContactName: newCustomerDraft.primaryContactName.trim(),
      primaryEmail: newCustomerDraft.primaryEmail.trim(),
      primaryPhone: newCustomerDraft.primaryPhone.trim(),
      siteAddress: newCustomerDraft.siteAddress.trim(),
      notes: newCustomerDraft.notes.trim()
    });
    if (!created) return;
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
    <header className="menu-bar" ref={barRef}>
      <div className="menu-bar-left">
        <span className="menu-bar-brand">FE</span>

        {/* File Menu */}
        <div className="menu-bar-dropdown">
          <button
            type="button"
            className={`menu-bar-trigger${openMenu === "file" ? " is-open" : ""}`}
            onClick={() => toggleMenu("file")}
          >
            File
          </button>
          {openMenu === "file" ? (
            <div className="menu-bar-panel" role="menu">
              {session ? (
                <>
                  <button type="button" role="menuitem" onClick={() => menuAction(onSaveDrawing)} disabled={isSavingDrawing}>
                    {currentDrawingId ? "Save" : "Save New"}<em>Ctrl+S</em>
                  </button>
                  <button type="button" role="menuitem" onClick={() => menuAction(onSaveDrawingAsNew)} disabled={isSavingDrawing}>
                    Save As…
                  </button>
                  <button type="button" role="menuitem" onClick={() => menuAction(onStartNewDraft)}>
                    New Drawing
                  </button>
                  <div className="menu-bar-divider" />
                </>
              ) : null}
              <button type="button" role="menuitem" onClick={() => menuAction(onExportPdf)}>
                Export PDF
              </button>
              {session ? (
                <>
                  <div className="menu-bar-divider" />
                  <button type="button" role="menuitem" onClick={() => menuAction(onNavigateDashboard)}>
                    Dashboard
                  </button>
                  <button type="button" role="menuitem" onClick={() => menuAction(onNavigateCustomers)}>
                    Customers
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!canNavigateEstimate}
                    title={estimateTitle}
                    onClick={() => menuAction(onNavigateEstimate)}
                  >
                    Estimate
                  </button>
                  {canManagePricing ? (
                    <button type="button" role="menuitem" onClick={() => menuAction(onNavigatePricing)}>
                      Pricing
                    </button>
                  ) : null}
                  {canManageAdmin ? (
                    <button type="button" role="menuitem" onClick={() => menuAction(onNavigateAdmin)}>
                      Admin
                    </button>
                  ) : null}
                </>
              ) : null}
              {!session ? (
                <button type="button" role="menuitem" onClick={() => menuAction(onGoToLogin)}>
                  Sign In
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Edit Menu */}
        <div className="menu-bar-dropdown">
          <button
            type="button"
            className={`menu-bar-trigger${openMenu === "edit" ? " is-open" : ""}`}
            onClick={() => toggleMenu("edit")}
          >
            Edit
          </button>
          {openMenu === "edit" ? (
            <div className="menu-bar-panel" role="menu">
              <button type="button" role="menuitem" disabled={!canUndo} onClick={() => menuAction(onUndo)}>
                Undo<em>Ctrl+Z</em>
              </button>
              <button type="button" role="menuitem" disabled={!canRedo} onClick={() => menuAction(onRedo)}>
                Redo<em>Ctrl+Y</em>
              </button>
              <div className="menu-bar-divider" />
              <button type="button" role="menuitem" disabled={!canDeleteSelection} onClick={() => menuAction(onDeleteSelection)}>
                Delete Selection<em>Del</em>
              </button>
              <button type="button" role="menuitem" className="menu-item-danger" onClick={() => menuAction(onClearLayout)}>
                Clear All
              </button>
            </div>
          ) : null}
        </div>

        {/* View Menu */}
        <div className="menu-bar-dropdown">
          <button
            type="button"
            className={`menu-bar-trigger${openMenu === "view" ? " is-open" : ""}`}
            onClick={() => toggleMenu("view")}
          >
            View
          </button>
          {openMenu === "view" ? (
            <div className="menu-bar-panel" role="menu">
              <button type="button" role="menuitem" onClick={() => menuAction(onToggleItemCounts)}>
                {isItemCountsVisible ? "✓ " : ""}Item Counts
              </button>
              <button type="button" role="menuitem" onClick={() => menuAction(onTogglePostKey)}>
                {isPostKeyVisible ? "✓ " : ""}Post Key
              </button>
              <button type="button" role="menuitem" onClick={() => menuAction(onToggleOptimization)}>
                {isOptimizationVisible ? "✓ " : ""}Layout Planner
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="menu-bar-center">
        {isEditingName ? (
          <input
            ref={nameInputRef}
            className="menu-bar-name-input"
            type="text"
            value={currentDrawingName}
            placeholder="Name this drawing"
            onChange={(event) => onSetCurrentDrawingName(event.target.value)}
            onBlur={() => setIsEditingName(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") {
                setIsEditingName(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="menu-bar-drawing-name"
            onClick={() => {
              if (session) setIsEditingName(true);
            }}
            title={session ? "Click to rename" : drawingTitle}
          >
            {drawingTitle}
          </button>
        )}

        {session ? (
          <div className="menu-bar-customer-wrap">
            <button
              type="button"
              className="menu-bar-customer-label"
              onClick={() => {
                setIsCustomerPickerOpen((current) => !current);
                setOpenMenu(null);
              }}
              title={currentCustomerName || "Select customer"}
            >
              {currentCustomerName || "No customer"}
            </button>
            {isCustomerPickerOpen ? (
              <div className="menu-bar-customer-popover">
                <select
                  value={currentCustomerId ?? ""}
                  onChange={(event) => {
                    onSetCurrentCustomerId(event.target.value || null);
                    setIsCustomerPickerOpen(false);
                  }}
                >
                  <option value="">No customer</option>
                  {activeCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="menu-bar-btn-sm"
                  onClick={() => setIsCreatingCustomer((current) => !current)}
                >
                  {isCreatingCustomer ? "Cancel" : "+ New"}
                </button>
                {isCreatingCustomer ? (
                  <div className="menu-bar-new-customer">
                    <input
                      type="text"
                      value={newCustomerDraft.name}
                      placeholder="Customer name"
                      onChange={(event) =>
                        setNewCustomerDraft((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                    <input
                      type="text"
                      value={newCustomerDraft.primaryContactName}
                      placeholder="Contact"
                      onChange={(event) =>
                        setNewCustomerDraft((current) => ({
                          ...current,
                          primaryContactName: event.target.value
                        }))
                      }
                    />
                    <input
                      type="email"
                      value={newCustomerDraft.primaryEmail}
                      placeholder="Email"
                      onChange={(event) =>
                        setNewCustomerDraft((current) => ({ ...current, primaryEmail: event.target.value }))
                      }
                    />
                    <input
                      type="text"
                      value={newCustomerDraft.primaryPhone}
                      placeholder="Phone"
                      onChange={(event) =>
                        setNewCustomerDraft((current) => ({
                          ...current,
                          primaryPhone: event.target.value
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="menu-bar-btn-sm menu-bar-btn-primary"
                      onClick={() => void handleCreateCustomer()}
                      disabled={isSavingCustomer}
                    >
                      {isSavingCustomer ? "…" : "Create"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {currentDrawingId && currentDrawingStatus && session ? (
          <select
            className="menu-bar-status-select"
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
        ) : null}
      </div>

      <div className="menu-bar-right">
        {session ? (
          <span className={`menu-bar-save-pill${isDirty ? " dirty" : ""}`}>
            {isDirty ? "Unsaved" : "Saved"}
          </span>
        ) : null}
        {session ? (
          <span className="menu-bar-user">{session.user.displayName}</span>
        ) : (
          <button type="button" className="menu-bar-btn-sm" onClick={onGoToLogin}>
            Sign In
          </button>
        )}
      </div>
    </header>
  );
}
