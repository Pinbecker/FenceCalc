import type { BasketballPostPlacement, FenceSpec, GatePlacement, LayoutSegment, PointMm } from "@fence-estimator/contracts";
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
  segmentsById: Map<string, LayoutSegment>
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

  let minStartMm = MIN_SEGMENT_MM;
  let maxStartMm = Math.max(MIN_SEGMENT_MM, segmentLengthMm - MIN_SEGMENT_MM - widthMm);
  const peers = previous
    .filter((placement) => placement.segmentId === target.segmentId && placement.id !== gateId)
    .sort((left, right) => left.startOffsetMm - right.startOffsetMm);

  for (const peer of peers) {
    if (peer.endOffsetMm <= target.startOffsetMm) {
      minStartMm = Math.max(minStartMm, peer.endOffsetMm);
      continue;
    }
    if (peer.startOffsetMm >= target.endOffsetMm) {
      maxStartMm = Math.min(maxStartMm, peer.startOffsetMm - widthMm);
      break;
    }
  }

  const unclampedStartMm = target.startOffsetMm + deltaAlongMm;
  let nextStartMm = Math.round(unclampedStartMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  nextStartMm = Math.max(minStartMm, Math.min(maxStartMm, nextStartMm));
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
