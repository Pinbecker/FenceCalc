import type {
  BasketballPostPlacement,
  FloodlightColumnPlacement,
  GatePlacement,
  InlineFeatureFacing,
  LayoutSegment,
  PointMm
} from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";
import { getSegmentIntermediatePostOffsets } from "@fence-estimator/rules-engine";

import { MIN_SEGMENT_MM, quantize } from "./constants.js";
import {
  clampGatePlacementToSegment,
  classifyIncidentNode,
  normalizeVector,
  pointCoordinateKey,
  resolveGatePreviewLeafCount
} from "./editorMath.js";
import { interpolateAlongSegment } from "./gateMath.js";
import type {
  ResolvedBasketballPostPlacement,
  ResolvedFloodlightColumnPlacement,
  ResolvedGatePlacement,
  SegmentConnectivity
} from "./types.js";

export function buildSegmentConnectivity(segments: LayoutSegment[]): SegmentConnectivity {
  const segmentComponent = new Map<string, string>();
  const segmentIdsByComponent = new Map<string, string[]>();
  const movableComponentIds = new Set<string>();
  const closedComponentIds = new Set<string>();
  const nodeDegreeByKey = new Map<string, number>();
  const segmentById = new Map<string, LayoutSegment>();
  const segmentIdsByNode = new Map<string, string[]>();

  function addNodeSegment(nodeKey: string, segmentId: string): void {
    const bucket = segmentIdsByNode.get(nodeKey);
    if (bucket) {
      bucket.push(segmentId);
      return;
    }
    segmentIdsByNode.set(nodeKey, [segmentId]);
  }

  for (const segment of segments) {
    segmentById.set(segment.id, segment);
    addNodeSegment(pointCoordinateKey(segment.start), segment.id);
    addNodeSegment(pointCoordinateKey(segment.end), segment.id);
  }

  for (const [nodeKey, segmentIds] of segmentIdsByNode) {
    nodeDegreeByKey.set(nodeKey, segmentIds.length);
  }

  const visited = new Set<string>();
  let componentIndex = 0;

  for (const segment of segments) {
    if (visited.has(segment.id)) {
      continue;
    }
    const componentId = `component-${componentIndex}`;
    componentIndex += 1;
    const queue: string[] = [segment.id];
    const componentSegmentIds: string[] = [];
    const componentNodeKeys = new Set<string>();
    visited.add(segment.id);

    while (queue.length > 0) {
      const currentSegmentId = queue.shift();
      if (!currentSegmentId) {
        break;
      }
      const currentSegment = segmentById.get(currentSegmentId);
      if (!currentSegment) {
        continue;
      }

      componentSegmentIds.push(currentSegmentId);
      segmentComponent.set(currentSegmentId, componentId);

      const nodeKeys = [
        pointCoordinateKey(currentSegment.start),
        pointCoordinateKey(currentSegment.end)
      ];
      for (const nodeKey of nodeKeys) {
        componentNodeKeys.add(nodeKey);
        const neighborSegmentIds = segmentIdsByNode.get(nodeKey) ?? [];
        for (const neighborSegmentId of neighborSegmentIds) {
          if (visited.has(neighborSegmentId)) {
            continue;
          }
          visited.add(neighborSegmentId);
          queue.push(neighborSegmentId);
        }
      }
    }

    segmentIdsByComponent.set(componentId, componentSegmentIds);
    const isClosed =
      componentSegmentIds.length >= 3 &&
      [...componentNodeKeys].every((nodeKey) => (nodeDegreeByKey.get(nodeKey) ?? 0) === 2);
    if (isClosed) {
      closedComponentIds.add(componentId);
    }
    const onlyOneSegment = componentSegmentIds.length === 1;
    const firstSegment = onlyOneSegment ? segmentById.get(componentSegmentIds[0] ?? "") : undefined;
    const firstNodeDegree = firstSegment ? nodeDegreeByKey.get(pointCoordinateKey(firstSegment.start)) ?? 0 : 0;
    const secondNodeDegree = firstSegment ? nodeDegreeByKey.get(pointCoordinateKey(firstSegment.end)) ?? 0 : 0;
    const isMovable = isClosed || (onlyOneSegment && firstNodeDegree === 1 && secondNodeDegree === 1);
    if (isMovable) {
      movableComponentIds.add(componentId);
    }
  }

  return {
    segmentComponent,
    segmentIdsByComponent,
    movableComponentIds,
    closedComponentIds,
    nodeDegreeByKey
  };
}

