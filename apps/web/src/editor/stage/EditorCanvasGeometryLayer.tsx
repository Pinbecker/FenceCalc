import { useMemo } from "react";
import { Circle, Group, Layer, Line, Rect, RegularPolygon } from "react-konva";
import { distanceMm } from "@fence-estimator/geometry";
import type { PointMm } from "@fence-estimator/contracts";
import type {
  ResolvedGoalUnitPlacement,
  ResolvedKickboardAttachment,
  ResolvedPitchDividerPlacement,
  ResolvedSideNettingAttachment
} from "@fence-estimator/rules-engine";

import { formatLengthMm } from "../../formatters";
import {
  DRAW_INCREMENT_MM,
  HANDLE_RADIUS_PX,
  LABEL_FONT_SIZE_PX,
  NODE_SNAP_DISTANCE_PX,
  POST_SYMBOL_RADIUS_PX,
  SEGMENT_SELECTED_STROKE_PX,
  SEGMENT_STROKE_PX,
  getSegmentColor,
  quantize
} from "../constants";
import {
  ACCESSORY_HALO,
  BASKETBALL_POST,
  FLOODLIGHT_COLUMN,
  GATE_PALETTES,
  HOVER,
  POST,
  SELECTION,
  SEGMENT_HALO,
  SEGMENT_LABEL,
  getDetailLevel,
  shouldShowGateDetail,
  shouldShowMinorLabels,
  shouldShowPosts,
} from "../colorTokens";
import { getBasketballPostArmEnd, renderBasketballPostSymbol } from "../basketballPostGeometry";
import { findNearestNode, snapToAxisGuide } from "../editorMath";
import { renderFloodlightColumnSymbol } from "../floodlightColumnGeometry";
import { renderGateSymbol } from "../gateGeometry";
import type { VisualPost } from "../types";
import { renderCanvasLabel } from "./canvasLabel";
import type { EditorCanvasStageProps } from "./types";

type EditorCanvasGeometryLayerProps = Pick<
  EditorCanvasStageProps,
  | "disableSnap"
  | "drawAnchorNodes"
  | "activeSegmentDrag"
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
  | "selectedSegmentIds"
  | "view"
  | "visibleSegmentLabelKeys"
  | "visualPosts"
>;

function getPlacedGateStyle(gateType: EditorCanvasGeometryLayerProps["placedGateVisuals"][number]["gateType"]) {
  return (GATE_PALETTES[gateType] ?? GATE_PALETTES.DEFAULT)!;
}

function getPlacedBasketballPostStyle(state: "default" | "hover" | "selected") {
  return {
    ...BASKETBALL_POST[state],
    halo: state === "selected" ? ACCESSORY_HALO.selected : state === "hover" ? ACCESSORY_HALO.hover : null,
  };
}

