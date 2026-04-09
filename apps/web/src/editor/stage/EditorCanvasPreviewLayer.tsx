import type { GateType } from "@fence-estimator/contracts";
import { Circle, Group, Layer, Line } from "react-konva";
import { distanceMm } from "@fence-estimator/geometry";

import { formatLengthMm } from "../../formatters";
import { renderBasketballPostSymbol } from "../basketballPostGeometry";
import { GHOST_STROKE_PX, LABEL_FONT_SIZE_PX, MIN_SEGMENT_MM } from "../constants";
import { renderFloodlightColumnSymbol } from "../floodlightColumnGeometry";
import { renderGateSymbol } from "../gateGeometry";
import { renderCanvasLabel } from "./canvasLabel";
import type { EditorCanvasStageProps } from "./types";

type EditorCanvasPreviewLayerProps = Pick<
  EditorCanvasStageProps,
  | "axisGuide"
  | "activeDrawNodeSnap"
  | "activeSegmentDrag"
  | "gateType"
  | "drawHoverSnap"
  | "drawStart"
  | "basketballPostPreview"
  | "floodlightColumnPreview"
  | "gatePreview"
  | "gatePreviewVisual"
  | "goalUnitPreview"
  | "ghostEnd"
  | "ghostLengthMm"
  | "interactionMode"
  | "kickboardPreview"
  | "oppositeGateGuides"
  | "pendingPitchDividerStart"
  | "pendingSideNettingStart"
  | "pitchDividerAnchorPreview"
  | "pitchDividerPreview"
  | "rectanglePreviewEnd"
  | "rectangleStart"
  | "recessPreview"
  | "sideNettingAnchorPreview"
  | "sideNettingPreview"
  | "sideNettingSegmentPreview"
  | "view"
  | "visibleBounds"
  | "closeLoopPoint"
>;

function getGatePreviewStyle(gateType: GateType) {
  switch (gateType) {
    case "DOUBLE_LEAF":
      return {
        highlight: "#94df8b",
        frameStroke: "#d9ffd0",
        leafStroke: "#f4ffd8",
        swingStroke: "#98d94f",
        markerFill: "#f6ffe9",
        labelColor: "#f2ffd7"
      };
    case "CUSTOM":
      return {
        highlight: "#d2a0ff",
        frameStroke: "#f5dbff",
        leafStroke: "#ffe8ff",
        swingStroke: "#df7ef2",
        markerFill: "#fff0ff",
        labelColor: "#ffe8ff"
      };
    default:
      return {
        highlight: "#8ee5ff",
        frameStroke: "#d2f4fb",
        leafStroke: "#fff3d7",
        swingStroke: "#f0be6e",
        markerFill: "#effdff",
        labelColor: "#fff8e3"
      };
  }
}

function midpoint(start: { x: number; y: number }, end: { x: number; y: number }) {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  };
}

function deriveSegmentAxes(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;

  return {
    tangent: { x: dx / length, y: dy / length },
    normal: { x: -dy / length, y: dx / length }
  };
}

function offsetPoint(
  point: { x: number; y: number },
  tangent: { x: number; y: number },
  normal: { x: number; y: number },
  scale: number,
  normalOffsetPx: number,
  tangentOffsetPx = 0
) {
  return {
    x: point.x + tangent.x * (tangentOffsetPx / scale) + normal.x * (normalOffsetPx / scale),
    y: point.y + tangent.y * (tangentOffsetPx / scale) + normal.y * (normalOffsetPx / scale)
  };
}

function buildGuideEndpoints(
  point: { x: number; y: number },
  direction: { x: number; y: number },
  visibleBounds: { left: number; top: number; right: number; bottom: number }
) {
  const extent =
    Math.hypot(visibleBounds.right - visibleBounds.left, visibleBounds.bottom - visibleBounds.top) + 1200;

  return {
    start: {
      x: point.x - direction.x * extent,
      y: point.y - direction.y * extent
    },
    end: {
      x: point.x + direction.x * extent,
      y: point.y + direction.y * extent
    }
  };
}

function renderPlacementGuide({
  targetPoint,
  guideDirection,
  visibleBounds,
  scale,
  anchorPoint
}: {
  targetPoint: { x: number; y: number };
  guideDirection: { x: number; y: number };
  visibleBounds: { left: number; top: number; right: number; bottom: number };
  scale: number;
  anchorPoint?: { x: number; y: number } | null;
}) {
  if (anchorPoint) {
    return (
      <>
        <Line
          points={[anchorPoint.x, anchorPoint.y, targetPoint.x, targetPoint.y]}
          stroke="#b8c8d0"
          strokeWidth={1.5 / scale}
          dash={[7 / scale, 5 / scale]}
          opacity={0.74}
          listening={false}
        />
        <Circle x={anchorPoint.x} y={anchorPoint.y} radius={4.2 / scale} fill="#d9e6eb" listening={false} />
      </>
    );
  }

  const endpoints = buildGuideEndpoints(targetPoint, guideDirection, visibleBounds);
  return (
    <Line
      points={[endpoints.start.x, endpoints.start.y, endpoints.end.x, endpoints.end.y]}
      stroke="#b8c8d0"
      strokeWidth={1.2 / scale}
      dash={[7 / scale, 6 / scale]}
      opacity={0.58}
      listening={false}
    />
  );
}

function renderRunDistanceLabels({
  keyPrefix,
  startPoint,
  splitStartPoint,
  splitEndPoint,
  endPoint,
  startDistanceMm,
  endDistanceMm,
  tangent,
  startNormal,
  endNormal,
  scale,
  fill = "rgba(12, 40, 44, 0.9)",
  textColor = "#dffcff",
  stroke = "rgba(118, 231, 248, 0.34)"
}: {
  keyPrefix: string;
  startPoint: { x: number; y: number };
  splitStartPoint: { x: number; y: number };
  splitEndPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  startDistanceMm: number;
  endDistanceMm: number;
  tangent: { x: number; y: number };
  startNormal: { x: number; y: number };
  endNormal: { x: number; y: number };
  scale: number;
  fill?: string;
  textColor?: string;
  stroke?: string;
}) {
  return (
    <>
      {startDistanceMm > MIN_SEGMENT_MM
        ? renderCanvasLabel({
            keyValue: `${keyPrefix}-start-distance`,
            ...offsetPoint(midpoint(startPoint, splitStartPoint), tangent, startNormal, scale, 20, -18),
            text: formatLengthMm(startDistanceMm),
            scale,
            fill,
            textColor,
            stroke,
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 42
          })
        : null}
      {endDistanceMm > MIN_SEGMENT_MM
        ? renderCanvasLabel({
            keyValue: `${keyPrefix}-end-distance`,
            ...offsetPoint(midpoint(splitEndPoint, endPoint), tangent, endNormal, scale, 20, 18),
            text: formatLengthMm(endDistanceMm),
            scale,
            fill,
            textColor,
            stroke,
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 42
          })
        : null}
    </>
  );
}

