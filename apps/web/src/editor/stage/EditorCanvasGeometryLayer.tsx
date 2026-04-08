import { Circle, Group, Layer, Line, Rect, RegularPolygon } from "react-konva";
import { distanceMm } from "@fence-estimator/geometry";
import type {
  ResolvedGoalUnitPlacement,
  ResolvedKickboardAttachment,
  ResolvedPitchDividerPlacement,
  ResolvedSideNettingAttachment
} from "@fence-estimator/rules-engine";

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
import { getBasketballPostArmEnd, renderBasketballPostSymbol } from "../basketballPostGeometry";
import { renderFloodlightColumnSymbol } from "../floodlightColumnGeometry";
import { renderGateSymbol } from "../gateGeometry";
import type { VisualPost } from "../types";
import { renderCanvasLabel } from "./canvasLabel";
import type { EditorCanvasStageProps } from "./types";

type EditorCanvasGeometryLayerProps = Pick<
  EditorCanvasStageProps,
  | "gatesBySegmentId"
  | "goalUnitVisuals"
  | "interactionMode"
  | "kickboardVisuals"
  | "onOpenSegmentLengthEditor"
  | "onSelectBasketballPost"
  | "onSelectFloodlightColumn"
  | "onSelectGate"
  | "onSelectSegment"
  | "onStartBasketballPostDrag"
  | "onStartFloodlightColumnDrag"
  | "onStartGateDrag"
  | "onStartSegmentDrag"
  | "onStartSegmentEndpointDrag"
  | "onEndSegmentEndpointDrag"
  | "onUpdateSegmentEndpoint"
  | "placedBasketballPostVisuals"
  | "placedFloodlightColumnVisuals"
  | "placedGateVisuals"
  | "pitchDividerVisuals"
  | "segmentLengthLabelsBySegmentId"
  | "segments"
  | "sideNettingVisuals"
  | "hoveredBasketballPostId"
  | "hoveredFloodlightColumnId"
  | "hoveredGateId"
  | "hoveredSegmentId"
  | "selectedBasketballPostId"
  | "selectedFloodlightColumnId"
  | "selectedGateId"
  | "selectedPlanVisual"
  | "selectedSegmentId"
  | "view"
  | "visibleSegmentLabelKeys"
  | "visualPosts"
>;

function getPlacedGateStyle(gateType: EditorCanvasGeometryLayerProps["placedGateVisuals"][number]["gateType"]) {
  switch (gateType) {
    case "DOUBLE_LEAF":
      return {
        default: {
          frameStroke: "#9aca74",
          leafStroke: "#e7ffd0",
          swingStroke: "#7ab542",
          markerFill: "#f2ffe4",
          labelColor: "#edffd7"
        },
        hover: {
          frameStroke: "#c7efaf",
          leafStroke: "#f4ffe5",
          swingStroke: "#a8dc6d",
          markerFill: "#fbfff5",
          labelColor: "#f6ffe7"
        },
        selected: {
          frameStroke: "#e0ffc7",
          leafStroke: "#fbffe8",
          swingStroke: "#c3ef83",
          markerFill: "#ffffff",
          labelColor: "#fcffe9"
        }
      };
    case "CUSTOM":
      return {
        default: {
          frameStroke: "#c78fe8",
          leafStroke: "#f8e6ff",
          swingStroke: "#c169d5",
          markerFill: "#fff1ff",
          labelColor: "#ffeaff"
        },
        hover: {
          frameStroke: "#dfb8f5",
          leafStroke: "#fdf2ff",
          swingStroke: "#d88ae8",
          markerFill: "#fff9ff",
          labelColor: "#fff2ff"
        },
        selected: {
          frameStroke: "#f0d5ff",
          leafStroke: "#fff5ff",
          swingStroke: "#e8a8f3",
          markerFill: "#ffffff",
          labelColor: "#fff7ff"
        }
      };
    default:
      return {
        default: {
          frameStroke: "#7fcaf3",
          leafStroke: "#fff0c6",
          swingStroke: "#efaa54",
          markerFill: "#effbff",
          labelColor: "#fff4d6"
        },
        hover: {
          frameStroke: "#b3e3fb",
          leafStroke: "#fff7dd",
          swingStroke: "#f4c173",
          markerFill: "#f9feff",
          labelColor: "#fff9e5"
        },
        selected: {
          frameStroke: "#d7f1ff",
          leafStroke: "#fffbe8",
          swingStroke: "#ffd08a",
          markerFill: "#ffffff",
          labelColor: "#fffdf0"
        }
      };
  }
}

