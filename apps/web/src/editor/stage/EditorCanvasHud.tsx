import { formatLengthMm, formatPointMeters } from "../../formatters";
import { DRAW_INCREMENT_MM } from "../constants";
import type { EditorCanvasStageProps } from "./types";

type EditorCanvasHudProps = Pick<
  EditorCanvasStageProps,
  "disableSnap" | "drawStart" | "interactionMode" | "scaleBar"
>;

export function EditorCanvasHud({
  disableSnap,
  drawStart,
  interactionMode,
  scaleBar
}: EditorCanvasHudProps) {
  return (
    <>
      <div className="scale-bar" aria-label="Canvas scale bar">
        <div className="scale-bar-line" style={{ width: `${scaleBar.lengthPx}px` }}>
          <span className="tick left" />
          <span className="tick right" />
        </div>
        <div className="scale-bar-labels">
          <span>0</span>
          <span>{scaleBar.label}</span>
        </div>
      </div>

      <div className="statusbar">
        <span className="statusbar-item">
          <strong>Mode</strong>
          <em>{interactionMode}</em>
        </span>
        <span className="statusbar-item">
          <strong>Snap</strong>
          <em>{disableSnap ? "Off" : "5 deg"}</em>
        </span>
        <span className="statusbar-item">
          <strong>Step</strong>
          <em>{formatLengthMm(DRAW_INCREMENT_MM)}</em>
        </span>
        <span className="statusbar-item">
          <strong>Start</strong>
          <em>{drawStart ? formatPointMeters(drawStart) : "None"}</em>
        </span>
      </div>
    </>
  );
}
