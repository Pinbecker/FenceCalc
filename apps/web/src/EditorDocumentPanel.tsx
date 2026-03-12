import type { WorkspacePersistenceState } from "./useWorkspacePersistence";

interface EditorDocumentPanelProps {
  workspace: WorkspacePersistenceState;
  onOpenDrawings(this: void): void;
  onStartNewDraft(this: void): void;
  onNavigate(this: void, route: "dashboard" | "drawings" | "editor" | "admin" | "login", query?: Record<string, string>): void;
}

export function EditorDocumentPanel({ workspace, onOpenDrawings, onStartNewDraft, onNavigate }: EditorDocumentPanelProps) {
  return (
    <section className="panel-block panel-document">
      <div className="panel-heading">
        <div>
          <h2>Drawing</h2>
          <p className="muted-line">Manage the current draft before you move back to the wider workspace.</p>
        </div>
        <button type="button" className="ghost editor-link-btn" onClick={onOpenDrawings}>
          Library
        </button>
      </div>
      {workspace.session ? (
        <>
          <div className="editor-document-meta">
            <strong>{workspace.session.company.name}</strong>
            <span>
              {workspace.session.user.displayName} · {workspace.session.user.role}
            </span>
          </div>
          {workspace.errorMessage ? <p className="status-line status-error">{workspace.errorMessage}</p> : null}
          {workspace.noticeMessage ? <p className="status-line status-ok">{workspace.noticeMessage}</p> : null}
          <label>
            Drawing Name
            <input
              type="text"
              value={workspace.currentDrawingName}
              placeholder="Name this drawing"
              onChange={(event) => workspace.setCurrentDrawingName(event.target.value)}
            />
          </label>
          <div className="editor-document-actions">
            <button type="button" onClick={() => void workspace.saveDrawing()} disabled={workspace.isSavingDrawing}>
              {workspace.currentDrawingId ? "Save" : "Save New"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => void workspace.saveDrawingAsNew()}
              disabled={workspace.isSavingDrawing}
            >
              Save As
            </button>
          </div>
          <div className="editor-document-actions">
            <button type="button" className="ghost" onClick={onStartNewDraft}>
              New Draft
            </button>
            <button type="button" className="ghost" onClick={() => onNavigate("dashboard")}>
              Dashboard
            </button>
          </div>
          <p className={`editor-save-state${workspace.isDirty ? " dirty" : ""}`}>
            {workspace.isDirty ? "Unsaved changes" : "Saved"}
          </p>
        </>
      ) : (
        <>
          <p className="muted-line">Sign in to save, reopen, and manage drawings.</p>
          <button type="button" onClick={() => onNavigate("login")}>
            Go To Login
          </button>
        </>
      )}
    </section>
  );
}
