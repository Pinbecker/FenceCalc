import type {
  BasketballPostPlacement,
  EstimateResult,
  FloodlightColumnPlacement,
  GatePlacement,
  LayoutModel,
  LayoutSegment,
  PointMm
} from "@fence-estimator/contracts";
import { distanceMm, pointKey } from "@fence-estimator/geometry";

import { estimateLayout } from "./estimate.js";

const MIN_SEGMENT_MM = 50;
const DRAW_INCREMENT_MM = 50;

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

function dedupeSortedOffsets(offsets: number[]): number[] {
  const deduped: number[] = [];
  const mergeThresholdMm = DRAW_INCREMENT_MM * 0.2;

  for (const offsetMm of offsets) {
    const last = deduped[deduped.length - 1];
    if (last === undefined || Math.abs(offsetMm - last) > mergeThresholdMm) {
      deduped.push(offsetMm);
    }
  }

  return deduped;
}

function clampInlineFeatureOffset(offsetMm: number, segmentLengthMm: number): number {
  return Math.max(0, Math.min(segmentLengthMm, offsetMm));
}

function isOffsetWithinGateSpan(
  offsetMm: number,
  gatePlacements: Array<{ startOffsetMm: number; endOffsetMm: number }>
): boolean {
  const epsilon = 0.001;
  return gatePlacements.some(
    (gate) => offsetMm >= gate.startOffsetMm - epsilon && offsetMm <= gate.endOffsetMm + epsilon
  );
}

function collectInlineFeatureOffsets(
  placements: Array<BasketballPostPlacement | FloodlightColumnPlacement>,
  segmentId: string,
  segmentLengthMm: number
): number[] {
  return dedupeSortedOffsets(
    placements
      .filter((placement) => placement.segmentId === segmentId)
      .map((placement) => clampInlineFeatureOffset(placement.offsetMm, segmentLengthMm))
      .sort((left, right) => left - right)
  );
}

function buildSegmentRuns(
  segment: LayoutSegment,
  gatePlacements: GatePlacement[],
  inlineFeatureOffsetsMm: number[]
): Array<{ start: PointMm; end: PointMm }> {
  const segmentLengthMm = distanceMm(segment.start, segment.end);
  if (segmentLengthMm <= 0) {
    return [];
  }

  const clampedGates = gatePlacements
    .map((placement) => clampGatePlacementToSegment(placement, segmentLengthMm))
    .filter((placement): placement is { startOffsetMm: number; endOffsetMm: number } => placement !== null)
    .sort((left, right) => left.startOffsetMm - right.startOffsetMm);

  const boundaries = dedupeSortedOffsets(
    [
      0,
      segmentLengthMm,
      ...clampedGates.flatMap((gate) => [gate.startOffsetMm, gate.endOffsetMm]),
      ...inlineFeatureOffsetsMm
    ].sort((left, right) => left - right)
  );

  const runs: Array<{ start: PointMm; end: PointMm }> = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startOffsetMm = boundaries[index];
    const endOffsetMm = boundaries[index + 1];
    if (startOffsetMm === undefined || endOffsetMm === undefined || endOffsetMm - startOffsetMm < MIN_SEGMENT_MM) {
      continue;
    }

    const midpointMm = startOffsetMm + (endOffsetMm - startOffsetMm) / 2;
    if (isOffsetWithinGateSpan(midpointMm, clampedGates)) {
      continue;
    }

    runs.push({
      start: interpolateAlongSegment(segment, startOffsetMm),
      end: interpolateAlongSegment(segment, endOffsetMm)
    });
  }

  return runs;
}

export interface DerivedFenceTopology {
  estimateSegments: LayoutSegment[];
  replacementNodeKeys: Set<string>;
  segmentSplitOffsetsBySegmentId: Map<string, number[]>;
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

export function buildDerivedFenceTopology(layout: LayoutModel): DerivedFenceTopology {
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
  const replacementNodeKeys = new Set<string>();
  const segmentSplitOffsetsBySegmentId = new Map<string, number[]>();

  for (const segment of layout.segments) {
    const segmentLengthMm = distanceMm(segment.start, segment.end);
    if (segmentLengthMm <= 0) {
      continue;
    }

    const gatePlacements = gatesBySegmentId.get(segment.id) ?? [];
    const gateSpans = gatePlacements
      .map((placement) => clampGatePlacementToSegment(placement, segmentLengthMm))
      .filter((placement): placement is { startOffsetMm: number; endOffsetMm: number } => placement !== null);
    const inlineFeatureOffsetsMm = collectInlineFeatureOffsets(
      [
        ...(layout.basketballPosts ?? []),
        ...(layout.floodlightColumns ?? [])
      ],
      segment.id,
      segmentLengthMm
    );
    const replacementOffsetsMm = inlineFeatureOffsetsMm.filter((offsetMm) => !isOffsetWithinGateSpan(offsetMm, gateSpans));
    const interiorReplacementOffsetsMm = replacementOffsetsMm.filter(
      (offsetMm) => offsetMm > DRAW_INCREMENT_MM * 0.1 && offsetMm < segmentLengthMm - DRAW_INCREMENT_MM * 0.1
    );

    if (interiorReplacementOffsetsMm.length > 0) {
      segmentSplitOffsetsBySegmentId.set(segment.id, interiorReplacementOffsetsMm);
    }

    for (const offsetMm of replacementOffsetsMm) {
      replacementNodeKeys.add(pointKey(interpolateAlongSegment(segment, offsetMm)));
    }

    const runs = buildSegmentRuns(segment, gatePlacements, interiorReplacementOffsetsMm);
    if (runs.length === 0) {
      continue;
    }
    runs.forEach((run, index) => {
      derived.push({
        id: `${segment.id}::run-${index}`,
        start: run.start,
        end: run.end,
        spec: segment.spec
      });
    });
  }

  return {
    estimateSegments: derived,
    replacementNodeKeys,
    segmentSplitOffsetsBySegmentId
  };
}

export function buildEstimateSegmentsForLayout(layout: LayoutModel): LayoutSegment[] {
  return buildDerivedFenceTopology(layout).estimateSegments;
}

export function estimateDrawingLayout(layout: LayoutModel): EstimateResult {
  const derived = buildDerivedFenceTopology(layout);

  return estimateLayout(
    {
      segments: derived.estimateSegments
    },
    {
      excludedNodeKeys: derived.replacementNodeKeys
    }
  );
}
