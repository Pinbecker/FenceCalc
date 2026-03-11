interface EditorCanvasControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  canDeleteSelection: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelection: () => void;
  onClearLayout: () => void;
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
    <section className="panel-block panel-controls">
      <div className="panel-heading">
        <h2>Controls</h2>
      </div>
      <div className="controls-toolbar" aria-label="Controls toolbar">
        <button type="button" className="icon-btn" onClick={onUndo} disabled={!canUndo} title="Undo">
          U
        </button>
        <button type="button" className="icon-btn" onClick={onRedo} disabled={!canRedo} title="Redo">
          R
        </button>
        <button type="button" className="icon-btn" onClick={onDeleteSelection} disabled={!canDeleteSelection} title="Delete Selected">
          D
        </button>
        <button type="button" className="icon-btn" onClick={onClearLayout} title="Clear Layout">
          C
        </button>
      </div>
    </section>
  );
}
