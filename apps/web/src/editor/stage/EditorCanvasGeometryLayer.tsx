import { Circle, Group, Layer, Line, Rect, RegularPolygon, Text } from "react-konva";
import { distanceMm } from "@fence-estimator/geometry";

import { formatLengthMm } from "../../formatters";
import {
  HANDLE_RADIUS_PX,
  LABEL_FONT_SIZE_PX,
  POST_SYMBOL_RADIUS_PX,
  SEGMENT_SELECTED_STROKE_PX,
  SEGMENT_STROKE_PX,
  getSegmentColor,
  quantize
} from "../constants";
import { renderGateSymbol } from "../gateGeometry";
import { buildSegmentRuns } from "../segmentTopology";
import type { VisualPost } from "../types";
import type { EditorCanvasStageProps } from "./types";

type EditorCanvasGeometryLayerProps = Pick<
  EditorCanvasStageProps,
  | "gatesBySegmentId"
  | "interactionMode"
  | "onOpenSegmentLengthEditor"
  | "onSelectGate"
  | "onSelectSegment"
  | "onStartGateDrag"
  | "onStartSegmentDrag"
  | "onUpdateSegmentEndpoint"
  | "placedGateVisuals"
  | "segmentLengthLabelsBySegmentId"
  | "segments"
  | "selectedGateId"
  | "selectedPlanVisual"
  | "selectedSegmentId"
  | "view"
  | "visibleSegmentLabelKeys"
  | "visualPosts"
>;

function renderPostSymbol(post: VisualPost, scale: number) {
  const size = POST_SYMBOL_RADIUS_PX / scale;
  const strokeWidth = 1.35 / scale;

  if (post.kind === "INTERMEDIATE") {
    return (
      <Rect
        key={post.key}
        x={post.point.x - size}
        y={post.point.y - size}
        width={size * 2}
        height={size * 2}
        fill="#46d3ff"
        stroke="#061019"
        strokeWidth={strokeWidth}
        listening={false}
      />
    );
  }

  if (post.kind === "CORNER") {
    return (
      <RegularPolygon
        key={post.key}
        x={post.point.x}
        y={post.point.y}
        sides={4}
        radius={size * 1.2}
        rotation={45}
        fill="#ff9f5a"
        stroke="#061019"
        strokeWidth={strokeWidth}
        listening={false}
      />
    );
  }

  if (post.kind === "JUNCTION") {
    return (
      <RegularPolygon
        key={post.key}
        x={post.point.x}
        y={post.point.y}
        sides={3}
        radius={size * 1.35}
        rotation={180}
        fill="#ff5d8f"
        stroke="#061019"
        strokeWidth={strokeWidth}
        listening={false}
      />
    );
  }

  if (post.kind === "INLINE_JOIN") {
    return (
      <RegularPolygon
        key={post.key}
        x={post.point.x}
        y={post.point.y}
        sides={6}
        radius={size * 1.1}
        fill="#b9d3f0"
        stroke="#061019"
        strokeWidth={strokeWidth}
        listening={false}
      />
    );
  }

  if (post.kind === "GATE") {
    return (
      <RegularPolygon
        key={post.key}
        x={post.point.x}
        y={post.point.y}
        sides={4}
        radius={size * 1.25}
        fill="#ffe08a"
        stroke="#061019"
        strokeWidth={strokeWidth}
        listening={false}
      />
    );
  }

  return (
    <Circle
      key={post.key}
      x={post.point.x}
      y={post.point.y}
      radius={size * 1.1}
      fill="#ffd166"
      stroke="#061019"
      strokeWidth={strokeWidth}
      listening={false}
    />
  );
}