function getPlacedBasketballPostStyle(state: "default" | "hover" | "selected") {
  if (state === "selected") {
    return {
      stroke: "#fff3cb",
      accent: "#ffd27a",
      fill: "#ff9c48",
      halo: "#ffe3a4"
    };
  }
  if (state === "hover") {
    return {
      stroke: "#ffe0bc",
      accent: "#ffc567",
      fill: "#f08c3f",
      halo: "#ffc987"
    };
  }
  return {
    stroke: "#3b2414",
    accent: "#ffb24d",
    fill: "#e77c2f",
    halo: null
  };
}

function getPlacedFloodlightColumnStyle(state: "default" | "hover" | "selected") {
  if (state === "selected") {
    return {
      stroke: "#fff7d6",
      fill: "#f3c94d",
      accent: "#fff6bf",
      halo: "#ffe89a"
    };
  }
  if (state === "hover") {
    return {
      stroke: "#fff2b8",
      fill: "#eeb63b",
      accent: "#fff2a0",
      halo: "#ffd86e"
    };
  }
  return {
    stroke: "#7a4c00",
    fill: "#d89a00",
    accent: "#ffe36c",
    halo: null
  };
}

function offsetSegmentLabel(
  start: { x: number; y: number },
  end: { x: number; y: number },
  scale: number,
  normalOffsetPx: number
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const center = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  };

  return {
    x: center.x + (-dy / length) * (normalOffsetPx / scale),
    y: center.y + (dx / length) * (normalOffsetPx / scale)
  };
}

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
        fill="#94b8b4"
        stroke="#14201e"
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
        fill="#b78f6f"
        stroke="#14201e"
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
        fill="#8c9fb1"
        stroke="#14201e"
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
        fill="#a9b4bd"
        stroke="#14201e"
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
        fill="#c4a66f"
        stroke="#14201e"
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
      fill="#d3c5aa"
      stroke="#14201e"
      strokeWidth={strokeWidth}
      listening={false}
    />
  );
}

function renderGoalUnitPlan(goalUnit: ResolvedGoalUnitPlacement, scale: number) {
  const strokeWidth = 1.8 / scale;
  const detailWidth = 1.2 / scale;
  const basketballNormal = { x: -goalUnit.normal.x, y: -goalUnit.normal.y };

  return (
    <Group key={`goal-unit-${goalUnit.id}`} listening={false}>
      <Line
        points={[goalUnit.entryPoint.x, goalUnit.entryPoint.y, goalUnit.exitPoint.x, goalUnit.exitPoint.y]}
        stroke="rgba(8, 12, 16, 0.92)"
        strokeWidth={6.6 / scale}
        lineCap="round"
      />
      <Line
        points={[
          goalUnit.entryPoint.x,
          goalUnit.entryPoint.y,
          goalUnit.recessEntryPoint.x,
          goalUnit.recessEntryPoint.y,
          goalUnit.recessExitPoint.x,
          goalUnit.recessExitPoint.y,
          goalUnit.exitPoint.x,
          goalUnit.exitPoint.y
        ]}
        stroke="#c7eff7"
        strokeWidth={strokeWidth}
        lineCap="round"
        lineJoin="round"
      />
      <Line
        points={[goalUnit.entryPoint.x, goalUnit.entryPoint.y, goalUnit.exitPoint.x, goalUnit.exitPoint.y]}
        stroke="rgba(199, 239, 247, 0.54)"
        strokeWidth={detailWidth}
        dash={[14 / scale, 10 / scale]}
        lineCap="round"
      />
      {goalUnit.hasBasketballPost ? (
        <>
          <Circle
            x={goalUnit.rearCenterPoint.x}
            y={goalUnit.rearCenterPoint.y}
            radius={7 / scale}
            fill="#0a3447"
            stroke="#effcff"
            strokeWidth={detailWidth}
          />
          <Line
            points={[
              goalUnit.rearCenterPoint.x,
              goalUnit.rearCenterPoint.y,
              goalUnit.rearCenterPoint.x + basketballNormal.x * 280,
              goalUnit.rearCenterPoint.y + basketballNormal.y * 280
            ]}
            stroke="#ffb769"
            strokeWidth={detailWidth}
            lineCap="round"
          />
        </>
      ) : null}
    </Group>
  );
}

