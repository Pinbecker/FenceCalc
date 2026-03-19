import type {
  BasketballFeaturePlacement,
  FenceHeightKey,
  FenceSpec,
  FloodlightColumnPlacement,
  GoalUnitPlacement,
  KickboardAttachment,
  LayoutSegment,
  PitchDividerPlacement,
  PointMm,
  SideNettingAttachment
} from "@fence-estimator/contracts";
import {
  PITCH_DIVIDER_MAX_SPAN_MM,
  PITCH_DIVIDER_SUPPORT_INTERVAL_MM,
  SIDE_NETTING_EXTENDED_POST_INTERVAL
} from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import { getSpecConfig } from "./constants.js";

const OFFSET_EPSILON_MM = 0.001;
const BASKETBALL_POST_RENDER_HEIGHT_MM = 3250;

export interface ResolvedGoalUnitPlacement {
  id: string;
  segmentId: string;
  centerOffsetMm: number;
  startOffsetMm: number;
  endOffsetMm: number;
  widthMm: GoalUnitPlacement["widthMm"];
  depthMm: number;
  goalHeightMm: GoalUnitPlacement["goalHeightMm"];
  enclosureHeightMm: GoalUnitPlacement["goalHeightMm"];
  entryPoint: PointMm;
  exitPoint: PointMm;
  recessEntryPoint: PointMm;
  recessExitPoint: PointMm;
  rearCenterPoint: PointMm;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
  spec: FenceSpec;
  enclosureSpec: FenceSpec;
  placement: GoalUnitPlacement;
}

export interface ResolvedBasketballFeaturePlacement {
  id: string;
  segmentId: string;
  offsetMm: number;
  point: PointMm;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
  spec: FenceSpec;
  type: NonNullable<BasketballFeaturePlacement["type"]>;
  mountingMode: NonNullable<BasketballFeaturePlacement["mountingMode"]>;
  armLengthMm: BasketballFeaturePlacement["armLengthMm"] | null;
  pairedFeatureId: string | null;
  replacesIntermediatePost: boolean;
  hostPostIndex: number;
  renderHeightMm: number;
  placement: BasketballFeaturePlacement;
}

export interface ResolvedKickboardAttachment {
  id: string;
  segmentId: string;
  start: PointMm;
  end: PointMm;
  lengthMm: number;
  boardCount: number;
  placement: KickboardAttachment;
}

export interface ResolvedPitchDividerPlacement {
  id: string;
  startPoint: PointMm;
  endPoint: PointMm;
  spanMm: number;
  supportPoints: PointMm[];
  supportPostCount: number;
  isValid: boolean;
  validationMessage: string | null;
  placement: PitchDividerPlacement;
}

export interface ResolvedSideNettingAttachment {
  id: string;
  segmentId: string;
  startOffsetMm: number;
  endOffsetMm: number;
  start: PointMm;
  end: PointMm;
  lengthMm: number;
  baseFenceHeightMm: number;
  additionalHeightMm: number;
  totalHeightMm: number;
  extendedPostIndices: number[];
  extendedPostPoints: PointMm[];
  placement: SideNettingAttachment;
}

export interface OppositeBasketballPairCandidate {
  segmentId: string;
  offsetMm: number;
  facing: BasketballFeaturePlacement["facing"];
  distanceMm: number;
}

function interpolateAlongSegment(segment: LayoutSegment, offsetMm: number): PointMm {
  const lengthMm = distanceMm(segment.start, segment.end);
  if (lengthMm <= OFFSET_EPSILON_MM) {
    return segment.start;
  }
  const ratio = Math.max(0, Math.min(1, offsetMm / lengthMm));
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
    y: segment.start.y + (segment.end.y - segment.start.y) * ratio
  };
}

function normalizeVector(vector: { x: number; y: number }): { x: number; y: number } | null {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= OFFSET_EPSILON_MM) {
    return null;
  }
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function getSegmentAxes(segment: LayoutSegment) {
  const tangent = normalizeVector({
    x: segment.end.x - segment.start.x,
    y: segment.end.y - segment.start.y
  });
  if (!tangent) {
    return null;
  }
  return {
    tangent,
    leftNormal: { x: -tangent.y, y: tangent.x }
  };
}

function getFenceHeightMm(spec: FenceSpec): number {
  return getSpecConfig(spec).assembledHeightMm;
}