export function resolveGatePlacements(
  segmentsById: Map<string, LayoutSegment>,
  gatePlacements: GatePlacement[],
): ResolvedGatePlacement[] {
  const sorted = [...gatePlacements].sort((left, right) => left.id.localeCompare(right.id));
  const resolved: ResolvedGatePlacement[] = [];

  for (const placement of sorted) {
    const segment = segmentsById.get(placement.segmentId);
    if (!segment) {
      continue;
    }
    const segmentLengthMm = distanceMm(segment.start, segment.end);
    const clamped = clampGatePlacementToSegment(placement, segmentLengthMm);
    if (!clamped) {
      continue;
    }
    const entryPoint = interpolateAlongSegment(segment, clamped.startOffsetMm);
    const exitPoint = interpolateAlongSegment(segment, clamped.endOffsetMm);
    const tangent = normalizeVector({
      x: exitPoint.x - entryPoint.x,
      y: exitPoint.y - entryPoint.y
    });
    if (!tangent) {
      continue;
    }
    const widthMm = clamped.endOffsetMm - clamped.startOffsetMm;
    resolved.push({
      id: placement.id,
      segmentId: placement.segmentId,
      startOffsetMm: clamped.startOffsetMm,
      endOffsetMm: clamped.endOffsetMm,
      gateType: placement.gateType,
      key: placement.id,
      startPoint: entryPoint,
      endPoint: exitPoint,
      centerPoint: {
        x: (entryPoint.x + exitPoint.x) / 2,
        y: (entryPoint.y + exitPoint.y) / 2
      },
      widthMm,
      tangent,
      normal: { x: -tangent.y, y: tangent.x },
      leafCount: resolveGatePreviewLeafCount(placement.gateType, widthMm),
      spec: segment.spec
    });
  }

  return resolved;
}

export function resolveBasketballPostPlacements(
  segmentsById: Map<string, LayoutSegment>,
  basketballPostPlacements: BasketballPostPlacement[],
): ResolvedBasketballPostPlacement[] {
  const sorted = [...basketballPostPlacements].sort((left, right) => left.id.localeCompare(right.id));
  const resolved: ResolvedBasketballPostPlacement[] = [];

  for (const placement of sorted) {
    const segment = segmentsById.get(placement.segmentId);
    if (!segment) {
      continue;
    }
    const segmentLengthMm = distanceMm(segment.start, segment.end);
    if (segmentLengthMm <= 0) {
      continue;
    }
    const tangent = normalizeVector({
      x: segment.end.x - segment.start.x,
      y: segment.end.y - segment.start.y
    });
    if (!tangent) {
      continue;
    }
    const validOffsetsMm = getSegmentIntermediatePostOffsets(segment);
    const offsetMm = validOffsetsMm.find((candidateOffsetMm) => Math.abs(candidateOffsetMm - placement.offsetMm) <= 25);
    if (offsetMm === undefined) {
      continue;
    }
    const point = interpolateAlongSegment(segment, offsetMm);
    const leftNormal = { x: -tangent.y, y: tangent.x };
    const normal =
      placement.facing === "RIGHT"
        ? { x: -leftNormal.x, y: -leftNormal.y }
        : leftNormal;
    const type = placement.type ?? "DEDICATED_POST";
    const mountingMode = placement.mountingMode ?? "PROJECTING_ARM";

    resolved.push({
      id: placement.id,
      segmentId: placement.segmentId,
      offsetMm,
      key: placement.id,
      point,
      tangent,
      normal,
      facing: placement.facing,
      type,
      mountingMode,
      armLengthMm: placement.armLengthMm ?? (type === "DEDICATED_POST" ? 1800 : null),
      pairedFeatureId: placement.pairedFeatureId ?? null,
      replacesIntermediatePost: type === "DEDICATED_POST" && (placement.replacesIntermediatePost ?? true),
      hostPostIndex: validOffsetsMm.findIndex((candidateOffsetMm) => candidateOffsetMm === offsetMm) + 1 || null,
      spec: segment.spec,
      placement: {
        ...placement,
        offsetMm
      }
    });
  }

  return resolved;
}

function resolveFloodlightColumnFacingNormal(
  tangent: { x: number; y: number },
  facing: InlineFeatureFacing
): { x: number; y: number } {
  const leftNormal = { x: -tangent.y, y: tangent.x };
  return facing === "RIGHT"
    ? { x: -leftNormal.x, y: -leftNormal.y }
    : leftNormal;
}

