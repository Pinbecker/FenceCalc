import type {
  BasketballPostPlacement,
  FenceSpec,
  FloodlightColumnPlacement,
  GatePlacement,
  GateType,
  LayoutModel,
  LayoutSegment,
  PointMm
} from "@fence-estimator/contracts";
import { areOpposite, distanceMm } from "@fence-estimator/geometry";

import {
  DRAW_INCREMENT_MM,
  GATE_DOUBLE_LEAF_THRESHOLD_MM,
  MIN_SEGMENT_MM,
  SCALE_BAR_CANDIDATES_MM,
  SCALE_BAR_MAX_RATIO,
  SCALE_BAR_TARGET_RATIO,
  quantize
} from "./constants.js";
import type {
  AxisGuide,
  GateOppositeGuide,
  GateVisual,
  HistoryAction,
  HistoryState,
  PostKind,
  ScaleBarState,
  ScreenRect
} from "./types.js";
import { formatDistanceLabel } from "../formatters.js";

export function sameSpec(left: FenceSpec, right: FenceSpec): boolean {
  return (
    left.system === right.system &&
    left.height === right.height &&
    (left.twinBarVariant ?? "STANDARD") === (right.twinBarVariant ?? "STANDARD")
  );
}

export function normalizeVector(vector: { x: number; y: number }): { x: number; y: number } | null {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 1e-6) {
    return null;
  }
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

export function dot(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return left.x * right.x + left.y * right.y;
}

export function cross(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return left.x * right.y - left.y * right.x;
}

export function rotateVector(vector: { x: number; y: number }, degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos
  };
}

export function resolveGateLeafCount(widthMm: number): 1 | 2 {
  return widthMm > GATE_DOUBLE_LEAF_THRESHOLD_MM ? 2 : 1;
}

export function resolveGatePreviewLeafCount(gateType: GateType, widthMm: number): 1 | 2 {
  if (gateType === "DOUBLE_LEAF") {
    return 2;
  }
  if (gateType === "SINGLE_LEAF") {
    return 1;
  }
  return resolveGateLeafCount(widthMm);
}

export function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.max(startA, startB) < Math.min(endA, endB);
}

export function rectanglesOverlap(left: ScreenRect, right: ScreenRect, paddingPx = 5): boolean {
  return (
    left.left - paddingPx < right.right &&
    left.right + paddingPx > right.left &&
    left.top - paddingPx < right.bottom &&
    left.bottom + paddingPx > right.top
  );
}

export function offsetAlongSegmentMm(segment: LayoutSegment, point: PointMm): number {
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

export function isPointOnSegmentInterior(point: PointMm, segment: LayoutSegment, toleranceMm = 1): boolean {
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

export function segmentIntersectionPoint(first: LayoutSegment, second: LayoutSegment): PointMm | null {
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

export function collectInteriorIntersectionOffsetsMm(target: LayoutSegment, allSegments: LayoutSegment[]): number[] {
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

export function isOppositeGatePair(left: GateVisual, right: GateVisual): boolean {
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

export function buildOppositeGateGuides(gates: GateVisual[]): GateOppositeGuide[] {
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

export function clampGatePlacementToSegment(
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

export function sameGatePlacement(left: GatePlacement, right: GatePlacement): boolean {
  return (
    left.id === right.id &&
    left.segmentId === right.segmentId &&
    left.startOffsetMm === right.startOffsetMm &&
    left.endOffsetMm === right.endOffsetMm &&
    left.gateType === right.gateType
  );
}

export function sameGatePlacementList(left: GatePlacement[], right: GatePlacement[]): boolean {
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

export function sameBasketballPostPlacement(
  left: BasketballPostPlacement,
  right: BasketballPostPlacement
): boolean {
  return (
    left.id === right.id &&
    left.segmentId === right.segmentId &&
    left.offsetMm === right.offsetMm &&
    left.facing === right.facing
  );
}

export function sameBasketballPostPlacementList(
  left: BasketballPostPlacement[],
  right: BasketballPostPlacement[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftBasketballPost = left[index];
    const rightBasketballPost = right[index];
    if (
      !leftBasketballPost ||
      !rightBasketballPost ||
      !sameBasketballPostPlacement(leftBasketballPost, rightBasketballPost)
    ) {
      return false;
    }
  }
  return true;
}

export function sameFloodlightColumnPlacement(
  left: FloodlightColumnPlacement,
  right: FloodlightColumnPlacement
): boolean {
  return (
    left.id === right.id &&
    left.segmentId === right.segmentId &&
    left.offsetMm === right.offsetMm &&
    left.facing === right.facing
  );
}

export function sameFloodlightColumnPlacementList(
  left: FloodlightColumnPlacement[],
  right: FloodlightColumnPlacement[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftFloodlightColumn = left[index];
    const rightFloodlightColumn = right[index];
    if (
      !leftFloodlightColumn ||
      !rightFloodlightColumn ||
      !sameFloodlightColumnPlacement(leftFloodlightColumn, rightFloodlightColumn)
    ) {
      return false;
    }
  }
  return true;
}

export function samePointApprox(left: PointMm, right: PointMm, epsilon = 0.001): boolean {
  return Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon;
}

export function sameSegment(left: LayoutSegment, right: LayoutSegment): boolean {
  return (
    left.id === right.id &&
    left.start.x === right.start.x &&
    left.start.y === right.start.y &&
    left.end.x === right.end.x &&
    left.end.y === right.end.y &&
    sameSpec(left.spec, right.spec)
  );
}

export function sameSegmentList(left: LayoutSegment[], right: LayoutSegment[]): boolean {
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

export function sameLayoutModel(left: LayoutModel, right: LayoutModel): boolean {
  return (
    sameSegmentList(left.segments, right.segments) &&
    sameGatePlacementList(left.gates ?? [], right.gates ?? []) &&
    sameBasketballPostPlacementList(left.basketballPosts ?? [], right.basketballPosts ?? []) &&
    sameFloodlightColumnPlacementList(left.floodlightColumns ?? [], right.floodlightColumns ?? [])
  );
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "APPLY": {
      const next = action.updater(state.present);
      if (sameLayoutModel(state.present, next)) {
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
    case "RESET": {
      if (sameLayoutModel(state.present, action.layout) && state.past.length === 0 && state.future.length === 0) {
        return state;
      }
      return {
        past: [],
        present: action.layout,
        future: []
      };
    }
    case "SET": {
      if (sameLayoutModel(state.present, action.layout)) {
        return state;
      }
      return {
        past: [...state.past, state.present],
        present: action.layout,
        future: []
      };
    }
    default:
      return state;
  }
}

export function buildScaleBar(scale: number, canvasWidth: number): ScaleBarState {
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

export function findNearestNode(point: PointMm, nodes: PointMm[], maxDistanceMm: number): PointMm | null {
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

export function snapToAxisGuide(
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

export function pointCoordinateKey(point: PointMm): string {
  return `${point.x}:${point.y}`;
}

export function classifyIncidentNode(vectors: Array<{ x: number; y: number }>): PostKind {
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
