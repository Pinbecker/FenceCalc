import type {
  GatePlacement,
  LayoutModel,
  LayoutSegment,
  PointMm,
} from "@fence-estimator/contracts";

import { cross, dot, EPSILON, magnitude, subtract } from "./vector.js";

export const LAYOUT_MIN_SEGMENT_MM = 50;
export const LAYOUT_MIN_GATE_CLEARANCE_MM = 50;
export const LAYOUT_MIN_GATE_WIDTH_MM = 50;

export type SegmentIntersectionKind =
  | "NONE"
  | "SHARED_ENDPOINT"
  | "CROSSING"
  | "UNSPLIT_JUNCTION"
  | "COLLINEAR_OVERLAP";

export type LayoutIntegrityIssueCode =
  | "DUPLICATE_SEGMENT_ID"
  | "SEGMENT_TOO_SHORT"
  | "SEGMENT_CROSSING"
  | "UNSPLIT_JUNCTION"
  | "SEGMENT_OVERLAP"
  | "DUPLICATE_GATE_ID"
  | "GATE_MISSING_SEGMENT"
  | "GATE_TOO_NARROW"
  | "GATE_OUT_OF_BOUNDS"
  | "GATE_END_CLEARANCE"
  | "GATE_OVERLAP";

export interface LayoutIntegrityIssue {
  code: LayoutIntegrityIssueCode;
  message: string;
  entityIds: string[];
}

export interface SegmentIntersectionResult {
  kind: SegmentIntersectionKind;
  point: PointMm | null;
}

const COORDINATE_TOLERANCE_MM = 0.01;

function approximatelyEqual(
  left: number,
  right: number,
  tolerance = COORDINATE_TOLERANCE_MM,
): boolean {
  return Math.abs(left - right) <= tolerance;
}

export function samePoint(
  left: PointMm,
  right: PointMm,
  tolerance = COORDINATE_TOLERANCE_MM,
): boolean {
  return (
    approximatelyEqual(left.x, right.x, tolerance) && approximatelyEqual(left.y, right.y, tolerance)
  );
}

export function segmentLengthMm(segment: LayoutSegment): number {
  return Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
}

export function offsetAlongSegmentMm(segment: LayoutSegment, point: PointMm): number {
  const vector = subtract(segment.end, segment.start);
  const length = magnitude(vector);
  if (length <= EPSILON) return 0;
  return Math.max(0, Math.min(length, dot(subtract(point, segment.start), vector) / length));
}

export function isPointOnSegmentInterior(
  point: PointMm,
  segment: LayoutSegment,
  toleranceMm = COORDINATE_TOLERANCE_MM,
): boolean {
  const vector = subtract(segment.end, segment.start);
  const length = magnitude(vector);
  if (length <= EPSILON) return false;
  const fromStart = subtract(point, segment.start);
  const perpendicularDistance = Math.abs(cross(fromStart, vector)) / length;
  if (perpendicularDistance > toleranceMm) return false;
  const projection = dot(fromStart, vector) / (length * length);
  const endpointTolerance = toleranceMm / length;
  return projection > endpointTolerance && projection < 1 - endpointTolerance;
}

function pointOnClosedSegment(point: PointMm, segment: LayoutSegment): boolean {
  if (segmentLengthMm(segment) <= EPSILON) return samePoint(point, segment.start);
  const vector = subtract(segment.end, segment.start);
  const fromStart = subtract(point, segment.start);
  if (Math.abs(cross(vector, fromStart)) > COORDINATE_TOLERANCE_MM * magnitude(vector))
    return false;
  const projection = dot(fromStart, vector);
  return (
    projection >= -COORDINATE_TOLERANCE_MM &&
    projection <= dot(vector, vector) + COORDINATE_TOLERANCE_MM
  );
}