export function EditorCanvasGeometryLayer({
  gatesBySegmentId,
  interactionMode,
  onOpenSegmentLengthEditor,
  onSelectGate,
  onSelectSegment,
  onStartGateDrag,
  onStartSegmentDrag,
  onUpdateSegmentEndpoint,
  placedGateVisuals,
  segmentLengthLabelsBySegmentId,
  segments,
  selectedGateId,
  selectedPlanVisual,
  selectedSegmentId,
  view,
  visibleSegmentLabelKeys,
  visualPosts
}: EditorCanvasGeometryLayerProps) {
  return (
    <Layer>
      {visualPosts.map((post) => renderPostSymbol(post, view.scale))}
      {segments.map((segment) => {
        const isSelected = segment.id === selectedSegmentId;
        const lengthLabels = segmentLengthLabelsBySegmentId.get(segment.id) ?? [];
        const segmentRuns = buildSegmentRuns(segment, gatesBySegmentId.get(segment.id) ?? []);
        const color = getSegmentColor(segment.spec);

        return (
          <Group key={segment.id}>
            {segmentRuns.map((run, runIndex) => (
              <Line
                key={`${segment.id}-run-${runIndex}`}
                points={[run.start.x, run.start.y, run.end.x, run.end.y]}
                stroke={color}
                opacity={selectedPlanVisual ? 0.75 : 1}
                strokeWidth={(isSelected ? SEGMENT_SELECTED_STROKE_PX : SEGMENT_STROKE_PX) / view.scale}
                {...(segment.spec.system === "ROLL_FORM" ? { dash: [12 / view.scale, 8 / view.scale] } : {})}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            ))}
            <Line
              points={[segment.start.x, segment.start.y, segment.end.x, segment.end.y]}
              stroke="#ffffff"
              opacity={0.001}
              strokeWidth={Math.max(SEGMENT_STROKE_PX, SEGMENT_SELECTED_STROKE_PX) / view.scale}
              hitStrokeWidth={22 / view.scale}
              lineCap="round"
              lineJoin="round"
              onMouseDown={(event) => {
                if (interactionMode !== "SELECT" || !isSelected || event.evt.button !== 0) {
                  return;
                }
                event.cancelBubble = true;
                onStartSegmentDrag(segment.id);
              }}
              onTouchStart={(event) => {
                if (interactionMode !== "SELECT" || !isSelected) {
                  return;
                }
                event.cancelBubble = true;
                onStartSegmentDrag(segment.id);
              }}
              onClick={(event) => {
                event.cancelBubble = true;
                if (interactionMode !== "SELECT") {
                  return;
                }
                onSelectSegment(segment.id);
              }}
              onTap={() => {
                if (interactionMode !== "SELECT") {
                  return;
                }
                onSelectSegment(segment.id);
              }}
            />
            {lengthLabels.map((label) =>
              visibleSegmentLabelKeys.has(label.key) ? (
                <Text
                  key={`segment-label-${label.key}`}
                  x={label.x}
                  y={label.y}
                  text={label.text}
                  fontSize={LABEL_FONT_SIZE_PX / view.scale}
                  fill={isSelected ? "#ffd166" : "#d8e8f7"}
                  offsetX={(label.text.length * 3.6) / view.scale}
                  offsetY={8 / view.scale}
                  listening={interactionMode === "SELECT"}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    onOpenSegmentLengthEditor(segment.id);
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    onOpenSegmentLengthEditor(segment.id);
                  }}
                />
              ) : null
            )}
            {lengthLabels.length === 0 ? (
              <Text
                x={(segment.start.x + segment.end.x) / 2}
                y={(segment.start.y + segment.end.y) / 2}
                text={formatLengthMm(distanceMm(segment.start, segment.end))}
                fontSize={LABEL_FONT_SIZE_PX / view.scale}
                fill={isSelected ? "#ffd166" : "#d8e8f7"}
                offsetX={22 / view.scale}
                offsetY={8 / view.scale}
                listening={interactionMode === "SELECT"}
                onClick={(event) => {
                  event.cancelBubble = true;
                  onOpenSegmentLengthEditor(segment.id);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  onOpenSegmentLengthEditor(segment.id);
                }}
              />
            ) : null}
            {interactionMode === "SELECT" && isSelected ? (
              <>
                <Circle
                  x={segment.start.x}
                  y={segment.start.y}
                  radius={HANDLE_RADIUS_PX / view.scale}
                  fill="#ffbe0b"
                  draggable
                  onDragMove={(event) => {
                    onUpdateSegmentEndpoint(segment.id, "start", quantize({ x: event.target.x(), y: event.target.y() }));
                  }}
                />
                <Circle
                  x={segment.end.x}
                  y={segment.end.y}
                  radius={HANDLE_RADIUS_PX / view.scale}
                  fill="#ffbe0b"
                  draggable
                  onDragMove={(event) => {
                    onUpdateSegmentEndpoint(segment.id, "end", quantize({ x: event.target.x(), y: event.target.y() }));
                  }}
                />
              </>
            ) : null}
          </Group>
        );
      })}
      {placedGateVisuals.map((gateVisual) => {
        const isGateSelected = interactionMode === "SELECT" && gateVisual.id === selectedGateId;

        return (
          <Group key={`gate-group-${gateVisual.id}`}>
            {renderGateSymbol(
              gateVisual,
              view.scale,
              {
                frameStroke: isGateSelected ? "#fff6d6" : "#d8f6ff",
                leafStroke: isGateSelected ? "#ffbe0b" : "#ffd166",
                swingStroke: isGateSelected ? "#ffd166" : "#ffe5a6",
                markerFill: isGateSelected ? "#ffffff" : "#fff4cf",
                labelColor: isGateSelected ? "#fff1c4" : "#ffe29a",
                opacity: selectedPlanVisual ? 0.88 : 1
              },
              `Gate ${formatLengthMm(gateVisual.widthMm)}`,
              `gate-${gateVisual.key}`
            )}
            {interactionMode === "SELECT" ? (
              <Line
                points={[gateVisual.startPoint.x, gateVisual.startPoint.y, gateVisual.endPoint.x, gateVisual.endPoint.y]}
                stroke="#ffffff"
                opacity={0.001}
                strokeWidth={6 / view.scale}
                hitStrokeWidth={24 / view.scale}
                lineCap="round"
                onMouseDown={(event) => {
                  if (event.evt.button !== 0) {
                    return;
                  }
                  event.cancelBubble = true;
                  onStartGateDrag(gateVisual.id);
                }}
                onTouchStart={(event) => {
                  event.cancelBubble = true;
                  onStartGateDrag(gateVisual.id);
                }}
                onClick={(event) => {
                  event.cancelBubble = true;
                  onSelectGate(gateVisual.id);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  onSelectGate(gateVisual.id);
                }}
              />
            ) : null}
          </Group>
        );
      })}
    </Layer>
  );
}
