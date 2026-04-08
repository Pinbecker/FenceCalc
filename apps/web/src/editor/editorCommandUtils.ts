import type {
  BasketballPostPlacement,
  FenceSpec,
  FloodlightColumnPlacement,
  GatePlacement,
  GoalUnitPlacement,
  KickboardAttachment,
  LayoutSegment,
  PitchDividerPlacement,
  PointMm,
  SideNettingAttachment
} from "@fence-estimator/contracts";
import type { SegmentOpeningSpan } from "@fence-estimator/rules-engine";
import { distanceMm } from "@fence-estimator/geometry";

import { DRAW_INCREMENT_MM, MIN_SEGMENT_MM, quantize } from "./constants";
import {
  clampGatePlacementToSegment,
  dot,
  normalizeVector,
  pointCoordinateKey,
  samePointApprox
} from "./editorMath";
import { buildRecessReplacementSegments } from "./recess";
import {
  doesRangeOverlapSegmentOpenings,
  isOffsetWithinSegmentOpenings
} from "./goalUnitOpenings";
import type { RecessInsertionPreview, ResolvedGatePlacement, SegmentConnectivity } from "./types";

interface RecessReplacementPathSegment {
  segment: LayoutSegment;
  lengthMm: number;
  pathStartMm: number;
  pathEndMm: number;
}

function buildRecessReplacementPath(replacement: LayoutSegment[]): RecessReplacementPathSegment[] {
  const path: RecessReplacementPathSegment[] = [];
  let cursorMm = 0;

  for (const segment of replacement) {
    const lengthMm = distanceMm(segment.start, segment.end);
    if (lengthMm <= 0) {
      continue;
    }
    path.push({
      segment,
      lengthMm,
      pathStartMm: cursorMm,
      pathEndMm: cursorMm + lengthMm
    });
    cursorMm += lengthMm;
  }

  return path;
}

function mapOffsetToRecessPath(offsetMm: number, preview: RecessInsertionPreview): number {
  const replacedSpanMm = preview.endOffsetMm - preview.startOffsetMm;
  if (replacedSpanMm <= 0) {
    return offsetMm;
  }

  const insertedSpanMm = replacedSpanMm + preview.depthMm * 2;
  if (offsetMm <= preview.startOffsetMm) {
    return offsetMm;
  }
  if (offsetMm >= preview.endOffsetMm) {
    return offsetMm + insertedSpanMm - replacedSpanMm;
  }

  const fraction = (offsetMm - preview.startOffsetMm) / replacedSpanMm;
  return preview.startOffsetMm + insertedSpanMm * fraction;
}

function distanceToPathSegment(pathSegment: RecessReplacementPathSegment, pathOffsetMm: number): number {
  if (pathOffsetMm < pathSegment.pathStartMm) {
    return pathSegment.pathStartMm - pathOffsetMm;
  }
  if (pathOffsetMm > pathSegment.pathEndMm) {
    return pathOffsetMm - pathSegment.pathEndMm;
  }
  return 0;
}

function findPathSegmentForOffset(
  pathSegments: RecessReplacementPathSegment[],
  pathOffsetMm: number
): RecessReplacementPathSegment | null {
  const epsilon = 0.001;
  for (let index = 0; index < pathSegments.length; index += 1) {
    const pathSegment = pathSegments[index];
    if (!pathSegment) {
      continue;
    }
    const isLast = index === pathSegments.length - 1;
    if (
      pathOffsetMm >= pathSegment.pathStartMm - epsilon &&
      (pathOffsetMm < pathSegment.pathEndMm - epsilon || isLast || Math.abs(pathOffsetMm - pathSegment.pathEndMm) <= epsilon)
    ) {
      return pathSegment;
    }
  }
  return null;
}

function mapOffsetOntoReplacementSegment(
  pathSegments: RecessReplacementPathSegment[],
  pathOffsetMm: number
): { segment: LayoutSegment; offsetMm: number; lengthMm: number } | null {
  const pathSegment = findPathSegmentForOffset(pathSegments, pathOffsetMm);
  if (!pathSegment) {
    return null;
  }
  return {
    segment: pathSegment.segment,
    offsetMm: Math.max(0, Math.min(pathSegment.lengthMm, pathOffsetMm - pathSegment.pathStartMm)),
    lengthMm: pathSegment.lengthMm
  };
}