function collectIncidentVectors(point: PointMm, segments: LayoutSegment[]): Array<{ x: number; y: number }> {
  const vectors: Array<{ x: number; y: number }> = [];

  for (const segment of segments) {
    if (pointCoordinateKey(segment.start) === pointCoordinateKey(point)) {
      const vector = normalizeVector({
        x: segment.end.x - segment.start.x,
        y: segment.end.y - segment.start.y
      });
      if (vector) {
        vectors.push(vector);
      }
    }
    if (pointCoordinateKey(segment.end) === pointCoordinateKey(point)) {
      const vector = normalizeVector({
        x: segment.start.x - segment.end.x,
        y: segment.start.y - segment.end.y
      });
      if (vector) {
        vectors.push(vector);
      }
    }
  }

  return vectors;
}

function resolveCornerBisector(point: PointMm, segments: LayoutSegment[]): { x: number; y: number } | null {
  const vectors = collectIncidentVectors(point, segments);
  if (classifyIncidentNode(vectors) !== "CORNER") {
    return null;
  }

  const sum = vectors.reduce(
    (accumulator, vector) => ({
      x: accumulator.x + vector.x,
      y: accumulator.y + vector.y
    }),
    { x: 0, y: 0 }
  );

  return normalizeVector(sum);
}

export function resolveFloodlightColumnNormal(
  segment: LayoutSegment,
  segmentLengthMm: number,
  offsetMm: number,
  facing: InlineFeatureFacing,
  segments: LayoutSegment[]
): { x: number; y: number } | null {
  const tangent = normalizeVector({
    x: segment.end.x - segment.start.x,
    y: segment.end.y - segment.start.y
  });
  if (!tangent) {
    return null;
  }

  const epsilon = 0.001;
  if (Math.abs(offsetMm) <= epsilon) {
    return resolveCornerBisector(segment.start, segments) ?? resolveFloodlightColumnFacingNormal(tangent, facing);
  }
  if (Math.abs(segmentLengthMm - offsetMm) <= epsilon) {
    return resolveCornerBisector(segment.end, segments) ?? resolveFloodlightColumnFacingNormal(tangent, facing);
  }

  return resolveFloodlightColumnFacingNormal(tangent, facing);
}

export function resolveFloodlightColumnPlacements(
  segmentsById: Map<string, LayoutSegment>,
  floodlightColumnPlacements: FloodlightColumnPlacement[],
): ResolvedFloodlightColumnPlacement[] {
  const sorted = [...floodlightColumnPlacements].sort((left, right) => left.id.localeCompare(right.id));
  const resolved: ResolvedFloodlightColumnPlacement[] = [];
  const segments = [...segmentsById.values()];

  for (const placement of sorted) {
    const segment = segmentsById.get(placement.segmentId);
    if (!segment) {
      continue;
    }
    const segmentLengthMm = distanceMm(segment.start, segment.end);
    if (segmentLengthMm <= 0) {
      continue;
    }
    const tangent = normalizeVector({
      x: segment.end.x - segment.start.x,
      y: segment.end.y - segment.start.y
    });
    if (!tangent) {
      continue;
    }
    const offsetMm = Math.max(0, Math.min(segmentLengthMm, placement.offsetMm));
    const point = interpolateAlongSegment(segment, offsetMm);
    const normal = resolveFloodlightColumnNormal(segment, segmentLengthMm, offsetMm, placement.facing, segments);
    if (!normal) {
      continue;
    }

    resolved.push({
      id: placement.id,
      segmentId: placement.segmentId,
      offsetMm,
      key: placement.id,
      point,
      tangent,
      normal,
      facing: placement.facing,
      spec: segment.spec,
      placement: {
        ...placement,
        offsetMm
      }
    });
  }

  return resolved;
}

export function buildSegmentRuns(segment: LayoutSegment, gateSpans: ResolvedGatePlacement[]): Array<{ start: PointMm; end: PointMm }> {
  const segmentLengthMm = distanceMm(segment.start, segment.end);
  if (segmentLengthMm <= 0) {
    return [];
  }
  if (gateSpans.length === 0) {
    return [{ start: segment.start, end: segment.end }];
  }

  const sortedGates = [...gateSpans].sort((left, right) => left.startOffsetMm - right.startOffsetMm);
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

export function buildEstimateSegments(segments: LayoutSegment[], gatesBySegmentId: Map<string, ResolvedGatePlacement[]>): LayoutSegment[] {
  const derived: LayoutSegment[] = [];

  for (const segment of segments) {
    const gateSpans = gatesBySegmentId.get(segment.id) ?? [];
    const runs = buildSegmentRuns(segment, gateSpans);
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
