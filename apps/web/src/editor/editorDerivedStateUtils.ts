import type { LayoutSegment, PointMm } from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";
import { getSpecConfig } from "@fence-estimator/rules-engine";

import {
  LABEL_FONT_SIZE_PX,
  MIN_SEGMENT_MM,
  SEGMENT_LABEL_OFFSET_PX,
  quantize
} from "./constants";
import { formatLengthMm } from "../formatters";
import { interpolateAlongSegment } from "./gateMath";
import {
  classifyIncidentNode,
  collectInteriorIntersectionOffsetsMm,
  normalizeVector,
  pointCoordinateKey,
  rectanglesOverlap
} from "./editorMath";
import type {
  IncidentNode,
  PostKind,
  ResolvedGatePlacement,
  ScreenRect,
  SegmentLengthLabel,
  VisualPost
} from "./types";

export function buildSegmentMap(segments: LayoutSegment[]): Map<string, LayoutSegment> {
  const map = new Map<string, LayoutSegment>();
  for (const segment of segments) {
    map.set(segment.id, segment);
  }
  return map;
}

export function buildResolvedGateMap(gates: ResolvedGatePlacement[]): Map<string, ResolvedGatePlacement> {
  const map = new Map<string, ResolvedGatePlacement>();
  for (const gate of gates) {
    map.set(gate.id, gate);
  }
  return map;
}

export function buildGatesBySegmentId(gates: ResolvedGatePlacement[]): Map<string, ResolvedGatePlacement[]> {
  const map = new Map<string, ResolvedGatePlacement[]>();
  for (const gate of gates) {
    const bucket = map.get(gate.segmentId);
    if (bucket) {
      bucket.push(gate);
      continue;
    }
    map.set(gate.segmentId, [gate]);
  }
  for (const bucket of map.values()) {
    bucket.sort((left, right) => left.startOffsetMm - right.startOffsetMm);
  }
  return map;
}

export function buildGateNodeHeightByKey(gates: ResolvedGatePlacement[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const gate of gates) {
    const heightMm = getSpecConfig(gate.spec).assembledHeightMm;
    const startKey = pointCoordinateKey(quantize(gate.startPoint));
    const endKey = pointCoordinateKey(quantize(gate.endPoint));
    map.set(startKey, Math.max(heightMm, map.get(startKey) ?? 0));
    map.set(endKey, Math.max(heightMm, map.get(endKey) ?? 0));
  }
  return map;
}

export function buildVisualPosts(
  estimateSegments: LayoutSegment[],
  gateNodeHeightByKey: Map<string, number>,
  replacementNodeKeys: Set<string> = new Set()
): VisualPost[] {
  const postsByCoordinate = new Map<string, VisualPost>();
  const incidentNodes = new Map<string, IncidentNode>();

  function addIncident(point: PointMm, vector: { x: number; y: number }, heightMm: number): void {
    const key = pointCoordinateKey(point);
    const existing = incidentNodes.get(key);
    if (existing) {
      existing.vectors.push(vector);
      existing.maxHeightMm = Math.max(existing.maxHeightMm, heightMm);
      return;
    }
    incidentNodes.set(key, { point, vectors: [vector], maxHeightMm: heightMm });
  }

  for (const segment of estimateSegments) {
    const config = getSpecConfig(segment.spec);
    const segmentLength = distanceMm(segment.start, segment.end);
    const bays = Math.max(1, Math.ceil(segmentLength / config.bayWidthMm));

    addIncident(
      segment.start,
      { x: segment.end.x - segment.start.x, y: segment.end.y - segment.start.y },
      config.assembledHeightMm
    );
    addIncident(
      segment.end,
      { x: segment.start.x - segment.end.x, y: segment.start.y - segment.end.y },
      config.assembledHeightMm
    );

    for (let index = 1; index < bays; index += 1) {
      const offsetMm = config.bayWidthMm * index;
      const point = quantize(interpolateAlongSegment(segment, offsetMm));
      const key = pointCoordinateKey(point);
      const existing = postsByCoordinate.get(key);
      if (existing) {
        existing.heightMm = Math.max(existing.heightMm, config.assembledHeightMm);
        continue;
      }
      postsByCoordinate.set(key, {
        key: `post-${key}`,
        point,
        kind: "INTERMEDIATE",
        heightMm: config.assembledHeightMm
      });
    }
  }

  for (const [coordinateKey, node] of incidentNodes) {
    if (gateNodeHeightByKey.has(coordinateKey) || replacementNodeKeys.has(coordinateKey)) {
      continue;
    }
    postsByCoordinate.set(coordinateKey, {
      key: `post-${coordinateKey}`,
      point: node.point,
      kind: classifyIncidentNode(node.vectors),
      heightMm: node.maxHeightMm
    });
  }

  for (const [coordinateKey, heightMm] of gateNodeHeightByKey) {
    const [xRaw, yRaw] = coordinateKey.split(":");
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    postsByCoordinate.set(coordinateKey, {
      key: `post-gate-${coordinateKey}`,
      point: { x, y },
      kind: "GATE",
      heightMm
    });
  }

  return [...postsByCoordinate.values()];
}

