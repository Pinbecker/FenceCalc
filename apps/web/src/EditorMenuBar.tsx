import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthSessionEnvelope } from "@fence-estimator/contracts";

interface EditorMenuBarProps {
  session: AuthSessionEnvelope | null;
  drawingTitle: string;
  currentDrawingId: string | null;
  currentWorkspaceId: string | null;
  currentCustomerId: string | null;
  currentDrawingName: string;
  currentCustomerName: string;
  isDirty: boolean;
  isSavingDrawing: boolean;
  isReadOnly?: boolean;
  canManagePricing: boolean;
  canManageAdmin: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canDeleteSelection: boolean;
  isItemCountsVisible: boolean;
  isPostKeyVisible: boolean;
  isOptimizationVisible: boolean;
  isGridVisible: boolean;
  isSnapDisabled: boolean;
  integrityIssueCount: number;
  canFitView: boolean;
  onSetCurrentDrawingName: (name: string) => void;
  onSaveDrawing: () => void;
  onOpenSaveAs: () => void;
  onExportPdf: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelection: () => void;
  onClearLayout: () => void;
  onFitView: () => void;
  onResetView: () => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onToggleItemCounts: () => void;
  onTogglePostKey: () => void;
  onToggleOptimization: () => void;
  onGoToLogin: () => void;
  onNavigateDashboard: () => void;
  onNavigateWorkspace: () => void;
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
    if (!isOpen) {
      return;
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onDismiss]);
}

