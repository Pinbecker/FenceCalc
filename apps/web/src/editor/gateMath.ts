import type { GateType, LayoutSegment, PointMm } from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import {
  DRAW_INCREMENT_MM,
  DOUBLE_GATE_WIDTH_MM,
  MIN_SEGMENT_MM,
  SINGLE_GATE_WIDTH_MM
} from "./constants.js";
import { normalizeVector } from "./editorMath.js";
import type { GateInsertionPreview, LineSnapPreview } from "./types.js";

export function interpolateAlongSegment(segment: LayoutSegment, offsetMm: number): PointMm {
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

export function projectPointOntoSegment(
  point: PointMm,
  segment: LayoutSegment,
): { projected: PointMm; offsetMm: number; distanceMm: number; signedDistanceMm: number } {
  const vx = segment.end.x - segment.start.x;
  const vy = segment.end.y - segment.start.y;
  const segmentLengthSquared = vx * vx + vy * vy;
  if (segmentLengthSquared <= 0) {
    return {
      projected: segment.start,
      offsetMm: 0,
      distanceMm: distanceMm(point, segment.start),
      signedDistanceMm: 0
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
    distanceMm: distanceMm(point, projected),
    signedDistanceMm: (vx * (point.y - segment.start.y) - vy * (point.x - segment.start.x)) / Math.sqrt(segmentLengthSquared)
  };
}

export function findNearestSegmentSnap(point: PointMm, segments: LayoutSegment[], maxDistanceMm: number): LineSnapPreview | null {
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

export function resolveGateWidthMm(gateType: GateType, customGateWidthMm: number): number {
  if (gateType === "SINGLE_LEAF") {
    return SINGLE_GATE_WIDTH_MM;
  }
  if (gateType === "DOUBLE_LEAF") {
    return DOUBLE_GATE_WIDTH_MM;
  }
  return customGateWidthMm;
}

export function buildGatePreview(segment: LayoutSegment, centerOffsetMm: number, requestedWidthMm: number): GateInsertionPreview | null {
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
    targetPoint: interpolateAlongSegment(segment, centerOffsetMm),
    snapMeta: { kind: "FREE", label: "Free placement" }
  };
}
