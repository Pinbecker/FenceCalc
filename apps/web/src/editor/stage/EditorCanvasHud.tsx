import { formatLengthMm, formatPointMeters } from "../../formatters";
import { DRAW_INCREMENT_MM } from "../constants";
import type { EditorCanvasStageProps } from "./types";

type EditorCanvasHudProps = Pick<
  EditorCanvasStageProps,
  | "closeLoopPoint"
  | "disableSnap"
  | "drawStart"
  | "drawSnapLabel"
  | "basketballPostPreview"
  | "hoveredBasketballPostId"
  | "gatePreview"
  | "hoveredGateId"
  | "hoveredSegmentId"
  | "interactionMode"
  | "isPanning"
  | "recessPreview"
  | "scaleBar"
>;

export function EditorCanvasHud({
  disableSnap,
  closeLoopPoint,
  drawStart,
  drawSnapLabel,
  basketballPostPreview,
  hoveredBasketballPostId,
  gatePreview,
  hoveredGateId,
  hoveredSegmentId,
  interactionMode,
  isPanning,
  recessPreview,
  scaleBar
}: EditorCanvasHudProps) {
  const guide = drawSnapLabel ?? basketballPostPreview?.snapMeta.label ?? gatePreview?.snapMeta.label ?? recessPreview?.snapMeta.label ?? null;
  const modeLabel =
    interactionMode === "BASKETBALL_POST"
      ? "Basketball Post"
      : interactionMode.charAt(0) + interactionMode.slice(1).toLowerCase();

  const action =
    interactionMode === "DRAW"
      ? closeLoopPoint
        ? "Click close loop"
        : drawStart
          ? "Click next point"
          : "Click start point"
      : interactionMode === "RECESS"
        ? recessPreview
          ? `Place recess on ${recessPreview.side === "LEFT" ? "left" : "right"}`
          : "Hover a run"
        : interactionMode === "GATE"
          ? gatePreview
            ? "Click to place gate"
            : "Hover a run"
          : interactionMode === "BASKETBALL_POST"
            ? basketballPostPreview
              ? `Click place post ${basketballPostPreview.facing.toLowerCase()}`
              : "Hover a run side"
          : hoveredBasketballPostId
            ? "Click select, drag slide"
          : hoveredGateId
            ? "Click select, drag slide"
            : hoveredSegmentId
              ? "Click select, drag move, click tag edit"
              : "Hover a line or gate";

  const controls =
    interactionMode === "DRAW"
      ? "Enter finish | Double-click finish"
      : interactionMode === "SELECT"
        ? "Wheel zoom | Space pan"
        : "Click place | Wheel zoom | Space pan";

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
          <em>{modeLabel}</em>
        </span>
        <span className="statusbar-item">
          <strong>Snap</strong>
          <em>{disableSnap ? "Off" : guide ?? "5 deg"}</em>
        </span>
        <span className="statusbar-item">
          <strong>Action</strong>
          <em>{action}</em>
        </span>
        {drawStart ? (
          <span className="statusbar-item">
            <strong>Start</strong>
            <em>{formatPointMeters(drawStart)}</em>
          </span>
        ) : null}
        {interactionMode === "DRAW" ? (
          <span className="statusbar-item">
            <strong>Step</strong>
            <em>{formatLengthMm(DRAW_INCREMENT_MM)}</em>
          </span>
        ) : null}
        {isPanning ? (
          <span className="statusbar-item">
            <strong>View</strong>
            <em>Panning</em>
          </span>
        ) : null}
        <span className="statusbar-item">
          <strong>Controls</strong>
          <em>{controls}</em>
        </span>
      </div>
    </>
  );
}
