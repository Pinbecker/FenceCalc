import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Arrow, Layer, Line, Stage, Text, Circle, Group, Rect, RegularPolygon } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  ROLL_FORM_HEIGHT_KEYS,
  TWIN_BAR_HEIGHT_KEYS,
  type FenceHeightKey,
  type FenceSpec,
  type LayoutSegment,
  type PointMm,
  type TwinBarVariant
} from "@fence-estimator/contracts";
import { areOpposite, snapPointToAngle, distanceMm } from "@fence-estimator/geometry";
import { estimateLayout, getSpecConfig } from "@fence-estimator/rules-engine";

import { OptimizationPlanner } from "./OptimizationPlanner";

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

interface Size {
  width: number;
  height: number;
}

type PostKind = "END" | "INTERMEDIATE" | "CORNER" | "JUNCTION" | "INLINE_JOIN" | "GATE";

interface VisualPost {
  key: string;
  point: PointMm;
  kind: PostKind;
  heightMm: number;
}

interface IncidentNode {
  point: PointMm;
  vectors: Array<{ x: number; y: number }>;
  maxHeightMm: number;
}

interface SegmentConnectivity {
  segmentComponent: Map<string, string>;
  segmentIdsByComponent: Map<string, string[]>;
  movableComponentIds: Set<string>;
  closedComponentIds: Set<string>;
  nodeDegreeByKey: Map<string, number>;
}

interface ScaleBarState {
  lengthMm: number;
  lengthPx: number;
  label: string;
}

interface AxisGuide {
  orientation: "VERTICAL" | "HORIZONTAL";
  coordinateMm: number;
  anchor: PointMm;
}

interface HistoryState {
  past: LayoutSegment[][];
  present: LayoutSegment[];
  future: LayoutSegment[][];
}

type DraggablePanel = "controls" | "itemCounts" | "postKey" | "tutorial";

interface PanelOffset {
  x: number;
  y: number;
}

type HistoryAction =
  | { type: "APPLY"; updater: (segments: LayoutSegment[]) => LayoutSegment[] }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SET"; segments: LayoutSegment[] };

type InteractionMode = "DRAW" | "SELECT" | "RECTANGLE" | "RECESS" | "GATE";
type RecessSide = "LEFT" | "RIGHT";
type GateType = "SINGLE_LEAF" | "DOUBLE_LEAF" | "CUSTOM";

interface RecessInsertionPreview {
  segment: LayoutSegment;
  segmentLengthMm: number;
  startOffsetMm: number;
  endOffsetMm: number;
  depthMm: number;
  side: RecessSide;
  sourcePoint: PointMm;
  entryPoint: PointMm;
  exitPoint: PointMm;
  recessEntryPoint: PointMm;
  recessExitPoint: PointMm;
  targetPoint: PointMm;
  alignmentGuide?: {
    anchorPoint: PointMm;
    targetPoint: PointMm;
  };
}

interface LineSnapPreview {
  segment: LayoutSegment;
  point: PointMm;
  startOffsetMm: number;
  endOffsetMm: number;
  distanceMm: number;
}

interface GateInsertionPreview {
  segment: LayoutSegment;
  segmentLengthMm: number;
  startOffsetMm: number;
  endOffsetMm: number;
  widthMm: number;
  entryPoint: PointMm;
  exitPoint: PointMm;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
  targetPoint: PointMm;
}

interface GatePlacement {
  id: string;
  segmentId: string;
  startOffsetMm: number;
  endOffsetMm: number;
  gateType: GateType;
}

interface ResolvedGatePlacement extends GateVisual {
  id: string;
  segmentId: string;
  startOffsetMm: number;
  endOffsetMm: number;
  gateType: GateType;
  spec: FenceSpec;
}

interface GateVisual {
  key: string;
  startPoint: PointMm;
  endPoint: PointMm;
  centerPoint: PointMm;
  widthMm: number;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
  leafCount: 1 | 2;
}

interface RecessAlignmentAnchor {
  sourceSegmentId: string;
  point: PointMm;
  tangent: { x: number; y: number };
}

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface GateOppositeGuide {
  key: string;
  start: PointMm;
  end: PointMm;
}

interface SegmentLengthLabel {
  key: string;
  segmentId: string;
  x: number;
  y: number;
  text: string;
  lengthMm: number;
  isSelected: boolean;
}

const MIN_SEGMENT_MM = 50;
const DRAW_INCREMENT_MM = 50;
const GRID_STEPS_MM = [250, 500, 1000, 2500, 5000, 10000];
const MIN_GRID_PIXEL_SPACING = 40;
const MIN_SCALE = 0.003;
const MAX_SCALE = 3;
const MINOR_GRID_STROKE_PX = 0.8;
const MAJOR_GRID_STROKE_PX = 1.3;
const SEGMENT_STROKE_PX = 3.5;
const SEGMENT_SELECTED_STROKE_PX = 5;
const GHOST_STROKE_PX = 2.8;
const LABEL_FONT_SIZE_PX = 12;
const SEGMENT_LABEL_OFFSET_PX = 18;
const GATE_LABEL_OFFSET_PX = 18;
const HANDLE_RADIUS_PX = 7;
const POST_SYMBOL_RADIUS_PX = 5;
const NODE_SNAP_DISTANCE_PX = 14;
const AXIS_GUIDE_SNAP_PX = 16;
const DRAW_LINE_SNAP_PX = 18;
const RECESS_POINTER_SNAP_PX = 20;
const GATE_POINTER_SNAP_PX = 20;
const RECESS_CORNER_SNAP_MM = 250;
const RECESS_WIDTH_OPTIONS_MM = [500, 1000, 1500, 2000, 2500, 3000];
const RECESS_DEPTH_OPTIONS_MM = [500, 1000, 1500, 2000];
const SINGLE_GATE_WIDTH_MM = 1200;
const DOUBLE_GATE_WIDTH_MM = 3000;
const GATE_WIDTH_OPTIONS_MM = [1000, 1200, 1500, 1800, 2400, 3000, 3600, 4000];
const GATE_OPEN_ANGLE_DEGREES = 33;
const GATE_DOUBLE_LEAF_THRESHOLD_MM = 1800;
const RECESS_INPUT_STEP_M = 0.05;
const INITIAL_VISIBLE_WIDTH_MM = 150000;
const SCALE_BAR_TARGET_RATIO = 0.18;
const SCALE_BAR_MAX_RATIO = 0.4;
const SCALE_BAR_CANDIDATES_MM = [
  1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000
];
const TWIN_BAR_STANDARD_COLORS: Record<(typeof TWIN_BAR_HEIGHT_KEYS)[number], string> = {
  "1.2m": "#4cc9f0",
  "1.8m": "#3a86ff",
  "2m": "#4361ee",
  "2.4m": "#8338ec",
  "3m": "#ff006e",
  "4m": "#fb5607",
  "4.5m": "#ffbe0b",
  "5m": "#2ec4b6",
  "6m": "#8ac926"
};
const TWIN_BAR_SUPER_REBOUND_COLORS: Record<(typeof TWIN_BAR_HEIGHT_KEYS)[number], string> = {
  "1.2m": "#06d6a0",
  "1.8m": "#1b9aaa",
  "2m": "#ef476f",
  "2.4m": "#f78c6b",
  "3m": "#ffd166",
  "4m": "#9b5de5",
  "4.5m": "#00bbf9",
  "5m": "#80ed99",
  "6m": "#ff9770"
};
const ROLL_FORM_COLORS: Record<(typeof ROLL_FORM_HEIGHT_KEYS)[number], string> = {
  "2m": "#00a884",
  "3m": "#ffd166"
};
const TWIN_BAR_HEIGHT_OPTIONS: FenceHeightKey[] = [...TWIN_BAR_HEIGHT_KEYS];
const ROLL_FORM_HEIGHT_OPTIONS: FenceHeightKey[] = [...ROLL_FORM_HEIGHT_KEYS];

function defaultFenceSpec(): FenceSpec {
  return {
    system: "TWIN_BAR",
    height: "2m",
    twinBarVariant: "STANDARD"
  };
}

function getSegmentColor(spec: FenceSpec): string {
  if (spec.system === "ROLL_FORM") {
    if (spec.height === "2m") {
      return ROLL_FORM_COLORS["2m"];
    }
    if (spec.height === "3m") {
      return ROLL_FORM_COLORS["3m"];
    }
    return "#2fbf71";
  }

  const palette = spec.twinBarVariant === "SUPER_REBOUND" ? TWIN_BAR_SUPER_REBOUND_COLORS : TWIN_BAR_STANDARD_COLORS;
  switch (spec.height) {
    case "1.2m":
      return palette["1.2m"];
    case "1.8m":
      return palette["1.8m"];
    case "2m":
      return palette["2m"];
    case "2.4m":
      return palette["2.4m"];
    case "3m":
      return palette["3m"];
    case "4m":
      return palette["4m"];
    case "4.5m":
      return palette["4.5m"];
    case "5m":
      return palette["5m"];
    case "6m":
      return palette["6m"];
    default:
      return spec.twinBarVariant === "SUPER_REBOUND" ? "#ff8438" : "#4f83ff";
  }
}

function formatLengthMm(lengthMm: number): string {
  return `${(lengthMm / 1000).toFixed(2)}m`;
}

function formatMetersInputFromMm(mm: number): string {
  return (mm / 1000).toFixed(2);
}

function parseMetersInputToMm(value: string): number | null {
  const parsedMeters = Number(value);
  if (!Number.isFinite(parsedMeters)) {
    return null;
  }
  const parsedMm = Math.round((parsedMeters * 1000) / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  if (parsedMm < DRAW_INCREMENT_MM) {
    return null;
  }
  return parsedMm;
}

function formatPointMeters(point: PointMm): string {
  return `${(point.x / 1000).toFixed(2)}m, ${(point.y / 1000).toFixed(2)}m`;
}

function formatHeightLabelFromMm(heightMm: number): string {
  return `${(heightMm / 1000).toFixed(heightMm % 1000 === 0 ? 0 : 1)}m`;
}

function formatDistanceLabel(lengthMm: number): string {
  if (lengthMm >= 1000000) {
    return `${(lengthMm / 1000000).toFixed(1)}km`;
  }
  return `${(lengthMm / 1000).toFixed(lengthMm >= 10000 ? 0 : 1)}m`;
}

function sameSpec(left: FenceSpec, right: FenceSpec): boolean {
  return (
    left.system === right.system &&
    left.height === right.height &&
    (left.twinBarVariant ?? "STANDARD") === (right.twinBarVariant ?? "STANDARD")
  );
}

function normalizeVector(vector: { x: number; y: number }): { x: number; y: number } | null {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 1e-6) {
    return null;
  }
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function dot(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return left.x * right.x + left.y * right.y;
}

function cross(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return left.x * right.y - left.y * right.x;
}

function rotateVector(vector: { x: number; y: number }, degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos
  };
}

function resolveGateLeafCount(widthMm: number): 1 | 2 {
  return widthMm > GATE_DOUBLE_LEAF_THRESHOLD_MM ? 2 : 1;
}

function resolveGatePreviewLeafCount(gateType: GateType, widthMm: number): 1 | 2 {
  if (gateType === "DOUBLE_LEAF") {
    return 2;
  }
  if (gateType === "SINGLE_LEAF") {
    return 1;
  }
  return resolveGateLeafCount(widthMm);
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.max(startA, startB) < Math.min(endA, endB);
}

function rectanglesOverlap(left: ScreenRect, right: ScreenRect, paddingPx = 5): boolean {
  return (
    left.left - paddingPx < right.right &&
    left.right + paddingPx > right.left &&
    left.top - paddingPx < right.bottom &&
    left.bottom + paddingPx > right.top
  );
}

function offsetAlongSegmentMm(segment: LayoutSegment, point: PointMm): number {
  const segmentVector = {
    x: segment.end.x - segment.start.x,
    y: segment.end.y - segment.start.y
  };
  const segmentLength = Math.hypot(segmentVector.x, segmentVector.y);
  if (segmentLength <= 1e-6) {
    return 0;
  }
  const toPoint = {
    x: point.x - segment.start.x,
    y: point.y - segment.start.y
  };
  return Math.max(0, Math.min(segmentLength, dot(toPoint, segmentVector) / segmentLength));
}

function isPointOnSegmentInterior(point: PointMm, segment: LayoutSegment, toleranceMm = 1): boolean {
  const segmentVector = {
    x: segment.end.x - segment.start.x,
    y: segment.end.y - segment.start.y
  };
  const segmentLength = Math.hypot(segmentVector.x, segmentVector.y);
  if (segmentLength <= 1e-6) {
    return false;
  }
  const fromStart = {
    x: point.x - segment.start.x,
    y: point.y - segment.start.y
  };
  const perpendicularDistanceMm = Math.abs(cross(fromStart, segmentVector)) / segmentLength;
  if (perpendicularDistanceMm > toleranceMm) {
    return false;
  }
  const projectionFraction = dot(fromStart, segmentVector) / (segmentLength * segmentLength);
  const endpointTolerance = toleranceMm / segmentLength;
  return projectionFraction > endpointTolerance && projectionFraction < 1 - endpointTolerance;
}

function segmentIntersectionPoint(first: LayoutSegment, second: LayoutSegment): PointMm | null {
  const p = first.start;
  const q = second.start;
  const r = {
    x: first.end.x - first.start.x,
    y: first.end.y - first.start.y
  };
  const s = {
    x: second.end.x - second.start.x,
    y: second.end.y - second.start.y
  };
  const rCrossS = cross(r, s);
  if (Math.abs(rCrossS) < 1e-6) {
    return null;
  }
  const qMinusP = {
    x: q.x - p.x,
    y: q.y - p.y
  };
  const t = cross(qMinusP, s) / rCrossS;
  const u = cross(qMinusP, r) / rCrossS;
  const tolerance = 1e-6;
  if (t < -tolerance || t > 1 + tolerance || u < -tolerance || u > 1 + tolerance) {
    return null;
  }
  return {
    x: p.x + r.x * t,
    y: p.y + r.y * t
  };
}

function collectInteriorIntersectionOffsetsMm(target: LayoutSegment, allSegments: LayoutSegment[]): number[] {
  const targetLengthMm = distanceMm(target.start, target.end);
  if (targetLengthMm <= MIN_SEGMENT_MM) {
    return [];
  }

  const rawOffsets: number[] = [];
  const addOffsetIfInterior = (point: PointMm): void => {
    if (!isPointOnSegmentInterior(point, target, 1)) {
      return;
    }
    const offsetMm = offsetAlongSegmentMm(target, point);
    if (offsetMm <= MIN_SEGMENT_MM || offsetMm >= targetLengthMm - MIN_SEGMENT_MM) {
      return;
    }
    rawOffsets.push(offsetMm);
  };

  for (const segment of allSegments) {
    if (segment.id === target.id) {
      continue;
    }
    addOffsetIfInterior(segment.start);
    addOffsetIfInterior(segment.end);
    const intersection = segmentIntersectionPoint(target, segment);
    if (intersection) {
      addOffsetIfInterior(intersection);
    }
  }

  rawOffsets.sort((left, right) => left - right);
  const deduped: number[] = [];
  const mergeThresholdMm = DRAW_INCREMENT_MM * 0.2;
  for (const offsetMm of rawOffsets) {
    const last = deduped[deduped.length - 1];
    if (last === undefined || Math.abs(offsetMm - last) > mergeThresholdMm) {
      deduped.push(offsetMm);
    }
  }
  return deduped;
}

function isOppositeGatePair(left: GateVisual, right: GateVisual): boolean {
  const tangentAlignment = Math.abs(dot(left.tangent, right.tangent));
  if (tangentAlignment < 0.92) {
    return false;
  }

  const delta = {
    x: right.centerPoint.x - left.centerPoint.x,
    y: right.centerPoint.y - left.centerPoint.y
  };
  const distanceBetweenCentersMm = Math.hypot(delta.x, delta.y);
  if (distanceBetweenCentersMm < 150) {
    return false;
  }

  const acrossMm = Math.abs(dot(delta, left.normal));
  if (acrossMm < 300) {
    return false;
  }

  const alongDriftMm = Math.abs(dot(delta, left.tangent));
  const maxAllowedAlongDriftMm = Math.max(left.widthMm, right.widthMm) * 0.8 + 250;
  return alongDriftMm <= maxAllowedAlongDriftMm;
}

function buildOppositeGateGuides(gates: GateVisual[]): GateOppositeGuide[] {
  if (gates.length < 2) {
    return [];
  }

  const candidates: Array<{ firstIndex: number; secondIndex: number; distanceMm: number }> = [];
  for (let leftIndex = 0; leftIndex < gates.length - 1; leftIndex += 1) {
    const left = gates[leftIndex];
    if (!left) {
      continue;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < gates.length; rightIndex += 1) {
      const right = gates[rightIndex];
      if (!right || !isOppositeGatePair(left, right)) {
        continue;
      }
      candidates.push({
        firstIndex: leftIndex,
        secondIndex: rightIndex,
        distanceMm: distanceMm(left.centerPoint, right.centerPoint)
      });
    }
  }

  candidates.sort((left, right) => left.distanceMm - right.distanceMm);
  const usedIndices = new Set<number>();
  const guides: GateOppositeGuide[] = [];

  for (const candidate of candidates) {
    if (usedIndices.has(candidate.firstIndex) || usedIndices.has(candidate.secondIndex)) {
      continue;
    }
    const first = gates[candidate.firstIndex];
    const second = gates[candidate.secondIndex];
    if (!first || !second) {
      continue;
    }
    guides.push({
      key: `${first.key}::${second.key}`,
      start: first.centerPoint,
      end: second.centerPoint
    });
    usedIndices.add(candidate.firstIndex);
    usedIndices.add(candidate.secondIndex);
  }

  return guides;
}

