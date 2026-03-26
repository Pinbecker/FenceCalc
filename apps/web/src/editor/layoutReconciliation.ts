import {
  type BasketballPostPlacement,
  type FloodlightColumnPlacement,
  type GatePlacement,
  type GoalUnitPlacement,
  type KickboardAttachment,
  type LayoutModel,
  type LayoutSegment,
  type PitchDividerPlacement,
  type SideNettingAttachment
} from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import { clampGatePlacementToSegment, samePointApprox } from "./editorMath";

function reconcileGatePlacementsForSegments(
  previousGates: GatePlacement[],
  previousSegments: LayoutSegment[],
  nextSegments: LayoutSegment[],
): GatePlacement[] {
  const previousSegmentsById = new Map(previousSegments.map((segment) => [segment.id, segment]));
  const nextSegmentsById = new Map(nextSegments.map((segment) => [segment.id, segment]));
  const next: GatePlacement[] = [];

  for (const placement of previousGates) {
    const nextSegment = nextSegmentsById.get(placement.segmentId);
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
  return next;
}

function reconcileBasketballPostsForSegments(
  previousBasketballPosts: BasketballPostPlacement[],
  nextSegments: LayoutSegment[],
): BasketballPostPlacement[] {
  const nextSegmentsById = new Map(nextSegments.map((segment) => [segment.id, segment]));
  const next: BasketballPostPlacement[] = [];

  for (const basketballPost of previousBasketballPosts) {
    const nextSegment = nextSegmentsById.get(basketballPost.segmentId);
    if (!nextSegment) {
      continue;
    }

    const segmentLengthMm = distanceMm(nextSegment.start, nextSegment.end);
    next.push({
      ...basketballPost,
      offsetMm: Math.max(0, Math.min(segmentLengthMm, basketballPost.offsetMm))
    });
  }

  next.sort((left, right) => left.id.localeCompare(right.id));
  return next;
}

function reconcileFloodlightColumnsForSegments(
  previousFloodlightColumns: FloodlightColumnPlacement[],
  nextSegments: LayoutSegment[],
): FloodlightColumnPlacement[] {
  const nextSegmentsById = new Map(nextSegments.map((segment) => [segment.id, segment]));
  const next: FloodlightColumnPlacement[] = [];

  for (const floodlightColumn of previousFloodlightColumns) {
    const nextSegment = nextSegmentsById.get(floodlightColumn.segmentId);
    if (!nextSegment) {
      continue;
    }

    const segmentLengthMm = distanceMm(nextSegment.start, nextSegment.end);
    next.push({
      ...floodlightColumn,
      offsetMm: Math.max(0, Math.min(segmentLengthMm, floodlightColumn.offsetMm))
    });
  }

  next.sort((left, right) => left.id.localeCompare(right.id));
  return next;
}

function reconcileGoalUnitsForSegments(
  previousGoalUnits: GoalUnitPlacement[],
  nextSegments: LayoutSegment[]
): GoalUnitPlacement[] {
  const nextSegmentsById = new Map(nextSegments.map((segment) => [segment.id, segment]));
  return previousGoalUnits
    .flatMap((goalUnit) => {
      const nextSegment = nextSegmentsById.get(goalUnit.segmentId);
      if (!nextSegment) {
        return [];
      }
      const segmentLengthMm = distanceMm(nextSegment.start, nextSegment.end);
      if (goalUnit.widthMm > segmentLengthMm) {
        return [];
      }
      const minCenterOffsetMm = goalUnit.widthMm / 2;
      const maxCenterOffsetMm = segmentLengthMm - goalUnit.widthMm / 2;
      return [{
        ...goalUnit,
        centerOffsetMm: Math.max(minCenterOffsetMm, Math.min(maxCenterOffsetMm, goalUnit.centerOffsetMm))
      }];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function reconcileKickboardsForSegments(
  previousKickboards: KickboardAttachment[],
  nextSegments: LayoutSegment[]
): KickboardAttachment[] {
  const nextSegmentIds = new Set(nextSegments.map((segment) => segment.id));
  return previousKickboards
    .filter((kickboard) => nextSegmentIds.has(kickboard.segmentId))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function reconcilePitchDividersForSegments(
  previousPitchDividers: PitchDividerPlacement[],
  nextSegments: LayoutSegment[]
): PitchDividerPlacement[] {
  const nextSegmentsById = new Map(nextSegments.map((segment) => [segment.id, segment]));
  return previousPitchDividers
    .flatMap((pitchDivider) => {
      const startSegment = nextSegmentsById.get(pitchDivider.startAnchor.segmentId);
      const endSegment = nextSegmentsById.get(pitchDivider.endAnchor.segmentId);
      if (!startSegment || !endSegment) {
        return [];
      }
      const startLengthMm = distanceMm(startSegment.start, startSegment.end);
      const endLengthMm = distanceMm(endSegment.start, endSegment.end);
      return [{
        ...pitchDivider,
        startAnchor: {
          ...pitchDivider.startAnchor,
          offsetMm: Math.max(0, Math.min(startLengthMm, pitchDivider.startAnchor.offsetMm))
        },
        endAnchor: {
          ...pitchDivider.endAnchor,
          offsetMm: Math.max(0, Math.min(endLengthMm, pitchDivider.endAnchor.offsetMm))
        }
      }];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function reconcileSideNettingsForSegments(
  previousSideNettings: SideNettingAttachment[],
  nextSegments: LayoutSegment[]
): SideNettingAttachment[] {
  const nextSegmentIds = new Set(nextSegments.map((segment) => segment.id));
  return previousSideNettings
    .filter((sideNetting) => nextSegmentIds.has(sideNetting.segmentId))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function reconcileLayoutForSegments(previous: LayoutModel, nextSegments: LayoutSegment[]): LayoutModel {
  return {
    ...previous,
    segments: nextSegments,
    gates: reconcileGatePlacementsForSegments(previous.gates ?? [], previous.segments, nextSegments),
    basketballPosts: reconcileBasketballPostsForSegments(previous.basketballPosts ?? [], nextSegments),
    floodlightColumns: reconcileFloodlightColumnsForSegments(previous.floodlightColumns ?? [], nextSegments),
    goalUnits: reconcileGoalUnitsForSegments(previous.goalUnits ?? [], nextSegments),
    kickboards: reconcileKickboardsForSegments(previous.kickboards ?? [], nextSegments),
    pitchDividers: reconcilePitchDividersForSegments(previous.pitchDividers ?? [], nextSegments),
    sideNettings: reconcileSideNettingsForSegments(previous.sideNettings ?? [], nextSegments)
  };
}