export function buildPostTypeCounts(visualPosts: VisualPost[]): Record<PostKind, number> {
  return visualPosts.reduce<Record<PostKind, number>>(
    (accumulator, post) => {
      accumulator[post.kind] += 1;
      return accumulator;
    },
    {
      END: 0,
      INTERMEDIATE: 0,
      CORNER: 0,
      JUNCTION: 0,
      INLINE_JOIN: 0,
      GATE: 0
    }
  );
}

export function buildSegmentLengthLabelsBySegmentId(
  segments: LayoutSegment[],
  selectedSegmentId: string | null,
  viewScale: number,
  splitOffsetsBySegmentId: Map<string, number[]> = new Map()
): Map<string, SegmentLengthLabel[]> {
  const map = new Map<string, SegmentLengthLabel[]>();

  for (const segment of segments) {
    const segmentLengthMm = distanceMm(segment.start, segment.end);
    if (segmentLengthMm <= MIN_SEGMENT_MM) {
      continue;
    }
    const segmentNormal = normalizeVector({
      x: -(segment.end.y - segment.start.y),
      y: segment.end.x - segment.start.x
    });
    const labelOffsetMm = SEGMENT_LABEL_OFFSET_PX / viewScale;
    const offsets = [
      ...collectInteriorIntersectionOffsetsMm(segment, segments),
      ...(splitOffsetsBySegmentId.get(segment.id) ?? [])
    ]
      .sort((left, right) => left - right)
      .filter((offsetMm, index, values) => index === 0 || Math.abs(offsetMm - values[index - 1]!) > 0.001);
    const boundaries = [0, ...offsets, segmentLengthMm];
    const labels: SegmentLengthLabel[] = [];

    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const startOffsetMm = boundaries[index];
      const endOffsetMm = boundaries[index + 1];
      if (startOffsetMm === undefined || endOffsetMm === undefined) {
        continue;
      }
      const runLengthMm = endOffsetMm - startOffsetMm;
      if (runLengthMm <= MIN_SEGMENT_MM) {
        continue;
      }
      const centerPoint = interpolateAlongSegment(segment, startOffsetMm + runLengthMm / 2);
      const labelPosition = segmentNormal
        ? {
            x: centerPoint.x + segmentNormal.x * labelOffsetMm,
            y: centerPoint.y + segmentNormal.y * labelOffsetMm
          }
        : centerPoint;

      labels.push({
        key: `${segment.id}::${Math.round(startOffsetMm)}-${Math.round(endOffsetMm)}`,
        segmentId: segment.id,
        x: labelPosition.x,
        y: labelPosition.y,
        text: formatLengthMm(runLengthMm),
        lengthMm: runLengthMm,
        isSelected: segment.id === selectedSegmentId
      });
    }

    if (labels.length === 0) {
      const midpoint = {
        x: (segment.start.x + segment.end.x) / 2,
        y: (segment.start.y + segment.end.y) / 2
      };
      const labelPosition = segmentNormal
        ? {
            x: midpoint.x + segmentNormal.x * labelOffsetMm,
            y: midpoint.y + segmentNormal.y * labelOffsetMm
          }
        : midpoint;
      labels.push({
        key: `${segment.id}::full`,
        segmentId: segment.id,
        x: labelPosition.x,
        y: labelPosition.y,
        text: formatLengthMm(segmentLengthMm),
        lengthMm: segmentLengthMm,
        isSelected: segment.id === selectedSegmentId
      });
    }

    map.set(segment.id, labels);
  }

  return map;
}

export function buildVisibleSegmentLabelKeys(
  segmentLengthLabelsBySegmentId: Map<string, SegmentLengthLabel[]>,
  viewScale: number
): Set<string> {
  const allLabels: SegmentLengthLabel[] = [];
  for (const labels of segmentLengthLabelsBySegmentId.values()) {
    allLabels.push(...labels);
  }

  const candidates = allLabels.map((label) => {
    const widthPx = Math.max(34, label.text.length * 7.2 + 6);
    const heightPx = LABEL_FONT_SIZE_PX + 6;
    const centerXpx = label.x * viewScale;
    const centerYpx = label.y * viewScale;
    return {
      ...label,
      rect: {
        left: centerXpx - widthPx / 2,
        top: centerYpx - heightPx / 2,
        right: centerXpx + widthPx / 2,
        bottom: centerYpx + heightPx / 2
      } satisfies ScreenRect
    };
  });

  candidates.sort((left, right) => {
    if (left.isSelected !== right.isSelected) {
      return left.isSelected ? -1 : 1;
    }
    if (left.lengthMm !== right.lengthMm) {
      return right.lengthMm - left.lengthMm;
    }
    return left.key.localeCompare(right.key);
  });

  const acceptedRects: ScreenRect[] = [];
  const visibleKeys = new Set<string>();
  for (const candidate of candidates) {
    const overlaps = acceptedRects.some((rect) => rectanglesOverlap(candidate.rect, rect));
    if (overlaps && !candidate.isSelected) {
      continue;
    }
    acceptedRects.push(candidate.rect);
    visibleKeys.add(candidate.key);
  }
  return visibleKeys;
}