function clampGatePlacementToSegment(
  placement: GatePlacement,
  segmentLengthMm: number,
): { startOffsetMm: number; endOffsetMm: number } | null {
  if (segmentLengthMm < MIN_SEGMENT_MM * 2 + DRAW_INCREMENT_MM) {
    return null;
  }

  const maxWidthMm = Math.max(DRAW_INCREMENT_MM, segmentLengthMm - MIN_SEGMENT_MM * 2);
  const requestedWidthMm = placement.endOffsetMm - placement.startOffsetMm;
  const widthMm = Math.max(DRAW_INCREMENT_MM, Math.min(maxWidthMm, requestedWidthMm));

  let startOffsetMm = Math.max(
    MIN_SEGMENT_MM,
    Math.min(segmentLengthMm - MIN_SEGMENT_MM - widthMm, placement.startOffsetMm),
  );
  let endOffsetMm = Math.min(segmentLengthMm - MIN_SEGMENT_MM, startOffsetMm + widthMm);

  startOffsetMm = Math.round(startOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  endOffsetMm = Math.round(endOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;

  if (endOffsetMm - startOffsetMm < DRAW_INCREMENT_MM) {
    return null;
  }
  if (startOffsetMm < MIN_SEGMENT_MM || segmentLengthMm - endOffsetMm < MIN_SEGMENT_MM) {
    return null;
  }

  return {
    startOffsetMm,
    endOffsetMm
  };
}

function sameGatePlacement(left: GatePlacement, right: GatePlacement): boolean {
  return (
    left.id === right.id &&
    left.segmentId === right.segmentId &&
    left.startOffsetMm === right.startOffsetMm &&
    left.endOffsetMm === right.endOffsetMm &&
    left.gateType === right.gateType
  );
}

function sameGatePlacementList(left: GatePlacement[], right: GatePlacement[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftGate = left[index];
    const rightGate = right[index];
    if (!leftGate || !rightGate || !sameGatePlacement(leftGate, rightGate)) {
      return false;
    }
  }
  return true;
}

function samePointApprox(left: PointMm, right: PointMm, epsilon = 0.001): boolean {
  return Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon;
}

function sameSegment(left: LayoutSegment, right: LayoutSegment): boolean {
  return (
    left.id === right.id &&
    left.start.x === right.start.x &&
    left.start.y === right.start.y &&
    left.end.x === right.end.x &&
    left.end.y === right.end.y &&
    sameSpec(left.spec, right.spec)
  );
}

function sameSegmentList(left: LayoutSegment[], right: LayoutSegment[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];
    if (!leftSegment || !rightSegment || !sameSegment(leftSegment, rightSegment)) {
      return false;
    }
  }
  return true;
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "APPLY": {
      const next = action.updater(state.present);
      if (sameSegmentList(state.present, next)) {
        return state;
      }
      return {
        past: [...state.past, state.present],
        present: next,
        future: []
      };
    }
    case "UNDO": {
      const previous = state.past[state.past.length - 1];
      if (!previous) {
        return state;
      }
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future]
      };
    }
    case "REDO": {
      const next = state.future[0];
      if (!next) {
        return state;
      }
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1)
      };
    }
    case "SET": {
      if (sameSegmentList(state.present, action.segments)) {
        return state;
      }
      return {
        past: [...state.past, state.present],
        present: action.segments,
        future: []
      };
    }
    default:
      return state;
  }
}

function buildScaleBar(scale: number, canvasWidth: number): ScaleBarState {
  const targetPx = Math.max(100, Math.min(220, canvasWidth * SCALE_BAR_TARGET_RATIO));
  const maxPx = canvasWidth * SCALE_BAR_MAX_RATIO;
  let bestLengthMm = SCALE_BAR_CANDIDATES_MM[0] ?? 1000;
  let bestError = Number.POSITIVE_INFINITY;
  let hasCandidate = false;

  for (const candidateMm of SCALE_BAR_CANDIDATES_MM) {
    const candidatePx = candidateMm * scale;
    if (candidatePx > maxPx) {
      continue;
    }
    hasCandidate = true;
    const error = Math.abs(candidatePx - targetPx);
    if (error < bestError) {
      bestLengthMm = candidateMm;
      bestError = error;
    }
  }

  if (!hasCandidate) {
    const rawMm = Math.max(100, maxPx / Math.max(scale, 1e-6));
    const magnitude = 10 ** Math.floor(Math.log10(rawMm));
    const normalized = rawMm / magnitude;
    const base = normalized >= 10 ? 10 : normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
    bestLengthMm = base * magnitude;
  }

  return {
    lengthMm: bestLengthMm,
    lengthPx: bestLengthMm * scale,
    label: formatDistanceLabel(bestLengthMm)
  };
}

function findNearestNode(point: PointMm, nodes: PointMm[], maxDistanceMm: number): PointMm | null {
  let closest: PointMm | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    const distance = distanceMm(point, node);
    if (distance > maxDistanceMm || distance >= bestDistance) {
      continue;
    }
    closest = node;
    bestDistance = distance;
  }

  return closest;
}

function snapToAxisGuide(
  start: PointMm,
  candidate: PointMm,
  anchors: PointMm[],
  maxDistanceMm: number,
): { point: PointMm; guide: AxisGuide | null } {
  const deltaX = candidate.x - start.x;
  const deltaY = candidate.y - start.y;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const isHorizontal = absX > 0 && absY <= absX * 0.2;
  const isVertical = absY > 0 && absX <= absY * 0.2;

  if (isHorizontal) {
    let best: PointMm | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const anchor of anchors) {
      const distance = Math.abs(anchor.x - candidate.x);
      if (distance > maxDistanceMm || distance >= bestDistance) {
        continue;
      }
      best = anchor;
      bestDistance = distance;
    }
    if (best) {
      return {
        point: quantize({ x: best.x, y: candidate.y }),
        guide: {
          orientation: "VERTICAL",
          coordinateMm: best.x,
          anchor: best
        }
      };
    }
  }

  if (isVertical) {
    let best: PointMm | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const anchor of anchors) {
      const distance = Math.abs(anchor.y - candidate.y);
      if (distance > maxDistanceMm || distance >= bestDistance) {
        continue;
      }
      best = anchor;
      bestDistance = distance;
    }
    if (best) {
      return {
        point: quantize({ x: candidate.x, y: best.y }),
        guide: {
          orientation: "HORIZONTAL",
          coordinateMm: best.y,
          anchor: best
        }
      };
    }
  }

  return { point: quantize(candidate), guide: null };
}

function pointCoordinateKey(point: PointMm): string {
  return `${point.x}:${point.y}`;
}

function classifyIncidentNode(vectors: Array<{ x: number; y: number }>): PostKind {
  if (vectors.length <= 1) {
    return "END";
  }
  if (vectors.length === 2) {
    const first = vectors[0];
    const second = vectors[1];
    if (!first || !second) {
      return "END";
    }
    return areOpposite(first, second, 1) ? "INLINE_JOIN" : "CORNER";
  }
  return "JUNCTION";
}

function buildSegmentConnectivity(segments: LayoutSegment[]): SegmentConnectivity {
  const segmentComponent = new Map<string, string>();
  const segmentIdsByComponent = new Map<string, string[]>();
  const movableComponentIds = new Set<string>();
  const closedComponentIds = new Set<string>();
  const nodeDegreeByKey = new Map<string, number>();
  const segmentById = new Map<string, LayoutSegment>();
  const segmentIdsByNode = new Map<string, string[]>();

  function addNodeSegment(nodeKey: string, segmentId: string): void {
    const bucket = segmentIdsByNode.get(nodeKey);
    if (bucket) {
      bucket.push(segmentId);
      return;
    }
    segmentIdsByNode.set(nodeKey, [segmentId]);
  }

  for (const segment of segments) {
    segmentById.set(segment.id, segment);
    addNodeSegment(pointCoordinateKey(segment.start), segment.id);
    addNodeSegment(pointCoordinateKey(segment.end), segment.id);
  }

  for (const [nodeKey, segmentIds] of segmentIdsByNode) {
    nodeDegreeByKey.set(nodeKey, segmentIds.length);
  }

  const visited = new Set<string>();
  let componentIndex = 0;

  for (const segment of segments) {
    if (visited.has(segment.id)) {
      continue;
    }
    const componentId = `component-${componentIndex}`;
    componentIndex += 1;
    const queue: string[] = [segment.id];
    const componentSegmentIds: string[] = [];
    const componentNodeKeys = new Set<string>();
    visited.add(segment.id);

    while (queue.length > 0) {
      const currentSegmentId = queue.shift();
      if (!currentSegmentId) {
        break;
      }
      const currentSegment = segmentById.get(currentSegmentId);
      if (!currentSegment) {
        continue;
      }

      componentSegmentIds.push(currentSegmentId);
      segmentComponent.set(currentSegmentId, componentId);

      const nodeKeys = [
        pointCoordinateKey(currentSegment.start),
        pointCoordinateKey(currentSegment.end)
      ];
      for (const nodeKey of nodeKeys) {
        componentNodeKeys.add(nodeKey);
        const neighborSegmentIds = segmentIdsByNode.get(nodeKey) ?? [];
        for (const neighborSegmentId of neighborSegmentIds) {
          if (visited.has(neighborSegmentId)) {
            continue;
          }
          visited.add(neighborSegmentId);
          queue.push(neighborSegmentId);
        }
      }
    }

    segmentIdsByComponent.set(componentId, componentSegmentIds);
    const isClosed =
      componentSegmentIds.length >= 3 &&
      [...componentNodeKeys].every((nodeKey) => (nodeDegreeByKey.get(nodeKey) ?? 0) === 2);
    if (isClosed) {
      closedComponentIds.add(componentId);
    }
    const onlyOneSegment = componentSegmentIds.length === 1;
    const firstSegment = onlyOneSegment ? segmentById.get(componentSegmentIds[0] ?? "") : undefined;
    const firstNodeDegree = firstSegment ? nodeDegreeByKey.get(pointCoordinateKey(firstSegment.start)) ?? 0 : 0;
    const secondNodeDegree = firstSegment ? nodeDegreeByKey.get(pointCoordinateKey(firstSegment.end)) ?? 0 : 0;
    const isMovable = isClosed || (onlyOneSegment && firstNodeDegree === 1 && secondNodeDegree === 1);
    if (isMovable) {
      movableComponentIds.add(componentId);
    }
  }

  return {
    segmentComponent,
    segmentIdsByComponent,
    movableComponentIds,
    closedComponentIds,
    nodeDegreeByKey
  };
}

function resolveGatePlacements(
  segmentsById: Map<string, LayoutSegment>,
  gatePlacements: GatePlacement[],
): ResolvedGatePlacement[] {
  const sorted = [...gatePlacements].sort((left, right) => left.id.localeCompare(right.id));
  const resolved: ResolvedGatePlacement[] = [];

  for (const placement of sorted) {
    const segment = segmentsById.get(placement.segmentId);
    if (!segment) {
      continue;
    }
    const segmentLengthMm = distanceMm(segment.start, segment.end);
    const clamped = clampGatePlacementToSegment(placement, segmentLengthMm);
    if (!clamped) {
      continue;
    }
    const entryPoint = interpolateAlongSegment(segment, clamped.startOffsetMm);
    const exitPoint = interpolateAlongSegment(segment, clamped.endOffsetMm);
    const tangent = normalizeVector({
      x: exitPoint.x - entryPoint.x,
      y: exitPoint.y - entryPoint.y
    });
    if (!tangent) {
      continue;
    }
    const widthMm = clamped.endOffsetMm - clamped.startOffsetMm;
    resolved.push({
      id: placement.id,
      segmentId: placement.segmentId,
      startOffsetMm: clamped.startOffsetMm,
      endOffsetMm: clamped.endOffsetMm,
      gateType: placement.gateType,
      key: placement.id,
      startPoint: entryPoint,
      endPoint: exitPoint,
      centerPoint: {
        x: (entryPoint.x + exitPoint.x) / 2,
        y: (entryPoint.y + exitPoint.y) / 2
      },
      widthMm,
      tangent,
      normal: { x: -tangent.y, y: tangent.x },
      leafCount: resolveGatePreviewLeafCount(placement.gateType, widthMm),
      spec: segment.spec
    });
  }

  return resolved;
}

function buildSegmentRuns(segment: LayoutSegment, gateSpans: ResolvedGatePlacement[]): Array<{ start: PointMm; end: PointMm }> {
  const segmentLengthMm = distanceMm(segment.start, segment.end);
  if (segmentLengthMm <= 0) {
    return [];
  }
  if (gateSpans.length === 0) {
    return [{ start: segment.start, end: segment.end }];
  }

  const sortedGates = [...gateSpans].sort((left, right) => left.startOffsetMm - right.startOffsetMm);
  const runs: Array<{ start: PointMm; end: PointMm }> = [];
  let cursorMm = 0;

  for (const gate of sortedGates) {
    const runEndMm = Math.max(cursorMm, gate.startOffsetMm);
    if (runEndMm - cursorMm >= MIN_SEGMENT_MM) {
      runs.push({
        start: interpolateAlongSegment(segment, cursorMm),
        end: interpolateAlongSegment(segment, runEndMm)
      });
    }
    cursorMm = Math.max(cursorMm, gate.endOffsetMm);
  }

  if (segmentLengthMm - cursorMm >= MIN_SEGMENT_MM) {
    runs.push({
      start: interpolateAlongSegment(segment, cursorMm),
      end: interpolateAlongSegment(segment, segmentLengthMm)
    });
  }

  return runs;
}

function buildEstimateSegments(segments: LayoutSegment[], gatesBySegmentId: Map<string, ResolvedGatePlacement[]>): LayoutSegment[] {
  const derived: LayoutSegment[] = [];

  for (const segment of segments) {
    const gateSpans = gatesBySegmentId.get(segment.id) ?? [];
    const runs = buildSegmentRuns(segment, gateSpans);
    if (runs.length === 0) {
      continue;
    }
    runs.forEach((run, index) => {
      derived.push({
        id: `${segment.id}::run-${index}`,
        start: quantize(run.start),
        end: quantize(run.end),
        spec: segment.spec
      });
    });
  }

  return derived;
}

