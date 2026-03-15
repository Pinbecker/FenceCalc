import type { AuthSessionEnvelope } from "@fence-estimator/contracts";

interface EditorWorkspaceHeaderProps {
  session: AuthSessionEnvelope | null;
  drawingTitle: string;
  currentDrawingId: string | null;
  currentDrawingName: string;
  currentCustomerName: string;
  isDirty: boolean;
  isSavingDrawing: boolean;
  canManagePricing: boolean;
  canManageAdmin: boolean;
  onSetCurrentDrawingName: (name: string) => void;
  onSetCurrentCustomerName: (name: string) => void;
  onSaveDrawing: () => void;
  onSaveDrawingAsNew: () => void;
  onStartNewDraft: () => void;
  onGoToLogin: () => void;
  onNavigateDashboard: () => void;
  onNavigateDrawings: () => void;
  onNavigateEstimate: () => void;
  onNavigatePricing: () => void;
  onNavigateAdmin: () => void;
}

export function EditorWorkspaceHeader({
  session,
  drawingTitle,
  currentDrawingId,
  currentDrawingName,
  currentCustomerName,
  isDirty,
  isSavingDrawing,
  canManagePricing,
  canManageAdmin,
  onSetCurrentDrawingName,
  onSetCurrentCustomerName,
  onSaveDrawing,
  onSaveDrawingAsNew,
  onStartNewDraft,
  onGoToLogin,
  onNavigateDashboard,
  onNavigateDrawings,
  onNavigateEstimate,
  onNavigatePricing,
  onNavigateAdmin
}: EditorWorkspaceHeaderProps) {
  const estimateTitle = currentDrawingId
    ? isDirty
      ? "Save the drawing before opening its estimate."
      : "Open estimate"
    : "Save this drawing first to open its estimate.";

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
                <input
                  type="text"
                  value={currentCustomerName}
                  placeholder="Customer name"
                  onChange={(event) => onSetCurrentCustomerName(event.target.value)}
                />
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
            <div className="editor-document-actions-compact">
              <button type="button" onClick={onSaveDrawing} disabled={isSavingDrawing}>
                {currentDrawingId ? "Save" : "Save New"}
              </button>
              <button type="button" className="ghost" onClick={onSaveDrawingAsNew} disabled={isSavingDrawing}>
                Save As
              </button>
              <button type="button" className="ghost" onClick={onStartNewDraft}>
                New Draft
              </button>
            </div>
          </div>
        ) : (
          <div className="editor-document-bar">
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
          <button type="button" className="ghost editor-link-btn" onClick={onNavigateDrawings}>
            Drawings
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
