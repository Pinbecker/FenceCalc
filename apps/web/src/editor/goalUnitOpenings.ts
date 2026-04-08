import type { SegmentOpeningSpan } from "@fence-estimator/rules-engine";

export function isOffsetWithinSegmentOpenings(
  offsetMm: number,
  openings: readonly SegmentOpeningSpan[],
): boolean {
  return openings.some(
    (opening) =>
      offsetMm >= opening.startOffsetMm - 0.001 &&
      offsetMm <= opening.endOffsetMm + 0.001,
  );
}

export function doesRangeOverlapSegmentOpenings(
  startOffsetMm: number,
  endOffsetMm: number,
  openings: readonly SegmentOpeningSpan[],
): boolean {
  return openings.some(
    (opening) => Math.max(startOffsetMm, opening.startOffsetMm) < Math.min(endOffsetMm, opening.endOffsetMm),
  );
}

export function isOffsetBlockedByGoalUnitOpening(
  segmentId: string,
  offsetMm: number,
  openingsBySegmentId: ReadonlyMap<string, readonly SegmentOpeningSpan[]>,
): boolean {
  return isOffsetWithinSegmentOpenings(offsetMm, openingsBySegmentId.get(segmentId) ?? []);
}

export function doesRangeOverlapGoalUnitOpening(
  segmentId: string,
  startOffsetMm: number,
  endOffsetMm: number,
  openingsBySegmentId: ReadonlyMap<string, readonly SegmentOpeningSpan[]>,
): boolean {
  return doesRangeOverlapSegmentOpenings(
    startOffsetMm,
    endOffsetMm,
    openingsBySegmentId.get(segmentId) ?? [],
  );
}
