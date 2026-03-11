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
        <span>Mode: {interactionMode}</span>
        <span>Snap: {disableSnap ? "OFF" : "5 deg"}</span>
        <span>Point Step: {formatLengthMm(DRAW_INCREMENT_MM)}</span>
        <span>Active Start: {drawStart ? formatPointMeters(drawStart) : "None"}</span>
      </div>
    </>
  );
}