function renderKickboardPlan(kickboard: ResolvedKickboardAttachment, scale: number) {
  const points = [kickboard.start.x, kickboard.start.y, kickboard.end.x, kickboard.end.y];
  return (
    <Group key={`kickboard-${kickboard.id}`} listening={false}>
      <Line
        points={points}
        stroke="rgba(48, 29, 15, 0.45)"
        strokeWidth={8 / scale}
        lineCap="round"
      />
      <Line
        points={points}
        stroke={kickboard.placement.profile === "CHAMFERED" ? "#9a6338" : "#7a5232"}
        strokeWidth={4.2 / scale}
        opacity={0.96}
        lineCap="round"
      />
      <Line
        points={points}
        stroke="rgba(255, 232, 207, 0.46)"
        strokeWidth={1.1 / scale}
        {...(kickboard.placement.profile === "CHAMFERED" ? { dash: [10 / scale, 6 / scale] } : {})}
        lineCap="round"
      />
    </Group>
  );
}

function renderPitchDividerPlan(pitchDivider: ResolvedPitchDividerPlacement, scale: number) {
  if (!pitchDivider.isValid) {
    return null;
  }
  return (
    <Group key={`pitch-divider-${pitchDivider.id}`} listening={false}>
      <Line
        points={[pitchDivider.startPoint.x, pitchDivider.startPoint.y, pitchDivider.endPoint.x, pitchDivider.endPoint.y]}
        stroke="#51c8ff"
        strokeWidth={2.2 / scale}
        dash={[12 / scale, 8 / scale]}
        opacity={0.96}
      />
      <Circle x={pitchDivider.startPoint.x} y={pitchDivider.startPoint.y} radius={5 / scale} fill="#8be0ff" />
      <Circle x={pitchDivider.endPoint.x} y={pitchDivider.endPoint.y} radius={5 / scale} fill="#8be0ff" />
      {pitchDivider.supportPoints.map((point, index) => (
        <Rect
          key={`${pitchDivider.id}-support-${index}`}
          x={point.x - 4 / scale}
          y={point.y - 4 / scale}
          width={8 / scale}
          height={8 / scale}
          fill="#b8ecff"
        />
      ))}
    </Group>
  );
}

function renderSideNettingPlan(sideNetting: ResolvedSideNettingAttachment, scale: number) {
  const points = [sideNetting.start.x, sideNetting.start.y, sideNetting.end.x, sideNetting.end.y];

  return (
    <Group key={`side-netting-${sideNetting.id}`} listening={false}>
      <Line
        points={points}
        stroke="rgba(22, 65, 71, 0.34)"
        strokeWidth={8 / scale}
        lineCap="round"
      />
      <Line
        points={points}
        stroke="#7cd5ea"
        strokeWidth={3.2 / scale}
        dash={[10 / scale, 8 / scale]}
        opacity={0.95}
        lineCap="round"
      />
      {sideNetting.extendedPostPoints.map((point, index) => (
        <Circle
          key={`${sideNetting.id}-extended-${index}`}
          x={point.x}
          y={point.y}
          radius={4.5 / scale}
          fill="#79e6f7"
          stroke="#10303a"
          strokeWidth={1 / scale}
        />
      ))}
    </Group>
  );
}