function mapRangeToReplacementSegments(
  pathSegments: RecessReplacementPathSegment[],
  startPathOffsetMm: number,
  endPathOffsetMm: number
): Array<{ segment: LayoutSegment; startOffsetMm: number; endOffsetMm: number; lengthMm: number }> {
  const rangeStartMm = Math.min(startPathOffsetMm, endPathOffsetMm);
  const rangeEndMm = Math.max(startPathOffsetMm, endPathOffsetMm);
  const mappedRanges: Array<{ segment: LayoutSegment; startOffsetMm: number; endOffsetMm: number; lengthMm: number }> = [];

  for (const pathSegment of pathSegments) {
    const overlapStartMm = Math.max(rangeStartMm, pathSegment.pathStartMm);
    const overlapEndMm = Math.min(rangeEndMm, pathSegment.pathEndMm);
    if (overlapEndMm - overlapStartMm <= 0.001) {
      continue;
    }
    mappedRanges.push({
      segment: pathSegment.segment,
      startOffsetMm: Math.max(0, overlapStartMm - pathSegment.pathStartMm),
      endOffsetMm: Math.min(pathSegment.lengthMm, overlapEndMm - pathSegment.pathStartMm),
      lengthMm: pathSegment.lengthMm
    });
  }

  return mappedRanges;
}