function getPlacedFloodlightColumnStyle(state: "default" | "hover" | "selected") {
  return {
    ...FLOODLIGHT_COLUMN[state],
    halo: state === "selected" ? ACCESSORY_HALO.selected : state === "hover" ? ACCESSORY_HALO.hover : null,
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPostScreenRadiusPx(post: VisualPost, scale: number) {
  const normalizedScale = clamp((scale - 0.012) / 0.15, 0, 1);
  const minRadiusPx =
    post.kind === "INTERMEDIATE"
      ? 2.6
      : post.kind === "CORNER" || post.kind === "GATE"
        ? 2.15
        : post.kind === "END"
          ? 2.05
          : 1.85;
  const maxRadiusPx =
    post.kind === "INTERMEDIATE"
      ? POST_SYMBOL_RADIUS_PX * 1.22
      : post.kind === "CORNER"
        ? POST_SYMBOL_RADIUS_PX * 1.18
        : post.kind === "GATE"
          ? POST_SYMBOL_RADIUS_PX * 1.02
          : post.kind === "END"
            ? POST_SYMBOL_RADIUS_PX * 1.08
            : post.kind === "JUNCTION"
              ? POST_SYMBOL_RADIUS_PX * 1.02
              : POST_SYMBOL_RADIUS_PX * 0.96;

  return minRadiusPx + normalizedScale * (maxRadiusPx - minRadiusPx);
}

function renderPostSymbol(post: VisualPost, scale: number, detailLevel: ReturnType<typeof getDetailLevel>) {
  const simplifiedLevel = detailLevel !== "full";
  const size = getPostScreenRadiusPx(post, scale) / scale;
  const strokeWidthPx =
    detailLevel === "full" ? 1.25 : detailLevel === "reduced" ? 0.95 : detailLevel === "overview" ? 0.72 : 0.58;
  const strokeWidth =
    (post.kind === "INTERMEDIATE" && detailLevel !== "full" ? strokeWidthPx * 0.82 : strokeWidthPx) / scale;
  const opacity =
    post.kind === "INTERMEDIATE"
      ? detailLevel === "full"
        ? 0.98
        : detailLevel === "reduced"
          ? 0.92
          : detailLevel === "overview"
            ? 0.86
            : 0.8
      : detailLevel === "schematic"
        ? 0.88
        : 1;

  if (simplifiedLevel) {
    return (
      <Circle
        key={post.key}
        x={post.point.x}
        y={post.point.y}
        radius={post.kind === "INTERMEDIATE" ? size * 0.92 : size}
        fill={POST.fill[post.kind]}
        stroke={POST.stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        listening={false}
      />
    );
  }

  if (post.kind === "INTERMEDIATE") {
    return (
      <Rect
        key={post.key}
        x={post.point.x - size}
        y={post.point.y - size}
        width={size * 2}
        height={size * 2}
        fill={POST.fill.INTERMEDIATE}
        stroke={POST.stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
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
        fill={POST.fill.CORNER}
        stroke={POST.stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
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
        fill={POST.fill.JUNCTION}
        stroke={POST.stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
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
        fill={POST.fill.INLINE_JOIN}
        stroke={POST.stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
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
        radius={size}
        fill={POST.fill.GATE}
        stroke={POST.stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
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
      fill={POST.fill.END}
      stroke={POST.stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
      listening={false}
    />
  );
}

function resolveEndpointDragPoint(
  point: PointMm,
  anchorPoint: PointMm,
  drawAnchorNodes: PointMm[],
  scale: number,
  disableSnap: boolean,
) {
  const axisSnapDistanceMm = Math.min(800, 16 / scale);
  const nodeSnapDistanceMm = Math.min(900, NODE_SNAP_DISTANCE_PX / scale);
  const candidate = quantize(point);

  if (disableSnap) {
    return candidate;
  }

  const snapNodes = drawAnchorNodes.filter(
    (node) => !(Math.abs(node.x - anchorPoint.x) <= DRAW_INCREMENT_MM * 0.25 && Math.abs(node.y - anchorPoint.y) <= DRAW_INCREMENT_MM * 0.25),
  );
  const guided = snapToAxisGuide(anchorPoint, candidate, snapNodes, axisSnapDistanceMm);
  const nearestNode = findNearestNode(guided.point, snapNodes, nodeSnapDistanceMm);
  return nearestNode ? quantize(nearestNode) : quantize(guided.point);
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
  disableSnap,
  drawAnchorNodes,
  activeSegmentDrag,
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
  selectedSegmentIds,
  view,
  visibleSegmentLabelKeys,
  visualPosts
}: EditorCanvasGeometryLayerProps) {
  const detailLevel = getDetailLevel(view.scale);
  const canShowPosts = shouldShowPosts(detailLevel);
  const canShowMinorLabels = shouldShowMinorLabels(detailLevel);
  const canShowGateSwing = shouldShowGateDetail(detailLevel);
  const visiblePosts = canShowPosts ? visualPosts : [];
  const forcedVisibleSegmentLabelKeys = useMemo(() => {
    const forcedKeys = new Set<string>();
    if (!activeSegmentDrag) {
      return forcedKeys;
    }

    const baselineLengthBySegmentId = new Map(
      activeSegmentDrag.baselineSegments.map((segment) => [
        segment.id,
        Math.round(distanceMm(segment.start, segment.end)),
      ] as const),
    );

    for (const segment of segments) {
      const labels = segmentLengthLabelsBySegmentId.get(segment.id) ?? [];
      if (labels.length === 0) {
        continue;
      }
      const baselineLengthMm = baselineLengthBySegmentId.get(segment.id);
      const currentLengthMm = Math.round(distanceMm(segment.start, segment.end));
      const isDraggedSegment = activeSegmentDrag.segmentIds.includes(segment.id);
      const lengthChanged =
        baselineLengthMm !== undefined && Math.abs(currentLengthMm - baselineLengthMm) >= 1;
      if (!isDraggedSegment && !lengthChanged) {
        continue;
      }
      labels.forEach((label) => {
        forcedKeys.add(label.key);
      });
    }

    return forcedKeys;
  }, [activeSegmentDrag, segmentLengthLabelsBySegmentId, segments]);

  return (
    <Layer>
      {pitchDividerVisuals.map((pitchDivider) => renderPitchDividerPlan(pitchDivider, view.scale))}
      {visiblePosts.map((post) => renderPostSymbol(post, view.scale, detailLevel))}
      {segments.map((segment) => {
        const isSelected =
          selectedSegmentIds.includes(segment.id) ||
          (selectedSegmentIds.length === 0 && segment.id === selectedSegmentId);
        const isHovered = segment.id === hoveredSegmentId;
        const lengthLabels = segmentLengthLabelsBySegmentId.get(segment.id) ?? [];
        const hasForcedVisibleLabels = lengthLabels.some((label) => forcedVisibleSegmentLabelKeys.has(label.key));
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
                  stroke={isSelected ? SEGMENT_HALO.selected.outer : SEGMENT_HALO.hover.outer}
                  opacity={0.9}
                  strokeWidth={(SEGMENT_SELECTED_STROKE_PX + 14) / view.scale}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
                <Line
                  points={[segment.start.x, segment.start.y, segment.end.x, segment.end.y]}
                  stroke={isSelected ? SEGMENT_HALO.selected.inner : SEGMENT_HALO.hover.inner}
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
                onSelectSegment(segment.id, event.evt?.shiftKey === true ? { append: true } : undefined);
              }}
              onTap={() => {
                if (interactionMode !== "SELECT") {
                  return;
                }
                onSelectSegment(segment.id);
              }}
            />
            {lengthLabels.map((label) =>
              visibleSegmentLabelKeys.has(label.key) || forcedVisibleSegmentLabelKeys.has(label.key) ? (
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
                    fill: isSelected
                      ? SEGMENT_LABEL.selected.fill
                      : isHovered
                        ? SEGMENT_LABEL.hover.fill
                        : SEGMENT_LABEL.default.fill,
                    stroke: isSelected
                      ? SEGMENT_LABEL.selected.stroke
                      : isHovered
                        ? SEGMENT_LABEL.hover.stroke
                        : SEGMENT_LABEL.default.stroke,
                    textColor: isSelected
                      ? SEGMENT_LABEL.selected.textColor
                      : isHovered
                        ? SEGMENT_LABEL.hover.textColor
                        : SEGMENT_LABEL.default.textColor,
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
                  fill: isSelected
                    ? SEGMENT_LABEL.selected.fill
                    : isHovered
                      ? SEGMENT_LABEL.hover.fill
                      : SEGMENT_LABEL.default.fill,
                  stroke: isSelected
                    ? SEGMENT_LABEL.selected.stroke
                    : isHovered
                      ? SEGMENT_LABEL.hover.stroke
                      : SEGMENT_LABEL.default.stroke,
                  textColor: isSelected
                    ? SEGMENT_LABEL.selected.textColor
                    : isHovered
                      ? SEGMENT_LABEL.hover.textColor
                      : SEGMENT_LABEL.default.textColor,
                  fontSizePx: LABEL_FONT_SIZE_PX,
                  minWidthPx: 44
                })}
              </Group>
            ) : null}
            {interactionMode === "SELECT" && isSelected && selectedSegmentIds.length <= 1 ? (
              <>
                <Circle
                  x={segment.start.x}
                  y={segment.start.y}
                  radius={HANDLE_RADIUS_PX / view.scale}
                  fill={SELECTION.handleFill}
                  stroke={SELECTION.handleStroke}
                  strokeWidth={1.8 / view.scale}
                  draggable
                  onDragStart={onStartSegmentEndpointDrag}
                  onDragMove={(event) => {
                    const snappedPoint = resolveEndpointDragPoint(
                      { x: event.target.x(), y: event.target.y() },
                      segment.end,
                      drawAnchorNodes,
                      view.scale,
                      disableSnap,
                    );
                    if (typeof event.target.position === "function") {
                      event.target.position(snappedPoint);
                    }
                    onUpdateSegmentEndpoint(segment.id, "start", snappedPoint);
                  }}
                  onDragEnd={onEndSegmentEndpointDrag}
                />
                <Circle
                  x={segment.end.x}
                  y={segment.end.y}
                  radius={HANDLE_RADIUS_PX / view.scale}
                  fill={SELECTION.handleFill}
                  stroke={SELECTION.handleStroke}
                  strokeWidth={1.8 / view.scale}
                  draggable
                  onDragStart={onStartSegmentEndpointDrag}
                  onDragMove={(event) => {
                    const snappedPoint = resolveEndpointDragPoint(
                      { x: event.target.x(), y: event.target.y() },
                      segment.start,
                      drawAnchorNodes,
                      view.scale,
                      disableSnap,
                    );
                    if (typeof event.target.position === "function") {
                      event.target.position(snappedPoint);
                    }
                    onUpdateSegmentEndpoint(segment.id, "end", snappedPoint);
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
              `basketball-post-${basketballPost.key}`,
              { simplified: detailLevel !== "full" }
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
                    if (event.evt.button !== 0 || !isBasketballPostSelected) {
                      return;
                    }
                    event.cancelBubble = true;
                    onStartBasketballPostDrag(basketballPost.id);
                  }}
                  onTouchStart={(event) => {
                    if (!isBasketballPostSelected) {
                      return;
                    }
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
                    if (event.evt.button !== 0 || !isBasketballPostSelected) {
                      return;
                    }
                    event.cancelBubble = true;
                    onStartBasketballPostDrag(basketballPost.id);
                  }}
                  onTouchStart={(event) => {
                    if (!isBasketballPostSelected) {
                      return;
                    }
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
              `floodlight-column-${floodlightColumn.key}`,
              { simplified: detailLevel !== "full" }
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
                  if (event.evt.button !== 0 || !isFloodlightColumnSelected) {
                    return;
                  }
                  event.cancelBubble = true;
                  onStartFloodlightColumnDrag(floodlightColumn.id);
                }}
                onTouchStart={(event) => {
                  if (!isFloodlightColumnSelected) {
                    return;
                  }
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
        const gateHaloColor = isGateSelected ? SELECTION.outline : isGateHovered ? HOVER.outline : null;
        const gateHaloRadius = Math.max(14, Math.min(22, gateVisual.widthMm * 0.01)) / view.scale;
        const gateLabel =
          isGateSelected || isGateHovered || canShowMinorLabels ? `Gate ${formatLengthMm(gateVisual.widthMm)}` : null;

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
              gateLabel,
              `gate-${gateVisual.key}`,
              { showSwingArcs: canShowGateSwing }
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
                  if (event.evt.button !== 0 || !isGateSelected) {
                    return;
                  }
                  event.cancelBubble = true;
                  onStartGateDrag(gateVisual.id);
                }}
                onTouchStart={(event) => {
                  if (!isGateSelected) {
                    return;
                  }
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