function buildSegmentRunsWithOpenings(
  segment: EditorCanvasGeometryLayerProps["segments"][number],
  gateSpans: EditorCanvasGeometryLayerProps["placedGateVisuals"],
  goalUnits: ResolvedGoalUnitPlacement[]
) {
  const openings = [
    ...gateSpans.map((gate) => ({ startOffsetMm: gate.startOffsetMm, endOffsetMm: gate.endOffsetMm })),
    ...goalUnits.map((goalUnit) => ({ startOffsetMm: goalUnit.startOffsetMm, endOffsetMm: goalUnit.endOffsetMm }))
  ]
    .sort((left, right) => left.startOffsetMm - right.startOffsetMm);
  const segmentLengthMm = distanceMm(segment.start, segment.end);
  const boundaries = [0, segmentLengthMm, ...openings.flatMap((opening) => [opening.startOffsetMm, opening.endOffsetMm])]
    .sort((left, right) => left - right);
  const runs: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startOffsetMm = boundaries[index] ?? 0;
    const endOffsetMm = boundaries[index + 1] ?? 0;
    if (endOffsetMm - startOffsetMm < 50) {
      continue;
    }
    const midpointMm = startOffsetMm + (endOffsetMm - startOffsetMm) / 2;
    const insideOpening = openings.some(
      (opening) => midpointMm >= opening.startOffsetMm - 0.001 && midpointMm <= opening.endOffsetMm + 0.001
    );
    if (insideOpening) {
      continue;
    }
    const startRatio = startOffsetMm / Math.max(segmentLengthMm, 1);
    const endRatio = endOffsetMm / Math.max(segmentLengthMm, 1);
    runs.push({
      start: {
        x: segment.start.x + (segment.end.x - segment.start.x) * startRatio,
        y: segment.start.y + (segment.end.y - segment.start.y) * startRatio
      },
      end: {
        x: segment.start.x + (segment.end.x - segment.start.x) * endRatio,
        y: segment.start.y + (segment.end.y - segment.start.y) * endRatio
      }
    });
  }
  return runs;
}

