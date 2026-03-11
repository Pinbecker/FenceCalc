import type { LayoutSegment, PointMm } from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import {
  DRAW_INCREMENT_MM,
  GRID_STEPS_MM,
  MIN_GRID_PIXEL_SPACING,
  MIN_SEGMENT_MM,
  RECESS_CORNER_SNAP_MM,
  quantize
} from "./constants.js";
import { dot, normalizeVector, pointCoordinateKey, samePointApprox } from "./editorMath.js";
import { interpolateAlongSegment } from "./gateGeometry.js";
import type { RecessAlignmentAnchor, RecessInsertionPreview, RecessSide } from "./types.js";

export function buildRecessPreview(
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

export function chooseGridStep(scale: number): number {
  const step = GRID_STEPS_MM.find((candidate) => candidate * scale >= MIN_GRID_PIXEL_SPACING);
  return step ?? GRID_STEPS_MM[GRID_STEPS_MM.length - 1]!;
}

export function recessMidpointSnapWindowMm(segmentLengthMm: number): number {
  const proportional = segmentLengthMm * 0.08;
  return Math.max(300, Math.min(1200, proportional));
}

export function recessFractionSnapWindowMm(segmentLengthMm: number): number {
  const proportional = segmentLengthMm * 0.06;
  return Math.max(260, Math.min(1000, proportional));
}

export function recessAnchorSnapWindowMm(segmentLengthMm: number): number {
  const proportional = segmentLengthMm * 0.05;
  return Math.max(220, Math.min(900, proportional));
}

export function recessSnapTargetsMm(segmentLengthMm: number): number[] {
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

export function snapOffsetToAnchorAlongSegment(
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

export function buildRecessAlignmentAnchors(segments: LayoutSegment[]): RecessAlignmentAnchor[] {
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

export function buildRecessReplacementSegments(preview: RecessInsertionPreview): LayoutSegment[] {
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
