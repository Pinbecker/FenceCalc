import { Circle, Group, Layer, Line } from "react-konva";

import { formatLengthMm } from "../../formatters";
import { GHOST_STROKE_PX, LABEL_FONT_SIZE_PX } from "../constants";
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
          {recessPreview.alignmentGuide ? (
            <>
              <Line
                points={[
                  recessPreview.alignmentGuide.anchorPoint.x,
                  recessPreview.alignmentGuide.anchorPoint.y,
                  recessPreview.alignmentGuide.targetPoint.x,
                  recessPreview.alignmentGuide.targetPoint.y
                ]}
                stroke="#b8c8d0"
                strokeWidth={1.5 / view.scale}
                dash={[7 / view.scale, 5 / view.scale]}
                opacity={0.72}
              />
              <Circle
                x={recessPreview.alignmentGuide.anchorPoint.x}
                y={recessPreview.alignmentGuide.anchorPoint.y}
                radius={4.2 / view.scale}
                fill="#d9e6eb"
              />
            </>
          ) : null}
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
