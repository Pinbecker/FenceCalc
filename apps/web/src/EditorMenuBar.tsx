import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthSessionEnvelope, DrawingStatus } from "@fence-estimator/contracts";
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
  drawingTitle: string;
  currentDrawingId: string | null;
  currentJobId: string | null;
  currentCustomerId: string | null;
  currentDrawingName: string;
  currentCustomerName: string;
  isDirty: boolean;
  isSavingDrawing: boolean;
  currentDrawingStatus: DrawingStatus | null;
  isReadOnly?: boolean;
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
  onSaveDrawing: () => void;
  onOpenSaveAs: () => void;
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
  onNavigateJob: () => void;
  onNavigateCurrentCustomer: () => void;
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
  drawingTitle,
  currentDrawingId,
  currentJobId,
  currentCustomerId,
  currentDrawingName,
  currentCustomerName,
  isDirty,
  isSavingDrawing,
  currentDrawingStatus,
  isReadOnly = false,
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
  onSaveDrawing,
  onOpenSaveAs,
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
  onNavigateJob,
  onNavigateCurrentCustomer,
  onNavigateCustomers,
  onNavigateEstimate,
  onNavigatePricing,
  onNavigateAdmin,
  canNavigateEstimate,
  estimateTitle
}: EditorMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const readOnlyTitle = "Quoted drawings open in view-only mode. Create a new revision from the job page to continue.";

  const closeAll = useCallback(() => {
    setOpenMenu(null);
  }, []);

  useMenuDismiss(closeAll, openMenu !== null);

  useEffect(() => {
    if (!openMenu) return;
    function handleClick(event: MouseEvent) {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        closeAll();
      }
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [openMenu, closeAll]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  useEffect(() => {
    if (isReadOnly) {
      setIsEditingName(false);
    }
  }, [isReadOnly]);

  function toggleMenu(id: MenuId) {
    setOpenMenu((current) => (current === id ? null : id));
  }

  function menuAction(fn: () => void) {
    fn();
    closeAll();
  }

  return (
    <header className="menu-bar" ref={barRef}>
      <div className="menu-bar-left">
        <span className="menu-bar-brand">FE</span>

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
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => menuAction(onSaveDrawing)}
                    disabled={isSavingDrawing || !currentDrawingId || isReadOnly}
                    title={isReadOnly ? readOnlyTitle : undefined}
                  >
                    Save<em>Ctrl+S</em>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => menuAction(onOpenSaveAs)}
                    disabled={isSavingDrawing || !currentDrawingId || isReadOnly}
                    title={isReadOnly ? readOnlyTitle : undefined}
                  >
                    Save As...
                  </button>
                  <button type="button" role="menuitem" onClick={() => menuAction(onStartNewDraft)}>
                    New Drawing...
                  </button>
                  <div className="menu-bar-divider" />
                </>
              ) : null}
              <button type="button" role="menuitem" onClick={() => menuAction(onExportPdf)}>
                Export PDF
              </button>
              {!session ? (
                <>
                  <div className="menu-bar-divider" />
                  <button type="button" role="menuitem" onClick={() => menuAction(onGoToLogin)}>
                    Sign In
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

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
              <button type="button" role="menuitem" disabled={!canUndo || isReadOnly} onClick={() => menuAction(onUndo)} title={isReadOnly ? readOnlyTitle : undefined}>
                Undo<em>Ctrl+Z</em>
              </button>
              <button type="button" role="menuitem" disabled={!canRedo || isReadOnly} onClick={() => menuAction(onRedo)} title={isReadOnly ? readOnlyTitle : undefined}>
                Redo<em>Ctrl+Y</em>
              </button>
              <div className="menu-bar-divider" />
              <button type="button" role="menuitem" disabled={!canDeleteSelection || isReadOnly} onClick={() => menuAction(onDeleteSelection)} title={isReadOnly ? readOnlyTitle : undefined}>
                Delete Selection<em>Del</em>
              </button>
              <button type="button" role="menuitem" className="menu-item-danger" disabled={isReadOnly} title={isReadOnly ? readOnlyTitle : undefined} onClick={() => menuAction(onClearLayout)}>
                Clear All
              </button>
            </div>
          ) : null}
        </div>

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
        {isEditingName && !isReadOnly ? (
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
              if (session && currentDrawingId && !isReadOnly) setIsEditingName(true);
            }}
            title={isReadOnly ? readOnlyTitle : session && currentDrawingId ? "Click to rename" : drawingTitle}
          >
            {drawingTitle}
          </button>
        )}

        {session ? (
          <div className="menu-bar-customer-wrap">
            {currentJobId ? (
              <button
                type="button"
                className="menu-bar-customer-label menu-bar-customer-link"
                onClick={onNavigateJob}
                title="Back to job"
              >
                ← Back to job
              </button>
            ) : null}
            {currentCustomerId ? (
              <button
                type="button"
                className="menu-bar-customer-label menu-bar-customer-link"
                onClick={onNavigateCurrentCustomer}
                title={`Open ${currentCustomerName || "customer"} page`}
              >
                {currentCustomerName || "No customer selected"}
              </button>
            ) : (
              <span className="menu-bar-customer-label" title={currentCustomerName || "Create drawing to select customer"}>
                {currentCustomerName || "No customer selected"}
              </span>
            )}
          </div>
        ) : null}

        {currentDrawingId && currentDrawingStatus && session ? (
          isReadOnly ? (
            <span className="menu-bar-status-badge is-read-only" title={readOnlyTitle}>
              {JOB_STATUS_LABELS[currentDrawingStatus]} · View only
            </span>
          ) : (
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
          )
        ) : null}
      </div>

      <div className="menu-bar-right">
        {session ? (
          <nav className="menu-bar-nav" aria-label="Editor navigation">
            <button type="button" className="menu-bar-nav-button" onClick={onNavigateDashboard}>
              Dashboard
            </button>
            <button type="button" className="menu-bar-nav-button" onClick={onNavigateCustomers}>
              Customers
            </button>
            <button
              type="button"
              className="menu-bar-nav-button"
              disabled={!canNavigateEstimate}
              title={estimateTitle}
              onClick={onNavigateEstimate}
            >
              Estimate
            </button>
            {canManagePricing ? (
              <button type="button" className="menu-bar-nav-button" onClick={onNavigatePricing}>
                Pricing
              </button>
            ) : null}
            {canManageAdmin ? (
              <button type="button" className="menu-bar-nav-button" onClick={onNavigateAdmin}>
                Admin
              </button>
            ) : null}
          </nav>
        ) : null}
        {session ? (
          <span className={`menu-bar-save-pill${isDirty ? " dirty" : ""}${isReadOnly ? " is-read-only" : ""}`}>
            {isReadOnly ? "View only" : isDirty ? "Unsaved" : "Saved"}
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
