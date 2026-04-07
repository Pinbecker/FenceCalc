import type { CompanyUserRecord } from "@fence-estimator/contracts";

interface WorkspaceEditDetailsModalProps {
  isOpen: boolean;
  users: CompanyUserRecord[];
  workspaceName: string;
  workspaceNotes: string;
  workspaceOwnerUserId: string | null;
  isSaving: boolean;
  onClose: () => void;
  onWorkspaceNameChange: (value: string) => void;
  onWorkspaceNotesChange: (value: string) => void;
  onWorkspaceOwnerUserIdChange: (value: string | null) => void;
  onSave: () => void;
}

export function WorkspaceEditDetailsModal({
  isOpen,
  users,
  workspaceName,
  workspaceNotes,
  workspaceOwnerUserId,
  isSaving,
  onClose,
  onWorkspaceNameChange,
  onWorkspaceNotesChange,
  onWorkspaceOwnerUserIdChange,
  onSave,
}: WorkspaceEditDetailsModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="portal-customer-edit-backdrop portal-modal-backdrop" onClick={onClose}>
      <div
        className="portal-customer-edit-modal portal-modal-card"
        role="dialog"
        aria-label="Edit drawing workspace details"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="portal-customer-edit-modal-header portal-modal-header">
          <h2>Edit drawing workspace details</h2>
          <button type="button" className="portal-text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="portal-customer-edit-modal-body portal-modal-body">
          <label className="portal-customer-edit-field">
            <span>Drawing name</span>
            <input
              value={workspaceName}
              onChange={(event) => onWorkspaceNameChange(event.target.value)}
            />
          </label>
          <label className="portal-customer-edit-field">
            <span>Owner</span>
            <select
              value={workspaceOwnerUserId ?? ""}
              onChange={(event) => onWorkspaceOwnerUserIdChange(event.target.value || null)}
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="portal-customer-edit-field">
            <span>Notes</span>
            <textarea
              rows={4}
              value={workspaceNotes}
              onChange={(event) => onWorkspaceNotesChange(event.target.value)}
            />
          </label>
        </div>
        <div className="portal-customer-edit-modal-footer portal-modal-footer">
          <button
            type="button"
            className="portal-secondary-button portal-compact-button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="portal-primary-button portal-compact-button"
            disabled={isSaving || !workspaceName.trim()}
            onClick={onSave}
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