function heightMmToFenceHeightKey(heightMm: number): FenceHeightKey {
  switch (heightMm) {
    case 1200:
      return "1.2m";
    case 1800:
      return "1.8m";
    case 2000:
      return "2m";
    case 2400:
      return "2.4m";
    case 3000:
      return "3m";
    case 4000:
      return "4m";
    case 4500:
      return "4.5m";
    case 5000:
      return "5m";
    case 6000:
      return "6m";
    default:
      throw new Error(`Unsupported fence height ${heightMm}mm`);
  }
}

function buildSpecAtHeight(spec: FenceSpec, heightMm: number): FenceSpec {
  return {
    ...spec,
    height: heightMmToFenceHeightKey(heightMm)
  };
}

export function getSegmentIntermediatePostOffsets(segment: LayoutSegment): number[] {
  const lengthMm = distanceMm(segment.start, segment.end);
  if (lengthMm <= OFFSET_EPSILON_MM) {
    return [];
  }
  const bayWidthMm = getSpecConfig(segment.spec).bayWidthMm;
  const bays = Math.max(1, Math.ceil(lengthMm / bayWidthMm));
  const offsets: number[] = [];

  for (let index = 1; index < bays; index += 1) {
    offsets.push(Math.min(lengthMm, bayWidthMm * index));
  }

  return offsets;
}

export function getSegmentPostOffsets(segment: LayoutSegment): number[] {
  const lengthMm = distanceMm(segment.start, segment.end);
  const offsets = [0, ...getSegmentIntermediatePostOffsets(segment), lengthMm].sort((left, right) => left - right);
  const uniqueOffsets: number[] = [];

  for (const offsetMm of offsets) {
    const lastOffsetMm = uniqueOffsets[uniqueOffsets.length - 1];
    if (lastOffsetMm === undefined || Math.abs(lastOffsetMm - offsetMm) > OFFSET_EPSILON_MM) {
      uniqueOffsets.push(offsetMm);
    }
  }

  return uniqueOffsets;
}

export function resolveIntermediatePostIndex(segment: LayoutSegment, offsetMm: number, toleranceMm = 25): number | null {
  const offsets = getSegmentIntermediatePostOffsets(segment);
  let bestIndex: number | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (let index = 0; index < offsets.length; index += 1) {
    const candidateOffsetMm = offsets[index];
    if (candidateOffsetMm === undefined) {
      continue;
    }
    const deltaMm = Math.abs(candidateOffsetMm - offsetMm);
    if (deltaMm <= toleranceMm && deltaMm < bestDelta) {
      bestDelta = deltaMm;
      bestIndex = index + 1;
    }
  }

  return bestIndex;
}