function renderGateSymbol(
  gate: GateVisual,
  scale: number,
  style: {
    frameStroke: string;
    leafStroke: string;
    swingStroke: string;
    markerFill: string;
    labelColor: string;
    opacity?: number;
  },
  label: string | null,
  keyOverride?: string,
) {
  const postTickHalfMm = Math.max(120, Math.min(260, gate.widthMm * 0.16));
  const openAngle = GATE_OPEN_ANGLE_DEGREES;
  const strokeWidth = 2.6 / scale;
  const sweepStrokeWidth = 1.7 / scale;
  const markerRadius = 3.2 / scale;
  const labelOffsetMm = Math.max(220, Math.min(420, gate.widthMm * 0.18)) + GATE_LABEL_OFFSET_PX / scale;
  const labelY = gate.centerPoint.y + gate.normal.y * labelOffsetMm;
  const labelX = gate.centerPoint.x + gate.normal.x * labelOffsetMm;

  const startPostTop = {
    x: gate.startPoint.x + gate.normal.x * postTickHalfMm,
    y: gate.startPoint.y + gate.normal.y * postTickHalfMm
  };
  const startPostBottom = {
    x: gate.startPoint.x - gate.normal.x * postTickHalfMm,
    y: gate.startPoint.y - gate.normal.y * postTickHalfMm
  };
  const endPostTop = {
    x: gate.endPoint.x + gate.normal.x * postTickHalfMm,
    y: gate.endPoint.y + gate.normal.y * postTickHalfMm
  };
  const endPostBottom = {
    x: gate.endPoint.x - gate.normal.x * postTickHalfMm,
    y: gate.endPoint.y - gate.normal.y * postTickHalfMm
  };

  const key = keyOverride ?? gate.key;

  if (gate.leafCount === 1) {
    const openDirection = rotateVector(gate.tangent, openAngle);
    const controlDirection = normalizeVector({
      x: gate.tangent.x + openDirection.x,
      y: gate.tangent.y + openDirection.y
    }) ?? openDirection;
    const openTip = {
      x: gate.startPoint.x + openDirection.x * gate.widthMm,
      y: gate.startPoint.y + openDirection.y * gate.widthMm
    };
    const sweepControl = {
      x: gate.startPoint.x + controlDirection.x * gate.widthMm * 1.1,
      y: gate.startPoint.y + controlDirection.y * gate.widthMm * 1.1
    };

    return (
      <Group key={key} listening={false} opacity={style.opacity ?? 1}>
        <Line
          points={[gate.startPoint.x, gate.startPoint.y, gate.endPoint.x, gate.endPoint.y]}
          stroke={style.frameStroke}
          strokeWidth={strokeWidth}
          dash={[9 / scale, 6 / scale]}
          lineCap="round"
        />
        <Line
          points={[startPostTop.x, startPostTop.y, startPostBottom.x, startPostBottom.y]}
          stroke={style.frameStroke}
          strokeWidth={strokeWidth}
          lineCap="round"
        />
        <Line
          points={[endPostTop.x, endPostTop.y, endPostBottom.x, endPostBottom.y]}
          stroke={style.frameStroke}
          strokeWidth={strokeWidth}
          lineCap="round"
        />
        <Line
          points={[gate.startPoint.x, gate.startPoint.y, openTip.x, openTip.y]}
          stroke={style.leafStroke}
          strokeWidth={strokeWidth}
          lineCap="round"
        />
        <Line
          points={[gate.endPoint.x, gate.endPoint.y, sweepControl.x, sweepControl.y, openTip.x, openTip.y]}
          stroke={style.swingStroke}
          strokeWidth={sweepStrokeWidth}
          dash={[8 / scale, 5 / scale]}
          bezier
          lineCap="round"
        />
        <Circle x={gate.startPoint.x} y={gate.startPoint.y} radius={markerRadius} fill={style.markerFill} />
        {label ? (
          <Text
            x={labelX}
            y={labelY}
            text={label}
            fontSize={LABEL_FONT_SIZE_PX / scale}
            fill={style.labelColor}
            offsetX={(label.length * 3.6) / scale}
            offsetY={10 / scale}
          />
        ) : null}
      </Group>
    );
  }

  const leafLengthMm = gate.widthMm / 2;
  const rightClosedDirection = {
    x: -gate.tangent.x,
    y: -gate.tangent.y
  };
  const leftOpenDirection = rotateVector(gate.tangent, openAngle);
  const rightOpenDirection = rotateVector(rightClosedDirection, -openAngle);
  const leftControlDirection = normalizeVector({
    x: gate.tangent.x + leftOpenDirection.x,
    y: gate.tangent.y + leftOpenDirection.y
  }) ?? leftOpenDirection;
  const rightControlDirection = normalizeVector({
    x: rightClosedDirection.x + rightOpenDirection.x,
    y: rightClosedDirection.y + rightOpenDirection.y
  }) ?? rightOpenDirection;

  const leftOpenTip = {
    x: gate.startPoint.x + leftOpenDirection.x * leafLengthMm,
    y: gate.startPoint.y + leftOpenDirection.y * leafLengthMm
  };
  const rightOpenTip = {
    x: gate.endPoint.x + rightOpenDirection.x * leafLengthMm,
    y: gate.endPoint.y + rightOpenDirection.y * leafLengthMm
  };
  const leftSweepControl = {
    x: gate.startPoint.x + leftControlDirection.x * leafLengthMm * 1.1,
    y: gate.startPoint.y + leftControlDirection.y * leafLengthMm * 1.1
  };
  const rightSweepControl = {
    x: gate.endPoint.x + rightControlDirection.x * leafLengthMm * 1.1,
    y: gate.endPoint.y + rightControlDirection.y * leafLengthMm * 1.1
  };

  return (
    <Group key={key} listening={false} opacity={style.opacity ?? 1}>
      <Line
        points={[gate.startPoint.x, gate.startPoint.y, gate.endPoint.x, gate.endPoint.y]}
        stroke={style.frameStroke}
        strokeWidth={strokeWidth}
        dash={[9 / scale, 6 / scale]}
        lineCap="round"
      />
      <Line
        points={[startPostTop.x, startPostTop.y, startPostBottom.x, startPostBottom.y]}
        stroke={style.frameStroke}
        strokeWidth={strokeWidth}
        lineCap="round"
      />
      <Line
        points={[endPostTop.x, endPostTop.y, endPostBottom.x, endPostBottom.y]}
        stroke={style.frameStroke}
        strokeWidth={strokeWidth}
        lineCap="round"
      />
      <Line
        points={[gate.startPoint.x, gate.startPoint.y, leftOpenTip.x, leftOpenTip.y]}
        stroke={style.leafStroke}
        strokeWidth={strokeWidth}
        lineCap="round"
      />
      <Line
        points={[gate.endPoint.x, gate.endPoint.y, rightOpenTip.x, rightOpenTip.y]}
        stroke={style.leafStroke}
        strokeWidth={strokeWidth}
        lineCap="round"
      />
      <Line
        points={[gate.centerPoint.x, gate.centerPoint.y, leftSweepControl.x, leftSweepControl.y, leftOpenTip.x, leftOpenTip.y]}
        stroke={style.swingStroke}
        strokeWidth={sweepStrokeWidth}
        dash={[8 / scale, 5 / scale]}
        bezier
        lineCap="round"
      />
      <Line
        points={[gate.centerPoint.x, gate.centerPoint.y, rightSweepControl.x, rightSweepControl.y, rightOpenTip.x, rightOpenTip.y]}
        stroke={style.swingStroke}
        strokeWidth={sweepStrokeWidth}
        dash={[8 / scale, 5 / scale]}
        bezier
        lineCap="round"
      />
      <Circle x={gate.startPoint.x} y={gate.startPoint.y} radius={markerRadius} fill={style.markerFill} />
      <Circle x={gate.endPoint.x} y={gate.endPoint.y} radius={markerRadius} fill={style.markerFill} />
      {label ? (
        <Text
          x={labelX}
          y={labelY}
          text={label}
          fontSize={LABEL_FONT_SIZE_PX / scale}
          fill={style.labelColor}
          offsetX={(label.length * 3.6) / scale}
          offsetY={10 / scale}
        />
      ) : null}
    </Group>
  );
}

function interpolateAlongSegment(segment: LayoutSegment, offsetMm: number): PointMm {
  const lengthMm = distanceMm(segment.start, segment.end);
  if (lengthMm <= 0) {
    return segment.start;
  }
  const t = Math.max(0, Math.min(1, offsetMm / lengthMm));
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * t,
    y: segment.start.y + (segment.end.y - segment.start.y) * t
  };
}

function projectPointOntoSegment(point: PointMm, segment: LayoutSegment): { projected: PointMm; offsetMm: number; distanceMm: number } {
  const vx = segment.end.x - segment.start.x;
  const vy = segment.end.y - segment.start.y;
  const segmentLengthSquared = vx * vx + vy * vy;
  if (segmentLengthSquared <= 0) {
    return {
      projected: segment.start,
      offsetMm: 0,
      distanceMm: distanceMm(point, segment.start)
    };
  }
  const wx = point.x - segment.start.x;
  const wy = point.y - segment.start.y;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / segmentLengthSquared));
  const projected = {
    x: segment.start.x + vx * t,
    y: segment.start.y + vy * t
  };
  return {
    projected,
    offsetMm: distanceMm(segment.start, projected),
    distanceMm: distanceMm(point, projected)
  };
}

