import type { GateType } from "@fence-estimator/contracts";
import { Circle, Group, Layer, Line } from "react-konva";
import { distanceMm } from "@fence-estimator/geometry";

import { formatLengthMm } from "../../formatters";
import { renderBasketballPostSymbol } from "../basketballPostGeometry";
import { GHOST_STROKE_PX, LABEL_FONT_SIZE_PX, MIN_SEGMENT_MM } from "../constants";
import { renderGateSymbol } from "../gateGeometry";
import { renderCanvasLabel } from "./canvasLabel";
import type { EditorCanvasStageProps } from "./types";

type EditorCanvasPreviewLayerProps = Pick<
  EditorCanvasStageProps,
  | "axisGuide"
  | "activeDrawNodeSnap"
  | "gateType"
  | "drawHoverSnap"
  | "drawStart"
  | "basketballPostPreview"
  | "gatePreview"
  | "gatePreviewVisual"
  | "ghostEnd"
  | "ghostLengthMm"
  | "interactionMode"
  | "oppositeGateGuides"
  | "rectanglePreviewEnd"
  | "rectangleStart"
  | "recessPreview"
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
  gateType,
  drawHoverSnap,
  drawStart,
  basketballPostPreview,
  gatePreview,
  gatePreviewVisual,
  ghostEnd,
  ghostLengthMm,
  interactionMode,
  oppositeGateGuides,
  rectanglePreviewEnd,
  rectangleStart,
  recessPreview,
  view,
  visibleBounds,
  closeLoopPoint
}: EditorCanvasPreviewLayerProps) {
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
      {interactionMode === "GATE" && gatePreview ? (
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
      {interactionMode === "BASKETBALL_POST" && basketballPostPreview ? (
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