export function EditorCanvasGeometryLayer({
  gatesBySegmentId,
  goalUnitVisuals = [],
  interactionMode,
  kickboardVisuals = [],
  onOpenSegmentLengthEditor,
  onSelectBasketballPost,
  onSelectFloodlightColumn = () => undefined,
  onSelectGate,
  onSelectSegment,
  onStartBasketballPostDrag,
  onStartFloodlightColumnDrag = () => undefined,
  onStartGateDrag,
  onStartSegmentDrag,
  onStartSegmentEndpointDrag,
  onEndSegmentEndpointDrag,
  onUpdateSegmentEndpoint,
  placedBasketballPostVisuals,
  placedFloodlightColumnVisuals = [],
  placedGateVisuals,
  pitchDividerVisuals = [],
  segmentLengthLabelsBySegmentId,
  segments,
  sideNettingVisuals = [],
  hoveredBasketballPostId,
  hoveredFloodlightColumnId = null,
  hoveredGateId,
  hoveredSegmentId,
  selectedBasketballPostId,
  selectedFloodlightColumnId = null,
  selectedGateId,
  selectedPlanVisual,
  selectedSegmentId,
  view,
  visibleSegmentLabelKeys,
  visualPosts
}: EditorCanvasGeometryLayerProps) {
  return (
    <Layer>
      {pitchDividerVisuals.map((pitchDivider) => renderPitchDividerPlan(pitchDivider, view.scale))}
      {visualPosts.map((post) => renderPostSymbol(post, view.scale))}
      {segments.map((segment) => {
        const isSelected = segment.id === selectedSegmentId;
        const isHovered = segment.id === hoveredSegmentId;
        const lengthLabels = segmentLengthLabelsBySegmentId.get(segment.id) ?? [];
        const segmentGoalUnits = goalUnitVisuals.filter((goalUnit) => goalUnit.segmentId === segment.id);
        const gateSpans = gatesBySegmentId.get(segment.id) ?? [];
        const segmentRuns = buildSegmentRunsWithOpenings(
          segment,
          gateSpans,
          segmentGoalUnits
        );
        const color = getSegmentColor(segment.spec);

        return (
          <Group key={segment.id}>
            {isHovered || isSelected ? (
              <>
                <Line
                  points={[segment.start.x, segment.start.y, segment.end.x, segment.end.y]}
                  stroke={isSelected ? "rgba(255, 218, 137, 0.58)" : "rgba(108, 225, 249, 0.52)"}
                  opacity={0.9}
                  strokeWidth={(SEGMENT_SELECTED_STROKE_PX + 14) / view.scale}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
                <Line
                  points={[segment.start.x, segment.start.y, segment.end.x, segment.end.y]}
                  stroke={isSelected ? "#ffe1a1" : "#9fe7f8"}
                  opacity={0.95}
                  strokeWidth={(SEGMENT_SELECTED_STROKE_PX + 5) / view.scale}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
              </>
            ) : null}
            {segmentRuns.map((run, runIndex) => (
              <Line
                key={`${segment.id}-run-${runIndex}`}
                points={[run.start.x, run.start.y, run.end.x, run.end.y]}
                stroke={color}
                opacity={selectedPlanVisual ? 0.75 : 1}
                strokeWidth={(isSelected || isHovered ? SEGMENT_SELECTED_STROKE_PX : SEGMENT_STROKE_PX) / view.scale}
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
              listening={interactionMode === "SELECT"}
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
                <Group
                  key={`segment-label-${label.key}`}
                  listening={interactionMode === "SELECT"}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    onOpenSegmentLengthEditor(segment.id);
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    onOpenSegmentLengthEditor(segment.id);
                  }}
                >
                  {renderCanvasLabel({
                    keyValue: `segment-label-chip-${label.key}`,
                    x: label.x,
                    y: label.y,
                    text: label.text,
                    scale: view.scale,
                    fill: isSelected ? "rgba(58, 48, 25, 0.84)" : "rgba(15, 23, 24, 0.74)",
                    stroke: isSelected ? "rgba(255, 216, 134, 0.28)" : "rgba(227, 238, 241, 0.14)",
                    textColor: isSelected ? "#ffe3ad" : isHovered ? "#f4fbfd" : "#dce7ea",
                    fontSizePx: LABEL_FONT_SIZE_PX,
                    minWidthPx: 48
                  })}
                </Group>
              ) : null
            )}
            {lengthLabels.length === 0 ? (
              <Group
                listening={interactionMode === "SELECT"}
                onClick={(event) => {
                  event.cancelBubble = true;
                  onOpenSegmentLengthEditor(segment.id);
                }}
                onTap={(event) => {
                    event.cancelBubble = true;
                    onOpenSegmentLengthEditor(segment.id);
                  }}
              >
                {renderCanvasLabel({
                  keyValue: `segment-label-fallback-${segment.id}`,
                  ...offsetSegmentLabel(segment.start, segment.end, view.scale, 18),
                  text: formatLengthMm(distanceMm(segment.start, segment.end)),
                  scale: view.scale,
                  fill: isSelected ? "rgba(58, 48, 25, 0.84)" : "rgba(15, 23, 24, 0.74)",
                  stroke: isSelected ? "rgba(255, 216, 134, 0.28)" : "rgba(227, 238, 241, 0.14)",
                  textColor: isSelected ? "#ffe3ad" : isHovered ? "#f4fbfd" : "#dce7ea",
                  fontSizePx: LABEL_FONT_SIZE_PX,
                  minWidthPx: 44
                })}
              </Group>
            ) : null}
            {interactionMode === "SELECT" && isSelected ? (
              <>
                <Circle
                  x={segment.start.x}
                  y={segment.start.y}
                  radius={HANDLE_RADIUS_PX / view.scale}
                  fill="#f0d08b"
                  draggable
                  onDragStart={onStartSegmentEndpointDrag}
                  onDragMove={(event) => {
                    onUpdateSegmentEndpoint(segment.id, "start", quantize({ x: event.target.x(), y: event.target.y() }));
                  }}
                  onDragEnd={onEndSegmentEndpointDrag}
                />
                <Circle
                  x={segment.end.x}
                  y={segment.end.y}
                  radius={HANDLE_RADIUS_PX / view.scale}
                  fill="#f0d08b"
                  draggable
                  onDragStart={onStartSegmentEndpointDrag}
                  onDragMove={(event) => {
                    onUpdateSegmentEndpoint(segment.id, "end", quantize({ x: event.target.x(), y: event.target.y() }));
                  }}
                  onDragEnd={onEndSegmentEndpointDrag}
                />
              </>
            ) : null}
          </Group>
        );
      })}
      {goalUnitVisuals.map((goalUnit) => renderGoalUnitPlan(goalUnit, view.scale))}
      {kickboardVisuals.map((kickboard) => renderKickboardPlan(kickboard, view.scale))}
      {sideNettingVisuals.map((sideNetting) => renderSideNettingPlan(sideNetting, view.scale))}
      {placedBasketballPostVisuals.map((basketballPost) => {
        const isBasketballPostSelected =
          interactionMode === "SELECT" && basketballPost.id === selectedBasketballPostId;
        const isBasketballPostHovered =
          interactionMode === "SELECT" && basketballPost.id === hoveredBasketballPostId;
        const basketballPostStyle = getPlacedBasketballPostStyle(
          isBasketballPostSelected ? "selected" : isBasketballPostHovered ? "hover" : "default"
        );
        const armEnd = getBasketballPostArmEnd(basketballPost);

        return (
          <Group key={`basketball-post-group-${basketballPost.id}`}>
            {basketballPostStyle.halo ? (
              <Circle
                x={basketballPost.point.x}
                y={basketballPost.point.y}
                radius={12 / view.scale}
                stroke={basketballPostStyle.halo}
                strokeWidth={2.2 / view.scale}
                opacity={0.92}
                listening={false}
              />
            ) : null}
            {renderBasketballPostSymbol(
              basketballPost,
              view.scale,
              {
                stroke: basketballPostStyle.stroke,
                accent: basketballPostStyle.accent,
                fill: basketballPostStyle.fill,
                opacity: selectedPlanVisual ? 0.88 : 1
              },
              `basketball-post-${basketballPost.key}`
            )}
            {interactionMode === "SELECT" ? (
              <>
                <Line
                  points={[basketballPost.point.x, basketballPost.point.y, armEnd.x, armEnd.y]}
                  stroke="#ffffff"
                  opacity={0.001}
                  listening
                  strokeWidth={4 / view.scale}
                  hitStrokeWidth={24 / view.scale}
                  lineCap="round"
                  onMouseDown={(event) => {
                    if (event.evt.button !== 0) {
                      return;
                    }
                    event.cancelBubble = true;
                    onStartBasketballPostDrag(basketballPost.id);
                  }}
                  onTouchStart={(event) => {
                    event.cancelBubble = true;
                    onStartBasketballPostDrag(basketballPost.id);
                  }}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    onSelectBasketballPost(basketballPost.id);
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    onSelectBasketballPost(basketballPost.id);
                  }}
                />
                <Circle
                  x={basketballPost.point.x}
                  y={basketballPost.point.y}
                  radius={12 / view.scale}
                  fill="#ffffff"
                  opacity={0.001}
                  listening
                  onMouseDown={(event) => {
                    if (event.evt.button !== 0) {
                      return;
                    }
                    event.cancelBubble = true;
                    onStartBasketballPostDrag(basketballPost.id);
                  }}
                  onTouchStart={(event) => {
                    event.cancelBubble = true;
                    onStartBasketballPostDrag(basketballPost.id);
                  }}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    onSelectBasketballPost(basketballPost.id);
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    onSelectBasketballPost(basketballPost.id);
                  }}
                />
              </>
            ) : null}
          </Group>
        );
      })}
      {placedFloodlightColumnVisuals.map((floodlightColumn) => {
        const isFloodlightColumnSelected =
          interactionMode === "SELECT" && floodlightColumn.id === selectedFloodlightColumnId;
        const isFloodlightColumnHovered =
          interactionMode === "SELECT" && floodlightColumn.id === hoveredFloodlightColumnId;
        const floodlightColumnStyle = getPlacedFloodlightColumnStyle(
          isFloodlightColumnSelected ? "selected" : isFloodlightColumnHovered ? "hover" : "default"
        );

        return (
          <Group key={`floodlight-column-group-${floodlightColumn.id}`}>
            {floodlightColumnStyle.halo ? (
              <Circle
                x={floodlightColumn.point.x}
                y={floodlightColumn.point.y}
                radius={14 / view.scale}
                stroke={floodlightColumnStyle.halo}
                strokeWidth={2.2 / view.scale}
                opacity={0.92}
                listening={false}
              />
            ) : null}
            {renderFloodlightColumnSymbol(
              floodlightColumn,
              view.scale,
              {
                stroke: floodlightColumnStyle.stroke,
                fill: floodlightColumnStyle.fill,
                accent: floodlightColumnStyle.accent,
                opacity: selectedPlanVisual ? 0.88 : 1
              },
              `floodlight-column-${floodlightColumn.key}`
            )}
            {interactionMode === "SELECT" ? (
              <Circle
                x={floodlightColumn.point.x}
                y={floodlightColumn.point.y}
                radius={14 / view.scale}
                fill="#ffffff"
                opacity={0.001}
                listening
                onMouseDown={(event) => {
                  if (event.evt.button !== 0) {
                    return;
                  }
                  event.cancelBubble = true;
                  onStartFloodlightColumnDrag(floodlightColumn.id);
                }}
                onTouchStart={(event) => {
                  event.cancelBubble = true;
                  onStartFloodlightColumnDrag(floodlightColumn.id);
                }}
                onClick={(event) => {
                  event.cancelBubble = true;
                  onSelectFloodlightColumn(floodlightColumn.id);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  onSelectFloodlightColumn(floodlightColumn.id);
                }}
              />
            ) : null}
          </Group>
        );
      })}
      {placedGateVisuals.map((gateVisual) => {
        const isGateSelected = interactionMode === "SELECT" && gateVisual.id === selectedGateId;
        const isGateHovered = interactionMode === "SELECT" && gateVisual.id === hoveredGateId;
        const palette = getPlacedGateStyle(gateVisual.gateType);
        const gateStyle = isGateSelected ? palette.selected : isGateHovered ? palette.hover : palette.default;
        const gateHaloColor = isGateSelected ? "#ffe3a4" : isGateHovered ? "#bfeeff" : null;
        const gateHaloRadius = Math.max(14, Math.min(22, gateVisual.widthMm * 0.01)) / view.scale;

        return (
          <Group key={`gate-group-${gateVisual.id}`}>
            {gateHaloColor ? (
              <Circle
                x={gateVisual.centerPoint.x}
                y={gateVisual.centerPoint.y}
                radius={gateHaloRadius}
                stroke={gateHaloColor}
                strokeWidth={2.2 / view.scale}
                opacity={0.92}
                listening={false}
              />
            ) : null}
            {renderGateSymbol(
              gateVisual,
              view.scale,
              {
                frameStroke: gateStyle.frameStroke,
                leafStroke: gateStyle.leafStroke,
                swingStroke: gateStyle.swingStroke,
                markerFill: gateStyle.markerFill,
                labelColor: gateStyle.labelColor,
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
                listening={interactionMode === "SELECT"}
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