function renderTargetSegmentHighlight(
  start: { x: number; y: number },
  end: { x: number; y: number },
  scale: number,
  color: string
) {
  return (
    <>
      <Line
        points={[start.x, start.y, end.x, end.y]}
        stroke={color}
        strokeWidth={12 / scale}
        opacity={0.28}
        lineCap="round"
        listening={false}
      />
      <Line
        points={[start.x, start.y, end.x, end.y]}
        stroke={color}
        strokeWidth={6 / scale}
        opacity={0.88}
        lineCap="round"
        listening={false}
      />
    </>
  );
}

export function EditorCanvasPreviewLayer({
  axisGuide,
  activeDrawNodeSnap,
  activeSegmentDrag = null,
  gateType,
  drawHoverSnap,
  drawStart,
  basketballPostPreview,
  floodlightColumnPreview = null,
  gatePreview,
  gatePreviewVisual,
  goalUnitPreview = null,
  ghostEnd,
  ghostLengthMm,
  interactionMode,
  kickboardPreview = null,
  oppositeGateGuides,
  pendingPitchDividerStart = null,
  pendingSideNettingStart = null,
  pitchDividerAnchorPreview = null,
  pitchDividerPreview = null,
  rectanglePreviewEnd,
  rectangleStart,
  recessPreview,
  sideNettingAnchorPreview = null,
  sideNettingPreview = null,
  sideNettingSegmentPreview = null,
  view,
  visibleBounds,
  closeLoopPoint
}: EditorCanvasPreviewLayerProps) {
  const activeSegmentDragBaselineSegments = activeSegmentDrag
    ? activeSegmentDrag.referenceSegments.filter((segment) => activeSegmentDrag.segmentIds.includes(segment.id))
    : [];
  const activeSegmentDragBaselineSegment = activeSegmentDrag
    ? activeSegmentDragBaselineSegments.find((segment) => segment.id === activeSegmentDrag.segmentId) ??
      activeSegmentDragBaselineSegments[0] ??
      null
    : null;
  const recessAxes = recessPreview
    ? deriveSegmentAxes(recessPreview.segment.start, recessPreview.segment.end)
    : null;
  const recessNormal =
    recessPreview && recessAxes
      ? {
          x: recessAxes.normal.x * (recessPreview.side === "LEFT" ? 1 : -1),
          y: recessAxes.normal.y * (recessPreview.side === "LEFT" ? 1 : -1)
        }
      : null;
  const ghostAxes = drawStart && ghostEnd ? deriveSegmentAxes(drawStart, ghostEnd) : null;
  const rectangleWidthDirection = rectangleStart && rectanglePreviewEnd ? Math.sign(rectanglePreviewEnd.y - rectangleStart.y) || 1 : 1;
  const rectangleHeightDirection = rectangleStart && rectanglePreviewEnd ? Math.sign(rectanglePreviewEnd.x - rectangleStart.x) || 1 : 1;
  const gatePreviewStyle = getGatePreviewStyle(gateType);

  return (
    <Layer>
      {interactionMode === "SELECT" && activeSegmentDragBaselineSegment ? (
        <Group
          key={`segment-drag-origin-${activeSegmentDrag?.selectionKey ?? activeSegmentDragBaselineSegment.id}`}
          listening={false}
        >
          {activeSegmentDragBaselineSegments.map((segment) => (
            <Line
              key={`segment-drag-origin-line-${segment.id}`}
              points={[
                segment.start.x,
                segment.start.y,
                segment.end.x,
                segment.end.y
              ]}
              stroke="rgba(217, 230, 236, 0.72)"
              strokeWidth={2.2 / view.scale}
              dash={[12 / view.scale, 8 / view.scale]}
              lineCap="round"
              lineJoin="round"
            />
          ))}
          {renderCanvasLabel({
            keyValue: `segment-drag-origin-label-${activeSegmentDrag?.selectionKey ?? activeSegmentDragBaselineSegment.id}`,
            ...offsetPoint(
              midpoint(activeSegmentDragBaselineSegment.start, activeSegmentDragBaselineSegment.end),
              deriveSegmentAxes(activeSegmentDragBaselineSegment.start, activeSegmentDragBaselineSegment.end).tangent,
              deriveSegmentAxes(activeSegmentDragBaselineSegment.start, activeSegmentDragBaselineSegment.end).normal,
              view.scale,
              24
            ),
            text: "Original",
            scale: view.scale,
            fill: "rgba(19, 28, 32, 0.84)",
            textColor: "#e7f0f4",
            stroke: "rgba(217, 230, 236, 0.24)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 60
          })}
        </Group>
      ) : null}
      {interactionMode === "RECESS" && recessPreview ? (
        <Group key={`recess-preview-${recessPreview.segment.id}`} listening={false}>
          {renderTargetSegmentHighlight(
            recessPreview.segment.start,
            recessPreview.segment.end,
            view.scale,
            "#7ee5d0"
          )}
          {recessPreview.alignmentGuide
            ? renderPlacementGuide({
                targetPoint: recessPreview.targetPoint,
                guideDirection: recessNormal ?? { x: 0, y: -1 },
                visibleBounds,
                scale: view.scale,
                anchorPoint: recessPreview.alignmentGuide.anchorPoint
              })
            : recessPreview.snapMeta.kind === "MIDPOINT" || recessPreview.snapMeta.kind === "FRACTION"
              ? renderPlacementGuide({
                  targetPoint: recessPreview.targetPoint,
                  guideDirection: recessNormal ?? { x: 0, y: -1 },
                  visibleBounds,
                  scale: view.scale
                })
              : null}
          <Line
            points={[
              recessPreview.segment.start.x,
              recessPreview.segment.start.y,
              recessPreview.entryPoint.x,
              recessPreview.entryPoint.y
            ]}
            stroke="#9db8c3"
            strokeWidth={4 / view.scale}
            lineCap="round"
          />
          <Line
            points={[
              recessPreview.entryPoint.x,
              recessPreview.entryPoint.y,
              recessPreview.recessEntryPoint.x,
              recessPreview.recessEntryPoint.y,
              recessPreview.recessExitPoint.x,
              recessPreview.recessExitPoint.y,
              recessPreview.exitPoint.x,
              recessPreview.exitPoint.y
            ]}
            stroke="#7fa89b"
            strokeWidth={4 / view.scale}
            dash={[12 / view.scale, 8 / view.scale]}
            lineCap="round"
            lineJoin="round"
          />
          <Line
            points={[
              recessPreview.exitPoint.x,
              recessPreview.exitPoint.y,
              recessPreview.segment.end.x,
              recessPreview.segment.end.y
            ]}
            stroke="#9db8c3"
            strokeWidth={4 / view.scale}
            lineCap="round"
          />
          <Circle
            x={recessPreview.targetPoint.x}
            y={recessPreview.targetPoint.y}
            radius={4 / view.scale}
            fill="#d8e4de"
          />
          {recessAxes && recessNormal
            ? renderRunDistanceLabels({
                keyPrefix: `recess-${recessPreview.segment.id}`,
                startPoint: recessPreview.segment.start,
                splitStartPoint: recessPreview.entryPoint,
                splitEndPoint: recessPreview.exitPoint,
                endPoint: recessPreview.segment.end,
                startDistanceMm: recessPreview.startOffsetMm,
                endDistanceMm: recessPreview.segmentLengthMm - recessPreview.endOffsetMm,
                tangent: recessAxes.tangent,
                startNormal: { x: -recessNormal.x, y: -recessNormal.y },
                endNormal: { x: -recessNormal.x, y: -recessNormal.y },
                scale: view.scale
              })
            : null}
          {renderCanvasLabel({
            keyValue: `recess-main-${recessPreview.segment.id}`,
            ...offsetPoint(
              midpoint(recessPreview.recessEntryPoint, recessPreview.recessExitPoint),
              recessAxes?.tangent ?? { x: 1, y: 0 },
              recessNormal ?? { x: 0, y: -1 },
              view.scale,
              28
            ),
            text: `${formatLengthMm(recessPreview.endOffsetMm - recessPreview.startOffsetMm)} x ${formatLengthMm(recessPreview.depthMm)}`,
            scale: view.scale,
            fill: "rgba(12, 58, 55, 0.92)",
            textColor: "#ddfffa",
            stroke: "rgba(126, 229, 208, 0.38)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 92
          })}
        </Group>
      ) : null}
      {interactionMode === "GOAL_UNIT" && goalUnitPreview ? (
        <Group key={`goal-unit-preview-${goalUnitPreview.segment.id}`} listening={false}>
          {renderTargetSegmentHighlight(
            goalUnitPreview.segment.start,
            goalUnitPreview.segment.end,
            view.scale,
            "#7db4ff"
          )}
          {goalUnitPreview.alignmentGuide
            ? renderPlacementGuide({
                targetPoint: goalUnitPreview.targetPoint,
                guideDirection: goalUnitPreview.side === "LEFT"
                  ? deriveSegmentAxes(goalUnitPreview.segment.start, goalUnitPreview.segment.end).normal
                  : {
                      x: -deriveSegmentAxes(goalUnitPreview.segment.start, goalUnitPreview.segment.end).normal.x,
                      y: -deriveSegmentAxes(goalUnitPreview.segment.start, goalUnitPreview.segment.end).normal.y
                    },
                visibleBounds,
                scale: view.scale,
                anchorPoint: goalUnitPreview.alignmentGuide.anchorPoint
              })
            : goalUnitPreview.snapMeta.kind === "MIDPOINT" || goalUnitPreview.snapMeta.kind === "FRACTION" || goalUnitPreview.snapMeta.kind === "ALIGNMENT"
              ? renderPlacementGuide({
                  targetPoint: goalUnitPreview.targetPoint,
                  guideDirection: goalUnitPreview.side === "LEFT"
                    ? deriveSegmentAxes(goalUnitPreview.segment.start, goalUnitPreview.segment.end).normal
                    : {
                        x: -deriveSegmentAxes(goalUnitPreview.segment.start, goalUnitPreview.segment.end).normal.x,
                        y: -deriveSegmentAxes(goalUnitPreview.segment.start, goalUnitPreview.segment.end).normal.y
                      },
                  visibleBounds,
                  scale: view.scale
                })
              : null}
          <Line
            points={[
              goalUnitPreview.segment.start.x,
              goalUnitPreview.segment.start.y,
              goalUnitPreview.entryPoint.x,
              goalUnitPreview.entryPoint.y
            ]}
            stroke="#b8c7d9"
            strokeWidth={4 / view.scale}
            lineCap="round"
          />
          <Line
            points={[
              goalUnitPreview.entryPoint.x,
              goalUnitPreview.entryPoint.y,
              goalUnitPreview.recessEntryPoint.x,
              goalUnitPreview.recessEntryPoint.y,
              goalUnitPreview.recessExitPoint.x,
              goalUnitPreview.recessExitPoint.y,
              goalUnitPreview.exitPoint.x,
              goalUnitPreview.exitPoint.y
            ]}
            stroke="#7db4ff"
            strokeWidth={4 / view.scale}
            dash={[12 / view.scale, 8 / view.scale]}
            lineCap="round"
            lineJoin="round"
          />
          <Line
            points={[
              goalUnitPreview.exitPoint.x,
              goalUnitPreview.exitPoint.y,
              goalUnitPreview.segment.end.x,
              goalUnitPreview.segment.end.y
            ]}
            stroke="#b8c7d9"
            strokeWidth={4 / view.scale}
            lineCap="round"
          />
          <Circle
            x={(goalUnitPreview.recessEntryPoint.x + goalUnitPreview.recessExitPoint.x) / 2}
            y={(goalUnitPreview.recessEntryPoint.y + goalUnitPreview.recessExitPoint.y) / 2}
            radius={6 / view.scale}
            fill="#d6e7ff"
            stroke="#2a4e83"
            strokeWidth={1.4 / view.scale}
          />
          {(() => {
            const segmentAxes = deriveSegmentAxes(goalUnitPreview.segment.start, goalUnitPreview.segment.end);
            const goalNormal = goalUnitPreview.side === "LEFT"
              ? segmentAxes.normal
              : { x: -segmentAxes.normal.x, y: -segmentAxes.normal.y };
            return renderRunDistanceLabels({
              keyPrefix: `goal-unit-${goalUnitPreview.segment.id}`,
              startPoint: goalUnitPreview.segment.start,
              splitStartPoint: goalUnitPreview.entryPoint,
              splitEndPoint: goalUnitPreview.exitPoint,
              endPoint: goalUnitPreview.segment.end,
              startDistanceMm: goalUnitPreview.startOffsetMm,
              endDistanceMm: goalUnitPreview.segmentLengthMm - goalUnitPreview.endOffsetMm,
              tangent: segmentAxes.tangent,
              startNormal: { x: -goalNormal.x, y: -goalNormal.y },
              endNormal: { x: -goalNormal.x, y: -goalNormal.y },
              scale: view.scale,
              fill: "rgba(16, 40, 76, 0.92)",
              textColor: "#e6f0ff",
              stroke: "rgba(125, 180, 255, 0.38)"
            });
          })()}
          {renderCanvasLabel({
            keyValue: `goal-unit-main-${goalUnitPreview.segment.id}`,
            ...offsetPoint(
              midpoint(goalUnitPreview.recessEntryPoint, goalUnitPreview.recessExitPoint),
              deriveSegmentAxes(goalUnitPreview.segment.start, goalUnitPreview.segment.end).tangent,
              goalUnitPreview.side === "LEFT" ? deriveSegmentAxes(goalUnitPreview.segment.start, goalUnitPreview.segment.end).normal : {
                x: -deriveSegmentAxes(goalUnitPreview.segment.start, goalUnitPreview.segment.end).normal.x,
                y: -deriveSegmentAxes(goalUnitPreview.segment.start, goalUnitPreview.segment.end).normal.y
              },
              view.scale,
              28
            ),
            text: `Goal Unit ${formatLengthMm(goalUnitPreview.widthMm)} x ${formatLengthMm(goalUnitPreview.goalHeightMm)}`,
            scale: view.scale,
            fill: "rgba(16, 40, 76, 0.92)",
            textColor: "#e6f0ff",
            stroke: "rgba(125, 180, 255, 0.38)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 104
          })}
        </Group>
      ) : null}
      {gatePreview ? (
        <Group key={`gate-preview-${gatePreview.segment.id}`} listening={false}>
          {renderTargetSegmentHighlight(
            gatePreview.segment.start,
            gatePreview.segment.end,
            view.scale,
            gatePreviewStyle.highlight
          )}
          {gatePreview.alignmentGuide
            ? renderPlacementGuide({
                targetPoint: gatePreview.targetPoint,
                guideDirection: gatePreview.normal,
                visibleBounds,
                scale: view.scale,
                anchorPoint: gatePreview.alignmentGuide.anchorPoint
              })
            : gatePreview.snapMeta.kind === "CENTERED"
              ? renderPlacementGuide({
                  targetPoint: gatePreview.targetPoint,
                  guideDirection: gatePreview.normal,
                  visibleBounds,
                  scale: view.scale
                })
              : null}
          <Line
            points={[
              gatePreview.segment.start.x,
              gatePreview.segment.start.y,
              gatePreview.entryPoint.x,
              gatePreview.entryPoint.y
            ]}
            stroke="#9fe7f8"
            strokeWidth={4 / view.scale}
            lineCap="round"
          />
          {gatePreviewVisual
            ? renderGateSymbol(
                gatePreviewVisual,
                view.scale,
                {
                  frameStroke: gatePreviewStyle.frameStroke,
                  leafStroke: gatePreviewStyle.leafStroke,
                  swingStroke: gatePreviewStyle.swingStroke,
                  markerFill: gatePreviewStyle.markerFill,
                  labelColor: gatePreviewStyle.labelColor
                },
                `Gate ${formatLengthMm(gatePreview.widthMm)}`,
                `gate-preview-symbol-${gatePreview.segment.id}`
              )
            : null}
          {renderRunDistanceLabels({
            keyPrefix: `gate-${gatePreview.segment.id}`,
            startPoint: gatePreview.segment.start,
            splitStartPoint: gatePreview.entryPoint,
            splitEndPoint: gatePreview.exitPoint,
            endPoint: gatePreview.segment.end,
            startDistanceMm: gatePreview.startOffsetMm,
            endDistanceMm: gatePreview.segmentLengthMm - gatePreview.endOffsetMm,
            tangent: gatePreview.tangent,
            startNormal: { x: -gatePreview.normal.x, y: -gatePreview.normal.y },
            endNormal: { x: -gatePreview.normal.x, y: -gatePreview.normal.y },
            scale: view.scale
          })}
          <Line
            points={[
              gatePreview.exitPoint.x,
              gatePreview.exitPoint.y,
              gatePreview.segment.end.x,
              gatePreview.segment.end.y
            ]}
            stroke="#9fe7f8"
            strokeWidth={4 / view.scale}
            lineCap="round"
          />
        </Group>
      ) : null}
      {basketballPostPreview ? (
        <Group key={`basketball-post-preview-${basketballPostPreview.segment.id}`} listening={false}>
          {renderTargetSegmentHighlight(
            basketballPostPreview.segment.start,
            basketballPostPreview.segment.end,
            view.scale,
            "#ffbc63"
          )}
          {basketballPostPreview.alignmentGuide
            ? renderPlacementGuide({
                targetPoint: basketballPostPreview.targetPoint,
                guideDirection: basketballPostPreview.normal,
                visibleBounds,
                scale: view.scale,
                anchorPoint: basketballPostPreview.alignmentGuide.anchorPoint
              })
            : basketballPostPreview.snapMeta.kind === "CENTERED"
              ? renderPlacementGuide({
                  targetPoint: basketballPostPreview.targetPoint,
                  guideDirection: basketballPostPreview.normal,
                  visibleBounds,
                  scale: view.scale
                })
              : null}
          {renderBasketballPostSymbol(
            {
              key: `preview-${basketballPostPreview.segment.id}`,
              point: basketballPostPreview.point,
              tangent: basketballPostPreview.tangent,
              normal: basketballPostPreview.normal,
              facing: basketballPostPreview.facing
            },
            view.scale,
            {
              stroke: "#4d2612",
              accent: "#ffd18a",
              fill: "#f58e3f"
            }
          )}
          {renderRunDistanceLabels({
            keyPrefix: `basketball-post-${basketballPostPreview.segment.id}`,
            startPoint: basketballPostPreview.segment.start,
            splitStartPoint: basketballPostPreview.point,
            splitEndPoint: basketballPostPreview.point,
            endPoint: basketballPostPreview.segment.end,
            startDistanceMm: basketballPostPreview.offsetMm,
            endDistanceMm: basketballPostPreview.segmentLengthMm - basketballPostPreview.offsetMm,
            tangent: basketballPostPreview.tangent,
            startNormal: { x: -basketballPostPreview.normal.x, y: -basketballPostPreview.normal.y },
            endNormal: { x: -basketballPostPreview.normal.x, y: -basketballPostPreview.normal.y },
            scale: view.scale,
            fill: "rgba(67, 33, 14, 0.92)",
            textColor: "#fff0d8",
            stroke: "rgba(255, 187, 106, 0.42)"
          })}
          {renderCanvasLabel({
            keyValue: `basketball-post-main-${basketballPostPreview.segment.id}`,
            ...offsetPoint(
              basketballPostPreview.point,
              basketballPostPreview.tangent,
              basketballPostPreview.normal,
              view.scale,
              76,
              basketballPostPreview.facing === "LEFT" ? 18 : -18
            ),
            text: `BB Post - ${basketballPostPreview.facing === "LEFT" ? "Left" : "Right"}`,
            scale: view.scale,
            fill: "rgba(67, 33, 14, 0.92)",
            textColor: "#fff0d8",
            stroke: "rgba(255, 187, 106, 0.42)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 84
          })}
        </Group>
      ) : null}
      {floodlightColumnPreview ? (
        <Group key={`floodlight-column-preview-${floodlightColumnPreview.segment.id}`} listening={false}>
          {renderTargetSegmentHighlight(
            floodlightColumnPreview.segment.start,
            floodlightColumnPreview.segment.end,
            view.scale,
            "#ffe27a"
          )}
          {floodlightColumnPreview.alignmentGuide
            ? renderPlacementGuide({
                targetPoint: floodlightColumnPreview.targetPoint,
                guideDirection: floodlightColumnPreview.normal,
                visibleBounds,
                scale: view.scale,
                anchorPoint: floodlightColumnPreview.alignmentGuide.anchorPoint
              })
            : null}
          {renderFloodlightColumnSymbol(
            {
              key: `preview-${floodlightColumnPreview.segment.id}`,
              point: floodlightColumnPreview.point,
              tangent: floodlightColumnPreview.tangent,
              normal: floodlightColumnPreview.normal,
              facing: floodlightColumnPreview.facing
            },
            view.scale,
            {
              stroke: "#7a4c00",
              fill: "#f0bb2d",
              accent: "#fff0a8"
            }
          )}
          {renderRunDistanceLabels({
            keyPrefix: `floodlight-column-${floodlightColumnPreview.segment.id}`,
            startPoint: floodlightColumnPreview.segment.start,
            splitStartPoint: floodlightColumnPreview.point,
            splitEndPoint: floodlightColumnPreview.point,
            endPoint: floodlightColumnPreview.segment.end,
            startDistanceMm: floodlightColumnPreview.offsetMm,
            endDistanceMm: floodlightColumnPreview.segmentLengthMm - floodlightColumnPreview.offsetMm,
            tangent: floodlightColumnPreview.tangent,
            startNormal: { x: -floodlightColumnPreview.normal.x, y: -floodlightColumnPreview.normal.y },
            endNormal: { x: -floodlightColumnPreview.normal.x, y: -floodlightColumnPreview.normal.y },
            scale: view.scale,
            fill: "rgba(92, 58, 4, 0.92)",
            textColor: "#fff7d6",
            stroke: "rgba(255, 226, 122, 0.42)"
          })}
          {renderCanvasLabel({
            keyValue: `floodlight-column-main-${floodlightColumnPreview.segment.id}`,
            ...offsetPoint(
              floodlightColumnPreview.point,
              floodlightColumnPreview.tangent,
              floodlightColumnPreview.normal,
              view.scale,
              82
            ),
            text: "Floodlight Column",
            scale: view.scale,
            fill: "rgba(92, 58, 4, 0.92)",
            textColor: "#fff7d6",
            stroke: "rgba(255, 226, 122, 0.42)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 102
          })}
        </Group>
      ) : null}
      {interactionMode === "KICKBOARD" && kickboardPreview ? (
        <Group key={`kickboard-preview-${kickboardPreview.segment.id}`} listening={false}>
          {renderTargetSegmentHighlight(kickboardPreview.segment.start, kickboardPreview.segment.end, view.scale, "#cb8640")}
          {renderCanvasLabel({
            keyValue: `kickboard-preview-label-${kickboardPreview.segment.id}`,
            ...offsetPoint(
              midpoint(kickboardPreview.segment.start, kickboardPreview.segment.end),
              deriveSegmentAxes(kickboardPreview.segment.start, kickboardPreview.segment.end).tangent,
              deriveSegmentAxes(kickboardPreview.segment.start, kickboardPreview.segment.end).normal,
              view.scale,
              24
            ),
            text: "Apply kickboard",
            scale: view.scale,
            fill: "rgba(72, 38, 11, 0.92)",
            textColor: "#ffe7c8",
            stroke: "rgba(234, 169, 102, 0.42)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 92
          })}
        </Group>
      ) : null}
      {interactionMode === "SIDE_NETTING" && sideNettingSegmentPreview ? (
        <Group key={`side-netting-segment-preview-${sideNettingSegmentPreview.segment.id}`} listening={false}>
          {renderTargetSegmentHighlight(
            sideNettingSegmentPreview.segment.start,
            sideNettingSegmentPreview.segment.end,
            view.scale,
            "#69c6a3"
          )}
          {renderCanvasLabel({
            keyValue: `side-netting-segment-label-${sideNettingSegmentPreview.segment.id}`,
            ...offsetPoint(
              midpoint(sideNettingSegmentPreview.segment.start, sideNettingSegmentPreview.segment.end),
              deriveSegmentAxes(sideNettingSegmentPreview.segment.start, sideNettingSegmentPreview.segment.end).tangent,
              deriveSegmentAxes(sideNettingSegmentPreview.segment.start, sideNettingSegmentPreview.segment.end).normal,
              view.scale,
              24
            ),
            text: `Side netting ${formatLengthMm(distanceMm(sideNettingSegmentPreview.segment.start, sideNettingSegmentPreview.segment.end))}`,
            scale: view.scale,
            fill: "rgba(12, 60, 44, 0.92)",
            textColor: "#ddfff3",
            stroke: "rgba(105, 198, 163, 0.42)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 104
          })}
        </Group>
      ) : null}
      {interactionMode === "SIDE_NETTING" && sideNettingAnchorPreview && !sideNettingPreview ? (
        <Group key={`side-netting-anchor-preview-${sideNettingAnchorPreview.segment.id}`} listening={false}>
          {renderTargetSegmentHighlight(
            sideNettingAnchorPreview.segment.start,
            sideNettingAnchorPreview.segment.end,
            view.scale,
            "#69c6a3"
          )}
          {pendingSideNettingStart ? (
            <Circle
              x={pendingSideNettingStart.point.x}
              y={pendingSideNettingStart.point.y}
              radius={5 / view.scale}
              fill="#ddfff3"
              stroke="#1c4a3b"
              strokeWidth={1.2 / view.scale}
            />
          ) : null}
          <Circle
            x={sideNettingAnchorPreview.point.x}
            y={sideNettingAnchorPreview.point.y}
            radius={5 / view.scale}
            fill="#ddfff3"
            stroke="#1c4a3b"
            strokeWidth={1.2 / view.scale}
          />
          {renderCanvasLabel({
            keyValue: `side-netting-anchor-label-${sideNettingAnchorPreview.segment.id}`,
            ...offsetPoint(
              sideNettingAnchorPreview.point,
              deriveSegmentAxes(sideNettingAnchorPreview.segment.start, sideNettingAnchorPreview.segment.end).tangent,
              deriveSegmentAxes(sideNettingAnchorPreview.segment.start, sideNettingAnchorPreview.segment.end).normal,
              view.scale,
              26
            ),
            text: pendingSideNettingStart ? "Finish" : "Start",
            scale: view.scale,
            fill: "rgba(12, 60, 44, 0.92)",
            textColor: "#ddfff3",
            stroke: "rgba(105, 198, 163, 0.42)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 112
          })}
        </Group>
      ) : null}
      {interactionMode === "SIDE_NETTING" && sideNettingPreview ? (
        <Group
          key={`side-netting-preview-${sideNettingPreview.segment.id}-${sideNettingPreview.startOffsetMm}-${sideNettingPreview.endOffsetMm}`}
          listening={false}
        >
          <Line
            points={[
              sideNettingPreview.startPoint.x,
              sideNettingPreview.startPoint.y,
              sideNettingPreview.endPoint.x,
              sideNettingPreview.endPoint.y
            ]}
            stroke="#69c6a3"
            strokeWidth={3.2 / view.scale}
            dash={[12 / view.scale, 8 / view.scale]}
            lineCap="round"
          />
          <Circle x={sideNettingPreview.startPoint.x} y={sideNettingPreview.startPoint.y} radius={5 / view.scale} fill="#ddfff3" />
          <Circle x={sideNettingPreview.endPoint.x} y={sideNettingPreview.endPoint.y} radius={5 / view.scale} fill="#ddfff3" />
          {renderCanvasLabel({
            keyValue: `side-netting-preview-label-${sideNettingPreview.segment.id}`,
            x: (sideNettingPreview.startPoint.x + sideNettingPreview.endPoint.x) / 2,
            y: (sideNettingPreview.startPoint.y + sideNettingPreview.endPoint.y) / 2 - 18 / view.scale,
            text: formatLengthMm(sideNettingPreview.lengthMm),
            scale: view.scale,
            fill: "rgba(12, 60, 44, 0.92)",
            textColor: "#ddfff3",
            stroke: "rgba(105, 198, 163, 0.42)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 112
          })}
        </Group>
      ) : null}
      {interactionMode === "PITCH_DIVIDER" && pitchDividerAnchorPreview && !pitchDividerPreview ? (
        <Group key={`pitch-divider-anchor-preview-${pitchDividerAnchorPreview.segment.id}`} listening={false}>
          {renderTargetSegmentHighlight(
            pitchDividerAnchorPreview.segment.start,
            pitchDividerAnchorPreview.segment.end,
            view.scale,
            "#d5ebff"
          )}
          {pendingPitchDividerStart ? (
            <Circle
              x={pendingPitchDividerStart.point.x}
              y={pendingPitchDividerStart.point.y}
              radius={5 / view.scale}
              fill="#f1f8ff"
              stroke="#274660"
              strokeWidth={1.2 / view.scale}
            />
          ) : null}
          <Circle
            x={pitchDividerAnchorPreview.point.x}
            y={pitchDividerAnchorPreview.point.y}
            radius={5 / view.scale}
            fill="#f1f8ff"
            stroke="#274660"
            strokeWidth={1.2 / view.scale}
          />
          {renderCanvasLabel({
            keyValue: `pitch-divider-anchor-label-${pitchDividerAnchorPreview.segment.id}`,
            ...offsetPoint(
              pitchDividerAnchorPreview.point,
              deriveSegmentAxes(pitchDividerAnchorPreview.segment.start, pitchDividerAnchorPreview.segment.end).tangent,
              deriveSegmentAxes(pitchDividerAnchorPreview.segment.start, pitchDividerAnchorPreview.segment.end).normal,
              view.scale,
              26
            ),
            text: pendingPitchDividerStart ? "Choose opposite anchor" : "Pitch divider anchor",
            scale: view.scale,
            fill: "rgba(20, 43, 64, 0.92)",
            textColor: "#e9f4ff",
            stroke: "rgba(144, 194, 245, 0.38)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 112
          })}
        </Group>
      ) : null}
      {interactionMode === "PITCH_DIVIDER" && pitchDividerPreview ? (
        <Group key={`pitch-divider-preview-${pitchDividerPreview.startAnchor.segment.id}-${pitchDividerPreview.endAnchor.segment.id}`} listening={false}>
          <Line
            points={[
              pitchDividerPreview.startAnchor.point.x,
              pitchDividerPreview.startAnchor.point.y,
              pitchDividerPreview.endAnchor.point.x,
              pitchDividerPreview.endAnchor.point.y
            ]}
            stroke={pitchDividerPreview.isValid ? "#d5ebff" : "#ff8d8d"}
            strokeWidth={2.4 / view.scale}
            dash={[10 / view.scale, 8 / view.scale]}
            lineCap="round"
          />
          <Circle x={pitchDividerPreview.startAnchor.point.x} y={pitchDividerPreview.startAnchor.point.y} radius={5 / view.scale} fill="#f1f8ff" />
          <Circle x={pitchDividerPreview.endAnchor.point.x} y={pitchDividerPreview.endAnchor.point.y} radius={5 / view.scale} fill="#f1f8ff" />
          {pitchDividerPreview.supportPoints.map((point, index) => (
            <Circle
              key={`pitch-divider-preview-support-${index}`}
              x={point.x}
              y={point.y}
              radius={4 / view.scale}
              fill={pitchDividerPreview.isValid ? "#d8efff" : "#ffd5d5"}
            />
          ))}
          {renderCanvasLabel({
            keyValue: "pitch-divider-preview-label",
            x: (pitchDividerPreview.startAnchor.point.x + pitchDividerPreview.endAnchor.point.x) / 2,
            y: (pitchDividerPreview.startAnchor.point.y + pitchDividerPreview.endAnchor.point.y) / 2 - 18 / view.scale,
            text: pitchDividerPreview.isValid
              ? `Pitch divider ${formatLengthMm(pitchDividerPreview.spanLengthMm)}`
              : "Pitch divider exceeds 70m",
            scale: view.scale,
            fill: pitchDividerPreview.isValid ? "rgba(20, 43, 64, 0.92)" : "rgba(86, 22, 22, 0.92)",
            textColor: pitchDividerPreview.isValid ? "#e9f4ff" : "#ffe3e3",
            stroke: pitchDividerPreview.isValid ? "rgba(144, 194, 245, 0.38)" : "rgba(255, 141, 141, 0.42)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 112
          })}
        </Group>
      ) : null}
      {oppositeGateGuides.map((guide) => (
        <Line
          key={`gate-opposite-guide-${guide.key}`}
          points={[guide.start.x, guide.start.y, guide.end.x, guide.end.y]}
          stroke="#bda77d"
          strokeWidth={2.1 / view.scale}
          dash={[10 / view.scale, 7 / view.scale]}
          lineCap="round"
          listening={false}
          opacity={0.72}
        />
      ))}
      {interactionMode === "DRAW" && drawHoverSnap ? (
        <Group listening={false}>
          {renderTargetSegmentHighlight(
            drawHoverSnap.segment.start,
            drawHoverSnap.segment.end,
            view.scale,
            "#7fe6ff"
          )}
          <Line
            points={[drawHoverSnap.segment.start.x, drawHoverSnap.segment.start.y, drawHoverSnap.point.x, drawHoverSnap.point.y]}
            stroke="#9fe7f8"
            strokeWidth={2.6 / view.scale}
            dash={[10 / view.scale, 7 / view.scale]}
          />
          <Line
            points={[drawHoverSnap.point.x, drawHoverSnap.point.y, drawHoverSnap.segment.end.x, drawHoverSnap.segment.end.y]}
            stroke="#ffd28b"
            strokeWidth={2.6 / view.scale}
            dash={[10 / view.scale, 7 / view.scale]}
          />
          <Circle x={drawHoverSnap.point.x} y={drawHoverSnap.point.y} radius={5.2 / view.scale} fill="#eefcff" opacity={0.98} />
          {(() => {
            const hoverAxes = deriveSegmentAxes(drawHoverSnap.segment.start, drawHoverSnap.segment.end);
            return renderRunDistanceLabels({
              keyPrefix: `draw-hover-${drawHoverSnap.segment.id}`,
              startPoint: drawHoverSnap.segment.start,
              splitStartPoint: drawHoverSnap.point,
              splitEndPoint: drawHoverSnap.point,
              endPoint: drawHoverSnap.segment.end,
              startDistanceMm: drawHoverSnap.startOffsetMm,
              endDistanceMm: drawHoverSnap.endOffsetMm,
              tangent: hoverAxes.tangent,
              startNormal: hoverAxes.normal,
              endNormal: { x: -hoverAxes.normal.x, y: -hoverAxes.normal.y },
              scale: view.scale
            });
          })()}
        </Group>
      ) : null}
      {interactionMode === "RECTANGLE" && rectangleStart && rectanglePreviewEnd ? (
        <Group listening={false}>
          <Line
            points={[
              rectangleStart.x,
              rectangleStart.y,
              rectanglePreviewEnd.x,
              rectangleStart.y,
              rectanglePreviewEnd.x,
              rectanglePreviewEnd.y,
              rectangleStart.x,
              rectanglePreviewEnd.y,
              rectangleStart.x,
              rectangleStart.y
            ]}
            stroke="#aebec4"
            strokeWidth={GHOST_STROKE_PX / view.scale}
            dash={[10 / view.scale, 7 / view.scale]}
            lineCap="round"
            lineJoin="round"
          />
          {renderCanvasLabel({
            keyValue: "rectangle-width",
            x: (rectangleStart.x + rectanglePreviewEnd.x) / 2,
            y: rectangleStart.y - (18 * rectangleWidthDirection) / view.scale,
            text: formatLengthMm(Math.abs(rectanglePreviewEnd.x - rectangleStart.x)),
            scale: view.scale,
            fill: "rgba(15, 23, 24, 0.74)",
            textColor: "#dce7ea",
            stroke: "rgba(227, 238, 241, 0.14)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 46
          })}
          {renderCanvasLabel({
            keyValue: "rectangle-height",
            x: rectanglePreviewEnd.x + (18 * rectangleHeightDirection) / view.scale,
            y: (rectangleStart.y + rectanglePreviewEnd.y) / 2,
            text: formatLengthMm(Math.abs(rectanglePreviewEnd.y - rectangleStart.y)),
            scale: view.scale,
            fill: "rgba(15, 23, 24, 0.74)",
            textColor: "#dce7ea",
            stroke: "rgba(227, 238, 241, 0.14)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 46
          })}
        </Group>
      ) : null}
      {drawStart && ghostEnd ? (
        <>
          {activeDrawNodeSnap && !closeLoopPoint ? (
            <Group listening={false}>
              {activeDrawNodeSnap.segments.map((segment) => {
                const segmentAxes = deriveSegmentAxes(segment.start, segment.end);
                const startDistanceMm = Math.round(distanceMm(segment.start, activeDrawNodeSnap.point));
                const endDistanceMm = Math.round(distanceMm(activeDrawNodeSnap.point, segment.end));

                return (
                  <Group key={`draw-node-snap-segment-${segment.id}`}>
                    {renderTargetSegmentHighlight(segment.start, segment.end, view.scale, "#8ceaff")}
                    {startDistanceMm > MIN_SEGMENT_MM ? (
                      <Line
                        points={[segment.start.x, segment.start.y, activeDrawNodeSnap.point.x, activeDrawNodeSnap.point.y]}
                        stroke="#9fe7f8"
                        strokeWidth={3.2 / view.scale}
                        dash={[12 / view.scale, 8 / view.scale]}
                        lineCap="round"
                      />
                    ) : null}
                    {endDistanceMm > MIN_SEGMENT_MM ? (
                      <Line
                        points={[activeDrawNodeSnap.point.x, activeDrawNodeSnap.point.y, segment.end.x, segment.end.y]}
                        stroke="#ffd28b"
                        strokeWidth={3.2 / view.scale}
                        dash={[12 / view.scale, 8 / view.scale]}
                        lineCap="round"
                      />
                    ) : null}
                    {renderRunDistanceLabels({
                      keyPrefix: `draw-node-snap-${segment.id}`,
                      startPoint: segment.start,
                      splitStartPoint: activeDrawNodeSnap.point,
                      splitEndPoint: activeDrawNodeSnap.point,
                      endPoint: segment.end,
                      startDistanceMm,
                      endDistanceMm,
                      tangent: segmentAxes.tangent,
                      startNormal: segmentAxes.normal,
                      endNormal: { x: -segmentAxes.normal.x, y: -segmentAxes.normal.y },
                      scale: view.scale,
                      fill: "rgba(12, 48, 55, 0.94)",
                      textColor: "#effcff",
                      stroke: "rgba(140, 234, 255, 0.42)"
                    })}
                  </Group>
                );
              })}
              <Circle
                x={activeDrawNodeSnap.point.x}
                y={activeDrawNodeSnap.point.y}
                radius={18 / view.scale}
                stroke="#86e8ff"
                strokeWidth={2.8 / view.scale}
                opacity={0.34}
              />
              <Circle
                x={activeDrawNodeSnap.point.x}
                y={activeDrawNodeSnap.point.y}
                radius={11 / view.scale}
                stroke="#ffe2a1"
                strokeWidth={2.2 / view.scale}
                opacity={0.98}
              />
              <Circle
                x={activeDrawNodeSnap.point.x}
                y={activeDrawNodeSnap.point.y}
                radius={5.8 / view.scale}
                fill="#f7fdff"
                stroke="#163741"
                strokeWidth={1.1 / view.scale}
                opacity={0.98}
              />
              <Line
                points={[
                  activeDrawNodeSnap.point.x - 12 / view.scale,
                  activeDrawNodeSnap.point.y,
                  activeDrawNodeSnap.point.x + 12 / view.scale,
                  activeDrawNodeSnap.point.y
                ]}
                stroke="#fff1bf"
                strokeWidth={1.7 / view.scale}
                lineCap="round"
              />
              <Line
                points={[
                  activeDrawNodeSnap.point.x,
                  activeDrawNodeSnap.point.y - 12 / view.scale,
                  activeDrawNodeSnap.point.x,
                  activeDrawNodeSnap.point.y + 12 / view.scale
                ]}
                stroke="#fff1bf"
                strokeWidth={1.7 / view.scale}
                lineCap="round"
              />
              {renderCanvasLabel({
                keyValue: "draw-node-snap-label",
                x: activeDrawNodeSnap.point.x,
                y: activeDrawNodeSnap.point.y - 34 / view.scale,
                text: "Fence snap",
                scale: view.scale,
                fill: "rgba(12, 48, 55, 0.94)",
                textColor: "#effcff",
                stroke: "rgba(140, 234, 255, 0.42)",
                fontSizePx: LABEL_FONT_SIZE_PX,
                minWidthPx: 70
              })}
            </Group>
          ) : null}
          {axisGuide ? (
            <>
              <Line
                listening={false}
                points={
                  axisGuide.orientation === "VERTICAL"
                    ? [axisGuide.coordinateMm, visibleBounds.top, axisGuide.coordinateMm, visibleBounds.bottom]
                    : [visibleBounds.left, axisGuide.coordinateMm, visibleBounds.right, axisGuide.coordinateMm]
                }
                stroke="#b9c7ce"
                strokeWidth={1.3 / view.scale}
                dash={[7 / view.scale, 6 / view.scale]}
                opacity={0.72}
              />
              <Circle
                listening={false}
                x={axisGuide.anchor.x}
                y={axisGuide.anchor.y}
                radius={4.5 / view.scale}
                fill="#e2ebef"
              />
            </>
          ) : null}
          <Line
            listening={false}
            points={[drawStart.x, drawStart.y, ghostEnd.x, ghostEnd.y]}
            stroke="#d0b07f"
            strokeWidth={GHOST_STROKE_PX / view.scale}
            dash={[10 / view.scale, 7 / view.scale]}
            lineCap="round"
          />
          {renderCanvasLabel({
            keyValue: "draw-ghost-length",
            ...offsetPoint(
              midpoint(drawStart, ghostEnd),
              ghostAxes?.tangent ?? { x: 1, y: 0 },
              ghostAxes?.normal ?? { x: 0, y: -1 },
              view.scale,
              18
            ),
          text: formatLengthMm(ghostLengthMm),
          scale: view.scale,
          fill: "rgba(12, 48, 55, 0.92)",
          textColor: "#dbfbff",
          stroke: "rgba(127, 230, 255, 0.36)",
          fontSizePx: LABEL_FONT_SIZE_PX,
          minWidthPx: 54
        })}
          {closeLoopPoint ? (
            <>
              <Circle
                listening={false}
                x={closeLoopPoint.x}
                y={closeLoopPoint.y}
                radius={8 / view.scale}
                stroke="#d8bf8d"
                strokeWidth={1.8 / view.scale}
              />
              {renderCanvasLabel({
                keyValue: "close-loop-label",
                x: closeLoopPoint.x,
                y: closeLoopPoint.y - 26 / view.scale,
                text: "Close shape",
                scale: view.scale,
                fill: "rgba(46, 38, 24, 0.84)",
                textColor: "#f1dfbd",
                stroke: "rgba(233, 205, 154, 0.2)",
                fontSizePx: LABEL_FONT_SIZE_PX,
                minWidthPx: 72
              })}
            </>
          ) : null}
        </>
      ) : null}
    </Layer>
  );
}
