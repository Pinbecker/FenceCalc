import { Circle, Group, Layer, Line } from "react-konva";

import { formatLengthMm } from "../../formatters";
import { GHOST_STROKE_PX, LABEL_FONT_SIZE_PX, MIN_SEGMENT_MM } from "../constants";
import { renderGateSymbol } from "../gateGeometry";
import { renderCanvasLabel } from "./canvasLabel";
import type { EditorCanvasStageProps } from "./types";

type EditorCanvasPreviewLayerProps = Pick<
  EditorCanvasStageProps,
  | "axisGuide"
  | "drawHoverSnap"
  | "drawStart"
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
  scale
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
}) {
  return (
    <>
      {startDistanceMm > MIN_SEGMENT_MM
        ? renderCanvasLabel({
            keyValue: `${keyPrefix}-start-distance`,
            ...offsetPoint(midpoint(startPoint, splitStartPoint), tangent, startNormal, scale, 20, -18),
            text: formatLengthMm(startDistanceMm),
            scale,
            fill: "rgba(15, 23, 24, 0.74)",
            textColor: "#dce7ea",
            stroke: "rgba(227, 238, 241, 0.14)",
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
            fill: "rgba(15, 23, 24, 0.74)",
            textColor: "#dce7ea",
            stroke: "rgba(227, 238, 241, 0.14)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 42
          })
        : null}
    </>
  );
}

export function EditorCanvasPreviewLayer({
  axisGuide,
  drawHoverSnap,
  drawStart,
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

  return (
    <Layer>
      {interactionMode === "RECESS" && recessPreview ? (
        <Group key={`recess-preview-${recessPreview.segment.id}`} listening={false}>
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
            fill: "rgba(28, 42, 39, 0.82)",
            textColor: "#eef5f2",
            stroke: "rgba(175, 198, 188, 0.2)",
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 92
          })}
        </Group>
      ) : null}
      {interactionMode === "GATE" && gatePreview ? (
        <Group key={`gate-preview-${gatePreview.segment.id}`} listening={false}>
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
            stroke="#9db8c3"
            strokeWidth={4 / view.scale}
            lineCap="round"
          />
          {gatePreviewVisual
            ? renderGateSymbol(
                gatePreviewVisual,
                view.scale,
                {
                  frameStroke: "#bfd3d9",
                  leafStroke: "#ece7da",
                  swingStroke: "#c7b88f",
                  markerFill: "#eef4f3",
                  labelColor: "#f4efe2"
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
            stroke="#9db8c3"
            strokeWidth={4 / view.scale}
            lineCap="round"
          />
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
          <Line
            points={[drawHoverSnap.segment.start.x, drawHoverSnap.segment.start.y, drawHoverSnap.point.x, drawHoverSnap.point.y]}
            stroke="#9db8c3"
            strokeWidth={1.8 / view.scale}
            dash={[8 / view.scale, 6 / view.scale]}
          />
          <Line
            points={[drawHoverSnap.point.x, drawHoverSnap.point.y, drawHoverSnap.segment.end.x, drawHoverSnap.segment.end.y]}
            stroke="#bda77d"
            strokeWidth={1.8 / view.scale}
            dash={[8 / view.scale, 6 / view.scale]}
          />
          <Circle x={drawHoverSnap.point.x} y={drawHoverSnap.point.y} radius={4 / view.scale} fill="#eef5f2" opacity={0.95} />
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
            fill: "rgba(46, 38, 24, 0.84)",
            textColor: "#f1dfbd",
            stroke: "rgba(233, 205, 154, 0.2)",
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
