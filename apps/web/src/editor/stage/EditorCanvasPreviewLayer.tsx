import { Circle, Group, Layer, Line, Text } from "react-konva";

import { formatLengthMm } from "../../formatters";
import { GHOST_STROKE_PX, LABEL_FONT_SIZE_PX, MIN_SEGMENT_MM } from "../constants";
import { renderGateSymbol } from "../gateGeometry";
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
>;

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
  visibleBounds
}: EditorCanvasPreviewLayerProps) {
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
            stroke="#7dd3fc"
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
            stroke="#00e0a4"
            strokeWidth={4.5 / view.scale}
            dash={[10 / view.scale, 7 / view.scale]}
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
            stroke="#7dd3fc"
            strokeWidth={4 / view.scale}
            lineCap="round"
          />
          <Circle
            x={recessPreview.targetPoint.x}
            y={recessPreview.targetPoint.y}
            radius={4 / view.scale}
            fill="#00e0a4"
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
                stroke="#8fd9ff"
                strokeWidth={1.8 / view.scale}
                dash={[7 / view.scale, 5 / view.scale]}
                opacity={0.9}
              />
              <Circle
                x={recessPreview.alignmentGuide.anchorPoint.x}
                y={recessPreview.alignmentGuide.anchorPoint.y}
                radius={4.2 / view.scale}
                fill="#8fd9ff"
              />
            </>
          ) : null}
          {recessPreview.startOffsetMm > MIN_SEGMENT_MM ? (
            <Text
              x={(recessPreview.segment.start.x + recessPreview.entryPoint.x) / 2}
              y={(recessPreview.segment.start.y + recessPreview.entryPoint.y) / 2}
              text={formatLengthMm(recessPreview.startOffsetMm)}
              fontSize={LABEL_FONT_SIZE_PX / view.scale}
              fill="#7dd3fc"
              offsetX={24 / view.scale}
              offsetY={18 / view.scale}
            />
          ) : null}
          {recessPreview.segmentLengthMm - recessPreview.endOffsetMm > MIN_SEGMENT_MM ? (
            <Text
              x={(recessPreview.exitPoint.x + recessPreview.segment.end.x) / 2}
              y={(recessPreview.exitPoint.y + recessPreview.segment.end.y) / 2}
              text={formatLengthMm(recessPreview.segmentLengthMm - recessPreview.endOffsetMm)}
              fontSize={LABEL_FONT_SIZE_PX / view.scale}
              fill="#7dd3fc"
              offsetX={24 / view.scale}
              offsetY={18 / view.scale}
            />
          ) : null}
          <Text
            x={(recessPreview.recessEntryPoint.x + recessPreview.recessExitPoint.x) / 2}
            y={(recessPreview.recessEntryPoint.y + recessPreview.recessExitPoint.y) / 2}
            text={`Recess ${formatLengthMm(recessPreview.endOffsetMm - recessPreview.startOffsetMm)} x ${formatLengthMm(recessPreview.depthMm)}`}
            fontSize={LABEL_FONT_SIZE_PX / view.scale}
            fill="#00e0a4"
            offsetX={48 / view.scale}
            offsetY={20 / view.scale}
          />
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
            stroke="#41d9ff"
            strokeWidth={4 / view.scale}
            lineCap="round"
          />
          {gatePreviewVisual
            ? renderGateSymbol(
                gatePreviewVisual,
                view.scale,
                {
                  frameStroke: "#d8f6ff",
                  leafStroke: "#ffffff",
                  swingStroke: "#ffe29a",
                  markerFill: "#ffffff",
                  labelColor: "#ffe29a"
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
            stroke="#41d9ff"
            strokeWidth={4 / view.scale}
            lineCap="round"
          />
          {gatePreview.startOffsetMm > MIN_SEGMENT_MM ? (
            <Text
              x={(gatePreview.segment.start.x + gatePreview.entryPoint.x) / 2}
              y={(gatePreview.segment.start.y + gatePreview.entryPoint.y) / 2}
              text={formatLengthMm(gatePreview.startOffsetMm)}
              fontSize={LABEL_FONT_SIZE_PX / view.scale}
              fill="#7dd3fc"
              offsetX={24 / view.scale}
              offsetY={18 / view.scale}
            />
          ) : null}
          {gatePreview.segmentLengthMm - gatePreview.endOffsetMm > MIN_SEGMENT_MM ? (
            <Text
              x={(gatePreview.exitPoint.x + gatePreview.segment.end.x) / 2}
              y={(gatePreview.exitPoint.y + gatePreview.segment.end.y) / 2}
              text={formatLengthMm(gatePreview.segmentLengthMm - gatePreview.endOffsetMm)}
              fontSize={LABEL_FONT_SIZE_PX / view.scale}
              fill="#7dd3fc"
              offsetX={24 / view.scale}
              offsetY={18 / view.scale}
            />
          ) : null}
        </Group>
      ) : null}
      {oppositeGateGuides.map((guide) => (
        <Line
          key={`gate-opposite-guide-${guide.key}`}
          points={[guide.start.x, guide.start.y, guide.end.x, guide.end.y]}
          stroke="#ffd166"
          strokeWidth={2.8 / view.scale}
          dash={[12 / view.scale, 7 / view.scale]}
          lineCap="round"
          listening={false}
          opacity={0.98}
        />
      ))}
      {interactionMode === "DRAW" && drawHoverSnap ? (
        <Group listening={false}>
          <Line
            points={[drawHoverSnap.segment.start.x, drawHoverSnap.segment.start.y, drawHoverSnap.point.x, drawHoverSnap.point.y]}
            stroke="#41d9ff"
            strokeWidth={2.2 / view.scale}
            dash={[8 / view.scale, 5 / view.scale]}
          />
          <Line
            points={[drawHoverSnap.point.x, drawHoverSnap.point.y, drawHoverSnap.segment.end.x, drawHoverSnap.segment.end.y]}
            stroke="#ffd166"
            strokeWidth={2.2 / view.scale}
            dash={[8 / view.scale, 5 / view.scale]}
          />
          <Circle x={drawHoverSnap.point.x} y={drawHoverSnap.point.y} radius={4.2 / view.scale} fill="#ffffff" opacity={0.95} />
          <Text
            x={(drawHoverSnap.segment.start.x + drawHoverSnap.point.x) / 2}
            y={(drawHoverSnap.segment.start.y + drawHoverSnap.point.y) / 2}
            text={formatLengthMm(drawHoverSnap.startOffsetMm)}
            fontSize={LABEL_FONT_SIZE_PX / view.scale}
            fill="#41d9ff"
            offsetX={(formatLengthMm(drawHoverSnap.startOffsetMm).length * 3.6) / view.scale}
            offsetY={18 / view.scale}
          />
          <Text
            x={(drawHoverSnap.segment.end.x + drawHoverSnap.point.x) / 2}
            y={(drawHoverSnap.segment.end.y + drawHoverSnap.point.y) / 2}
            text={formatLengthMm(drawHoverSnap.endOffsetMm)}
            fontSize={LABEL_FONT_SIZE_PX / view.scale}
            fill="#ffd166"
            offsetX={(formatLengthMm(drawHoverSnap.endOffsetMm).length * 3.6) / view.scale}
            offsetY={18 / view.scale}
          />
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
            stroke="#8fd9ff"
            strokeWidth={GHOST_STROKE_PX / view.scale}
            dash={[10 / view.scale, 7 / view.scale]}
            lineCap="round"
            lineJoin="round"
          />
          <Text
            x={(rectangleStart.x + rectanglePreviewEnd.x) / 2}
            y={rectangleStart.y}
            text={formatLengthMm(Math.abs(rectanglePreviewEnd.x - rectangleStart.x))}
            fontSize={LABEL_FONT_SIZE_PX / view.scale}
            fill="#8fd9ff"
            offsetX={40 / view.scale}
            offsetY={12 / view.scale}
          />
          <Text
            x={rectanglePreviewEnd.x}
            y={(rectangleStart.y + rectanglePreviewEnd.y) / 2}
            text={formatLengthMm(Math.abs(rectanglePreviewEnd.y - rectangleStart.y))}
            fontSize={LABEL_FONT_SIZE_PX / view.scale}
            fill="#8fd9ff"
            offsetX={10 / view.scale}
            offsetY={12 / view.scale}
          />
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
                stroke="#8fd9ff"
                strokeWidth={1.6 / view.scale}
                dash={[7 / view.scale, 5 / view.scale]}
                opacity={0.8}
              />
              <Circle
                listening={false}
                x={axisGuide.anchor.x}
                y={axisGuide.anchor.y}
                radius={4.5 / view.scale}
                fill="#8fd9ff"
              />
            </>
          ) : null}
          <Line
            listening={false}
            points={[drawStart.x, drawStart.y, ghostEnd.x, ghostEnd.y]}
            stroke="#ff6b35"
            strokeWidth={GHOST_STROKE_PX / view.scale}
            dash={[10 / view.scale, 7 / view.scale]}
            lineCap="round"
          />
          <Text
            listening={false}
            x={(drawStart.x + ghostEnd.x) / 2}
            y={(drawStart.y + ghostEnd.y) / 2}
            text={formatLengthMm(ghostLengthMm)}
            fontSize={LABEL_FONT_SIZE_PX / view.scale}
            fill="#ffd166"
            offsetX={42 / view.scale}
            offsetY={20 / view.scale}
          />
        </>
      ) : null}
    </Layer>
  );
}