function findNearestSegmentSnap(point: PointMm, segments: LayoutSegment[], maxDistanceMm: number): LineSnapPreview | null {
  let best: LineSnapPreview | null = null;

  for (const segment of segments) {
    const segmentLengthMm = distanceMm(segment.start, segment.end);
    if (segmentLengthMm <= 0) {
      continue;
    }
    const projection = projectPointOntoSegment(point, segment);
    if (projection.distanceMm > maxDistanceMm) {
      continue;
    }
    const snappedOffsetMm = Math.max(
      0,
      Math.min(segmentLengthMm, Math.round(projection.offsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM),
    );
    const snappedPoint = interpolateAlongSegment(segment, snappedOffsetMm);
    const snappedDistanceMm = distanceMm(point, snappedPoint);
    if (snappedDistanceMm > maxDistanceMm) {
      continue;
    }
    if (!best || snappedDistanceMm < best.distanceMm) {
      best = {
        segment,
        point: snappedPoint,
        startOffsetMm: snappedOffsetMm,
        endOffsetMm: Math.max(0, segmentLengthMm - snappedOffsetMm),
        distanceMm: snappedDistanceMm
      };
    }
  }

  return best;
}

function resolveGateWidthMm(gateType: GateType, customGateWidthMm: number): number {
  if (gateType === "SINGLE_LEAF") {
    return SINGLE_GATE_WIDTH_MM;
  }
  if (gateType === "DOUBLE_LEAF") {
    return DOUBLE_GATE_WIDTH_MM;
  }
  return customGateWidthMm;
}

function buildGatePreview(segment: LayoutSegment, centerOffsetMm: number, requestedWidthMm: number): GateInsertionPreview | null {
  const segmentLengthMm = distanceMm(segment.start, segment.end);
  if (segmentLengthMm < MIN_SEGMENT_MM * 2 + DRAW_INCREMENT_MM) {
    return null;
  }

  const maxWidthMm = Math.max(DRAW_INCREMENT_MM, segmentLengthMm - MIN_SEGMENT_MM * 2);
  const widthMm = Math.max(DRAW_INCREMENT_MM, Math.min(requestedWidthMm, maxWidthMm));
  let startOffsetMm = centerOffsetMm - widthMm / 2;
  let endOffsetMm = centerOffsetMm + widthMm / 2;
  startOffsetMm = Math.max(MIN_SEGMENT_MM, Math.min(segmentLengthMm - MIN_SEGMENT_MM - widthMm, startOffsetMm));
  endOffsetMm = Math.min(segmentLengthMm - MIN_SEGMENT_MM, startOffsetMm + widthMm);

  startOffsetMm = Math.round(startOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  endOffsetMm = Math.round(endOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  if (endOffsetMm - startOffsetMm < DRAW_INCREMENT_MM) {
    return null;
  }
  if (startOffsetMm < MIN_SEGMENT_MM || segmentLengthMm - endOffsetMm < MIN_SEGMENT_MM) {
    return null;
  }

  const entryPoint = interpolateAlongSegment(segment, startOffsetMm);
  const exitPoint = interpolateAlongSegment(segment, endOffsetMm);
  const tangent = normalizeVector({
    x: exitPoint.x - entryPoint.x,
    y: exitPoint.y - entryPoint.y
  });
  if (!tangent) {
    return null;
  }

  return {
    segment,
    segmentLengthMm,
    startOffsetMm,
    endOffsetMm,
    widthMm: endOffsetMm - startOffsetMm,
    entryPoint,
    exitPoint,
    tangent,
    normal: { x: -tangent.y, y: tangent.x },
    targetPoint: interpolateAlongSegment(segment, centerOffsetMm)
  };
}

function buildRecessPreview(
  segment: LayoutSegment,
  centerOffsetMm: number,
  requestedWidthMm: number,
  requestedDepthMm: number,
  side: RecessSide,
): RecessInsertionPreview | null {
  const segmentLengthMm = distanceMm(segment.start, segment.end);
  if (segmentLengthMm <= MIN_SEGMENT_MM) {
    return null;
  }

  const widthMm = Math.max(DRAW_INCREMENT_MM, Math.min(requestedWidthMm, segmentLengthMm));
  const depthMm = Math.max(DRAW_INCREMENT_MM, requestedDepthMm);

  let startOffsetMm = centerOffsetMm - widthMm / 2;
  let endOffsetMm = centerOffsetMm + widthMm / 2;

  if (centerOffsetMm <= widthMm / 2 + RECESS_CORNER_SNAP_MM) {
    startOffsetMm = 0;
    endOffsetMm = widthMm;
  } else if (centerOffsetMm >= segmentLengthMm - widthMm / 2 - RECESS_CORNER_SNAP_MM) {
    endOffsetMm = segmentLengthMm;
    startOffsetMm = segmentLengthMm - widthMm;
  }

  startOffsetMm = Math.max(0, Math.min(segmentLengthMm - widthMm, startOffsetMm));
  endOffsetMm = Math.max(startOffsetMm, Math.min(segmentLengthMm, startOffsetMm + widthMm));

  startOffsetMm = Math.round(startOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  endOffsetMm = Math.round(endOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  if (endOffsetMm - startOffsetMm < DRAW_INCREMENT_MM) {
    return null;
  }

  const sourcePoint = segment.start;
  const entryPoint = interpolateAlongSegment(segment, startOffsetMm);
  const exitPoint = interpolateAlongSegment(segment, endOffsetMm);

  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const segmentLength = Math.sqrt(dx * dx + dy * dy);
  if (segmentLength <= 0) {
    return null;
  }
  const ux = dx / segmentLength;
  const uy = dy / segmentLength;
  const orientationFactor = side === "LEFT" ? 1 : -1;
  const nx = -uy * orientationFactor;
  const ny = ux * orientationFactor;

  const recessEntryPoint = {
    x: entryPoint.x + nx * depthMm,
    y: entryPoint.y + ny * depthMm
  };
  const recessExitPoint = {
    x: exitPoint.x + nx * depthMm,
    y: exitPoint.y + ny * depthMm
  };

  return {
    segment,
    segmentLengthMm,
    startOffsetMm,
    endOffsetMm,
    depthMm,
    side,
    sourcePoint,
    entryPoint,
    exitPoint,
    recessEntryPoint,
    recessExitPoint,
    targetPoint: interpolateAlongSegment(segment, centerOffsetMm)
  };
}

function chooseGridStep(scale: number): number {
  const step = GRID_STEPS_MM.find((candidate) => candidate * scale >= MIN_GRID_PIXEL_SPACING);
  return step ?? GRID_STEPS_MM[GRID_STEPS_MM.length - 1]!;
}

function recessMidpointSnapWindowMm(segmentLengthMm: number): number {
  const proportional = segmentLengthMm * 0.08;
  return Math.max(300, Math.min(1200, proportional));
}

function recessFractionSnapWindowMm(segmentLengthMm: number): number {
  const proportional = segmentLengthMm * 0.06;
  return Math.max(260, Math.min(1000, proportional));
}

function recessAnchorSnapWindowMm(segmentLengthMm: number): number {
  const proportional = segmentLengthMm * 0.05;
  return Math.max(220, Math.min(900, proportional));
}

function recessSnapTargetsMm(segmentLengthMm: number): number[] {
  const fractions = [0.25, 1 / 3, 0.5, 2 / 3, 0.75];
  const snapped = new Set<number>();
  for (const fraction of fractions) {
    const offsetMm = Math.round((segmentLengthMm * fraction) / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
    if (offsetMm <= 0 || offsetMm >= segmentLengthMm) {
      continue;
    }
    snapped.add(offsetMm);
  }
  return [...snapped];
}

function snapOffsetToAnchorAlongSegment(
  segment: LayoutSegment,
  currentOffsetMm: number,
  anchorPoints: PointMm[],
  windowMm: number,
): { offsetMm: number; anchorPoint: PointMm | null } {
  const segmentLengthMm = distanceMm(segment.start, segment.end);
  const tangent = normalizeVector({
    x: segment.end.x - segment.start.x,
    y: segment.end.y - segment.start.y
  });
  if (!tangent || segmentLengthMm <= 0) {
    return { offsetMm: currentOffsetMm, anchorPoint: null };
  }

  const currentPoint = interpolateAlongSegment(segment, currentOffsetMm);
  const currentAlong = currentPoint.x * tangent.x + currentPoint.y * tangent.y;
  let bestOffsetMm = currentOffsetMm;
  let bestAnchorPoint: PointMm | null = null;
  let bestDistanceMm = Number.POSITIVE_INFINITY;

  for (const anchor of anchorPoints) {
    const anchorAlong = anchor.x * tangent.x + anchor.y * tangent.y;
    const deltaAlong = anchorAlong - currentAlong;
    const distanceAlong = Math.abs(deltaAlong);
    if (distanceAlong > windowMm) {
      continue;
    }
    const candidateOffsetMm = currentOffsetMm + deltaAlong;
    if (candidateOffsetMm <= 0 || candidateOffsetMm >= segmentLengthMm) {
      continue;
    }
    if (distanceAlong < bestDistanceMm) {
      bestDistanceMm = distanceAlong;
      bestOffsetMm = candidateOffsetMm;
      bestAnchorPoint = anchor;
    }
  }

  return {
    offsetMm: bestOffsetMm,
    anchorPoint: bestAnchorPoint
  };
}

function vectorFromNodeTowardsOtherEnd(segment: LayoutSegment, node: PointMm): { x: number; y: number } | null {
  if (samePointApprox(segment.start, node, 0.1)) {
    return {
      x: segment.end.x - segment.start.x,
      y: segment.end.y - segment.start.y
    };
  }
  if (samePointApprox(segment.end, node, 0.1)) {
    return {
      x: segment.start.x - segment.end.x,
      y: segment.start.y - segment.end.y
    };
  }
  return null;
}

function buildRecessAlignmentAnchors(segments: LayoutSegment[]): RecessAlignmentAnchor[] {
  const segmentsByNode = new Map<string, LayoutSegment[]>();

  function addNodeSegment(node: PointMm, segment: LayoutSegment): void {
    const key = pointCoordinateKey(node);
    const existing = segmentsByNode.get(key);
    if (existing) {
      existing.push(segment);
      return;
    }
    segmentsByNode.set(key, [segment]);
  }

  for (const segment of segments) {
    addNodeSegment(segment.start, segment);
    addNodeSegment(segment.end, segment);
  }

  const anchors: RecessAlignmentAnchor[] = [];
  for (const segment of segments) {
    const startIncidents = segmentsByNode.get(pointCoordinateKey(segment.start)) ?? [];
    const endIncidents = segmentsByNode.get(pointCoordinateKey(segment.end)) ?? [];
    if (startIncidents.length !== 2 || endIncidents.length !== 2) {
      continue;
    }

    const startOther = startIncidents.find((candidate) => candidate.id !== segment.id);
    const endOther = endIncidents.find((candidate) => candidate.id !== segment.id);
    if (!startOther || !endOther) {
      continue;
    }

    const startMain = normalizeVector(vectorFromNodeTowardsOtherEnd(segment, segment.start) ?? { x: 0, y: 0 });
    const endMain = normalizeVector(vectorFromNodeTowardsOtherEnd(segment, segment.end) ?? { x: 0, y: 0 });
    const startLeg = normalizeVector(vectorFromNodeTowardsOtherEnd(startOther, segment.start) ?? { x: 0, y: 0 });
    const endLeg = normalizeVector(vectorFromNodeTowardsOtherEnd(endOther, segment.end) ?? { x: 0, y: 0 });
    if (!startMain || !endMain || !startLeg || !endLeg) {
      continue;
    }

    const startPerpendicular = Math.abs(dot(startMain, startLeg)) <= 0.35;
    const endPerpendicular = Math.abs(dot(endMain, endLeg)) <= 0.35;
    if (!startPerpendicular || !endPerpendicular) {
      continue;
    }

    const segmentTangent = normalizeVector({
      x: segment.end.x - segment.start.x,
      y: segment.end.y - segment.start.y
    });
    if (!segmentTangent) {
      continue;
    }

    anchors.push({
      sourceSegmentId: segment.id,
      point: {
        x: (segment.start.x + segment.end.x) / 2,
        y: (segment.start.y + segment.end.y) / 2
      },
      tangent: segmentTangent
    });
  }

  return anchors;
}

function screenToWorld(pointer: { x: number; y: number }, view: Viewport): PointMm {
  return {
    x: (pointer.x - view.x) / view.scale,
    y: (pointer.y - view.y) / view.scale
  };
}

function quantize(point: PointMm): PointMm {
  return {
    x: Math.round(point.x / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM,
    y: Math.round(point.y / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM
  };
}

function buildRecessReplacementSegments(preview: RecessInsertionPreview): LayoutSegment[] {
  const points = [
    quantize(preview.segment.start),
    quantize(preview.entryPoint),
    quantize(preview.recessEntryPoint),
    quantize(preview.recessExitPoint),
    quantize(preview.exitPoint),
    quantize(preview.segment.end)
  ];

  const built: LayoutSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end || distanceMm(start, end) < MIN_SEGMENT_MM) {
      continue;
    }
    built.push({
      id: crypto.randomUUID(),
      start,
      end,
      spec: preview.segment.spec
    });
  }
  return built;
}

function useWindowSize(): Size {
  const [size, setSize] = useState<Size>({
    width: window.innerWidth,
    height: window.innerHeight
  });

  useEffect(() => {
    function onResize(): void {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
}

export function App() {
  const { width, height } = useWindowSize();
  const canvasWidth = width;
  const canvasHeight = height;
  const stageRef = useRef<Konva.Stage | null>(null);
  const [view, setView] = useState<Viewport>({ x: 120, y: 120, scale: 0.1 });
  const [history, dispatchHistory] = useReducer(historyReducer, {
    past: [],
    present: [],
    future: []
  } satisfies HistoryState);
  const segments = history.present;
  const [activeSpec, setActiveSpec] = useState<FenceSpec>(defaultFenceSpec());
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("DRAW");
  const [drawStart, setDrawStart] = useState<PointMm | null>(null);
  const [rectangleStart, setRectangleStart] = useState<PointMm | null>(null);
  const [pointerWorld, setPointerWorld] = useState<PointMm | null>(null);
  const [recessWidthMm, setRecessWidthMm] = useState<number>(1500);
  const [recessDepthMm, setRecessDepthMm] = useState<number>(1000);
  const [recessWidthInputM, setRecessWidthInputM] = useState<string>(() => formatMetersInputFromMm(1500));
  const [recessDepthInputM, setRecessDepthInputM] = useState<string>(() => formatMetersInputFromMm(1000));
  const [recessSide, setRecessSide] = useState<RecessSide>("LEFT");
  const [gateType, setGateType] = useState<GateType>("SINGLE_LEAF");
  const [customGateWidthMm, setCustomGateWidthMm] = useState<number>(SINGLE_GATE_WIDTH_MM);
  const [customGateWidthInputM, setCustomGateWidthInputM] = useState<string>(() => formatMetersInputFromMm(SINGLE_GATE_WIDTH_MM));
  const [gatePlacements, setGatePlacements] = useState<GatePlacement[]>([]);
  const [disableSnap, setDisableSnap] = useState(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panAnchor, setPanAnchor] = useState<{ x: number; y: number } | null>(null);
  const [activeSegmentDrag, setActiveSegmentDrag] = useState<{ segmentId: string; lastPointer: PointMm } | null>(null);
  const [activeGateDrag, setActiveGateDrag] = useState<{ gateId: string; lastPointer: PointMm } | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<string>("");
  const [isLengthEditorOpen, setIsLengthEditorOpen] = useState(false);
  const [selectedLengthInputM, setSelectedLengthInputM] = useState<string>("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isOptimizationInspectorOpen, setIsOptimizationInspectorOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [panelOffsets, setPanelOffsets] = useState<Record<DraggablePanel, PanelOffset>>({
    controls: { x: 0, y: 0 },
    itemCounts: { x: 0, y: 0 },
    postKey: { x: 0, y: 0 },
    tutorial: { x: 0, y: 0 }
  });
  const [activePanelDrag, setActivePanelDrag] = useState<{
    panel: DraggablePanel;
    startPointer: { x: number; y: number };
    startOffset: PanelOffset;
  } | null>(null);
  const previousSegmentsByIdRef = useRef<Map<string, LayoutSegment>>(new Map());
  const initialScaleApplied = useRef(false);
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const applySegments = useCallback((updater: (previous: LayoutSegment[]) => LayoutSegment[]) => {
    dispatchHistory({ type: "APPLY", updater });
  }, []);

  const undoSegments = useCallback(() => {
    dispatchHistory({ type: "UNDO" });
    setDrawStart(null);
    setSelectedSegmentId(null);
  }, []);

  const redoSegments = useCallback(() => {
    dispatchHistory({ type: "REDO" });
    setDrawStart(null);
    setSelectedSegmentId(null);
  }, []);

  useEffect(() => {
    if (!activePanelDrag) {
      return;
    }
    const drag = activePanelDrag;

    function onMouseMove(event: MouseEvent): void {
      const deltaX = event.clientX - drag.startPointer.x;
      const deltaY = event.clientY - drag.startPointer.y;
      setPanelOffsets((previous) => ({
        ...previous,
        [drag.panel]: {
          x: drag.startOffset.x + deltaX,
          y: drag.startOffset.y + deltaY
        }
      }));
    }

    function onMouseUp(): void {
      setActivePanelDrag(null);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [activePanelDrag]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (isModifierPressed && event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) {
          redoSegments();
        } else {
          undoSegments();
        }
        return;
      }
      if (isModifierPressed && event.code === "KeyY") {
        event.preventDefault();
        redoSegments();
        return;
      }
      if (!isModifierPressed && event.code === "KeyD") {
        setInteractionMode("DRAW");
      }
      if (!isModifierPressed && event.code === "KeyS") {
        setInteractionMode("SELECT");
      }
      if (!isModifierPressed && event.code === "KeyX") {
        setInteractionMode("RECTANGLE");
      }
      if (!isModifierPressed && event.code === "KeyR") {
        setInteractionMode("RECESS");
      }
      if (!isModifierPressed && event.code === "KeyG") {
        setInteractionMode("GATE");
      }
      if (event.code === "Space") {
        setIsSpacePressed(true);
      }
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        setDisableSnap(true);
      }
      if (event.code === "Delete" || event.code === "Backspace") {
        if (selectedGateId) {
          setGatePlacements((previous) => previous.filter((gate) => gate.id !== selectedGateId));
          setSelectedGateId(null);
          return;
        }
        if (selectedSegmentId) {
          applySegments((previous) => previous.filter((segment) => segment.id !== selectedSegmentId));
          setSelectedSegmentId(null);
        }
      }
      if (event.code === "Escape") {
        setDrawStart(null);
        setRectangleStart(null);
      }
    }

    function onKeyUp(event: KeyboardEvent): void {
      if (event.code === "Space") {
        setIsSpacePressed(false);
      }
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        setDisableSnap(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [applySegments, redoSegments, selectedGateId, selectedSegmentId, undoSegments]);

  useEffect(() => {
    if (interactionMode !== "SELECT") {
      setSelectedSegmentId(null);
      setSelectedGateId(null);
      setIsLengthEditorOpen(false);
      setActiveSegmentDrag(null);
      setActiveGateDrag(null);
    }
    if (interactionMode !== "DRAW") {
      setDrawStart(null);
    }
    if (interactionMode !== "RECTANGLE") {
      setRectangleStart(null);
    }
  }, [interactionMode]);

  useEffect(() => {
    if (initialScaleApplied.current || canvasWidth <= 0 || canvasHeight <= 0) {
      return;
    }
    const targetScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, canvasWidth / INITIAL_VISIBLE_WIDTH_MM));
    setView({
      x: canvasWidth * 0.08,
      y: canvasHeight * 0.12,
      scale: targetScale
    });
    initialScaleApplied.current = true;
  }, [canvasHeight, canvasWidth]);

  const segmentsById = useMemo(() => {
    const map = new Map<string, LayoutSegment>();
    for (const segment of segments) {
      map.set(segment.id, segment);
    }
    return map;
  }, [segments]);
  const resolvedGatePlacements = useMemo(
    () => resolveGatePlacements(segmentsById, gatePlacements),
    [gatePlacements, segmentsById],
  );
  const resolvedGateById = useMemo(() => {
    const map = new Map<string, ResolvedGatePlacement>();
    for (const gate of resolvedGatePlacements) {
      map.set(gate.id, gate);
    }
    return map;
  }, [resolvedGatePlacements]);
  const gatesBySegmentId = useMemo(() => {
    const map = new Map<string, ResolvedGatePlacement[]>();
    for (const gate of resolvedGatePlacements) {
      const bucket = map.get(gate.segmentId);
      if (bucket) {
        bucket.push(gate);
      } else {
        map.set(gate.segmentId, [gate]);
      }
    }
    for (const bucket of map.values()) {
      bucket.sort((left, right) => left.startOffsetMm - right.startOffsetMm);
    }
    return map;
  }, [resolvedGatePlacements]);
  const gateNodeHeightByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const gate of resolvedGatePlacements) {
      const heightMm = getSpecConfig(gate.spec).assembledHeightMm;
      const startKey = pointCoordinateKey(quantize(gate.startPoint));
      const endKey = pointCoordinateKey(quantize(gate.endPoint));
      map.set(startKey, Math.max(heightMm, map.get(startKey) ?? 0));
      map.set(endKey, Math.max(heightMm, map.get(endKey) ?? 0));
    }
    return map;
  }, [resolvedGatePlacements]);
  const estimateSegments = useMemo(
    () => buildEstimateSegments(segments, gatesBySegmentId),
    [gatesBySegmentId, segments],
  );
  const estimateSegmentsById = useMemo(() => {
    const map = new Map<string, LayoutSegment>();
    for (const segment of estimateSegments) {
      map.set(segment.id, segment);
    }
    return map;
  }, [estimateSegments]);
  const baseEstimate = useMemo(() => estimateLayout({ segments }), [segments]);
  const estimateFromOpenings = useMemo(() => estimateLayout({ segments: estimateSegments }), [estimateSegments]);
  const estimate = useMemo(() => {
    const byHeightAndType = new Map<string, { end: number; intermediate: number; corner: number; junction: number; inlineJoin: number; total: number }>();
    const allHeightKeys = new Set([
      ...Object.keys(baseEstimate.posts.byHeightAndType),
      ...Object.keys(estimateFromOpenings.posts.byHeightAndType)
    ]);

    for (const heightKey of allHeightKeys) {
      const baseBucket = baseEstimate.posts.byHeightAndType[heightKey];
      const openingsBucket = estimateFromOpenings.posts.byHeightAndType[heightKey];
      const merged = {
        end: baseBucket?.end ?? 0,
        intermediate: openingsBucket?.intermediate ?? 0,
        corner: baseBucket?.corner ?? 0,
        junction: baseBucket?.junction ?? 0,
        inlineJoin: baseBucket?.inlineJoin ?? 0,
        total: 0
      };
      merged.total = merged.end + merged.intermediate + merged.corner + merged.junction + merged.inlineJoin;
      byHeightAndType.set(heightKey, merged);
    }

    const byHeightMm: Record<string, number> = {};
    for (const [heightKey, bucket] of byHeightAndType) {
      byHeightMm[heightKey] = bucket.total;
    }

    return {
      ...estimateFromOpenings,
      posts: {
        terminal: baseEstimate.posts.terminal,
        intermediate: estimateFromOpenings.posts.intermediate,
        total: baseEstimate.posts.terminal + estimateFromOpenings.posts.intermediate,
        cornerPosts: baseEstimate.posts.cornerPosts,
        byHeightAndType: Object.fromEntries(byHeightAndType),
        byHeightMm
      },
      corners: baseEstimate.corners
    };
  }, [baseEstimate, estimateFromOpenings]);
  useEffect(() => {
    const previousSegmentsById = previousSegmentsByIdRef.current;
    setGatePlacements((previous) => {
      const next: GatePlacement[] = [];

      for (const placement of previous) {
        const nextSegment = segmentsById.get(placement.segmentId);
        if (!nextSegment) {
          continue;
        }

        let adjustedPlacement = placement;
        const previousSegment = previousSegmentsById.get(placement.segmentId);
        if (previousSegment) {
          const startMoved = !samePointApprox(previousSegment.start, nextSegment.start);
          const endMoved = !samePointApprox(previousSegment.end, nextSegment.end);

          if (startMoved && !endMoved) {
            const previousLengthMm = distanceMm(previousSegment.start, previousSegment.end);
            const nextLengthMm = distanceMm(nextSegment.start, nextSegment.end);
            const lengthDeltaMm = nextLengthMm - previousLengthMm;
            if (Math.abs(lengthDeltaMm) > 0.001) {
              adjustedPlacement = {
                ...adjustedPlacement,
                startOffsetMm: adjustedPlacement.startOffsetMm + lengthDeltaMm,
                endOffsetMm: adjustedPlacement.endOffsetMm + lengthDeltaMm
              };
            }
          }
        }

        const segmentLengthMm = distanceMm(nextSegment.start, nextSegment.end);
        const clamped = clampGatePlacementToSegment(adjustedPlacement, segmentLengthMm);
        if (!clamped) {
          continue;
        }

        next.push({
          ...adjustedPlacement,
          startOffsetMm: clamped.startOffsetMm,
          endOffsetMm: clamped.endOffsetMm
        });
      }

      next.sort((left, right) => left.id.localeCompare(right.id));
      return sameGatePlacementList(previous, next) ? previous : next;
    });
    previousSegmentsByIdRef.current = new Map(segmentsById);
  }, [segmentsById]);
  const visualPosts = useMemo(() => {
    const postsByCoordinate = new Map<string, VisualPost>();
    const incidentNodes = new Map<string, IncidentNode>();

    function addIncident(point: PointMm, vector: { x: number; y: number }, heightMm: number): void {
      const key = pointCoordinateKey(point);
      const existing = incidentNodes.get(key);
      if (existing) {
        existing.vectors.push(vector);
        existing.maxHeightMm = Math.max(existing.maxHeightMm, heightMm);
        return;
      }
      incidentNodes.set(key, { point, vectors: [vector], maxHeightMm: heightMm });
    }

    for (const segment of estimateSegments) {
      const config = getSpecConfig(segment.spec);
      const segmentLength = distanceMm(segment.start, segment.end);
      const bays = Math.max(1, Math.ceil(segmentLength / config.bayWidthMm));

      addIncident(
        segment.start,
        { x: segment.end.x - segment.start.x, y: segment.end.y - segment.start.y },
        config.assembledHeightMm,
      );
      addIncident(
        segment.end,
        { x: segment.start.x - segment.end.x, y: segment.start.y - segment.end.y },
        config.assembledHeightMm,
      );

      for (let index = 1; index < bays; index += 1) {
        const offsetMm = config.bayWidthMm * index;
        const point = quantize(interpolateAlongSegment(segment, offsetMm));
        const key = pointCoordinateKey(point);
        const existing = postsByCoordinate.get(key);
        if (existing) {
          existing.heightMm = Math.max(existing.heightMm, config.assembledHeightMm);
          continue;
        }
        postsByCoordinate.set(key, {
          key: `post-${key}`,
          point,
          kind: "INTERMEDIATE",
          heightMm: config.assembledHeightMm
        });
      }
    }

    for (const [coordinateKey, node] of incidentNodes) {
      if (gateNodeHeightByKey.has(coordinateKey)) {
        continue;
      }
      postsByCoordinate.set(coordinateKey, {
        key: `post-${coordinateKey}`,
        point: node.point,
        kind: classifyIncidentNode(node.vectors),
        heightMm: node.maxHeightMm
      });
    }

    for (const [coordinateKey, heightMm] of gateNodeHeightByKey) {
      const [xRaw, yRaw] = coordinateKey.split(":");
      const x = Number(xRaw);
      const y = Number(yRaw);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      postsByCoordinate.set(coordinateKey, {
        key: `post-gate-${coordinateKey}`,
        point: { x, y },
        kind: "GATE",
        heightMm
      });
    }

    return [...postsByCoordinate.values()];
  }, [estimateSegments, gateNodeHeightByKey]);
  const recessAlignmentAnchors = useMemo(() => buildRecessAlignmentAnchors(segments), [segments]);
  const drawAnchorNodes = useMemo(
    () =>
      visualPosts
        .filter((post) => post.kind === "END" || post.kind === "CORNER")
        .map((post) => post.point),
    [visualPosts],
  );
  const postTypeCounts = useMemo(
    () =>
      visualPosts.reduce<Record<PostKind, number>>(
        (accumulator, post) => {
          accumulator[post.kind] += 1;
          return accumulator;
        },
        {
          END: 0,
          INTERMEDIATE: 0,
          CORNER: 0,
          JUNCTION: 0,
          INLINE_JOIN: 0,
          GATE: 0
        },
      ),
    [visualPosts],
  );
  const postHeightRows = useMemo(
    () =>
      Object.entries(estimate.posts.byHeightAndType)
        .map(([heightMm, counts]) => ({
          heightMm: Number(heightMm),
          ...counts
        }))
        .sort((left, right) => left.heightMm - right.heightMm),
    [estimate.posts.byHeightAndType],
  );
  const connectivity = useMemo(() => buildSegmentConnectivity(segments), [segments]);
  const placedGateVisuals = useMemo(() => resolvedGatePlacements, [resolvedGatePlacements]);
  const segmentLengthLabelsBySegmentId = useMemo(() => {
    const map = new Map<string, SegmentLengthLabel[]>();

    for (const segment of segments) {
      const segmentLengthMm = distanceMm(segment.start, segment.end);
      if (segmentLengthMm <= MIN_SEGMENT_MM) {
        continue;
      }
      const segmentNormal = normalizeVector({
        x: -(segment.end.y - segment.start.y),
        y: segment.end.x - segment.start.x
      });
      const labelOffsetMm = SEGMENT_LABEL_OFFSET_PX / view.scale;
      const offsets = collectInteriorIntersectionOffsetsMm(segment, segments);
      const boundaries = [0, ...offsets, segmentLengthMm];
      const labels: SegmentLengthLabel[] = [];

      for (let index = 0; index < boundaries.length - 1; index += 1) {
        const startOffsetMm = boundaries[index];
        const endOffsetMm = boundaries[index + 1];
        if (startOffsetMm === undefined || endOffsetMm === undefined) {
          continue;
        }
        const runLengthMm = endOffsetMm - startOffsetMm;
        if (runLengthMm <= MIN_SEGMENT_MM) {
          continue;
        }
        const centerPoint = interpolateAlongSegment(segment, startOffsetMm + runLengthMm / 2);
        const labelPosition = segmentNormal
          ? {
              x: centerPoint.x + segmentNormal.x * labelOffsetMm,
              y: centerPoint.y + segmentNormal.y * labelOffsetMm
            }
          : centerPoint;

        labels.push({
          key: `${segment.id}::${Math.round(startOffsetMm)}-${Math.round(endOffsetMm)}`,
          segmentId: segment.id,
          x: labelPosition.x,
          y: labelPosition.y,
          text: formatLengthMm(runLengthMm),
          lengthMm: runLengthMm,
          isSelected: segment.id === selectedSegmentId
        });
      }

      if (labels.length === 0) {
        const midpoint = {
          x: (segment.start.x + segment.end.x) / 2,
          y: (segment.start.y + segment.end.y) / 2
        };
        const labelPosition = segmentNormal
          ? {
              x: midpoint.x + segmentNormal.x * labelOffsetMm,
              y: midpoint.y + segmentNormal.y * labelOffsetMm
            }
          : midpoint;
        labels.push({
          key: `${segment.id}::full`,
          segmentId: segment.id,
          x: labelPosition.x,
          y: labelPosition.y,
          text: formatLengthMm(segmentLengthMm),
          lengthMm: segmentLengthMm,
          isSelected: segment.id === selectedSegmentId
        });
      }

      map.set(segment.id, labels);
    }

    return map;
  }, [segments, selectedSegmentId, view.scale]);
  const visibleSegmentLabelKeys = useMemo(() => {
    const allLabels: SegmentLengthLabel[] = [];
    for (const labels of segmentLengthLabelsBySegmentId.values()) {
      allLabels.push(...labels);
    }

    const candidates = allLabels.map((label) => {
      const widthPx = Math.max(34, label.text.length * 7.2 + 6);
      const heightPx = LABEL_FONT_SIZE_PX + 6;
      const centerXpx = label.x * view.scale;
      const centerYpx = label.y * view.scale;
      return {
        ...label,
        rect: {
          left: centerXpx - widthPx / 2,
          top: centerYpx - heightPx / 2,
          right: centerXpx + widthPx / 2,
          bottom: centerYpx + heightPx / 2
        } satisfies ScreenRect
      };
    });

    candidates.sort((left, right) => {
      if (left.isSelected !== right.isSelected) {
        return left.isSelected ? -1 : 1;
      }
      if (left.lengthMm !== right.lengthMm) {
        return right.lengthMm - left.lengthMm;
      }
      return left.key.localeCompare(right.key);
    });

    const acceptedRects: ScreenRect[] = [];
    const visibleKeys = new Set<string>();
    for (const candidate of candidates) {
      const overlaps = acceptedRects.some((rect) => rectanglesOverlap(candidate.rect, rect));
      if (overlaps && !candidate.isSelected) {
        continue;
      }
      acceptedRects.push(candidate.rect);
      visibleKeys.add(candidate.key);
    }
    return visibleKeys;
  }, [segmentLengthLabelsBySegmentId, view.scale]);
  const oppositeGateGuides = useMemo(() => buildOppositeGateGuides(placedGateVisuals), [placedGateVisuals]);
  const selectedComponentId = useMemo(() => {
    if (!selectedSegmentId) {
      return null;
    }
    return connectivity.segmentComponent.get(selectedSegmentId) ?? null;
  }, [connectivity.segmentComponent, selectedSegmentId]);
  const selectedComponentClosed = useMemo(() => {
    if (!selectedComponentId) {
      return false;
    }
    return connectivity.closedComponentIds.has(selectedComponentId);
  }, [connectivity.closedComponentIds, selectedComponentId]);
  const activeHeightOptions = activeSpec.system === "TWIN_BAR" ? TWIN_BAR_HEIGHT_OPTIONS : ROLL_FORM_HEIGHT_OPTIONS;
  const postRowsByType = useMemo(() => {
    const rowsForType = (typeKey: "end" | "intermediate" | "corner" | "junction" | "inlineJoin") =>
      postHeightRows
        .filter((row) => row[typeKey] > 0)
        .map((row) => ({ heightMm: row.heightMm, count: row[typeKey] }));
    return {
      end: rowsForType("end"),
      intermediate: rowsForType("intermediate"),
      corner: rowsForType("corner"),
      junction: rowsForType("junction"),
      inlineJoin: rowsForType("inlineJoin")
    };
  }, [postHeightRows]);
  const gateCounts = useMemo(() => {
    let single = 0;
    let double = 0;
    let custom = 0;

    for (const gate of resolvedGatePlacements) {
      if (gate.gateType === "CUSTOM") {
        custom += 1;
      }
      if (gate.leafCount === 2) {
        double += 1;
      } else {
        single += 1;
      }
    }

    return {
      total: resolvedGatePlacements.length,
      single,
      double,
      custom
    };
  }, [resolvedGatePlacements]);
  const gateCountsByHeight = useMemo(
    () =>
      [...resolvedGatePlacements.reduce<Map<string, number>>((map, gate) => {
        map.set(gate.spec.height, (map.get(gate.spec.height) ?? 0) + 1);
        return map;
      }, new Map())]
        .map(([height, count]) => ({ height, count }))
        .sort((left, right) => Number.parseFloat(left.height) - Number.parseFloat(right.height)),
    [resolvedGatePlacements],
  );
  const twinBarFenceRows = useMemo(
    () =>
      Object.entries(estimate.materials.twinBarPanelsByFenceHeight)
        .map(([height, counts]) => ({ height, ...counts }))
        .sort((left, right) => Number.parseFloat(left.height) - Number.parseFloat(right.height)),
    [estimate.materials.twinBarPanelsByFenceHeight],
  );
  const optimizationSummary = estimate.optimization;
  const optimizationBuckets = optimizationSummary.twinBar.buckets;
  const optimizationPlans = useMemo(
    () => optimizationBuckets.flatMap((bucket) => bucket.plans),
    [optimizationBuckets],
  );
  const highlightableOptimizationPlans = useMemo(
    () => optimizationPlans.filter((plan) => plan.panelsSaved > 0),
    [optimizationPlans],
  );
  const selectedSegment = useMemo(() => {
    if (!selectedSegmentId) {
      return null;
    }
    return segmentsById.get(selectedSegmentId) ?? null;
  }, [segmentsById, selectedSegmentId]);
  const segmentOrdinalById = useMemo(() => {
    const map = new Map<string, number>();
    estimateSegments.forEach((segment, index) => {
      map.set(segment.id, index + 1);
    });
    return map;
  }, [estimateSegments]);
  useEffect(() => {
    if (!selectedSegment) {
      setIsLengthEditorOpen(false);
      setSelectedLengthInputM("");
      return;
    }
    setSelectedLengthInputM((distanceMm(selectedSegment.start, selectedSegment.end) / 1000).toFixed(2));
  }, [selectedSegment]);
  useEffect(() => {
    if (!selectedGateId) {
      return;
    }
    if (!resolvedGateById.has(selectedGateId)) {
      setSelectedGateId(null);
      setActiveGateDrag(null);
    }
  }, [resolvedGateById, selectedGateId]);
  const scaleBar = useMemo(() => buildScaleBar(view.scale, canvasWidth), [canvasWidth, view.scale]);
  const selectedPlan = useMemo(() => {
    if (!selectedPlanId) {
      return null;
    }
    return highlightableOptimizationPlans.find((plan) => plan.id === selectedPlanId) ?? null;
  }, [highlightableOptimizationPlans, selectedPlanId]);
  const selectedPlanVisual = useMemo(() => {
    if (!selectedPlan) {
      return null;
    }
    const cuts = selectedPlan.cuts
      .map((cut) => {
        const segment = estimateSegmentsById.get(cut.demand.segmentId);
        if (!segment) {
          return null;
        }
        const start = interpolateAlongSegment(segment, cut.demand.startOffsetMm);
        const end = interpolateAlongSegment(segment, cut.demand.endOffsetMm);
        return {
          cut,
          start,
          end,
          center: {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2
          }
        };
      })
      .filter((entry) => entry !== null);

    if (cuts.length === 0) {
      return null;
    }
    return {
      plan: selectedPlan,
      cuts,
      links: cuts.slice(1).map((cut, index) => ({
        start: cuts[index]?.center ?? cut.center,
        end: cut.center
      }))
    };
  }, [estimateSegmentsById, selectedPlan]);
  const nodeSnapDistanceMm = Math.min(600, NODE_SNAP_DISTANCE_PX / view.scale);
  const axisGuideSnapDistanceMm = Math.min(600, AXIS_GUIDE_SNAP_PX / view.scale);
  const drawLineSnapDistanceMm = Math.min(900, DRAW_LINE_SNAP_PX / view.scale);

  const resolveDrawPoint = useCallback(
    (worldPoint: PointMm): { point: PointMm; guide: AxisGuide | null } => {
      const angleCandidate =
        disableSnap || !drawStart ? quantize(worldPoint) : snapPointToAngle(drawStart, worldPoint, 5);
      const nearestNode = findNearestNode(angleCandidate, drawAnchorNodes, nodeSnapDistanceMm);
      const nearestLine = findNearestSegmentSnap(angleCandidate, segments, drawLineSnapDistanceMm);
      const nodeDistanceMm = nearestNode ? distanceMm(angleCandidate, nearestNode) : Number.POSITIVE_INFINITY;
      let basePoint = quantize(angleCandidate);
      if (nearestLine && nearestLine.distanceMm < nodeDistanceMm) {
        basePoint = nearestLine.point;
      } else if (nearestNode) {
        basePoint = quantize(nearestNode);
      }

      if (!drawStart) {
        return { point: basePoint, guide: null };
      }

      const guided = snapToAxisGuide(drawStart, basePoint, drawAnchorNodes, axisGuideSnapDistanceMm);
      const guidedLineSnap = findNearestSegmentSnap(guided.point, segments, drawLineSnapDistanceMm);
      if (guidedLineSnap) {
        return {
          point: guidedLineSnap.point,
          guide: guided.guide
        };
      }
      return guided;
    },
    [axisGuideSnapDistanceMm, disableSnap, drawAnchorNodes, drawLineSnapDistanceMm, drawStart, nodeSnapDistanceMm, segments],
  );

  useEffect(() => {
    if (highlightableOptimizationPlans.length === 0) {
      setSelectedPlanId(null);
      return;
    }
    if (!selectedPlanId || !highlightableOptimizationPlans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(highlightableOptimizationPlans[0]?.id ?? null);
    }
  }, [highlightableOptimizationPlans, selectedPlanId]);

  const ghostSnap = useMemo(() => {
    if (!drawStart || !pointerWorld) {
      return null;
    }
    return resolveDrawPoint(pointerWorld);
  }, [drawStart, pointerWorld, resolveDrawPoint]);
  const ghostEnd = ghostSnap?.point ?? null;
  const axisGuide = ghostSnap?.guide ?? null;
  const recessPointerSnapMm = RECESS_POINTER_SNAP_PX / view.scale;
  const gatePointerSnapMm = GATE_POINTER_SNAP_PX / view.scale;
  const requestedGateWidthMm = useMemo(
    () => resolveGateWidthMm(gateType, customGateWidthMm),
    [customGateWidthMm, gateType],
  );
  const recessPreview = useMemo(() => {
    if (interactionMode !== "RECESS" || !pointerWorld) {
      return null;
    }

    let best: { segment: LayoutSegment; offsetMm: number; distanceMm: number } | null = null;
    for (const segment of segments) {
      const projection = projectPointOntoSegment(pointerWorld, segment);
      if (projection.distanceMm > recessPointerSnapMm) {
        continue;
      }
      if (!best || projection.distanceMm < best.distanceMm) {
        best = {
          segment,
          offsetMm: projection.offsetMm,
          distanceMm: projection.distanceMm
        };
      }
    }

    if (!best) {
      return null;
    }

    const segmentLengthMm = distanceMm(best.segment.start, best.segment.end);
    const baseOffsetMm = best.offsetMm;
    let snappedOffsetMm = baseOffsetMm;
    let bestSnapDistanceMm = Number.POSITIVE_INFINITY;

    const midpointMm = segmentLengthMm / 2;
    const midpointWindowMm = recessMidpointSnapWindowMm(segmentLengthMm);
    const midpointDistanceMm = Math.abs(baseOffsetMm - midpointMm);
    if (midpointDistanceMm <= midpointWindowMm && midpointDistanceMm < bestSnapDistanceMm) {
      snappedOffsetMm = midpointMm;
      bestSnapDistanceMm = midpointDistanceMm;
    }

    const fractionWindowMm = recessFractionSnapWindowMm(segmentLengthMm);
    for (const targetOffsetMm of recessSnapTargetsMm(segmentLengthMm)) {
      const distanceToTargetMm = Math.abs(baseOffsetMm - targetOffsetMm);
      if (distanceToTargetMm <= fractionWindowMm && distanceToTargetMm < bestSnapDistanceMm) {
        snappedOffsetMm = targetOffsetMm;
        bestSnapDistanceMm = distanceToTargetMm;
      }
    }

    const anchorWindowMm = recessAnchorSnapWindowMm(segmentLengthMm);
    const segmentTangent = normalizeVector({
      x: best.segment.end.x - best.segment.start.x,
      y: best.segment.end.y - best.segment.start.y
    });
    const alignmentAnchors = !segmentTangent
      ? []
      : recessAlignmentAnchors
          .filter(
            (anchor) =>
              anchor.sourceSegmentId !== best.segment.id && Math.abs(dot(segmentTangent, anchor.tangent)) >= 0.9,
          )
          .map((anchor) => anchor.point);
    const anchorSnapResult = snapOffsetToAnchorAlongSegment(best.segment, baseOffsetMm, alignmentAnchors, anchorWindowMm);
    const anchorSnappedOffsetMm = anchorSnapResult.offsetMm;
    const anchorSnapDistanceMm = Math.abs(anchorSnappedOffsetMm - baseOffsetMm);
    let selectedAnchorPoint: PointMm | null = null;
    if (anchorSnapDistanceMm <= anchorWindowMm && anchorSnapDistanceMm < bestSnapDistanceMm) {
      snappedOffsetMm = anchorSnappedOffsetMm;
      selectedAnchorPoint = anchorSnapResult.anchorPoint;
    }

    snappedOffsetMm = Math.max(0, Math.min(segmentLengthMm, Math.round(snappedOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM));

    const preview = buildRecessPreview(best.segment, snappedOffsetMm, recessWidthMm, recessDepthMm, recessSide);
    if (!preview || !selectedAnchorPoint) {
      return preview;
    }

    return {
      ...preview,
      alignmentGuide: {
        anchorPoint: selectedAnchorPoint,
        targetPoint: preview.targetPoint
      }
    };
  }, [
    interactionMode,
    pointerWorld,
    recessAlignmentAnchors,
    recessDepthMm,
    recessPointerSnapMm,
    recessSide,
    recessWidthMm,
    segments
  ]);
  const gatePreview = useMemo(() => {
    if (interactionMode !== "GATE" || !pointerWorld) {
      return null;
    }

    let best: { segment: LayoutSegment; offsetMm: number; distanceMm: number } | null = null;
    for (const segment of segments) {
      const projection = projectPointOntoSegment(pointerWorld, segment);
      if (projection.distanceMm > gatePointerSnapMm) {
        continue;
      }
      if (!best || projection.distanceMm < best.distanceMm) {
        best = {
          segment,
          offsetMm: projection.offsetMm,
          distanceMm: projection.distanceMm
        };
      }
    }

    if (!best) {
      return null;
    }

    const segmentLengthMm = distanceMm(best.segment.start, best.segment.end);
    const midpointMm = segmentLengthMm / 2;
    const snapWindowMm = recessMidpointSnapWindowMm(segmentLengthMm);
    const centeredOffsetMm = Math.abs(best.offsetMm - midpointMm) <= snapWindowMm ? midpointMm : best.offsetMm;

    return buildGatePreview(best.segment, centeredOffsetMm, requestedGateWidthMm);
  }, [gatePointerSnapMm, interactionMode, pointerWorld, requestedGateWidthMm, segments]);
  const gatePreviewVisual = useMemo(() => {
    if (!gatePreview) {
      return null;
    }
    return {
      key: `preview-${gatePreview.segment.id}`,
      startPoint: gatePreview.entryPoint,
      endPoint: gatePreview.exitPoint,
      centerPoint: {
        x: (gatePreview.entryPoint.x + gatePreview.exitPoint.x) / 2,
        y: (gatePreview.entryPoint.y + gatePreview.exitPoint.y) / 2
      },
      widthMm: gatePreview.widthMm,
      tangent: gatePreview.tangent,
      normal: gatePreview.normal,
      leafCount: resolveGatePreviewLeafCount(gateType, gatePreview.widthMm)
    } satisfies GateVisual;
  }, [gatePreview, gateType]);
  const drawHoverSnap = useMemo(() => {
    if (interactionMode !== "DRAW" || !pointerWorld) {
      return null;
    }
    return findNearestSegmentSnap(pointerWorld, segments, drawLineSnapDistanceMm);
  }, [drawLineSnapDistanceMm, interactionMode, pointerWorld, segments]);
  const rectanglePreviewEnd = useMemo(() => {
    if (interactionMode !== "RECTANGLE" || !rectangleStart || !pointerWorld) {
      return null;
    }
    return resolveDrawPoint(pointerWorld).point;
  }, [interactionMode, pointerWorld, rectangleStart, resolveDrawPoint]);

  const ghostLengthMm = useMemo(() => {
    if (!drawStart || !ghostEnd) {
      return 0;
    }
    return Math.round(distanceMm(drawStart, ghostEnd));
  }, [drawStart, ghostEnd]);

  const gridStepMm = chooseGridStep(view.scale);
  const majorGridStepMm = gridStepMm * 5;

  const visibleBounds = useMemo(() => {
    const left = (-view.x) / view.scale;
    const right = (canvasWidth - view.x) / view.scale;
    const top = (-view.y) / view.scale;
    const bottom = (canvasHeight - view.y) / view.scale;
    return { left, right, top, bottom };
  }, [canvasHeight, canvasWidth, view.scale, view.x, view.y]);

  const verticalLines: { x: number; major: boolean }[] = [];
  const horizontalLines: { y: number; major: boolean }[] = [];

  const startX = Math.floor(visibleBounds.left / gridStepMm) * gridStepMm;
  for (let x = startX; x <= visibleBounds.right; x += gridStepMm) {
    verticalLines.push({ x, major: x % majorGridStepMm === 0 });
  }

  const startY = Math.floor(visibleBounds.top / gridStepMm) * gridStepMm;
  for (let y = startY; y <= visibleBounds.bottom; y += gridStepMm) {
    horizontalLines.push({ y, major: y % majorGridStepMm === 0 });
  }

  function updateSegment(segmentId: string, updater: (segment: LayoutSegment) => LayoutSegment): void {
    applySegments((previous) =>
      previous.map((segment) => (segment.id === segmentId ? updater(segment) : segment)),
    );
  }

  function onRecessWidthInputChange(value: string): void {
    setRecessWidthInputM(value);
    const parsed = parseMetersInputToMm(value);
    if (parsed !== null) {
      setRecessWidthMm(parsed);
    }
  }

  function onRecessDepthInputChange(value: string): void {
    setRecessDepthInputM(value);
    const parsed = parseMetersInputToMm(value);
    if (parsed !== null) {
      setRecessDepthMm(parsed);
    }
  }

  function normalizeRecessInputs(): void {
    setRecessWidthInputM(formatMetersInputFromMm(recessWidthMm));
    setRecessDepthInputM(formatMetersInputFromMm(recessDepthMm));
  }

  function onCustomGateWidthInputChange(value: string): void {
    setCustomGateWidthInputM(value);
    const parsed = parseMetersInputToMm(value);
    if (parsed !== null) {
      setCustomGateWidthMm(parsed);
    }
  }

  function normalizeGateInputs(): void {
    setCustomGateWidthInputM(formatMetersInputFromMm(customGateWidthMm));
  }

  function startPanelDrag(panel: DraggablePanel, event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    setActivePanelDrag({
      panel,
      startPointer: { x: event.clientX, y: event.clientY },
      startOffset: panelOffsets[panel]
    });
  }

  function panelDragStyle(panel: DraggablePanel): { transform: string; zIndex: number } {
    const offset = panelOffsets[panel];
    return {
      transform: `translate(${offset.x}px, ${offset.y}px)`,
      zIndex: activePanelDrag?.panel === panel ? 50 : 32
    };
  }

  function openLengthEditor(segmentId: string): void {
    if (interactionMode !== "SELECT") {
      return;
    }
    const segment = segmentsById.get(segmentId);
    if (!segment) {
      return;
    }
    setSelectedSegmentId(segmentId);
    setSelectedLengthInputM((distanceMm(segment.start, segment.end) / 1000).toFixed(2));
    setIsLengthEditorOpen(true);
  }

  function resizeSegmentLength(segmentId: string, requestedLengthMm: number): void {
    const componentId = connectivity.segmentComponent.get(segmentId);
    if (!componentId) {
      return;
    }
    const componentSegmentIds = connectivity.segmentIdsByComponent.get(componentId) ?? [segmentId];
    const componentSegmentIdSet = new Set(componentSegmentIds);
    const isClosedComponent = connectivity.closedComponentIds.has(componentId);

    applySegments((previous) => {
      const segmentById = new Map(previous.map((segment) => [segment.id, segment]));
      const target = segmentById.get(segmentId);
      if (!target) {
        return previous;
      }

      const currentLengthMm = distanceMm(target.start, target.end);
      const nextLengthMm = Math.max(MIN_SEGMENT_MM, requestedLengthMm);
      if (Math.abs(currentLengthMm - nextLengthMm) < DRAW_INCREMENT_MM / 2) {
        return previous;
      }

      const dx = target.end.x - target.start.x;
      const dy = target.end.y - target.start.y;
      const currentLength = Math.hypot(dx, dy);
      if (currentLength < 1) {
        return previous;
      }
      const unitX = dx / currentLength;
      const unitY = dy / currentLength;

      if (isClosedComponent) {
        const pointByKey = new Map<string, PointMm>();
        for (const componentSegmentId of componentSegmentIds) {
          const componentSegment = segmentById.get(componentSegmentId);
          if (!componentSegment) {
            continue;
          }
          pointByKey.set(pointCoordinateKey(componentSegment.start), componentSegment.start);
          pointByKey.set(pointCoordinateKey(componentSegment.end), componentSegment.end);
        }

        const anchorProjection = target.start.x * unitX + target.start.y * unitY;
        const scale = nextLengthMm / currentLengthMm;
        const transformedPointByKey = new Map<string, PointMm>();
        for (const [key, point] of pointByKey) {
          const projection = point.x * unitX + point.y * unitY;
          const relative = projection - anchorProjection;
          const scaledRelative = relative * scale;
          const deltaAlong = scaledRelative - relative;
          transformedPointByKey.set(
            key,
            quantize({
              x: point.x + unitX * deltaAlong,
              y: point.y + unitY * deltaAlong
            }),
          );
        }

        return previous.map((segment) => {
          if (!componentSegmentIdSet.has(segment.id)) {
            return segment;
          }
          return {
            ...segment,
            start: transformedPointByKey.get(pointCoordinateKey(segment.start)) ?? segment.start,
            end: transformedPointByKey.get(pointCoordinateKey(segment.end)) ?? segment.end
          };
        });
      }

      const movedNodeKeys = new Set<string>();
      const startKey = pointCoordinateKey(target.start);
      const endKey = pointCoordinateKey(target.end);
      const adjacency = new Map<string, Set<string>>();
      for (const componentSegmentId of componentSegmentIds) {
        if (componentSegmentId === segmentId) {
          continue;
        }
        const componentSegment = segmentById.get(componentSegmentId);
        if (!componentSegment) {
          continue;
        }
        const fromKey = pointCoordinateKey(componentSegment.start);
        const toKey = pointCoordinateKey(componentSegment.end);
        if (!adjacency.has(fromKey)) {
          adjacency.set(fromKey, new Set());
        }
        if (!adjacency.has(toKey)) {
          adjacency.set(toKey, new Set());
        }
        adjacency.get(fromKey)?.add(toKey);
        adjacency.get(toKey)?.add(fromKey);
      }

      const queue: string[] = [endKey];
      movedNodeKeys.add(endKey);
      while (queue.length > 0) {
        const currentNodeKey = queue.shift();
        if (!currentNodeKey) {
          continue;
        }
        for (const neighborNodeKey of adjacency.get(currentNodeKey) ?? []) {
          if (neighborNodeKey === startKey || movedNodeKeys.has(neighborNodeKey)) {
            continue;
          }
          movedNodeKeys.add(neighborNodeKey);
          queue.push(neighborNodeKey);
        }
      }

      const nextEnd = quantize({
        x: target.start.x + unitX * nextLengthMm,
        y: target.start.y + unitY * nextLengthMm
      });
      const delta = {
        x: nextEnd.x - target.end.x,
        y: nextEnd.y - target.end.y
      };

      return previous.map((segment) => {
        if (!componentSegmentIdSet.has(segment.id)) {
          return segment;
        }
        const startNodeKey = pointCoordinateKey(segment.start);
        const endNodeKey = pointCoordinateKey(segment.end);
        return {
          ...segment,
          start: movedNodeKeys.has(startNodeKey)
            ? quantize({ x: segment.start.x + delta.x, y: segment.start.y + delta.y })
            : segment.start,
          end: movedNodeKeys.has(endNodeKey)
            ? quantize({ x: segment.end.x + delta.x, y: segment.end.y + delta.y })
            : segment.end
        };
      });
    });
  }

  function applySelectedLengthEdit(): void {
    if (!selectedSegmentId) {
      return;
    }
    const parsedLengthMm = parseMetersInputToMm(selectedLengthInputM);
    if (parsedLengthMm === null) {
      return;
    }
    resizeSegmentLength(selectedSegmentId, parsedLengthMm);
    setIsLengthEditorOpen(false);
  }

  function offsetSegmentPerpendicular(segmentId: string, dragDelta: PointMm): void {
    applySegments((previous) => {
      const target = previous.find((segment) => segment.id === segmentId);
      if (!target) {
        return previous;
      }

      const tangent = normalizeVector({
        x: target.end.x - target.start.x,
        y: target.end.y - target.start.y
      });
      if (!tangent) {
        return previous;
      }
      const normal = {
        x: -tangent.y,
        y: tangent.x
      };
      const offsetMm = dot(dragDelta, normal);
      if (Math.abs(offsetMm) < 0.01) {
        return previous;
      }
      const projectedDelta = {
        x: normal.x * offsetMm,
        y: normal.y * offsetMm
      };
      const movedStartPoint = target.start;
      const movedEndPoint = target.end;

      let changed = false;
      const next = previous.map((segment) => {
        const moveStart =
          samePointApprox(segment.start, movedStartPoint, 0.1) || samePointApprox(segment.start, movedEndPoint, 0.1);
        const moveEnd = samePointApprox(segment.end, movedStartPoint, 0.1) || samePointApprox(segment.end, movedEndPoint, 0.1);
        if (!moveStart && !moveEnd) {
          return segment;
        }
        changed = true;
        return {
          ...segment,
          start: moveStart
            ? {
                x: segment.start.x + projectedDelta.x,
                y: segment.start.y + projectedDelta.y
              }
            : segment.start,
          end: moveEnd
            ? {
                x: segment.end.x + projectedDelta.x,
                y: segment.end.y + projectedDelta.y
              }
            : segment.end
        };
      });

      return changed ? next : previous;
    });
  }

  function startSelectedSegmentDrag(segmentId: string): void {
    if (interactionMode !== "SELECT") {
      return;
    }
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }
    const pointerWorldPoint = screenToWorld(pointer, view);
    setActiveSegmentDrag({
      segmentId,
      lastPointer: pointerWorldPoint
    });
    setActiveGateDrag(null);
  }

  function moveGateAlongSegment(gateId: string, deltaAlongMm: number): void {
    if (Math.abs(deltaAlongMm) < 0.01) {
      return;
    }

    setGatePlacements((previous) => {
      const gateIndex = previous.findIndex((placement) => placement.id === gateId);
      if (gateIndex < 0) {
        return previous;
      }
      const target = previous[gateIndex];
      if (!target) {
        return previous;
      }
      const segment = segmentsById.get(target.segmentId);
      if (!segment) {
        return previous;
      }

      const segmentLengthMm = distanceMm(segment.start, segment.end);
      const widthMm = target.endOffsetMm - target.startOffsetMm;
      if (widthMm < DRAW_INCREMENT_MM) {
        return previous;
      }

      let minStartMm = MIN_SEGMENT_MM;
      let maxStartMm = Math.max(MIN_SEGMENT_MM, segmentLengthMm - MIN_SEGMENT_MM - widthMm);
      const peers = previous
        .filter((placement) => placement.segmentId === target.segmentId && placement.id !== gateId)
        .sort((left, right) => left.startOffsetMm - right.startOffsetMm);

      for (const peer of peers) {
        if (peer.endOffsetMm <= target.startOffsetMm) {
          minStartMm = Math.max(minStartMm, peer.endOffsetMm);
          continue;
        }
        if (peer.startOffsetMm >= target.endOffsetMm) {
          maxStartMm = Math.min(maxStartMm, peer.startOffsetMm - widthMm);
          break;
        }
      }

      const unclampedStartMm = target.startOffsetMm + deltaAlongMm;
      let nextStartMm = Math.round(unclampedStartMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
      nextStartMm = Math.max(minStartMm, Math.min(maxStartMm, nextStartMm));
      const nextEndMm = nextStartMm + widthMm;

      const normalized = clampGatePlacementToSegment(
        {
          ...target,
          startOffsetMm: nextStartMm,
          endOffsetMm: nextEndMm
        },
        segmentLengthMm,
      );
      if (!normalized) {
        return previous;
      }
      if (
        Math.abs(normalized.startOffsetMm - target.startOffsetMm) < 0.001 &&
        Math.abs(normalized.endOffsetMm - target.endOffsetMm) < 0.001
      ) {
        return previous;
      }

      const next = [...previous];
      next[gateIndex] = {
        ...target,
        startOffsetMm: normalized.startOffsetMm,
        endOffsetMm: normalized.endOffsetMm
      };
      next.sort((left, right) => left.id.localeCompare(right.id));
      return next;
    });
  }

  function startSelectedGateDrag(gateId: string): void {
    if (interactionMode !== "SELECT") {
      return;
    }
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }
    const pointerWorldPoint = screenToWorld(pointer, view);
    setActiveGateDrag({
      gateId,
      lastPointer: pointerWorldPoint
    });
    setActiveSegmentDrag(null);
  }

  function startOrCommitDrawing(worldPoint: PointMm): void {
    const snappedPoint = resolveDrawPoint(worldPoint).point;

    if (!drawStart) {
      setDrawStart(snappedPoint);
      setSelectedSegmentId(null);
      setSelectedGateId(null);
      return;
    }

    if (distanceMm(drawStart, snappedPoint) < MIN_SEGMENT_MM) {
      return;
    }

    const segment: LayoutSegment = {
      id: crypto.randomUUID(),
      start: quantize(drawStart),
      end: quantize(snappedPoint),
      spec: activeSpec
    };

    applySegments((previous) => [...previous, segment]);
    setDrawStart(snappedPoint);
    setSelectedGateId(null);
  }

  function startOrCommitRectangle(worldPoint: PointMm): void {
    const snappedPoint = resolveDrawPoint(worldPoint).point;

    if (!rectangleStart) {
      setRectangleStart(snappedPoint);
      setSelectedSegmentId(null);
      setSelectedGateId(null);
      return;
    }

    const widthMm = Math.abs(snappedPoint.x - rectangleStart.x);
    const heightMm = Math.abs(snappedPoint.y - rectangleStart.y);
    if (widthMm < MIN_SEGMENT_MM || heightMm < MIN_SEGMENT_MM) {
      return;
    }

    const cornerA = quantize(rectangleStart);
    const cornerB = quantize({ x: snappedPoint.x, y: rectangleStart.y });
    const cornerC = quantize(snappedPoint);
    const cornerD = quantize({ x: rectangleStart.x, y: snappedPoint.y });

    const rectangleSegments: LayoutSegment[] = [
      {
        id: crypto.randomUUID(),
        start: cornerA,
        end: cornerB,
        spec: activeSpec
      },
      {
        id: crypto.randomUUID(),
        start: cornerB,
        end: cornerC,
        spec: activeSpec
      },
      {
        id: crypto.randomUUID(),
        start: cornerC,
        end: cornerD,
        spec: activeSpec
      },
      {
        id: crypto.randomUUID(),
        start: cornerD,
        end: cornerA,
        spec: activeSpec
      }
    ];

    applySegments((previous) => [...previous, ...rectangleSegments]);
    setRectangleStart(null);
    setSelectedSegmentId(null);
    setSelectedGateId(null);
  }

  function insertRecess(preview: RecessInsertionPreview): void {
    const replacement = buildRecessReplacementSegments(preview);
    if (replacement.length === 0) {
      return;
    }

    const originalStart = quantize(preview.segment.start);
    const entryPoint = quantize(preview.entryPoint);
    const exitPoint = quantize(preview.exitPoint);
    const originalEnd = quantize(preview.segment.end);
    const leftReplacementSegment = replacement.find(
      (segment) => samePointApprox(segment.start, originalStart, 0.1) && samePointApprox(segment.end, entryPoint, 0.1),
    );
    const rightReplacementSegment = replacement.find(
      (segment) => samePointApprox(segment.start, exitPoint, 0.1) && samePointApprox(segment.end, originalEnd, 0.1),
    );

    applySegments((previous) => {
      const next: LayoutSegment[] = [];
      for (const segment of previous) {
        if (segment.id !== preview.segment.id) {
          next.push(segment);
          continue;
        }
        next.push(...replacement);
      }
      return next;
    });
    setGatePlacements((previous) => {
      const next: GatePlacement[] = [];
      for (const placement of previous) {
        if (placement.segmentId !== preview.segment.id) {
          next.push(placement);
          continue;
        }

        const resolved = resolvedGateById.get(placement.id);
        const sourceStartOffsetMm = resolved?.startOffsetMm ?? placement.startOffsetMm;
        const sourceEndOffsetMm = resolved?.endOffsetMm ?? placement.endOffsetMm;

        if (sourceEndOffsetMm <= preview.startOffsetMm && leftReplacementSegment) {
          const leftLengthMm = distanceMm(leftReplacementSegment.start, leftReplacementSegment.end);
          const normalized = clampGatePlacementToSegment(
            {
              ...placement,
              segmentId: leftReplacementSegment.id,
              startOffsetMm: sourceStartOffsetMm,
              endOffsetMm: sourceEndOffsetMm
            },
            leftLengthMm,
          );
          if (normalized) {
            next.push({
              ...placement,
              segmentId: leftReplacementSegment.id,
              startOffsetMm: normalized.startOffsetMm,
              endOffsetMm: normalized.endOffsetMm
            });
          }
          continue;
        }

        if (sourceStartOffsetMm >= preview.endOffsetMm && rightReplacementSegment) {
          const rightLengthMm = distanceMm(rightReplacementSegment.start, rightReplacementSegment.end);
          const normalized = clampGatePlacementToSegment(
            {
              ...placement,
              segmentId: rightReplacementSegment.id,
              startOffsetMm: sourceStartOffsetMm - preview.endOffsetMm,
              endOffsetMm: sourceEndOffsetMm - preview.endOffsetMm
            },
            rightLengthMm,
          );
          if (normalized) {
            next.push({
              ...placement,
              segmentId: rightReplacementSegment.id,
              startOffsetMm: normalized.startOffsetMm,
              endOffsetMm: normalized.endOffsetMm
            });
          }
        }
      }
      next.sort((left, right) => left.id.localeCompare(right.id));
      return next;
    });
    setSelectedSegmentId(null);
    setSelectedGateId(null);
    setDrawStart(null);
  }

  function insertGate(preview: GateInsertionPreview): void {
    setGatePlacements((previous) => {
      const nextGate: GatePlacement = {
        id: crypto.randomUUID(),
        segmentId: preview.segment.id,
        startOffsetMm: preview.startOffsetMm,
        endOffsetMm: preview.endOffsetMm,
        gateType
      };
      const next = previous.filter(
        (placement) =>
          placement.segmentId !== nextGate.segmentId ||
          !rangesOverlap(placement.startOffsetMm, placement.endOffsetMm, nextGate.startOffsetMm, nextGate.endOffsetMm),
      );
      next.push(nextGate);
      next.sort((left, right) => left.id.localeCompare(right.id));
      return next;
    });
    setSelectedSegmentId(null);
    setDrawStart(null);
  }

  function onStageMouseDown(event: KonvaEventObject<MouseEvent>): void {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const isMiddleButton = event.evt.button === 1;
    const isPanIntent = isMiddleButton || isSpacePressed;
    if (isPanIntent) {
      const pointer = stage.getPointerPosition();
      if (!pointer) {
        return;
      }
      setIsPanning(true);
      setPanAnchor({ x: pointer.x - view.x, y: pointer.y - view.y });
      return;
    }

    if (event.evt.button !== 0) {
      return;
    }

    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }
    const world = screenToWorld(pointer, view);

    if (interactionMode === "SELECT") {
      if (event.target === stage) {
        setSelectedSegmentId(null);
        setSelectedGateId(null);
      }
      return;
    }

    if (interactionMode === "RECESS") {
      if (recessPreview) {
        insertRecess(recessPreview);
      }
      return;
    }

    if (interactionMode === "GATE") {
      if (gatePreview) {
        insertGate(gatePreview);
      }
      return;
    }

    if (interactionMode === "RECTANGLE") {
      startOrCommitRectangle(world);
      return;
    }

    startOrCommitDrawing(world);
  }

  function onStageMouseMove(): void {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }
    const world = screenToWorld(pointer, view);

    if (activeGateDrag) {
      const gate = resolvedGateById.get(activeGateDrag.gateId);
      if (!gate) {
        setActiveGateDrag(null);
        setPointerWorld(world);
        return;
      }
      const pointerDelta = {
        x: world.x - activeGateDrag.lastPointer.x,
        y: world.y - activeGateDrag.lastPointer.y
      };
      const deltaAlongMm = dot(pointerDelta, gate.tangent);
      moveGateAlongSegment(gate.id, deltaAlongMm);
      setActiveGateDrag((previous) =>
        previous
          ? {
              ...previous,
              lastPointer: world
            }
          : previous,
      );
      setPointerWorld(world);
      return;
    }

    if (activeSegmentDrag) {
      const delta = {
        x: world.x - activeSegmentDrag.lastPointer.x,
        y: world.y - activeSegmentDrag.lastPointer.y
      };
      if (Math.abs(delta.x) >= 0.01 || Math.abs(delta.y) >= 0.01) {
        offsetSegmentPerpendicular(activeSegmentDrag.segmentId, delta);
      }
      setActiveSegmentDrag((previous) =>
        previous
          ? {
              ...previous,
              lastPointer: world
            }
          : previous,
      );
      setPointerWorld(world);
      return;
    }

    if (isPanning && panAnchor) {
      setView((previous) => ({
        ...previous,
        x: pointer.x - panAnchor.x,
        y: pointer.y - panAnchor.y
      }));
      return;
    }

    setPointerWorld(world);
  }

  function onStageMouseUp(): void {
    setActiveSegmentDrag(null);
    setActiveGateDrag(null);
    setIsPanning(false);
    setPanAnchor(null);
  }

  function onStageWheel(event: KonvaEventObject<WheelEvent>): void {
    event.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }

    const zoomFactor = 1.08;
    const oldScale = view.scale;
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const candidateScale = direction > 0 ? oldScale * zoomFactor : oldScale / zoomFactor;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, candidateScale));
    const focus = {
      x: (pointer.x - view.x) / oldScale,
      y: (pointer.y - view.y) / oldScale
    };

    setView({
      scale: newScale,
      x: pointer.x - focus.x * newScale,
      y: pointer.y - focus.y * newScale
    });
  }

  function onContextMenu(event: KonvaEventObject<PointerEvent>): void {
    event.evt.preventDefault();
    setDrawStart(null);
    setRectangleStart(null);
  }

  async function createSnapshot(): Promise<void> {
    try {
      setSnapshotStatus("Saving snapshot...");
      const response = await fetch("http://localhost:3001/api/v1/snapshots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          layout: {
            segments
          }
        })
      });
      if (!response.ok) {
        setSnapshotStatus(`Snapshot failed (${response.status})`);
        return;
      }
      const body = (await response.json()) as { id: string };
      setSnapshotStatus(`Snapshot saved: ${body.id}`);
    } catch (error) {
      setSnapshotStatus(`Snapshot failed: ${(error as Error).message}`);
    }
  }

  function openOptimizationInspector(): void {
    setIsOptimizationInspectorOpen(true);
  }

  return (
    <div className="app-shell">
      <aside className="left-panel">
        <div className="left-panel-stack">
          <section className="panel-block panel-interaction">
            <h2>Interaction</h2>
            <div className="mode-toggle-row mode-toggle-row-5" role="tablist" aria-label="Interaction mode">
              <button
                type="button"
                className={`mode-toggle-btn${interactionMode === "DRAW" ? " active" : ""}`}
                onClick={() => setInteractionMode("DRAW")}
              >
                Draw
              </button>
              <button
                type="button"
                className={`mode-toggle-btn${interactionMode === "SELECT" ? " active" : ""}`}
                onClick={() => setInteractionMode("SELECT")}
              >
                Select
              </button>
              <button
                type="button"
                className={`mode-toggle-btn${interactionMode === "RECTANGLE" ? " active" : ""}`}
                onClick={() => setInteractionMode("RECTANGLE")}
              >
                Rect
              </button>
              <button
                type="button"
                className={`mode-toggle-btn${interactionMode === "RECESS" ? " active" : ""}`}
                onClick={() => setInteractionMode("RECESS")}
              >
                Recess
              </button>
              <button
                type="button"
                className={`mode-toggle-btn${interactionMode === "GATE" ? " active" : ""}`}
                onClick={() => setInteractionMode("GATE")}
              >
                Gate
              </button>
            </div>
            {interactionMode === "DRAW" ? (
              <p className="muted-line">Click to start a run and keep clicking to chain segments. Hold Shift to disable angle snapping.</p>
            ) : null}
            {interactionMode === "RECTANGLE" ? (
              <p className="muted-line">Click first corner, then opposite corner to place a rectangle perimeter.</p>
            ) : null}
            {interactionMode === "RECESS" ? (
              <>
                <label>
                  Recess Width
                  <input
                    type="number"
                    min={RECESS_INPUT_STEP_M}
                    step={RECESS_INPUT_STEP_M}
                    list="recess-width-presets"
                    value={recessWidthInputM}
                    onChange={(event) => onRecessWidthInputChange(event.target.value)}
                    onBlur={normalizeRecessInputs}
                  />
                  <datalist id="recess-width-presets">
                    {RECESS_WIDTH_OPTIONS_MM.map((value) => (
                      <option key={value} value={formatMetersInputFromMm(value)} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Recess Depth
                  <input
                    type="number"
                    min={RECESS_INPUT_STEP_M}
                    step={RECESS_INPUT_STEP_M}
                    list="recess-depth-presets"
                    value={recessDepthInputM}
                    onChange={(event) => onRecessDepthInputChange(event.target.value)}
                    onBlur={normalizeRecessInputs}
                  />
                  <datalist id="recess-depth-presets">
                    {RECESS_DEPTH_OPTIONS_MM.map((value) => (
                      <option key={value} value={formatMetersInputFromMm(value)} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Recess Side
                  <select value={recessSide} onChange={(event) => setRecessSide(event.target.value as RecessSide)}>
                    <option value="LEFT">Left Of Run</option>
                    <option value="RIGHT">Right Of Run</option>
                  </select>
                </label>
                {recessPreview ? (
                  <>
                    <p className="muted-line">
                      Left run {formatLengthMm(recessPreview.startOffsetMm)} | Right run{" "}
                      {formatLengthMm(recessPreview.segmentLengthMm - recessPreview.endOffsetMm)}
                    </p>
                    <p className="muted-line">Tip: center snaps automatically when you hover near midpoint.</p>
                  </>
                ) : (
                  <p className="muted-line">Hover near a fence line and click to place recess.</p>
                )}
              </>
            ) : null}
            {interactionMode === "GATE" ? (
              <>
                <div className="mode-toggle-row mode-toggle-row-3">
                  <button
                    type="button"
                    className={`mode-toggle-btn${gateType === "SINGLE_LEAF" ? " active" : ""}`}
                    onClick={() => setGateType("SINGLE_LEAF")}
                  >
                    Single 1.2m
                  </button>
                  <button
                    type="button"
                    className={`mode-toggle-btn${gateType === "DOUBLE_LEAF" ? " active" : ""}`}
                    onClick={() => setGateType("DOUBLE_LEAF")}
                  >
                    Double 3.0m
                  </button>
                  <button
                    type="button"
                    className={`mode-toggle-btn${gateType === "CUSTOM" ? " active" : ""}`}
                    onClick={() => setGateType("CUSTOM")}
                  >
                    Custom
                  </button>
                </div>
                {gateType === "CUSTOM" ? (
                  <label>
                    Custom Gate Width
                    <input
                      type="number"
                      min={RECESS_INPUT_STEP_M}
                      step={RECESS_INPUT_STEP_M}
                      list="gate-width-presets"
                      value={customGateWidthInputM}
                      onChange={(event) => onCustomGateWidthInputChange(event.target.value)}
                      onBlur={normalizeGateInputs}
                    />
                    <datalist id="gate-width-presets">
                      {GATE_WIDTH_OPTIONS_MM.map((value) => (
                        <option key={value} value={formatMetersInputFromMm(value)} />
                      ))}
                    </datalist>
                  </label>
                ) : null}
                {gatePreview ? (
                  <p className="muted-line">
                    Gate {formatLengthMm(gatePreview.widthMm)} | left run {formatLengthMm(gatePreview.startOffsetMm)} | right run{" "}
                    {formatLengthMm(gatePreview.segmentLengthMm - gatePreview.endOffsetMm)}
                  </p>
                ) : (
                  <p className="muted-line">Hover near a fence line and click to insert gate object.</p>
                )}
              </>
            ) : null}
          </section>

          <section className="panel-block panel-fence-palette">
            <h2>Fence Palette</h2>
            <label>
              System
              <select
                value={activeSpec.system}
                onChange={(event) => {
                  const nextSystem = event.target.value as FenceSpec["system"];
                  setActiveSpec((previous) => {
                    if (nextSystem === "TWIN_BAR") {
                      const nextHeight = TWIN_BAR_HEIGHT_OPTIONS.includes(previous.height)
                        ? previous.height
                        : TWIN_BAR_HEIGHT_OPTIONS[2];
                      return {
                        system: nextSystem,
                        height: nextHeight ?? "2m",
                        twinBarVariant: previous.twinBarVariant ?? "STANDARD"
                      };
                    }
                    const nextHeight = ROLL_FORM_HEIGHT_OPTIONS.includes(previous.height)
                      ? previous.height
                      : ROLL_FORM_HEIGHT_OPTIONS[0];
                    return {
                      system: nextSystem,
                      height: nextHeight ?? "2m"
                    };
                  });
                }}
              >
                <option value="TWIN_BAR">Twin Bar</option>
                <option value="ROLL_FORM">Roll Form Welded Mesh</option>
              </select>
            </label>
            <label>
              Height
              <select
                value={activeSpec.height}
                onChange={(event) => {
                  const nextHeight = event.target.value as FenceHeightKey;
                  setActiveSpec((previous) => ({ ...previous, height: nextHeight }));
                }}
              >
                {activeHeightOptions.map((heightOption) => (
                  <option key={heightOption} value={heightOption}>
                    {heightOption}
                  </option>
                ))}
              </select>
            </label>
            {activeSpec.system === "TWIN_BAR" ? (
              <label>
                Variant
                <select
                  value={activeSpec.twinBarVariant ?? "STANDARD"}
                  onChange={(event) => {
                    const next = event.target.value as TwinBarVariant;
                    setActiveSpec((previous) => ({ ...previous, twinBarVariant: next }));
                  }}
                >
                  <option value="STANDARD">Standard</option>
                  <option value="SUPER_REBOUND">Super Rebound</option>
                </select>
              </label>
            ) : null}
            <div className="palette-legend">
              {(activeSpec.system === "TWIN_BAR" ? TWIN_BAR_HEIGHT_OPTIONS : ROLL_FORM_HEIGHT_OPTIONS).map(
                (heightOption) => (
                  <div key={heightOption}>
                    <span
                      className="swatch"
                      style={{ background: getSegmentColor({ ...activeSpec, height: heightOption }) }}
                    />
                    {activeSpec.system === "TWIN_BAR"
                      ? `${heightOption} ${activeSpec.twinBarVariant === "SUPER_REBOUND" ? "Super Rebound" : "Standard"}`
                      : `Roll Form ${heightOption}`}
                  </div>
                ),
              )}
            </div>
          </section>
        </div>

        <section className="panel-block panel-item-counts" style={panelDragStyle("itemCounts")}>
          <div className="panel-heading panel-drag-handle" onMouseDown={(event) => startPanelDrag("itemCounts", event)}>
            <h2>Item Counts</h2>
          </div>
          <div className="count-group">
            <h3>End Posts</h3>
            {postRowsByType.end.length === 0 ? (
              <p className="muted-line">No end posts.</p>
            ) : (
              <dl className="dense-list">
                {postRowsByType.end.map((row) => (
                  <div key={`end-${row.heightMm}`}>
                    <dt>{formatHeightLabelFromMm(row.heightMm)}</dt>
                    <dd>{row.count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <div className="count-group">
            <h3>Intermediate Posts</h3>
            {postRowsByType.intermediate.length === 0 ? (
              <p className="muted-line">No intermediate posts.</p>
            ) : (
              <dl className="dense-list">
                {postRowsByType.intermediate.map((row) => (
                  <div key={`intermediate-${row.heightMm}`}>
                    <dt>{formatHeightLabelFromMm(row.heightMm)}</dt>
                    <dd>{row.count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <div className="count-group">
            <h3>Corner Posts</h3>
            {postRowsByType.corner.length === 0 ? (
              <p className="muted-line">No corner posts.</p>
            ) : (
              <dl className="dense-list">
                {postRowsByType.corner.map((row) => (
                  <div key={`corner-${row.heightMm}`}>
                    <dt>{formatHeightLabelFromMm(row.heightMm)}</dt>
                    <dd>{row.count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <div className="count-group">
            <h3>Junction Posts</h3>
            {postRowsByType.junction.length === 0 ? (
              <p className="muted-line">No junction posts.</p>
            ) : (
              <dl className="dense-list">
                {postRowsByType.junction.map((row) => (
                  <div key={`junction-${row.heightMm}`}>
                    <dt>{formatHeightLabelFromMm(row.heightMm)}</dt>
                    <dd>{row.count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <div className="count-group">
            <h3>Inline Join Posts</h3>
            {postRowsByType.inlineJoin.length === 0 ? (
              <p className="muted-line">No inline join posts.</p>
            ) : (
              <dl className="dense-list">
                {postRowsByType.inlineJoin.map((row) => (
                  <div key={`inline-${row.heightMm}`}>
                    <dt>{formatHeightLabelFromMm(row.heightMm)}</dt>
                    <dd>{row.count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <div className="count-group">
            <h3>Gates</h3>
            {gateCounts.total === 0 ? (
              <p className="muted-line">No gates placed.</p>
            ) : (
              <>
                <dl className="dense-list">
                  <div>
                    <dt>Total</dt>
                    <dd>{gateCounts.total}</dd>
                  </div>
                  <div>
                    <dt>Single Leaf</dt>
                    <dd>{gateCounts.single}</dd>
                  </div>
                  <div>
                    <dt>Double Leaf</dt>
                    <dd>{gateCounts.double}</dd>
                  </div>
                  <div>
                    <dt>Custom</dt>
                    <dd>{gateCounts.custom}</dd>
                  </div>
                </dl>
                <dl className="dense-list">
                  {gateCountsByHeight.map((row) => (
                    <div key={`gate-height-${row.height}`}>
                      <dt>{row.height}</dt>
                      <dd>{row.count}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </div>
          <div className="count-group">
            <h3>Fence Heights (Std / SR)</h3>
            {twinBarFenceRows.length === 0 ? (
              <p className="muted-line">No twin bar fence runs yet.</p>
            ) : (
              <dl className="dense-list">
                {twinBarFenceRows.map((row) => (
                  <div key={row.height}>
                    <dt>{row.height}</dt>
                    <dd>
                      {row.standard} / {row.superRebound}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>

        <section className="panel-block panel-post-key" style={panelDragStyle("postKey")}>
          <div className="panel-heading panel-drag-handle" onMouseDown={(event) => startPanelDrag("postKey", event)}>
            <h2>Post Key</h2>
          </div>
          <div className="post-key">
            <div className="post-key-row">
              <span className="post-icon post-end" />
              <span>End Post</span>
              <strong>{postTypeCounts.END}</strong>
            </div>
            <div className="post-key-row">
              <span className="post-icon post-intermediate" />
              <span>Intermediate Post</span>
              <strong>{postTypeCounts.INTERMEDIATE}</strong>
            </div>
            <div className="post-key-row">
              <span className="post-icon post-corner" />
              <span>Corner Post</span>
              <strong>{postTypeCounts.CORNER}</strong>
            </div>
            <div className="post-key-row">
              <span className="post-icon post-junction" />
              <span>Junction Post</span>
              <strong>{postTypeCounts.JUNCTION}</strong>
            </div>
            <div className="post-key-row">
              <span className="post-icon post-inline-join" />
              <span>Inline Join Post</span>
              <strong>{postTypeCounts.INLINE_JOIN}</strong>
            </div>
            <div className="post-key-row">
              <span className="post-icon post-gate" />
              <span>Gate Post</span>
              <strong>{postTypeCounts.GATE}</strong>
            </div>
          </div>
        </section>

        {!isTutorialOpen ? (
          <button type="button" className="tutorial-launch" onClick={() => setIsTutorialOpen(true)}>
            Tutorial
          </button>
        ) : null}

        {isTutorialOpen ? (
          <section className="panel-block panel-tutorial" style={panelDragStyle("tutorial")}>
            <div className="panel-heading panel-drag-handle" onMouseDown={(event) => startPanelDrag("tutorial", event)}>
              <h2>Tutorial</h2>
              <button
                type="button"
                className="panel-close"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => setIsTutorialOpen(false)}
              >
                x
              </button>
            </div>
            <ul>
              <li>Mode Draw: left click start/commit fence line.</li>
              <li>Mode Select: click line to select and edit.</li>
              <li>Mode Rect: click two corners to draw a rectangle perimeter.</li>
              <li>Mode Recess: hover line and click to insert recess.</li>
              <li>Mode Gate: hover line and click to insert a gate object.</li>
              <li>Right click cancels active draw chain.</li>
              <li>Hold Shift to disable angle snapping.</li>
              <li>Horizontal/vertical guide lines help match terminations.</li>
              <li>Middle drag or Space + drag to pan.</li>
              <li>Open Cut Planner after drawing to review stock-panel plans and reuse steps.</li>
            </ul>
          </section>
        ) : null}

        <section className="panel-block panel-controls" style={panelDragStyle("controls")}>
          <div className="panel-heading panel-drag-handle" onMouseDown={(event) => startPanelDrag("controls", event)}>
            <h2>Controls</h2>
          </div>
          <div className="controls-toolbar" aria-label="Controls toolbar">
            <button type="button" className="icon-btn" onClick={undoSegments} disabled={!canUndo} title="Undo">
              U
            </button>
            <button type="button" className="icon-btn" onClick={redoSegments} disabled={!canRedo} title="Redo">
              R
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                if (selectedGateId) {
                  setGatePlacements((previous) => previous.filter((gate) => gate.id !== selectedGateId));
                  setSelectedGateId(null);
                  return;
                }
                if (!selectedSegmentId) {
                  return;
                }
                applySegments((previous) => previous.filter((segment) => segment.id !== selectedSegmentId));
                setSelectedSegmentId(null);
              }}
              disabled={interactionMode !== "SELECT" || (!selectedSegmentId && !selectedGateId)}
              title="Delete Selected"
            >
              D
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                dispatchHistory({ type: "SET", segments: [] });
                setGatePlacements([]);
                setDrawStart(null);
                setSelectedSegmentId(null);
                setSelectedGateId(null);
              }}
              title="Clear Layout"
            >
              C
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                void createSnapshot();
              }}
              disabled={segments.length === 0}
              title="Save Snapshot To API"
            >
              S
            </button>
          </div>
          {snapshotStatus ? <p className="snapshot-status">{snapshotStatus}</p> : null}
        </section>

      </aside>

      <OptimizationPlanner
        summary={optimizationSummary}
        canInspect={segments.length > 0}
        isOpen={isOptimizationInspectorOpen}
        selectedPlanId={selectedPlanId}
        segmentOrdinalById={segmentOrdinalById}
        onOpen={openOptimizationInspector}
        onClose={() => setIsOptimizationInspectorOpen(false)}
        onSelectPlan={setSelectedPlanId}
      />

      {isLengthEditorOpen && selectedSegment ? (
        <section className="panel-block length-editor">
          <h2>Edit Segment Length</h2>
          <label>
            Length (m)
            <input
              type="number"
              min={RECESS_INPUT_STEP_M}
              step={RECESS_INPUT_STEP_M}
              value={selectedLengthInputM}
              onChange={(event) => setSelectedLengthInputM(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applySelectedLengthEdit();
                }
              }}
            />
          </label>
          <p className="muted-line">
            {selectedComponentClosed
              ? "Closed perimeter: matching parallel spans update as a rigid body."
              : "Open run: downstream connected segments move with the edited endpoint."}
          </p>
          <div className="length-editor-actions">
            <button type="button" onClick={applySelectedLengthEdit}>
              Apply Length
            </button>
            <button type="button" className="ghost" onClick={() => setIsLengthEditorOpen(false)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <main className="canvas-wrap">
        <Stage
          ref={stageRef}
          width={canvasWidth}
          height={canvasHeight}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          onMouseDown={onStageMouseDown}
          onMouseMove={onStageMouseMove}
          onMouseUp={onStageMouseUp}
          onWheel={onStageWheel}
          onContextMenu={onContextMenu}
        >
          <Layer listening={false}>
            {verticalLines.map((line) => (
              <Line
                key={`v-${line.x}`}
                points={[line.x, visibleBounds.top, line.x, visibleBounds.bottom]}
                stroke={line.major ? "#243543" : "#1a242d"}
                strokeWidth={(line.major ? MAJOR_GRID_STROKE_PX : MINOR_GRID_STROKE_PX) / view.scale}
              />
            ))}
            {horizontalLines.map((line) => (
              <Line
                key={`h-${line.y}`}
                points={[visibleBounds.left, line.y, visibleBounds.right, line.y]}
                stroke={line.major ? "#243543" : "#1a242d"}
                strokeWidth={(line.major ? MAJOR_GRID_STROKE_PX : MINOR_GRID_STROKE_PX) / view.scale}
              />
            ))}
          </Layer>

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
                      `gate-preview-symbol-${gatePreview.segment.id}`,
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
            {visualPosts.map((post) => {
              const size = POST_SYMBOL_RADIUS_PX / view.scale;
              const strokeWidth = 1.35 / view.scale;

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
            })}
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
                      {...(segment.spec.system === "ROLL_FORM"
                        ? { dash: [12 / view.scale, 8 / view.scale] }
                        : {})}
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
                      setSelectedGateId(null);
                      startSelectedSegmentDrag(segment.id);
                    }}
                    onTouchStart={(event) => {
                      if (interactionMode !== "SELECT" || !isSelected) {
                        return;
                      }
                      event.cancelBubble = true;
                      startSelectedSegmentDrag(segment.id);
                    }}
                    onClick={(event) => {
                      event.cancelBubble = true;
                      if (interactionMode !== "SELECT") {
                        return;
                      }
                      setSelectedSegmentId(segment.id);
                      setSelectedGateId(null);
                      setDrawStart(null);
                    }}
                    onTap={() => {
                      if (interactionMode !== "SELECT") {
                        return;
                      }
                      setSelectedSegmentId(segment.id);
                      setSelectedGateId(null);
                      setDrawStart(null);
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
                          setSelectedGateId(null);
                          openLengthEditor(segment.id);
                        }}
                        onTap={(event) => {
                          event.cancelBubble = true;
                          setSelectedGateId(null);
                          openLengthEditor(segment.id);
                        }}
                      />
                    ) : null,
                  )}
                  {/*
                    Fallback for very dense views where all labels are culled by overlap logic.
                  */}
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
                        setSelectedGateId(null);
                        openLengthEditor(segment.id);
                      }}
                      onTap={(event) => {
                        event.cancelBubble = true;
                        setSelectedGateId(null);
                        openLengthEditor(segment.id);
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
                          const position = quantize({ x: event.target.x(), y: event.target.y() });
                          updateSegment(segment.id, (current) => ({ ...current, start: position }));
                        }}
                      />
                      <Circle
                        x={segment.end.x}
                        y={segment.end.y}
                        radius={HANDLE_RADIUS_PX / view.scale}
                        fill="#ffbe0b"
                        draggable
                        onDragMove={(event) => {
                          const position = quantize({ x: event.target.x(), y: event.target.y() });
                          updateSegment(segment.id, (current) => ({ ...current, end: position }));
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
                    `gate-${gateVisual.key}`,
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
                        setSelectedSegmentId(null);
                        setSelectedGateId(gateVisual.id);
                        setIsLengthEditorOpen(false);
                        startSelectedGateDrag(gateVisual.id);
                      }}
                      onTouchStart={(event) => {
                        event.cancelBubble = true;
                        setSelectedSegmentId(null);
                        setSelectedGateId(gateVisual.id);
                        setIsLengthEditorOpen(false);
                        startSelectedGateDrag(gateVisual.id);
                      }}
                      onClick={(event) => {
                        event.cancelBubble = true;
                        setSelectedSegmentId(null);
                        setSelectedGateId(gateVisual.id);
                        setIsLengthEditorOpen(false);
                      }}
                      onTap={(event) => {
                        event.cancelBubble = true;
                        setSelectedSegmentId(null);
                        setSelectedGateId(gateVisual.id);
                        setIsLengthEditorOpen(false);
                      }}
                    />
                  ) : null}
                </Group>
              );
            })}
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
          <Layer listening={false}>
            {selectedPlanVisual ? (
              <Group key={`plan-${selectedPlanVisual.plan.id}`}>
                {selectedPlanVisual.links.map((link, index) => (
                  <Arrow
                    key={`plan-link-${index + 1}`}
                    points={[link.start.x, link.start.y, link.end.x, link.end.y]}
                    stroke="#ffffff"
                    fill="#ffffff"
                    strokeWidth={2.2 / view.scale}
                    pointerLength={11 / view.scale}
                    pointerWidth={11 / view.scale}
                    dash={[8 / view.scale, 6 / view.scale]}
                    opacity={0.9}
                  />
                ))}
                {selectedPlanVisual.cuts.map((entry) => (
                  <Group key={entry.cut.id}>
                    <Line
                      points={[entry.start.x, entry.start.y, entry.end.x, entry.end.y]}
                      stroke={entry.cut.mode === "OPEN_STOCK_PANEL" ? "#ffb347" : "#17e3d0"}
                      strokeWidth={8 / view.scale}
                      lineCap="round"
                    />
                    <Circle x={entry.center.x} y={entry.center.y} radius={8 / view.scale} fill="#061019" stroke="#ffffff" strokeWidth={1.6 / view.scale} />
                    <Text
                      x={entry.center.x}
                      y={entry.center.y}
                      text={String(entry.cut.step)}
                      fontSize={LABEL_FONT_SIZE_PX / view.scale}
                      fill="#f7fbff"
                      align="center"
                      verticalAlign="middle"
                      offsetX={3.6 / view.scale}
                      offsetY={6 / view.scale}
                    />
                  </Group>
                ))}
              </Group>
            ) : null}
          </Layer>
        </Stage>

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
          <span>Mode: {interactionMode}</span>
          <span>Snap: {disableSnap ? "OFF" : "5 deg"}</span>
          <span>Point Step: {formatLengthMm(DRAW_INCREMENT_MM)}</span>
          <span>Active Start: {drawStart ? formatPointMeters(drawStart) : "None"}</span>
        </div>
      </main>
    </div>
  );
}


