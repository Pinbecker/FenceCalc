interface EditorLengthEditorProps {
  isOpen: boolean;
  selectedComponentClosed: boolean;
  selectedLengthInputM: string;
  inputStepM: number;
  onChangeLength: (value: string) => void;
  onApply: () => void;
  onCancel: () => void;
}

export function EditorLengthEditor({
  isOpen,
  selectedComponentClosed,
  selectedLengthInputM,
  inputStepM,
  onChangeLength,
  onApply,
  onCancel
}: EditorLengthEditorProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <section className="panel-block length-editor">
      <h2>Edit Segment Length</h2>
      <label>
        Length (m)
        <input
          type="number"
          min={inputStepM}
          step={inputStepM}
          value={selectedLengthInputM}
          onChange={(event) => onChangeLength(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onApply();
            }
          }}
        />
      </label>
      <p className="muted-line">
        {selectedComponentClosed
          ? "Closed perimeter: matching parallel spans update as a rigid body."
          : "Open run: downstream connected segments move with the edited endpoint."}
      </p>
      <div className="length-editor-actions">
        <button type="button" onClick={onApply}>
          Apply Length
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
