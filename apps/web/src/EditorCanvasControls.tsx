interface EditorCanvasControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  canDeleteSelection: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelection: () => void;
  onClearLayout: () => void;
}

function ToolbarButton(props: {
  label: string;
  shortcut: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "danger";
  title: string;
}) {
  return (
    <button
      type="button"
      className={`editor-toolbar-button${props.tone === "danger" ? " is-danger" : ""}`}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
    >
      <span>{props.label}</span>
      <em>{props.shortcut}</em>
    </button>
  );
}

export function EditorCanvasControls({
  canUndo,
  canRedo,
  canDeleteSelection,
  onUndo,
  onRedo,
  onDeleteSelection,
  onClearLayout
}: EditorCanvasControlsProps) {
  return (
    <div className="editor-toolbar" aria-label="Canvas actions">
      <ToolbarButton label="Undo" shortcut="Ctrl+Z" onClick={onUndo} disabled={!canUndo} title="Undo" />
      <ToolbarButton label="Redo" shortcut="Ctrl+Y" onClick={onRedo} disabled={!canRedo} title="Redo" />
      <ToolbarButton
        label="Delete"
        shortcut="Del"
        onClick={onDeleteSelection}
        disabled={!canDeleteSelection}
        title="Delete Selected"
      />
      <ToolbarButton label="Clear" shortcut="Reset" onClick={onClearLayout} tone="danger" title="Clear Layout" />
    </div>
  );
}