export function classifySegmentIntersection(
  first: LayoutSegment,
  second: LayoutSegment,
): SegmentIntersectionResult {
  const firstVector = subtract(first.end, first.start);
  const secondVector = subtract(second.end, second.start);
  const denominator = cross(firstVector, secondVector);
  const delta = subtract(second.start, first.start);

  if (Math.abs(denominator) <= EPSILON) {
    if (
      Math.abs(cross(delta, firstVector)) >
      COORDINATE_TOLERANCE_MM * Math.max(1, magnitude(firstVector))
    ) {
      return { kind: "NONE", point: null };
    }
    const firstLength = segmentLengthMm(first);
    if (firstLength <= EPSILON) return { kind: "NONE", point: null };
    const offsets = [
      offsetAlongSegmentMm(first, second.start),
      offsetAlongSegmentMm(first, second.end),
    ].sort((left, right) => left - right);
    const overlapStart = Math.max(0, offsets[0] ?? 0);
    const overlapEnd = Math.min(firstLength, offsets[1] ?? 0);
    if (overlapEnd - overlapStart > COORDINATE_TOLERANCE_MM) {
      return { kind: "COLLINEAR_OVERLAP", point: null };
    }
    const shared = [first.start, first.end].find(
      (point) => samePoint(point, second.start) || samePoint(point, second.end),
    );
    return shared ? { kind: "SHARED_ENDPOINT", point: shared } : { kind: "NONE", point: null };
  }

  const firstParameter = cross(delta, secondVector) / denominator;
  const secondParameter = cross(delta, firstVector) / denominator;
  const tolerance = 1e-9;
  if (
    firstParameter < -tolerance ||
    firstParameter > 1 + tolerance ||
    secondParameter < -tolerance ||
    secondParameter > 1 + tolerance
  ) {
    return { kind: "NONE", point: null };
  }

  const point = {
    x: first.start.x + firstVector.x * firstParameter,
    y: first.start.y + firstVector.y * firstParameter,
  };
  const firstInterior = firstParameter > tolerance && firstParameter < 1 - tolerance;
  const secondInterior = secondParameter > tolerance && secondParameter < 1 - tolerance;
  if (firstInterior && secondInterior) return { kind: "CROSSING", point };
  if (firstInterior || secondInterior) return { kind: "UNSPLIT_JUNCTION", point };
  return { kind: "SHARED_ENDPOINT", point };
}

export function segmentIntersectionPoint(
  first: LayoutSegment,
  second: LayoutSegment,
): PointMm | null {
  const result = classifySegmentIntersection(first, second);
  return result.kind === "CROSSING" ||
    result.kind === "UNSPLIT_JUNCTION" ||
    result.kind === "SHARED_ENDPOINT"
    ? result.point
    : null;
}

export function clampSegmentEndToBlockingIntersection(
  start: PointMm,
  proposedEnd: PointMm,
  segments: LayoutSegment[],
): PointMm {
  const candidate: LayoutSegment = {
    id: "__candidate__",
    start,
    end: proposedEnd,
    spec: { system: "TWIN_BAR", height: "2m" },
  };
  let bestPoint = proposedEnd;
  let bestDistance = segmentLengthMm(candidate);
  for (const segment of segments) {
    const result = classifySegmentIntersection(candidate, segment);
    if (!result.point || result.kind === "NONE" || result.kind === "COLLINEAR_OVERLAP") continue;
    const distance = Math.hypot(result.point.x - start.x, result.point.y - start.y);
    if (distance > COORDINATE_TOLERANCE_MM && distance < bestDistance - COORDINATE_TOLERANCE_MM) {
      bestDistance = distance;
      bestPoint = result.point;
    }
  }
  return bestPoint;
}

export function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.max(startA, startB) < Math.min(endA, endB);
}

export function clampGateRangeToSegment(
  placement: Pick<GatePlacement, "startOffsetMm" | "endOffsetMm">,
  lengthMm: number,
): { startOffsetMm: number; endOffsetMm: number } | null {
  if (lengthMm < LAYOUT_MIN_GATE_CLEARANCE_MM * 2 + LAYOUT_MIN_GATE_WIDTH_MM) return null;
  const maximumWidth = lengthMm - LAYOUT_MIN_GATE_CLEARANCE_MM * 2;
  const width = Math.max(
    LAYOUT_MIN_GATE_WIDTH_MM,
    Math.min(maximumWidth, placement.endOffsetMm - placement.startOffsetMm),
  );
  let startOffsetMm = Math.max(
    LAYOUT_MIN_GATE_CLEARANCE_MM,
    Math.min(lengthMm - LAYOUT_MIN_GATE_CLEARANCE_MM - width, placement.startOffsetMm),
  );
  let endOffsetMm = startOffsetMm + width;
  startOffsetMm = Math.round(startOffsetMm / LAYOUT_MIN_GATE_WIDTH_MM) * LAYOUT_MIN_GATE_WIDTH_MM;
  endOffsetMm = Math.round(endOffsetMm / LAYOUT_MIN_GATE_WIDTH_MM) * LAYOUT_MIN_GATE_WIDTH_MM;
  return endOffsetMm - startOffsetMm >= LAYOUT_MIN_GATE_WIDTH_MM
    ? { startOffsetMm, endOffsetMm }
    : null;
}