export function resolveGoalUnitPlacements(
  segmentsById: Map<string, LayoutSegment>,
  placements: GoalUnitPlacement[]
): ResolvedGoalUnitPlacement[] {
  return placements.flatMap((placement) => {
      const segment = segmentsById.get(placement.segmentId);
      if (!segment) {
        return [];
      }
      const axes = getSegmentAxes(segment);
      if (!axes) {
        return [];
      }
      const segmentLengthMm = distanceMm(segment.start, segment.end);
      const startOffsetMm = placement.centerOffsetMm - placement.widthMm / 2;
      const endOffsetMm = placement.centerOffsetMm + placement.widthMm / 2;
      if (startOffsetMm < -OFFSET_EPSILON_MM || endOffsetMm > segmentLengthMm + OFFSET_EPSILON_MM) {
        return [];
      }

      const entryPoint = interpolateAlongSegment(segment, startOffsetMm);
      const exitPoint = interpolateAlongSegment(segment, endOffsetMm);
      const normal =
        placement.side === "RIGHT"
          ? { x: -axes.leftNormal.x, y: -axes.leftNormal.y }
          : axes.leftNormal;
      const recessEntryPoint = {
        x: entryPoint.x + normal.x * placement.depthMm,
        y: entryPoint.y + normal.y * placement.depthMm
      };
      const recessExitPoint = {
        x: exitPoint.x + normal.x * placement.depthMm,
        y: exitPoint.y + normal.y * placement.depthMm
      };

      return [{
        id: placement.id,
        segmentId: placement.segmentId,
        centerOffsetMm: placement.centerOffsetMm,
        startOffsetMm,
        endOffsetMm,
        widthMm: placement.widthMm,
        depthMm: placement.depthMm,
        goalHeightMm: placement.goalHeightMm,
        enclosureHeightMm: placement.goalHeightMm,
        entryPoint,
        exitPoint,
        recessEntryPoint,
        recessExitPoint,
        rearCenterPoint: {
          x: (recessEntryPoint.x + recessExitPoint.x) / 2,
          y: (recessEntryPoint.y + recessExitPoint.y) / 2
        },
        tangent: axes.tangent,
        normal,
        spec: segment.spec,
        enclosureSpec: buildSpecAtHeight(segment.spec, placement.goalHeightMm),
        placement
      } satisfies ResolvedGoalUnitPlacement];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function buildGoalUnitEstimateSegments(goalUnit: ResolvedGoalUnitPlacement): LayoutSegment[] {
  return [
    {
      id: `${goalUnit.id}::side-start`,
      start: goalUnit.entryPoint,
      end: goalUnit.recessEntryPoint,
      spec: goalUnit.enclosureSpec
    },
    {
      id: `${goalUnit.id}::rear`,
      start: goalUnit.recessEntryPoint,
      end: goalUnit.recessExitPoint,
      spec: goalUnit.enclosureSpec
    },
    {
      id: `${goalUnit.id}::side-end`,
      start: goalUnit.recessExitPoint,
      end: goalUnit.exitPoint,
      spec: goalUnit.enclosureSpec
    }
  ];
}

export function resolveBasketballFeaturePlacements(
  segmentsById: Map<string, LayoutSegment>,
  placements: BasketballFeaturePlacement[]
): ResolvedBasketballFeaturePlacement[] {
  return placements.flatMap((placement) => {
      const segment = segmentsById.get(placement.segmentId);
      if (!segment) {
        return [];
      }
      const axes = getSegmentAxes(segment);
      const hostPostIndex = resolveIntermediatePostIndex(segment, placement.offsetMm);
      if (!axes || hostPostIndex === null) {
        return [];
      }
      const point = interpolateAlongSegment(segment, placement.offsetMm);
      const type = placement.type ?? "DEDICATED_POST";
      const mountingMode = placement.mountingMode ?? "PROJECTING_ARM";
      const normal =
        placement.facing === "RIGHT"
          ? { x: -axes.leftNormal.x, y: -axes.leftNormal.y }
          : axes.leftNormal;
      const fenceHeightMm = getFenceHeightMm(segment.spec);
      const replacesIntermediatePost =
        type === "DEDICATED_POST" &&
        (placement.replacesIntermediatePost ?? true) &&
        fenceHeightMm <= 3000;

      return [{
        id: placement.id,
        segmentId: placement.segmentId,
        offsetMm: placement.offsetMm,
        point,
        tangent: axes.tangent,
        normal,
        spec: segment.spec,
        type,
        mountingMode,
        armLengthMm: placement.armLengthMm ?? null,
        pairedFeatureId: placement.pairedFeatureId ?? null,
        replacesIntermediatePost,
        hostPostIndex,
        renderHeightMm: Math.max(BASKETBALL_POST_RENDER_HEIGHT_MM, fenceHeightMm),
        placement
      } satisfies ResolvedBasketballFeaturePlacement];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function resolveKickboardAttachments(
  segmentsById: Map<string, LayoutSegment>,
  attachments: KickboardAttachment[]
): ResolvedKickboardAttachment[] {
  return attachments
    .map((attachment) => {
      const segment = segmentsById.get(attachment.segmentId);
      if (!segment) {
        return null;
      }
      const lengthMm = distanceMm(segment.start, segment.end);
      return {
        id: attachment.id,
        segmentId: attachment.segmentId,
        start: segment.start,
        end: segment.end,
        lengthMm,
        boardCount: Math.max(1, Math.ceil(lengthMm / attachment.boardLengthMm)),
        placement: attachment
      } satisfies ResolvedKickboardAttachment;
    })
    .filter((attachment): attachment is ResolvedKickboardAttachment => attachment !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function resolvePitchDividerPlacements(
  segmentsById: Map<string, LayoutSegment>,
  placements: PitchDividerPlacement[]
): ResolvedPitchDividerPlacement[] {
  return placements
    .map((placement) => {
      const startSegment = segmentsById.get(placement.startAnchor.segmentId);
      const endSegment = segmentsById.get(placement.endAnchor.segmentId);
      if (!startSegment || !endSegment) {
        return {
          id: placement.id,
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 0, y: 0 },
          spanMm: 0,
          supportPoints: [],
          supportPostCount: 0,
          isValid: false,
          validationMessage: "Missing fence-line anchor",
          placement
        } satisfies ResolvedPitchDividerPlacement;
      }

      const startPoint = interpolateAlongSegment(startSegment, placement.startAnchor.offsetMm);
      const endPoint = interpolateAlongSegment(endSegment, placement.endAnchor.offsetMm);
      const spanMm = distanceMm(startPoint, endPoint);
      const supportPoints: PointMm[] = [];
      if (spanMm <= PITCH_DIVIDER_MAX_SPAN_MM + OFFSET_EPSILON_MM) {
        for (
          let distanceFromStartMm = PITCH_DIVIDER_SUPPORT_INTERVAL_MM;
          distanceFromStartMm < spanMm - OFFSET_EPSILON_MM;
          distanceFromStartMm += PITCH_DIVIDER_SUPPORT_INTERVAL_MM
        ) {
          const ratio = distanceFromStartMm / spanMm;
          supportPoints.push({
            x: startPoint.x + (endPoint.x - startPoint.x) * ratio,
            y: startPoint.y + (endPoint.y - startPoint.y) * ratio
          });
        }
      }

      return {
        id: placement.id,
        startPoint,
        endPoint,
        spanMm,
        supportPoints,
        supportPostCount: supportPoints.length,
        isValid: spanMm <= PITCH_DIVIDER_MAX_SPAN_MM + OFFSET_EPSILON_MM,
        validationMessage: spanMm <= PITCH_DIVIDER_MAX_SPAN_MM + OFFSET_EPSILON_MM ? null : "Span exceeds 70m maximum",
        placement
      } satisfies ResolvedPitchDividerPlacement;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function resolveSideNettingAttachments(
  segmentsById: Map<string, LayoutSegment>,
  attachments: SideNettingAttachment[]
): ResolvedSideNettingAttachment[] {
  return attachments
    .map((attachment) => {
      const segment = segmentsById.get(attachment.segmentId);
      if (!segment) {
        return null;
      }
      const segmentLengthMm = distanceMm(segment.start, segment.end);
      const startOffsetMm = Math.max(0, Math.min(segmentLengthMm, attachment.startOffsetMm ?? 0));
      const endOffsetMm = Math.max(startOffsetMm, Math.min(segmentLengthMm, attachment.endOffsetMm ?? segmentLengthMm));
      const lengthMm = Math.max(0, endOffsetMm - startOffsetMm);
      const segmentPostOffsetsMm = getSegmentPostOffsets(segment);
      const coveredSupportOffsetsMm = [
        startOffsetMm,
        ...segmentPostOffsetsMm.filter(
          (offsetMm) => offsetMm > startOffsetMm + OFFSET_EPSILON_MM && offsetMm < endOffsetMm - OFFSET_EPSILON_MM
        ),
        endOffsetMm
      ];
      const extendedPostIndices: number[] = [];
      const extendedPostPoints: PointMm[] = [];

      for (
        let coveredIndex = 0;
        coveredIndex < coveredSupportOffsetsMm.length;
        coveredIndex += SIDE_NETTING_EXTENDED_POST_INTERVAL
      ) {
        const offsetMm = coveredSupportOffsetsMm[coveredIndex];
        if (offsetMm === undefined) {
          continue;
        }
        extendedPostIndices.push(coveredIndex);
        extendedPostPoints.push(interpolateAlongSegment(segment, offsetMm));
      }
      const finalSupportIndex = coveredSupportOffsetsMm.length - 1;
      if (finalSupportIndex >= 0 && !extendedPostIndices.includes(finalSupportIndex)) {
        const finalOffsetMm = coveredSupportOffsetsMm[finalSupportIndex];
        if (finalOffsetMm !== undefined) {
          extendedPostIndices.push(finalSupportIndex);
          extendedPostPoints.push(interpolateAlongSegment(segment, finalOffsetMm));
        }
      }

      const baseFenceHeightMm = getFenceHeightMm(segment.spec);
      return {
        id: attachment.id,
        segmentId: attachment.segmentId,
        startOffsetMm,
        endOffsetMm,
        start: interpolateAlongSegment(segment, startOffsetMm),
        end: interpolateAlongSegment(segment, endOffsetMm),
        lengthMm,
        baseFenceHeightMm,
        additionalHeightMm: attachment.additionalHeightMm,
        totalHeightMm: baseFenceHeightMm + attachment.additionalHeightMm,
        extendedPostIndices,
        extendedPostPoints,
        placement: attachment
      } satisfies ResolvedSideNettingAttachment;
    })
    .filter((attachment): attachment is ResolvedSideNettingAttachment => attachment !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function buildBasketballReplacementOffsetsBySegmentId(
  placements: ResolvedBasketballFeaturePlacement[]
): Map<string, number[]> {
  const replacementOffsetsBySegmentId = new Map<string, number[]>();

  for (const placement of placements) {
    if (!placement.replacesIntermediatePost) {
      continue;
    }
    const existing = replacementOffsetsBySegmentId.get(placement.segmentId);
    if (existing) {
      existing.push(placement.offsetMm);
      continue;
    }
    replacementOffsetsBySegmentId.set(placement.segmentId, [placement.offsetMm]);
  }

  for (const offsets of replacementOffsetsBySegmentId.values()) {
    offsets.sort((left, right) => left - right);
  }

  return replacementOffsetsBySegmentId;
}

export function findOppositeBasketballPairCandidate(
  segments: LayoutSegment[],
  sourceSegmentId: string,
  sourceOffsetMm: number,
  facing: BasketballFeaturePlacement["facing"]
): OppositeBasketballPairCandidate | null {
  const sourceSegment = segments.find((segment) => segment.id === sourceSegmentId);
  if (!sourceSegment) {
    return null;
  }
  const axes = getSegmentAxes(sourceSegment);
  if (!axes) {
    return null;
  }

  const sourcePoint = interpolateAlongSegment(sourceSegment, sourceOffsetMm);
  const outwardNormal =
    facing === "RIGHT"
      ? { x: -axes.leftNormal.x, y: -axes.leftNormal.y }
      : axes.leftNormal;
  let bestCandidate: OppositeBasketballPairCandidate | null = null;

  for (const candidateSegment of segments) {
    if (candidateSegment.id === sourceSegmentId) {
      continue;
    }
    const candidateAxes = getSegmentAxes(candidateSegment);
    if (!candidateAxes || getFenceHeightMm(candidateSegment.spec) < 3000) {
      continue;
    }

    const alignment = Math.abs(
      axes.tangent.x * candidateAxes.tangent.x + axes.tangent.y * candidateAxes.tangent.y
    );
    if (alignment < 0.94) {
      continue;
    }

    const segmentVector = {
      x: candidateSegment.end.x - candidateSegment.start.x,
      y: candidateSegment.end.y - candidateSegment.start.y
    };
    const segmentLengthMm = Math.hypot(segmentVector.x, segmentVector.y);
    if (segmentLengthMm <= OFFSET_EPSILON_MM) {
      continue;
    }

    const startToSource = {
      x: sourcePoint.x - candidateSegment.start.x,
      y: sourcePoint.y - candidateSegment.start.y
    };
    const alongMm =
      (startToSource.x * segmentVector.x + startToSource.y * segmentVector.y) / Math.max(segmentLengthMm, 1);
    if (alongMm < -OFFSET_EPSILON_MM || alongMm > segmentLengthMm + OFFSET_EPSILON_MM) {
      continue;
    }
    const snappedIndex = resolveIntermediatePostIndex(candidateSegment, alongMm, 600);
    if (snappedIndex === null) {
      continue;
    }

    const snappedOffsetMm = getSegmentIntermediatePostOffsets(candidateSegment)[snappedIndex - 1];
    if (snappedOffsetMm === undefined) {
      continue;
    }
    const candidatePoint = interpolateAlongSegment(candidateSegment, snappedOffsetMm);
    const delta = {
      x: candidatePoint.x - sourcePoint.x,
      y: candidatePoint.y - sourcePoint.y
    };
    const distanceAlongNormalMm = delta.x * outwardNormal.x + delta.y * outwardNormal.y;
    if (distanceAlongNormalMm <= 0) {
      continue;
    }

    if (!bestCandidate || distanceAlongNormalMm < bestCandidate.distanceMm) {
      bestCandidate = {
        segmentId: candidateSegment.id,
        offsetMm: snappedOffsetMm,
        facing: facing === "LEFT" ? "RIGHT" : "LEFT",
        distanceMm: distanceAlongNormalMm
      };
    }
  }

  return bestCandidate;
}
