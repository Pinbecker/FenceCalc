import type { EditorCanvasStageProps } from "./types";

type EditorCanvasHudProps = Pick<EditorCanvasStageProps, "scaleBar">;

export function EditorCanvasHud({ scaleBar }: EditorCanvasHudProps) {
  return (
    <div className="scale-bar" aria-label={`Canvas scale bar (${scaleBar.label})`}>
      <div className="scale-bar-meta">
        <span className="scale-bar-caption">Scale</span>
        <strong className="scale-bar-value">{scaleBar.label}</strong>
      </div>
      <div className="scale-bar-track">
        <div className="scale-bar-line" style={{ width: `${scaleBar.lengthPx}px` }}>
          <span className="tick left" />
          <span className="tick right" />
        </div>
      </div>
      <div className="scale-bar-labels">
        <span>0</span>
        <span>{scaleBar.label}</span>
      </div>
    </div>
  );
}