function validateGates(layout: LayoutModel, issues: LayoutIntegrityIssue[]): void {
  const segments = new Map(layout.segments.map((segment) => [segment.id, segment]));
  const seen = new Set<string>();
  const bySegment = new Map<string, GatePlacement[]>();
  for (const gate of layout.gates ?? []) {
    if (seen.has(gate.id)) {
      issues.push({
        code: "DUPLICATE_GATE_ID",
        message: `Gate ${gate.id} is duplicated`,
        entityIds: [gate.id],
      });
    }
    seen.add(gate.id);
    const segment = segments.get(gate.segmentId);
    if (!segment) {
      issues.push({
        code: "GATE_MISSING_SEGMENT",
        message: `Gate ${gate.id} is attached to a missing fence line`,
        entityIds: [gate.id, gate.segmentId],
      });
      continue;
    }
    const length = segmentLengthMm(segment);
    const width = gate.endOffsetMm - gate.startOffsetMm;
    if (width < LAYOUT_MIN_GATE_WIDTH_MM) {
      issues.push({
        code: "GATE_TOO_NARROW",
        message: `Gate ${gate.id} is narrower than 50mm`,
        entityIds: [gate.id],
      });
    }
    if (gate.startOffsetMm < 0 || gate.endOffsetMm > length) {
      issues.push({
        code: "GATE_OUT_OF_BOUNDS",
        message: `Gate ${gate.id} extends beyond its fence line`,
        entityIds: [gate.id, gate.segmentId],
      });
    } else if (
      gate.startOffsetMm < LAYOUT_MIN_GATE_CLEARANCE_MM ||
      length - gate.endOffsetMm < LAYOUT_MIN_GATE_CLEARANCE_MM
    ) {
      issues.push({
        code: "GATE_END_CLEARANCE",
        message: `Gate ${gate.id} needs at least 50mm of fence at each end`,
        entityIds: [gate.id, gate.segmentId],
      });
    }
    bySegment.set(gate.segmentId, [...(bySegment.get(gate.segmentId) ?? []), gate]);
  }
  for (const [segmentId, gates] of bySegment) {
    const ordered = [...gates].sort((left, right) => left.startOffsetMm - right.startOffsetMm);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (
        previous &&
        current &&
        rangesOverlap(
          previous.startOffsetMm,
          previous.endOffsetMm,
          current.startOffsetMm,
          current.endOffsetMm,
        )
      ) {
        issues.push({
          code: "GATE_OVERLAP",
          message: `Gates ${previous.id} and ${current.id} overlap on the same fence line`,
          entityIds: [segmentId, previous.id, current.id],
        });
      }
    }
  }
}

export function validateLayoutIntegrity(layout: LayoutModel): LayoutIntegrityIssue[] {
  const issues: LayoutIntegrityIssue[] = [];
  const seenIds = new Set<string>();
  for (const segment of layout.segments) {
    if (seenIds.has(segment.id)) {
      issues.push({
        code: "DUPLICATE_SEGMENT_ID",
        message: `Fence line ${segment.id} is duplicated`,
        entityIds: [segment.id],
      });
    }
    seenIds.add(segment.id);
    if (segmentLengthMm(segment) < LAYOUT_MIN_SEGMENT_MM) {
      issues.push({
        code: "SEGMENT_TOO_SHORT",
        message: `Fence line ${segment.id} is shorter than 50mm`,
        entityIds: [segment.id],
      });
    }
  }

  for (let leftIndex = 0; leftIndex < layout.segments.length - 1; leftIndex += 1) {
    const left = layout.segments[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < layout.segments.length; rightIndex += 1) {
      const right = layout.segments[rightIndex];
      if (!right) continue;
      const relation = classifySegmentIntersection(left, right);
      if (relation.kind === "CROSSING") {
        issues.push({
          code: "SEGMENT_CROSSING",
          message: `Fence lines ${left.id} and ${right.id} cross without a shared junction`,
          entityIds: [left.id, right.id],
        });
      } else if (relation.kind === "UNSPLIT_JUNCTION") {
        issues.push({
          code: "UNSPLIT_JUNCTION",
          message: `Fence lines ${left.id} and ${right.id} meet through the middle of a line instead of at a junction`,
          entityIds: [left.id, right.id],
        });
      } else if (relation.kind === "COLLINEAR_OVERLAP") {
        issues.push({
          code: "SEGMENT_OVERLAP",
          message: `Fence lines ${left.id} and ${right.id} overlap`,
          entityIds: [left.id, right.id],
        });
      }
    }
  }
  validateGates(layout, issues);
  return issues;
}

export function isPointOnSegment(point: PointMm, segment: LayoutSegment): boolean {
  return pointOnClosedSegment(point, segment);
}