function resolveNearestGateStartOffsetMm(
  previous: GatePlacement[],
  target: GatePlacement,
  proposedStartOffsetMm: number,
  segmentLengthMm: number,
  blockedOpenings: readonly SegmentOpeningSpan[] = []
): number | null {
  const widthMm = target.endOffsetMm - target.startOffsetMm;
  if (widthMm < DRAW_INCREMENT_MM) {
    return null;
  }

  const minStartMm = MIN_SEGMENT_MM;
  const maxStartMm = Math.max(MIN_SEGMENT_MM, segmentLengthMm - MIN_SEGMENT_MM - widthMm);
  if (maxStartMm < minStartMm) {
    return null;
  }

  const forbiddenIntervals = [
    ...previous
      .filter((placement) => placement.segmentId === target.segmentId && placement.id !== target.id)
      .map((placement) => ({
        startMm: placement.startOffsetMm - widthMm,
        endMm: placement.endOffsetMm
      })),
    ...blockedOpenings.map((opening) => ({
      startMm: opening.startOffsetMm - widthMm,
      endMm: opening.endOffsetMm
    }))
  ]
    .map((interval) => ({
      startMm: Math.max(minStartMm, interval.startMm),
      endMm: Math.min(maxStartMm, interval.endMm)
    }))
    .filter((interval) => interval.endMm >= interval.startMm)
    .sort((left, right) => left.startMm - right.startMm);

  const roundedProposalMm = Math.round(proposedStartOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  let bestStartMm: number | null = null;
  let bestDistanceMm = Number.POSITIVE_INFINITY;
  let cursorMm = minStartMm;

  function considerInterval(intervalStartMm: number, intervalEndMm: number): void {
    if (intervalEndMm < intervalStartMm) {
      return;
    }
    const candidateStartMm = Math.max(intervalStartMm, Math.min(intervalEndMm, roundedProposalMm));
    const distanceFromProposalMm = Math.abs(candidateStartMm - roundedProposalMm);
    if (
      distanceFromProposalMm < bestDistanceMm ||
      (Math.abs(distanceFromProposalMm - bestDistanceMm) <= 0.001 && (bestStartMm === null || candidateStartMm < bestStartMm))
    ) {
      bestStartMm = candidateStartMm;
      bestDistanceMm = distanceFromProposalMm;
    }
  }

  for (const interval of forbiddenIntervals) {
    considerInterval(cursorMm, Math.min(maxStartMm, interval.startMm));
    cursorMm = Math.max(cursorMm, interval.endMm);
  }
  considerInterval(cursorMm, maxStartMm);

  return bestStartMm;
}

function resolveNearestBasketballPostOffsetMm(
  previous: BasketballPostPlacement[],
  target: BasketballPostPlacement,
  proposedOffsetMm: number,
  segmentLengthMm: number,
  blockedOpenings: readonly SegmentOpeningSpan[] = []
): number {
  const clampedProposalMm = Math.max(0, Math.min(segmentLengthMm, proposedOffsetMm));
  const roundedProposalMm = Math.round(clampedProposalMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  const occupiedOffsets = new Set(
    previous
      .filter((placement) => placement.segmentId === target.segmentId && placement.id !== target.id)
      .map((placement) => Math.round(placement.offsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM)
  );

  if (
    !occupiedOffsets.has(roundedProposalMm) &&
    !isOffsetWithinSegmentOpenings(roundedProposalMm, blockedOpenings)
  ) {
    return roundedProposalMm;
  }

  const direction = Math.sign(proposedOffsetMm - target.offsetMm);
  const maxSteps = Math.ceil(segmentLengthMm / DRAW_INCREMENT_MM);
  for (let step = 1; step <= maxSteps; step += 1) {
    const lowerCandidateMm = roundedProposalMm - step * DRAW_INCREMENT_MM;
    const upperCandidateMm = roundedProposalMm + step * DRAW_INCREMENT_MM;
    const orderedCandidates =
      direction >= 0
        ? [upperCandidateMm, lowerCandidateMm]
        : [lowerCandidateMm, upperCandidateMm];

    for (const candidateMm of orderedCandidates) {
      if (candidateMm < 0 || candidateMm > segmentLengthMm) {
        continue;
      }
      if (occupiedOffsets.has(candidateMm) || isOffsetWithinSegmentOpenings(candidateMm, blockedOpenings)) {
        continue;
      }
      return candidateMm;
    }
  }

  return Math.round(target.offsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
}

function resolveNearestFloodlightColumnOffsetMm(
  previous: FloodlightColumnPlacement[],
  target: FloodlightColumnPlacement,
  proposedOffsetMm: number,
  segmentLengthMm: number,
  blockedOpenings: readonly SegmentOpeningSpan[] = []
): number {
  const clampedProposalMm = Math.max(0, Math.min(segmentLengthMm, proposedOffsetMm));
  const roundedProposalMm = Math.round(clampedProposalMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  const occupiedOffsets = new Set(
    previous
      .filter((placement) => placement.segmentId === target.segmentId && placement.id !== target.id)
      .map((placement) => Math.round(placement.offsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM)
  );

  if (
    !occupiedOffsets.has(roundedProposalMm) &&
    !isOffsetWithinSegmentOpenings(roundedProposalMm, blockedOpenings)
  ) {
    return roundedProposalMm;
  }

  const direction = Math.sign(proposedOffsetMm - target.offsetMm);
  const maxSteps = Math.ceil(segmentLengthMm / DRAW_INCREMENT_MM);
  for (let step = 1; step <= maxSteps; step += 1) {
    const lowerCandidateMm = roundedProposalMm - step * DRAW_INCREMENT_MM;
    const upperCandidateMm = roundedProposalMm + step * DRAW_INCREMENT_MM;
    const orderedCandidates =
      direction >= 0
        ? [upperCandidateMm, lowerCandidateMm]
        : [lowerCandidateMm, upperCandidateMm];

    for (const candidateMm of orderedCandidates) {
      if (candidateMm < 0 || candidateMm > segmentLengthMm) {
        continue;
      }
      if (occupiedOffsets.has(candidateMm) || isOffsetWithinSegmentOpenings(candidateMm, blockedOpenings)) {
        continue;
      }
      return candidateMm;
    }
  }

  return Math.round(target.offsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
}

export function resizeSegmentCollection(
  previous: LayoutSegment[],
  segmentId: string,
  requestedLengthMm: number,
  connectivity: SegmentConnectivity
): LayoutSegment[] {
  const componentId = connectivity.segmentComponent.get(segmentId);
  if (!componentId) {
    return previous;
  }
  const componentSegmentIds = connectivity.segmentIdsByComponent.get(componentId) ?? [segmentId];
  const componentSegmentIdSet = new Set(componentSegmentIds);
  const isClosedComponent = connectivity.closedComponentIds.has(componentId);
  const segmentById = new Map(previous.map((segment) => [segment.id, segment] as const));
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
        })
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
}

export function offsetSegmentCollection(
  previous: LayoutSegment[],
  segmentId: string,
  dragDelta: PointMm
): LayoutSegment[] {
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
  const normal = { x: -tangent.y, y: tangent.x };
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
      samePointApprox(segment.start, movedStartPoint, 0.1) ||
      samePointApprox(segment.start, movedEndPoint, 0.1);
    const moveEnd =
      samePointApprox(segment.end, movedStartPoint, 0.1) ||
      samePointApprox(segment.end, movedEndPoint, 0.1);
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
}

export function moveGatePlacementCollection(
  previous: GatePlacement[],
  gateId: string,
  deltaAlongMm: number,
  segmentsById: Map<string, LayoutSegment>,
  openingsBySegmentId: ReadonlyMap<string, readonly SegmentOpeningSpan[]> = new Map()
): GatePlacement[] {
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
  const blockedOpenings = openingsBySegmentId.get(target.segmentId) ?? [];
  const nextStartMm = resolveNearestGateStartOffsetMm(
    previous,
    target,
    target.startOffsetMm + deltaAlongMm,
    segmentLengthMm,
    blockedOpenings
  );
  if (nextStartMm === null) {
    return previous;
  }
  const nextEndMm = nextStartMm + widthMm;

  const normalized = clampGatePlacementToSegment(
    {
      ...target,
      startOffsetMm: nextStartMm,
      endOffsetMm: nextEndMm
    },
    segmentLengthMm
  );
  if (!normalized) {
    return previous;
  }
  if (
    doesRangeOverlapSegmentOpenings(
      normalized.startOffsetMm,
      normalized.endOffsetMm,
      blockedOpenings
    )
  ) {
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
}

export function moveGatePlacementCollectionToOffsets(
  previous: GatePlacement[],
  gateId: string,
  nextStartOffsetMm: number,
  nextEndOffsetMm: number,
  segmentsById: Map<string, LayoutSegment>,
  openingsBySegmentId: ReadonlyMap<string, readonly SegmentOpeningSpan[]> = new Map()
): GatePlacement[] {
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
  const proposedCenterOffsetMm = (nextStartOffsetMm + nextEndOffsetMm) / 2;
  const blockedOpenings = openingsBySegmentId.get(target.segmentId) ?? [];
  const clampedStartMm = resolveNearestGateStartOffsetMm(
    previous,
    target,
    proposedCenterOffsetMm - widthMm / 2,
    segmentLengthMm,
    blockedOpenings
  );
  if (clampedStartMm === null) {
    return previous;
  }
  const normalized = clampGatePlacementToSegment(
    {
      ...target,
      startOffsetMm: clampedStartMm,
      endOffsetMm: clampedStartMm + widthMm
    },
    segmentLengthMm
  );
  if (!normalized) {
    return previous;
  }
  if (
    doesRangeOverlapSegmentOpenings(
      normalized.startOffsetMm,
      normalized.endOffsetMm,
      blockedOpenings
    )
  ) {
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
}

export function moveBasketballPostPlacementCollection(
  previous: BasketballPostPlacement[],
  basketballPostId: string,
  deltaAlongMm: number,
  segmentsById: Map<string, LayoutSegment>,
  openingsBySegmentId: ReadonlyMap<string, readonly SegmentOpeningSpan[]> = new Map()
): BasketballPostPlacement[] {
  const target = previous.find((placement) => placement.id === basketballPostId);
  if (!target) {
    return previous;
  }
  const segment = segmentsById.get(target.segmentId);
  if (!segment) {
    return previous;
  }

  const segmentLengthMm = distanceMm(segment.start, segment.end);
  const nextOffsetMm = resolveNearestBasketballPostOffsetMm(
    previous,
    target,
    target.offsetMm + deltaAlongMm,
    segmentLengthMm,
    openingsBySegmentId.get(target.segmentId) ?? []
  );
  if (Math.abs(nextOffsetMm - target.offsetMm) < 0.001) {
    return previous;
  }

  return previous.map((placement) =>
    placement.id === basketballPostId
      ? {
          ...placement,
          offsetMm: nextOffsetMm
        }
      : placement
  );
}

export function moveBasketballPostPlacementCollectionToOffset(
  previous: BasketballPostPlacement[],
  basketballPostId: string,
  nextOffsetMm: number,
  segmentsById: Map<string, LayoutSegment>,
  openingsBySegmentId: ReadonlyMap<string, readonly SegmentOpeningSpan[]> = new Map()
): BasketballPostPlacement[] {
  const target = previous.find((placement) => placement.id === basketballPostId);
  if (!target) {
    return previous;
  }
  const segment = segmentsById.get(target.segmentId);
  if (!segment) {
    return previous;
  }
  const segmentLengthMm = distanceMm(segment.start, segment.end);
  const resolvedOffsetMm = resolveNearestBasketballPostOffsetMm(
    previous,
    target,
    nextOffsetMm,
    segmentLengthMm,
    openingsBySegmentId.get(target.segmentId) ?? []
  );
  if (Math.abs(resolvedOffsetMm - target.offsetMm) < 0.001) {
    return previous;
  }
  return previous.map((placement) =>
    placement.id === basketballPostId
      ? {
          ...placement,
          offsetMm: resolvedOffsetMm
        }
      : placement
  );
}

export function moveFloodlightColumnPlacementCollection(
  previous: FloodlightColumnPlacement[],
  floodlightColumnId: string,
  deltaAlongMm: number,
  segmentsById: Map<string, LayoutSegment>,
  openingsBySegmentId: ReadonlyMap<string, readonly SegmentOpeningSpan[]> = new Map()
): FloodlightColumnPlacement[] {
  const target = previous.find((placement) => placement.id === floodlightColumnId);
  if (!target) {
    return previous;
  }
  const segment = segmentsById.get(target.segmentId);
  if (!segment) {
    return previous;
  }

  const segmentLengthMm = distanceMm(segment.start, segment.end);
  const nextOffsetMm = resolveNearestFloodlightColumnOffsetMm(
    previous,
    target,
    target.offsetMm + deltaAlongMm,
    segmentLengthMm,
    openingsBySegmentId.get(target.segmentId) ?? []
  );
  if (Math.abs(nextOffsetMm - target.offsetMm) < 0.001) {
    return previous;
  }

  return previous.map((placement) =>
    placement.id === floodlightColumnId
      ? {
          ...placement,
          offsetMm: nextOffsetMm
        }
      : placement
  );
}

export function moveFloodlightColumnPlacementCollectionToOffset(
  previous: FloodlightColumnPlacement[],
  floodlightColumnId: string,
  nextOffsetMm: number,
  segmentsById: Map<string, LayoutSegment>,
  openingsBySegmentId: ReadonlyMap<string, readonly SegmentOpeningSpan[]> = new Map()
): FloodlightColumnPlacement[] {
  const target = previous.find((placement) => placement.id === floodlightColumnId);
  if (!target) {
    return previous;
  }
  const segment = segmentsById.get(target.segmentId);
  if (!segment) {
    return previous;
  }
  const segmentLengthMm = distanceMm(segment.start, segment.end);
  const resolvedOffsetMm = resolveNearestFloodlightColumnOffsetMm(
    previous,
    target,
    nextOffsetMm,
    segmentLengthMm,
    openingsBySegmentId.get(target.segmentId) ?? []
  );
  if (Math.abs(resolvedOffsetMm - target.offsetMm) < 0.001) {
    return previous;
  }
  return previous.map((placement) =>
    placement.id === floodlightColumnId
      ? {
          ...placement,
          offsetMm: resolvedOffsetMm
        }
      : placement
  );
}

export function buildRectangleSegments(
  start: PointMm,
  end: PointMm,
  spec: FenceSpec
): LayoutSegment[] {
  const cornerA = quantize(start);
  const cornerB = quantize({ x: end.x, y: start.y });
  const cornerC = quantize(end);
  const cornerD = quantize({ x: start.x, y: end.y });

  return [
    { id: crypto.randomUUID(), start: cornerA, end: cornerB, spec },
    { id: crypto.randomUUID(), start: cornerB, end: cornerC, spec },
    { id: crypto.randomUUID(), start: cornerC, end: cornerD, spec },
    { id: crypto.randomUUID(), start: cornerD, end: cornerA, spec }
  ];
}

export function remapGatePlacementsForRecess(
  previous: GatePlacement[],
  preview: RecessInsertionPreview,
  resolvedGateById: Map<string, ResolvedGatePlacement>,
  replacement: LayoutSegment[] = buildRecessReplacementSegments(preview)
): GatePlacement[] {
  const pathSegments = buildRecessReplacementPath(replacement);
  if (pathSegments.length === 0) {
    return previous;
  }

  const next: GatePlacement[] = [];
  for (const placement of previous) {
    if (placement.segmentId !== preview.segment.id) {
      next.push(placement);
      continue;
    }

    const resolved = resolvedGateById.get(placement.id);
    const sourceStartOffsetMm = resolved?.startOffsetMm ?? placement.startOffsetMm;
    const sourceEndOffsetMm = resolved?.endOffsetMm ?? placement.endOffsetMm;
    const mappedStartPathOffsetMm = mapOffsetToRecessPath(sourceStartOffsetMm, preview);
    const mappedEndPathOffsetMm = mapOffsetToRecessPath(sourceEndOffsetMm, preview);
    const exactPathSegment = pathSegments.find(
      (pathSegment) =>
        mappedStartPathOffsetMm >= pathSegment.pathStartMm - 0.001 &&
        mappedEndPathOffsetMm <= pathSegment.pathEndMm + 0.001
    );

    if (exactPathSegment) {
      const normalized = clampGatePlacementToSegment(
        {
          ...placement,
          segmentId: exactPathSegment.segment.id,
          startOffsetMm: mappedStartPathOffsetMm - exactPathSegment.pathStartMm,
          endOffsetMm: mappedEndPathOffsetMm - exactPathSegment.pathStartMm
        },
        exactPathSegment.lengthMm
      );
      if (normalized) {
        next.push({
          ...placement,
          segmentId: exactPathSegment.segment.id,
          startOffsetMm: normalized.startOffsetMm,
          endOffsetMm: normalized.endOffsetMm
        });
        continue;
      }
    }

    const sourceWidthMm = sourceEndOffsetMm - sourceStartOffsetMm;
    const mappedMidpointPathOffsetMm = mapOffsetToRecessPath((sourceStartOffsetMm + sourceEndOffsetMm) / 2, preview);
    const fallbackSegments = [...pathSegments].sort((left, right) => {
      const leftDistance = distanceToPathSegment(left, mappedMidpointPathOffsetMm);
      const rightDistance = distanceToPathSegment(right, mappedMidpointPathOffsetMm);
      if (Math.abs(leftDistance - rightDistance) > 0.001) {
        return leftDistance - rightDistance;
      }
      return right.lengthMm - left.lengthMm;
    });

    for (const fallbackSegment of fallbackSegments) {
      const midpointOffsetMm = mappedMidpointPathOffsetMm - fallbackSegment.pathStartMm;
      const normalized = clampGatePlacementToSegment(
        {
          ...placement,
          segmentId: fallbackSegment.segment.id,
          startOffsetMm: midpointOffsetMm - sourceWidthMm / 2,
          endOffsetMm: midpointOffsetMm + sourceWidthMm / 2
        },
        fallbackSegment.lengthMm
      );
      if (!normalized) {
        continue;
      }
      next.push({
        ...placement,
        segmentId: fallbackSegment.segment.id,
        startOffsetMm: normalized.startOffsetMm,
        endOffsetMm: normalized.endOffsetMm
      });
      break;
    }
  }

  next.sort((left, right) => left.id.localeCompare(right.id));
  return next;
}

export function remapBasketballPostPlacementsForRecess(
  previous: BasketballPostPlacement[],
  preview: RecessInsertionPreview,
  replacement: LayoutSegment[] = buildRecessReplacementSegments(preview)
): BasketballPostPlacement[] {
  const pathSegments = buildRecessReplacementPath(replacement);
  if (pathSegments.length === 0) {
    return previous;
  }

  const next: BasketballPostPlacement[] = [];
  for (const placement of previous) {
    if (placement.segmentId !== preview.segment.id) {
      next.push(placement);
      continue;
    }

    const mappedPathOffsetMm = mapOffsetToRecessPath(placement.offsetMm, preview);
    const pathSegment = findPathSegmentForOffset(pathSegments, mappedPathOffsetMm);
    if (!pathSegment) {
      continue;
    }

    next.push({
      ...placement,
      segmentId: pathSegment.segment.id,
      offsetMm: Math.max(0, Math.min(pathSegment.lengthMm, mappedPathOffsetMm - pathSegment.pathStartMm))
    });
  }

  next.sort((left, right) => left.id.localeCompare(right.id));
  return next;
}

export function remapFloodlightColumnPlacementsForRecess(
  previous: FloodlightColumnPlacement[],
  preview: RecessInsertionPreview,
  replacement: LayoutSegment[] = buildRecessReplacementSegments(preview)
): FloodlightColumnPlacement[] {
  const pathSegments = buildRecessReplacementPath(replacement);
  if (pathSegments.length === 0) {
    return previous;
  }

  const next: FloodlightColumnPlacement[] = [];
  for (const placement of previous) {
    if (placement.segmentId !== preview.segment.id) {
      next.push(placement);
      continue;
    }

    const mappedPathOffsetMm = mapOffsetToRecessPath(placement.offsetMm, preview);
    const pathSegment = findPathSegmentForOffset(pathSegments, mappedPathOffsetMm);
    if (!pathSegment) {
      continue;
    }

    next.push({
      ...placement,
      segmentId: pathSegment.segment.id,
      offsetMm: Math.max(0, Math.min(pathSegment.lengthMm, mappedPathOffsetMm - pathSegment.pathStartMm))
    });
  }

  next.sort((left, right) => left.id.localeCompare(right.id));
  return next;
}

export function remapGoalUnitPlacementsForRecess(
  previous: GoalUnitPlacement[],
  preview: RecessInsertionPreview,
  replacement: LayoutSegment[] = buildRecessReplacementSegments(preview)
): GoalUnitPlacement[] {
  const pathSegments = buildRecessReplacementPath(replacement);
  if (pathSegments.length === 0) {
    return previous;
  }

  const next: GoalUnitPlacement[] = [];
  for (const placement of previous) {
    if (placement.segmentId !== preview.segment.id) {
      next.push(placement);
      continue;
    }

    const mappedPathOffsetMm = mapOffsetToRecessPath(placement.centerOffsetMm, preview);
    const exactSegment = mapOffsetOntoReplacementSegment(pathSegments, mappedPathOffsetMm);
    const viableSegments = exactSegment
      ? [exactSegment, ...pathSegments
          .filter((pathSegment) => pathSegment.segment.id !== exactSegment.segment.id)
          .map((pathSegment) => ({
            segment: pathSegment.segment,
            offsetMm: pathSegment.lengthMm / 2,
            lengthMm: pathSegment.lengthMm
          }))]
      : pathSegments.map((pathSegment) => ({
          segment: pathSegment.segment,
          offsetMm: pathSegment.lengthMm / 2,
          lengthMm: pathSegment.lengthMm
        }));

    const resolvedSegment = viableSegments.find((candidate) => candidate.lengthMm + 0.001 >= placement.widthMm);
    if (!resolvedSegment) {
      continue;
    }

    const minCenterOffsetMm = placement.widthMm / 2;
    const maxCenterOffsetMm = Math.max(minCenterOffsetMm, resolvedSegment.lengthMm - placement.widthMm / 2);
    next.push({
      ...placement,
      segmentId: resolvedSegment.segment.id,
      centerOffsetMm: Math.max(minCenterOffsetMm, Math.min(maxCenterOffsetMm, resolvedSegment.offsetMm))
    });
  }

  next.sort((left, right) => left.id.localeCompare(right.id));
  return next;
}

export function remapKickboardAttachmentsForRecess(
  previous: KickboardAttachment[],
  preview: RecessInsertionPreview,
  replacement: LayoutSegment[] = buildRecessReplacementSegments(preview)
): KickboardAttachment[] {
  const pathSegments = buildRecessReplacementPath(replacement);
  if (pathSegments.length === 0) {
    return previous;
  }

  const originalSegmentLengthMm = distanceMm(preview.segment.start, preview.segment.end);
  const next: KickboardAttachment[] = [];
  for (const attachment of previous) {
    if (attachment.segmentId !== preview.segment.id) {
      next.push(attachment);
      continue;
    }

    const mappedRanges = mapRangeToReplacementSegments(
      pathSegments,
      mapOffsetToRecessPath(0, preview),
      mapOffsetToRecessPath(originalSegmentLengthMm, preview)
    );
    mappedRanges.forEach((mappedRange, index) => {
      next.push({
        ...attachment,
        id: index === 0 ? attachment.id : crypto.randomUUID(),
        segmentId: mappedRange.segment.id
      });
    });
  }

  next.sort((left, right) => left.id.localeCompare(right.id));
  return next;
}

export function remapPitchDividerPlacementsForRecess(
  previous: PitchDividerPlacement[],
  preview: RecessInsertionPreview,
  replacement: LayoutSegment[] = buildRecessReplacementSegments(preview)
): PitchDividerPlacement[] {
  const pathSegments = buildRecessReplacementPath(replacement);
  if (pathSegments.length === 0) {
    return previous;
  }

  const next = previous.flatMap((placement) => {
    const startAnchor =
      placement.startAnchor.segmentId === preview.segment.id
        ? mapOffsetOntoReplacementSegment(pathSegments, mapOffsetToRecessPath(placement.startAnchor.offsetMm, preview))
        : null;
    const endAnchor =
      placement.endAnchor.segmentId === preview.segment.id
        ? mapOffsetOntoReplacementSegment(pathSegments, mapOffsetToRecessPath(placement.endAnchor.offsetMm, preview))
        : null;

    if (placement.startAnchor.segmentId === preview.segment.id && !startAnchor) {
      return [];
    }
    if (placement.endAnchor.segmentId === preview.segment.id && !endAnchor) {
      return [];
    }

    return [{
      ...placement,
      startAnchor: startAnchor
        ? { segmentId: startAnchor.segment.id, offsetMm: startAnchor.offsetMm }
        : placement.startAnchor,
      endAnchor: endAnchor
        ? { segmentId: endAnchor.segment.id, offsetMm: endAnchor.offsetMm }
        : placement.endAnchor
    }];
  });

  next.sort((left, right) => left.id.localeCompare(right.id));
  return next;
}

export function remapSideNettingAttachmentsForRecess(
  previous: SideNettingAttachment[],
  preview: RecessInsertionPreview,
  replacement: LayoutSegment[] = buildRecessReplacementSegments(preview)
): SideNettingAttachment[] {
  const pathSegments = buildRecessReplacementPath(replacement);
  if (pathSegments.length === 0) {
    return previous;
  }

  const originalSegmentLengthMm = distanceMm(preview.segment.start, preview.segment.end);
  const next: SideNettingAttachment[] = [];
  for (const attachment of previous) {
    if (attachment.segmentId !== preview.segment.id) {
      next.push(attachment);
      continue;
    }

    const sourceStartOffsetMm = attachment.startOffsetMm ?? 0;
    const sourceEndOffsetMm = attachment.endOffsetMm ?? originalSegmentLengthMm;
    const mappedRanges = mapRangeToReplacementSegments(
      pathSegments,
      mapOffsetToRecessPath(sourceStartOffsetMm, preview),
      mapOffsetToRecessPath(sourceEndOffsetMm, preview)
    );

    mappedRanges.forEach((mappedRange, index) => {
      next.push({
        ...attachment,
        id: index === 0 ? attachment.id : crypto.randomUUID(),
        segmentId: mappedRange.segment.id,
        startOffsetMm: mappedRange.startOffsetMm,
        endOffsetMm: mappedRange.endOffsetMm
      });
    });
  }

  next.sort((left, right) => left.id.localeCompare(right.id));
  return next;
}