export function EditorMenuBar({
  session,
  drawingTitle,
  currentDrawingId,
  currentWorkspaceId,
  currentCustomerId,
  currentDrawingName,
  currentCustomerName,
  isDirty,
  isSavingDrawing,
  isReadOnly = false,
  canManagePricing,
  canManageAdmin,
  canUndo,
  canRedo,
  canDeleteSelection,
  isItemCountsVisible,
  isPostKeyVisible,
  isOptimizationVisible,
  isGridVisible,
  isSnapDisabled,
  integrityIssueCount,
  canFitView,
  onSetCurrentDrawingName,
  onSaveDrawing,
  onOpenSaveAs,
  onExportPdf,
  onUndo,
  onRedo,
  onDeleteSelection,
  onClearLayout,
  onFitView,
  onResetView,
  onToggleGrid,
  onToggleSnap,
  onToggleItemCounts,
  onTogglePostKey,
  onToggleOptimization,
  onGoToLogin,
  onNavigateDashboard,
  onNavigateWorkspace,
  onNavigateCurrentCustomer,
  onNavigateCustomers,
  onNavigateEstimate,
  onNavigatePricing,
  onNavigateAdmin,
  canNavigateEstimate,
  estimateTitle,
}: EditorMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const readOnlyTitle =
    "Historical and ready design revisions open in view-only mode. Start a new revision from the design workspace to continue.";

  const closeAll = useCallback(() => {
    setOpenMenu(null);
  }, []);

  useMenuDismiss(closeAll, openMenu !== null);

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    function handleClick(event: MouseEvent) {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        closeAll();
      }
    }

    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [closeAll, openMenu]);

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
                    disabled={
                      isSavingDrawing || !currentDrawingId || isReadOnly || integrityIssueCount > 0
                    }
                    title={isReadOnly ? readOnlyTitle : undefined}
                  >
                    Save<em>Ctrl+S</em>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => menuAction(onOpenSaveAs)}
                    disabled={
                      isSavingDrawing || !currentDrawingId || isReadOnly || integrityIssueCount > 0
                    }
                    title={isReadOnly ? readOnlyTitle : undefined}
                  >
                    Save As...
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
              <button
                type="button"
                role="menuitem"
                disabled={!canUndo || isReadOnly}
                onClick={() => menuAction(onUndo)}
                title={isReadOnly ? readOnlyTitle : undefined}
              >
                Undo<em>Ctrl+Z</em>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canRedo || isReadOnly}
                onClick={() => menuAction(onRedo)}
                title={isReadOnly ? readOnlyTitle : undefined}
              >
                Redo<em>Ctrl+Y</em>
              </button>
              <div className="menu-bar-divider" />
              <button
                type="button"
                role="menuitem"
                disabled={!canDeleteSelection || isReadOnly}
                onClick={() => menuAction(onDeleteSelection)}
                title={isReadOnly ? readOnlyTitle : undefined}
              >
                Delete Selection<em>Del</em>
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu-item-danger"
                disabled={isReadOnly}
                title={isReadOnly ? readOnlyTitle : undefined}
                onClick={() => menuAction(onClearLayout)}
              >
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
              <button
                type="button"
                role="menuitem"
                disabled={!canFitView}
                onClick={() => menuAction(onFitView)}
              >
                Fit to Drawing
              </button>
              <button type="button" role="menuitem" onClick={() => menuAction(onResetView)}>
                Reset View
              </button>
              <div className="menu-bar-divider" />
              <button type="button" role="menuitem" onClick={() => menuAction(onToggleSnap)}>
                Snap {isSnapDisabled ? "Off" : "On"}
              </button>
              <button type="button" role="menuitem" onClick={() => menuAction(onToggleGrid)}>
                Grid {isGridVisible ? "On" : "Off"}
              </button>
              <button type="button" role="menuitem" onClick={() => menuAction(onToggleItemCounts)}>
                Item Counts {isItemCountsVisible ? "On" : "Off"}
              </button>
              <button type="button" role="menuitem" onClick={() => menuAction(onTogglePostKey)}>
                Post Key {isPostKeyVisible ? "On" : "Off"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => menuAction(onToggleOptimization)}
              >
                Panel Cut Plan {isOptimizationVisible ? "Open" : "Closed"}
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
              if (session && currentDrawingId && !isReadOnly) {
                setIsEditingName(true);
              }
            }}
            title={
              isReadOnly
                ? readOnlyTitle
                : session && currentDrawingId
                  ? "Click to rename"
                  : drawingTitle
            }
          >
            {drawingTitle}
          </button>
        )}

        {session ? (
          <div className="menu-bar-customer-wrap">
            {currentWorkspaceId ? (
              <button
                type="button"
                className="menu-bar-customer-label menu-bar-customer-link"
                onClick={onNavigateWorkspace}
                title="Back to drawing workspace"
              >
                Back to workspace
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
              <span
                className="menu-bar-customer-label"
                title={currentCustomerName || "Open a workspace drawing to select customer"}
              >
                {currentCustomerName || "No customer selected"}
              </span>
            )}
          </div>
        ) : null}

        <div className="menu-bar-quick" aria-label="Editor view controls">
          <button
            type="button"
            className="menu-bar-quick-button"
            onClick={onFitView}
            disabled={!canFitView}
            title={canFitView ? "Fit the drawing into view" : "Add some fence runs to fit the view"}
          >
            Fit
          </button>
          <button
            type="button"
            className="menu-bar-quick-button"
            onClick={onResetView}
            title="Reset the view to the default framing"
          >
            Reset
          </button>
          <button
            type="button"
            className={`menu-bar-quick-button${isSnapDisabled ? "" : " is-active"}`}
            onClick={onToggleSnap}
            title={isSnapDisabled ? "Turn snapping back on" : "Turn snapping off"}
          >
            Snap {isSnapDisabled ? "Off" : "On"}
          </button>
          <button
            type="button"
            className={`menu-bar-quick-button${isGridVisible ? " is-active" : ""}`}
            onClick={onToggleGrid}
            title={isGridVisible ? "Hide the canvas grid" : "Show the canvas grid"}
          >
            Grid
          </button>
          <button
            type="button"
            className={`menu-bar-quick-button${isOptimizationVisible ? " is-active" : ""}`}
            onClick={onToggleOptimization}
            disabled={!canFitView}
            title={canFitView ? "Open the production panel cut plan" : "Add fence runs first"}
          >
            Cuts
          </button>
        </div>
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
              Estimates
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
          <span
            className={`menu-bar-save-pill${isDirty ? " dirty" : ""}${isReadOnly ? " is-read-only" : ""}${integrityIssueCount > 0 ? " is-invalid" : ""}`}
            title={
              integrityIssueCount > 0
                ? `${integrityIssueCount} drawing integrity issue${integrityIssueCount === 1 ? "" : "s"}`
                : undefined
            }
          >
            {isReadOnly
              ? "View only"
              : integrityIssueCount > 0
                ? "Needs attention"
                : isDirty
                  ? "Unsaved"
                  : "Saved"}
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
