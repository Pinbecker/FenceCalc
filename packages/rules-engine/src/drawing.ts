import type { EstimateResult, GatePlacement, LayoutModel, LayoutSegment, PointMm } from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import { estimateLayout } from "./estimate.js";

const MIN_SEGMENT_MM = 50;
const DRAW_INCREMENT_MM = 50;

function quantize(point: PointMm): PointMm {
  return {
    x: Math.round(point.x / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM,
    y: Math.round(point.y / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM
  };
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

function buildSegmentRuns(segment: LayoutSegment, gatePlacements: GatePlacement[]): Array<{ start: PointMm; end: PointMm }> {
  const segmentLengthMm = distanceMm(segment.start, segment.end);
  if (segmentLengthMm <= 0) {
    return [];
  }
  if (gatePlacements.length === 0) {
    return [{ start: segment.start, end: segment.end }];
  }

  const sortedGates = [...gatePlacements]
    .map((placement) => clampGatePlacementToSegment(placement, segmentLengthMm))
    .filter((placement): placement is { startOffsetMm: number; endOffsetMm: number } => placement !== null)
    .sort((left, right) => left.startOffsetMm - right.startOffsetMm);

  if (sortedGates.length === 0) {
    return [{ start: segment.start, end: segment.end }];
  }

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

export function buildEstimateSegmentsForLayout(layout: LayoutModel): LayoutSegment[] {
  const gatesBySegmentId = new Map<string, GatePlacement[]>();
  for (const gate of layout.gates ?? []) {
    const bucket = gatesBySegmentId.get(gate.segmentId);
    if (bucket) {
      bucket.push(gate);
    } else {
      gatesBySegmentId.set(gate.segmentId, [gate]);
    }
  }

  const derived: LayoutSegment[] = [];
  for (const segment of layout.segments) {
    const runs = buildSegmentRuns(segment, gatesBySegmentId.get(segment.id) ?? []);
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

export function estimateDrawingLayout(layout: LayoutModel): EstimateResult {
  return estimateLayout({
    segments: buildEstimateSegmentsForLayout(layout)
  });
}
