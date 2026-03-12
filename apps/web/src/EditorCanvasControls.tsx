interface EditorCanvasControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  canDeleteSelection: boolean;
  canFinishInteraction: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelection: () => void;
  onClearLayout: () => void;
  onFinishInteraction: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
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
  canFinishInteraction,
  onUndo,
  onRedo,
  onDeleteSelection,
  onClearLayout,
  onFinishInteraction,
  onZoomIn,
  onZoomOut,
  onResetView
}: EditorCanvasControlsProps) {
  return (
    <div className="editor-toolbar" aria-label="Canvas actions">
      <ToolbarButton label="Undo" shortcut="Ctrl+Z" onClick={onUndo} disabled={!canUndo} title="Undo" />
      <ToolbarButton label="Redo" shortcut="Ctrl+Y" onClick={onRedo} disabled={!canRedo} title="Redo" />
      <ToolbarButton label="Zoom In" shortcut="+" onClick={onZoomIn} title="Zoom In" />
      <ToolbarButton label="Zoom Out" shortcut="-" onClick={onZoomOut} title="Zoom Out" />
      <ToolbarButton label="Reset View" shortcut="Fit" onClick={onResetView} title="Reset Canvas View" />
      <ToolbarButton
        label="Finish"
        shortcut="Tap"
        onClick={onFinishInteraction}
        disabled={!canFinishInteraction}
        title="Finish Current Drawing Interaction"
      />
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
