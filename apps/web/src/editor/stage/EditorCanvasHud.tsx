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
  | "floodlightColumnPreview"
  | "hoveredBasketballPostId"
  | "hoveredFloodlightColumnId"
  | "gatePreview"
  | "goalUnitPreview"
  | "hoveredGateId"
  | "hoveredSegmentId"
  | "interactionMode"
  | "isPanning"
  | "kickboardPreview"
  | "pitchDividerAnchorPreview"
  | "pitchDividerPreview"
  | "pendingSideNettingStart"
  | "recessPreview"
  | "sideNettingAnchorPreview"
  | "sideNettingPreview"
  | "scaleBar"
>;

export function EditorCanvasHud({
  disableSnap,
  closeLoopPoint,
  drawStart,
  drawSnapLabel,
  basketballPostPreview,
  floodlightColumnPreview = null,
  hoveredBasketballPostId,
  hoveredFloodlightColumnId = null,
  gatePreview,
  goalUnitPreview = null,
  hoveredGateId,
  hoveredSegmentId,
  interactionMode,
  isPanning,
  kickboardPreview = null,
  pitchDividerAnchorPreview = null,
  pitchDividerPreview = null,
  pendingSideNettingStart = null,
  recessPreview,
  sideNettingAnchorPreview = null,
  sideNettingPreview = null,
  scaleBar
}: EditorCanvasHudProps) {
  const guide =
    drawSnapLabel ??
    basketballPostPreview?.snapMeta.label ??
    floodlightColumnPreview?.snapMeta.label ??
    gatePreview?.snapMeta.label ??
    goalUnitPreview?.snapMeta.label ??
    kickboardPreview?.snapMeta.label ??
    pitchDividerAnchorPreview?.snapMeta.label ??
    sideNettingAnchorPreview?.snapMeta.label ??
    sideNettingPreview?.snapMeta.label ??
    recessPreview?.snapMeta.label ??
    null;
  const modeLabel =
    interactionMode === "BASKETBALL_POST"
      ? "Basketball Post"
      : interactionMode === "FLOODLIGHT_COLUMN"
        ? "Floodlight Column"
      : interactionMode === "GOAL_UNIT"
        ? "Goal Unit"
        : interactionMode === "PITCH_DIVIDER"
          ? "Pitch Divider"
          : interactionMode === "SIDE_NETTING"
            ? "Side Netting"
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
        : interactionMode === "GOAL_UNIT"
          ? goalUnitPreview
            ? "Click to place goal unit"
            : "Hover a valid run"
          : interactionMode === "KICKBOARD"
            ? kickboardPreview
              ? "Click apply kickboard"
              : "Hover a run"
            : interactionMode === "PITCH_DIVIDER"
              ? pitchDividerPreview
                ? pitchDividerPreview.isValid
                  ? "Click finish divider"
                  : "Pick a closer end"
                : "Click first anchor"
              : interactionMode === "SIDE_NETTING"
                ? sideNettingPreview
                  ? "Click to finish"
                  : pendingSideNettingStart
                    ? sideNettingAnchorPreview
                      ? "Click to finish"
                      : "Hover a line"
                    : sideNettingAnchorPreview
                      ? "Click to start"
                      : "Hover a line"
          : interactionMode === "SELECT" && basketballPostPreview
            ? `Drag post ${basketballPostPreview.facing.toLowerCase()}`
            : interactionMode === "SELECT" && gatePreview
            ? "Drag to slide gate"
            : interactionMode === "GATE"
              ? gatePreview
                ? "Click to place gate"
                : "Hover a run"
              : interactionMode === "BASKETBALL_POST"
                ? basketballPostPreview
                  ? `Click place post ${basketballPostPreview.facing.toLowerCase()}`
                  : "Hover a run side"
                : interactionMode === "FLOODLIGHT_COLUMN"
                  ? floodlightColumnPreview
                    ? "Click place floodlight column"
                    : "Hover a run or corner"
                  : hoveredBasketballPostId
                    ? "Click select, drag slide"
                    : hoveredFloodlightColumnId
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
        : interactionMode === "PITCH_DIVIDER"
          ? "Click start, click end | Right-click cancel"
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
