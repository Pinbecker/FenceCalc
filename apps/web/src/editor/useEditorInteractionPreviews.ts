import { useCallback, useMemo } from "react";
import type {
  BasketballArmLengthMm,
  GateType,
  GoalUnitHeightMm,
  GoalUnitWidthMm,
  InlineFeatureFacing,
  LayoutSegment,
  PointMm
} from "@fence-estimator/contracts";
import { distanceMm, snapPointToAngle } from "@fence-estimator/geometry";
import { PITCH_DIVIDER_MAX_SPAN_MM, PITCH_DIVIDER_SUPPORT_INTERVAL_MM } from "@fence-estimator/contracts";
import { getSegmentPostOffsets } from "@fence-estimator/rules-engine";

import {
  AXIS_GUIDE_SNAP_PX,
  DRAW_INCREMENT_MM,
  DRAW_LINE_SNAP_PX,
  GATE_POINTER_SNAP_PX,
  NODE_SNAP_DISTANCE_PX,
  RECESS_POINTER_SNAP_PX,
  quantize
} from "./constants";
import {
  clampSegmentEndToBlockingIntersection,
  classifyIncidentNode,
  dot,
  findNearestNode,
  normalizeVector,
  pointCoordinateKey,
  resolveGatePreviewLeafCount,
  snapToAxisGuide
} from "./editorMath";
import {
  buildGatePreview,
  findNearestSegmentSnap,
  interpolateAlongSegment,
  projectPointOntoSegment,
  resolveGateWidthMm
} from "./gateMath";
import {
  buildRecessPreview,
  recessAnchorSnapWindowMm,
  recessFractionSnapWindowMm,
  recessMidpointSnapWindowMm,
  recessSnapTargetsMm,
  snapOffsetToAnchorAlongSegment
} from "./recess";
import { resolveFloodlightColumnNormal } from "./segmentTopology";
import type {
  BasketballPostInsertionPreview,
  DrawNodeSnapPreview,
  DrawResolveResult,
  FloodlightColumnInsertionPreview,
  GateVisual,
  GoalUnitInsertionPreview,
  InteractionMode,
  LineSnapPreview,
  PitchDividerAnchorPreview,
  PitchDividerSpanPreview,
  PreviewSnapMeta,
  RecessAlignmentAnchor,
  RecessInsertionPreview,
  RecessSide,
  RecessSidePreference,
  ResolvedBasketballPostPlacement,
  ResolvedFloodlightColumnPlacement,
  ResolvedGatePlacement,
  SegmentAttachmentPreview,
  SegmentRangePreview
} from "./types";

interface EditorInteractionPreviewsOptions {
  segments: LayoutSegment[];
  lineSnapSegments?: LayoutSegment[];
  interactionMode: InteractionMode;
  pointerWorld: PointMm | null;
  drawStart: PointMm | null;
  rectangleStart: PointMm | null;
  drawAnchorNodes: PointMm[];
  disableSnap: boolean;
  viewScale: number;
  recessAlignmentAnchors: RecessAlignmentAnchor[];
  recessWidthMm: number;
  recessDepthMm: number;
  recessSide: RecessSidePreference;
  goalUnitWidthMm?: GoalUnitWidthMm;
  goalUnitDepthMm?: number;
  goalUnitHeightMm?: GoalUnitHeightMm;
  gateType: GateType;
  customGateWidthMm: number;
  basketballPlacementType?: "DEDICATED_POST" | "MOUNTED_TO_EXISTING_POST";
  basketballArmLengthMm?: BasketballArmLengthMm;
  placedGateVisuals: ResolvedGatePlacement[];
  placedBasketballPostVisuals: ResolvedBasketballPostPlacement[];
  placedFloodlightColumnVisuals?: ResolvedFloodlightColumnPlacement[];
  placedGoalUnitVisuals?: Array<{
    segmentId: string;
    entryPoint: PointMm;
    exitPoint: PointMm;
    tangent: { x: number; y: number };
  }>;
  drawChainStart: PointMm | null;
  pendingPitchDividerStart?: PitchDividerAnchorPreview | null;
  pendingSideNettingStart?: PitchDividerAnchorPreview | null;
  activeGateDragId?: string | null;
  activeBasketballPostDragId?: string | null;
  activeFloodlightColumnDragId?: string | null;
}

function buildSnapMeta(kind: PreviewSnapMeta["kind"], label: string): PreviewSnapMeta {
  return { kind, label };
}

function getFenceHeightMm(segment: LayoutSegment): number {
  switch (segment.spec.height) {
    case "1.2m":
      return 1200;
    case "1.8m":
      return 1800;
    case "2m":
      return 2000;
    case "2.4m":
      return 2400;
    case "3m":
      return 3000;
    case "4m":
      return 4000;
    case "4.5m":
      return 4500;
    case "5m":
      return 5000;
    case "6m":
      return 6000;
    default:
      return 0;
  }
}

function findNearestPreDrawHoverSnap(
  point: PointMm,
  segments: LayoutSegment[],
  maxDistanceMm: number
): LineSnapPreview | null {
  const nearestLine = findNearestSegmentSnap(point, segments, maxDistanceMm);
  if (!nearestLine) {
    return null;
  }

  const segmentLengthMm = distanceMm(nearestLine.segment.start, nearestLine.segment.end);
  if (segmentLengthMm <= 0) {
    return {
      ...nearestLine,
      snapMeta: buildSnapMeta("SEGMENT", "Fence line")
    };
  }

  const midpointMm = Math.max(
    0,
    Math.min(segmentLengthMm, Math.round((segmentLengthMm / 2) / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM)
  );
  const projection = projectPointOntoSegment(point, nearestLine.segment);
  const midpointWindowMm = Math.max(300, Math.min(900, segmentLengthMm * 0.1));
  if (Math.abs(projection.offsetMm - midpointMm) <= midpointWindowMm) {
    const midpointPoint = interpolateAlongSegment(nearestLine.segment, midpointMm);
    const midpointDistanceMm = distanceMm(point, midpointPoint);
    if (midpointDistanceMm <= maxDistanceMm) {
      return {
        segment: nearestLine.segment,
        point: midpointPoint,
        startOffsetMm: midpointMm,
        endOffsetMm: Math.max(0, segmentLengthMm - midpointMm),
        distanceMm: midpointDistanceMm,
        snapMeta: buildSnapMeta("CENTERED", "Centered")
      };
    }
  }

  return {
    ...nearestLine,
    snapMeta: buildSnapMeta("SEGMENT", "Fence line")
  };
}

function findNearestProjectedSegment(
  point: PointMm,
  segments: LayoutSegment[],
  maxDistanceMm: number,
  predicate?: (segment: LayoutSegment) => boolean
): {
  segment: LayoutSegment;
  offsetMm: number;
  distanceMm: number;
  signedDistanceMm: number;
} | null {
  let best:
    | {
        segment: LayoutSegment;
        offsetMm: number;
        distanceMm: number;
        signedDistanceMm: number;
      }
    | null = null;

  for (const segment of segments) {
    if (predicate && !predicate(segment)) {
      continue;
    }
    const projection = projectPointOntoSegment(point, segment);
    if (projection.distanceMm > maxDistanceMm) {
      continue;
    }
    if (!best || projection.distanceMm < best.distanceMm) {
      best = {
        segment,
        offsetMm: projection.offsetMm,
        distanceMm: projection.distanceMm,
        signedDistanceMm: projection.signedDistanceMm
      };
    }
  }

  return best;
}

function findNearestSegmentPostOffsetMm(segment: LayoutSegment, targetOffsetMm: number): number | null {
  const postOffsetsMm = getSegmentPostOffsets(segment);
  let bestOffsetMm: number | null = null;
  let bestDeltaMm = Number.POSITIVE_INFINITY;

  for (const offsetMm of postOffsetsMm) {
    const deltaMm = Math.abs(offsetMm - targetOffsetMm);
    if (deltaMm < bestDeltaMm) {
      bestDeltaMm = deltaMm;
      bestOffsetMm = offsetMm;
    }
  }

  return bestOffsetMm;
}

export function useEditorInteractionPreviews({
  segments,
  lineSnapSegments = [],
  interactionMode,
  pointerWorld,
  drawStart,
  rectangleStart,
  drawAnchorNodes,
  disableSnap,
  viewScale,
  recessAlignmentAnchors,
  recessWidthMm,
  recessDepthMm,
  recessSide,
  goalUnitWidthMm = 3000,
  goalUnitDepthMm = 1200,
  goalUnitHeightMm = 3000,
  gateType,
  customGateWidthMm,
  basketballPlacementType = "DEDICATED_POST",
  basketballArmLengthMm: _basketballArmLengthMm,
  placedGateVisuals,
  placedBasketballPostVisuals,
  placedFloodlightColumnVisuals = [],
  placedGoalUnitVisuals = [],
  drawChainStart,
  pendingPitchDividerStart = null,
  pendingSideNettingStart = null,
  activeGateDragId = null,
  activeBasketballPostDragId = null,
  activeFloodlightColumnDragId = null
}: EditorInteractionPreviewsOptions) {
  const drawSegments = lineSnapSegments.length > 0 ? lineSnapSegments : segments;
  const nodeSnapDistanceMm = Math.min(600, NODE_SNAP_DISTANCE_PX / viewScale);
  const axisGuideSnapDistanceMm = Math.min(600, AXIS_GUIDE_SNAP_PX / viewScale);
  const drawLineSnapDistanceMm = Math.min(900, DRAW_LINE_SNAP_PX / viewScale);
  const recessPointerSnapMm = Math.max(500, RECESS_POINTER_SNAP_PX / viewScale);
  const gatePointerSnapMm = Math.max(500, GATE_POINTER_SNAP_PX / viewScale);
  const basketballPostPointerSnapMm = Math.max(650, 48 / viewScale);
  const floodlightColumnPointerSnapMm = Math.max(650, 48 / viewScale);
  const hoverSegmentSnapMm = Math.max(180, 16 / viewScale);
  const hoverGateSnapMm = Math.max(180, 22 / viewScale);
  const pitchDividerPointerSnapMm = Math.max(650, 42 / viewScale);
  const requestedGateWidthMm = useMemo(
    () => resolveGateWidthMm(gateType, customGateWidthMm),
    [customGateWidthMm, gateType]
  );

  const buildSnappedGatePreview = useCallback(
    (
      segment: LayoutSegment,
      baseOffsetMm: number,
      gateWidthMm: number,
      excludedGateId: string | null = null
    ): ReturnType<typeof buildGatePreview> => {
      const segmentLengthMm = distanceMm(segment.start, segment.end);
      const midpointMm = segmentLengthMm / 2;
      const midpointWindowMm = recessMidpointSnapWindowMm(segmentLengthMm);
      const anchorWindowMm = recessAnchorSnapWindowMm(segmentLengthMm);
      let snappedOffsetMm = baseOffsetMm;
      let bestSnapDistanceMm = Number.POSITIVE_INFINITY;
      let snapMeta = buildSnapMeta("FREE", "Free placement");
      let selectedAnchorPoint: PointMm | null = null;

      const midpointDistanceMm = Math.abs(baseOffsetMm - midpointMm);
      if (midpointDistanceMm <= midpointWindowMm && midpointDistanceMm < bestSnapDistanceMm) {
        snappedOffsetMm = midpointMm;
        bestSnapDistanceMm = midpointDistanceMm;
        snapMeta = buildSnapMeta("CENTERED", "Centered");
      }

      const segmentTangent = normalizeVector({
        x: segment.end.x - segment.start.x,
        y: segment.end.y - segment.start.y
      });
      const gateAlignmentAnchors = !segmentTangent
        ? []
        : placedGateVisuals
            .filter(
              (gate) =>
                gate.id !== excludedGateId &&
                gate.segmentId !== segment.id &&
                Math.abs(dot(segmentTangent, gate.tangent)) >= 0.9
            )
            .map((gate) => gate.centerPoint);
      const anchorSnapResult = snapOffsetToAnchorAlongSegment(segment, baseOffsetMm, gateAlignmentAnchors, anchorWindowMm);
      const anchorSnapDistanceMm = Math.abs(anchorSnapResult.offsetMm - baseOffsetMm);
      if (
        anchorSnapResult.anchorPoint &&
        anchorSnapDistanceMm <= anchorWindowMm &&
        anchorSnapDistanceMm < bestSnapDistanceMm
      ) {
        snappedOffsetMm = anchorSnapResult.offsetMm;
        selectedAnchorPoint = anchorSnapResult.anchorPoint;
        snapMeta = buildSnapMeta("ALIGNMENT", "Aligned gate");
      }

      snappedOffsetMm = Math.max(
        0,
        Math.min(segmentLengthMm, Math.round(snappedOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM)
      );

      const preview = buildGatePreview(segment, snappedOffsetMm, gateWidthMm);
      if (!preview) {
        return null;
      }
      const previewWithSnap = {
        ...preview,
        snapMeta
      };
      if (!selectedAnchorPoint) {
        return previewWithSnap;
      }
      return {
        ...previewWithSnap,
        alignmentGuide: {
          anchorPoint: selectedAnchorPoint,
          targetPoint: preview.targetPoint
        }
      };
    },
    [placedGateVisuals]
  );

  const buildSnappedBasketballPostPreview = useCallback(
    (
      segment: LayoutSegment,
      baseOffsetMm: number,
      signedDistanceMm: number,
      excludedBasketballPostId: string | null = null,
      facingOverride: InlineFeatureFacing | null = null
    ): BasketballPostInsertionPreview | null => {
      const segmentLengthMm = distanceMm(segment.start, segment.end);
      const midpointMm = segmentLengthMm / 2;
      const midpointWindowMm = recessMidpointSnapWindowMm(segmentLengthMm);
      const anchorWindowMm = recessAnchorSnapWindowMm(segmentLengthMm);
      let snappedOffsetMm = baseOffsetMm;
      let bestSnapDistanceMm = Number.POSITIVE_INFINITY;
      let snapMeta = buildSnapMeta("FREE", "Free placement");
      let selectedAnchorPoint: PointMm | null = null;

      const midpointDistanceMm = Math.abs(baseOffsetMm - midpointMm);
      if (midpointDistanceMm <= midpointWindowMm && midpointDistanceMm < bestSnapDistanceMm) {
        snappedOffsetMm = midpointMm;
        bestSnapDistanceMm = midpointDistanceMm;
        snapMeta = buildSnapMeta("CENTERED", "Centered");
      }

      const segmentTangent = normalizeVector({
        x: segment.end.x - segment.start.x,
        y: segment.end.y - segment.start.y
      });
      const alignmentAnchors = !segmentTangent
        ? []
        : placedBasketballPostVisuals
            .filter(
              (post) =>
                post.id !== excludedBasketballPostId &&
                post.segmentId !== segment.id &&
                Math.abs(dot(segmentTangent, post.tangent)) >= 0.9
            )
            .map((post) => post.point);
      const anchorSnapResult = snapOffsetToAnchorAlongSegment(segment, baseOffsetMm, alignmentAnchors, anchorWindowMm);
      const anchorSnapDistanceMm = Math.abs(anchorSnapResult.offsetMm - baseOffsetMm);
      if (
        anchorSnapResult.anchorPoint &&
        anchorSnapDistanceMm <= anchorWindowMm &&
        anchorSnapDistanceMm < bestSnapDistanceMm
      ) {
        snappedOffsetMm = anchorSnapResult.offsetMm;
        selectedAnchorPoint = anchorSnapResult.anchorPoint;
        snapMeta = buildSnapMeta("ALIGNMENT", "Aligned post");
      }

      snappedOffsetMm = Math.max(
        0,
        Math.min(segmentLengthMm, Math.round(snappedOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM)
      );

      const point = interpolateAlongSegment(segment, snappedOffsetMm);
      const tangent =
        segmentTangent ??
        normalizeVector({
          x: segment.end.x - segment.start.x,
          y: segment.end.y - segment.start.y
        });
      if (!tangent) {
        return null;
      }

      const facing = facingOverride ?? (signedDistanceMm >= 0 ? "LEFT" : "RIGHT");
      const leftNormal = { x: -tangent.y, y: tangent.x };
      const normal =
        facing === "RIGHT"
          ? { x: -leftNormal.x, y: -leftNormal.y }
          : leftNormal;

      const preview: BasketballPostInsertionPreview = {
        segment,
        segmentLengthMm,
        offsetMm: snappedOffsetMm,
        point,
        tangent,
        normal,
        facing,
        targetPoint: point,
        snapMeta
      };

      if (!selectedAnchorPoint) {
        return preview;
      }

      return {
        ...preview,
        alignmentGuide: {
          anchorPoint: selectedAnchorPoint,
          targetPoint: preview.targetPoint
        }
      };
    },
    [placedBasketballPostVisuals]
  );

  const cornerNodeKeys = useMemo(() => {
    const vectorsByNode = new Map<string, Array<{ x: number; y: number }>>();

    function addVector(point: PointMm, vector: { x: number; y: number }) {
      const key = pointCoordinateKey(point);
      const bucket = vectorsByNode.get(key);
      if (bucket) {
        bucket.push(vector);
        return;
      }
      vectorsByNode.set(key, [vector]);
    }

    for (const segment of segments) {
      addVector(segment.start, { x: segment.end.x - segment.start.x, y: segment.end.y - segment.start.y });
      addVector(segment.end, { x: segment.start.x - segment.end.x, y: segment.start.y - segment.end.y });
    }

    return new Set(
      [...vectorsByNode.entries()]
        .filter(([, vectors]) => classifyIncidentNode(vectors) === "CORNER")
        .map(([key]) => key)
    );
  }, [segments]);

  const buildSnappedFloodlightColumnPreview = useCallback(
    (
      segment: LayoutSegment,
      baseOffsetMm: number,
      signedDistanceMm: number,
      excludedFloodlightColumnId: string | null = null,
      facingOverride: InlineFeatureFacing | null = null
    ): FloodlightColumnInsertionPreview | null => {
      const segmentLengthMm = distanceMm(segment.start, segment.end);
      const midpointMm = segmentLengthMm / 2;
      const midpointWindowMm = recessMidpointSnapWindowMm(segmentLengthMm);
      const anchorWindowMm = recessAnchorSnapWindowMm(segmentLengthMm);
      const cornerWindowMm = Math.max(250, Math.min(900, segmentLengthMm * 0.1));
      let snappedOffsetMm = baseOffsetMm;
      let bestSnapDistanceMm = Number.POSITIVE_INFINITY;
      let snapMeta = buildSnapMeta("FREE", "Free placement");
      let selectedAnchorPoint: PointMm | null = null;

      const segmentTangent = normalizeVector({
        x: segment.end.x - segment.start.x,
        y: segment.end.y - segment.start.y
      });
      if (!segmentTangent) {
        return null;
      }

      const startKey = pointCoordinateKey(segment.start);
      const endKey = pointCoordinateKey(segment.end);
      if (cornerNodeKeys.has(startKey) && baseOffsetMm <= cornerWindowMm) {
        snappedOffsetMm = 0;
        bestSnapDistanceMm = baseOffsetMm;
        snapMeta = buildSnapMeta("NODE", "Corner");
      }
      const endDistanceMm = Math.abs(segmentLengthMm - baseOffsetMm);
      if (cornerNodeKeys.has(endKey) && endDistanceMm <= cornerWindowMm && endDistanceMm < bestSnapDistanceMm) {
        snappedOffsetMm = segmentLengthMm;
        bestSnapDistanceMm = endDistanceMm;
        snapMeta = buildSnapMeta("NODE", "Corner");
      }

      const midpointDistanceMm = Math.abs(baseOffsetMm - midpointMm);
      if (midpointDistanceMm <= midpointWindowMm && midpointDistanceMm < bestSnapDistanceMm) {
        snappedOffsetMm = midpointMm;
        bestSnapDistanceMm = midpointDistanceMm;
        snapMeta = buildSnapMeta("CENTERED", "Centered");
      }

      const alignmentAnchors = placedFloodlightColumnVisuals
        .filter(
          (column) =>
            column.id !== excludedFloodlightColumnId &&
            column.segmentId !== segment.id &&
            Math.abs(dot(segmentTangent, column.tangent)) >= 0.9
        )
        .map((column) => column.point);
      const anchorSnapResult = snapOffsetToAnchorAlongSegment(segment, baseOffsetMm, alignmentAnchors, anchorWindowMm);
      const anchorSnapDistanceMm = Math.abs(anchorSnapResult.offsetMm - baseOffsetMm);
      if (
        anchorSnapResult.anchorPoint &&
        anchorSnapDistanceMm <= anchorWindowMm &&
        anchorSnapDistanceMm < bestSnapDistanceMm
      ) {
        snappedOffsetMm = anchorSnapResult.offsetMm;
        selectedAnchorPoint = anchorSnapResult.anchorPoint;
        snapMeta = buildSnapMeta("ALIGNMENT", "Aligned column");
      }

      snappedOffsetMm = Math.max(
        0,
        Math.min(segmentLengthMm, Math.round(snappedOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM)
      );

      const point = interpolateAlongSegment(segment, snappedOffsetMm);
      const facing =
        Math.abs(signedDistanceMm) <= 0.001
          ? (facingOverride ?? "LEFT")
          : signedDistanceMm >= 0
            ? "LEFT"
            : "RIGHT";
      const normal = resolveFloodlightColumnNormal(segment, segmentLengthMm, snappedOffsetMm, facing, segments);
      if (!normal) {
        return null;
      }
      const preview: FloodlightColumnInsertionPreview = {
        segment,
        segmentLengthMm,
        offsetMm: snappedOffsetMm,
        point,
        tangent: segmentTangent,
        normal,
        facing,
        targetPoint: point,
        snapMeta
      };

      if (!selectedAnchorPoint) {
        return preview;
      }

      return {
        ...preview,
        alignmentGuide: {
          anchorPoint: selectedAnchorPoint,
          targetPoint: preview.targetPoint
        }
      };
    },
    [cornerNodeKeys, placedFloodlightColumnVisuals, segments]
  );

  const resolveRecessLikePreview = useCallback(
    (widthMm: number, depthMm: number, alignmentAnchors: RecessAlignmentAnchor[] = recessAlignmentAnchors): RecessInsertionPreview | null => {
      if (!pointerWorld) {
        return null;
      }

      const best = findNearestProjectedSegment(pointerWorld, segments, recessPointerSnapMm);
      if (!best) {
        return null;
      }

      const segmentLengthMm = distanceMm(best.segment.start, best.segment.end);
      if (widthMm > segmentLengthMm + 0.001) {
        return null;
      }
      const baseOffsetMm = best.offsetMm;
      let snappedOffsetMm = baseOffsetMm;
      let bestSnapDistanceMm = Number.POSITIVE_INFINITY;
      let snapMeta = buildSnapMeta("FREE", "Free placement");

      const midpointMm = segmentLengthMm / 2;
      const midpointWindowMm = recessMidpointSnapWindowMm(segmentLengthMm);
      const midpointDistanceMm = Math.abs(baseOffsetMm - midpointMm);
      if (midpointDistanceMm <= midpointWindowMm && midpointDistanceMm < bestSnapDistanceMm) {
        snappedOffsetMm = midpointMm;
        bestSnapDistanceMm = midpointDistanceMm;
        snapMeta = buildSnapMeta("MIDPOINT", "Centered");
      }

      const fractionWindowMm = recessFractionSnapWindowMm(segmentLengthMm);
      for (const targetOffsetMm of recessSnapTargetsMm(segmentLengthMm)) {
        const distanceToTargetMm = Math.abs(baseOffsetMm - targetOffsetMm);
        if (distanceToTargetMm <= fractionWindowMm && distanceToTargetMm < bestSnapDistanceMm) {
          snappedOffsetMm = targetOffsetMm;
          bestSnapDistanceMm = distanceToTargetMm;
          snapMeta = buildSnapMeta("FRACTION", "Run fraction");
        }
      }

      const anchorWindowMm = recessAnchorSnapWindowMm(segmentLengthMm);
      const segmentTangent = normalizeVector({
        x: best.segment.end.x - best.segment.start.x,
        y: best.segment.end.y - best.segment.start.y
      });
      const candidateAlignmentAnchors = !segmentTangent
        ? []
        : alignmentAnchors
            .filter(
              (anchor) =>
                anchor.sourceSegmentId !== best.segment.id && Math.abs(dot(segmentTangent, anchor.tangent)) >= 0.9
            )
            .map((anchor) => anchor.point);
      const anchorSnapResult = snapOffsetToAnchorAlongSegment(best.segment, baseOffsetMm, candidateAlignmentAnchors, anchorWindowMm);
      const anchorSnappedOffsetMm = anchorSnapResult.offsetMm;
      const anchorSnapDistanceMm = Math.abs(anchorSnappedOffsetMm - baseOffsetMm);
      let selectedAnchorPoint: PointMm | null = null;
      if (anchorSnapDistanceMm <= anchorWindowMm && anchorSnapDistanceMm < bestSnapDistanceMm) {
        snappedOffsetMm = anchorSnappedOffsetMm;
        selectedAnchorPoint = anchorSnapResult.anchorPoint;
        snapMeta = buildSnapMeta("ALIGNMENT", "Aligned recess");
      }

      snappedOffsetMm = Math.max(
        widthMm / 2,
        Math.min(segmentLengthMm - widthMm / 2, Math.round(snappedOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM)
      );

      const inferredSide: RecessSide = best.signedDistanceMm >= 0 ? "LEFT" : "RIGHT";
      const previewSide = recessSide === "AUTO" ? inferredSide : recessSide;
      const preview = buildRecessPreview(
        best.segment,
        snappedOffsetMm,
        widthMm,
        depthMm,
        previewSide,
        recessSide === "AUTO" ? "AUTO" : "MANUAL",
        snapMeta
      );
      if (!preview || !selectedAnchorPoint) {
        return preview;
      }

      return {
        ...preview,
        alignmentGuide: {
          anchorPoint: selectedAnchorPoint,
          targetPoint: preview.targetPoint
        }
      };
    },
    [pointerWorld, recessAlignmentAnchors, recessPointerSnapMm, recessSide, segments]
  );

  const resolvePitchDividerAnchorPreview = useCallback(
    (worldPoint: PointMm): PitchDividerAnchorPreview | null => {
      const best = findNearestProjectedSegment(worldPoint, segments, pitchDividerPointerSnapMm);
      if (!best) {
        return null;
      }
      const segmentLengthMm = distanceMm(best.segment.start, best.segment.end);
      const midpointMm = segmentLengthMm / 2;
      let offsetMm = Math.max(0, Math.min(segmentLengthMm, Math.round(best.offsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM));
      let snapMeta = buildSnapMeta("SEGMENT", "Fence line");
      if (Math.abs(best.offsetMm - midpointMm) <= recessMidpointSnapWindowMm(segmentLengthMm)) {
        offsetMm = Math.round(midpointMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
        snapMeta = buildSnapMeta("CENTERED", "Centered");
      }
      return {
        segment: best.segment,
        offsetMm,
        point: interpolateAlongSegment(best.segment, offsetMm),
        snapMeta
      };
    },
    [pitchDividerPointerSnapMm, segments]
  );

  const buildPitchDividerSpanPreview = useCallback(
    (startAnchor: PitchDividerAnchorPreview, endAnchor: PitchDividerAnchorPreview): PitchDividerSpanPreview => {
      const spanLengthMm = distanceMm(startAnchor.point, endAnchor.point);
      const supportPoints: PointMm[] = [];
      if (spanLengthMm <= PITCH_DIVIDER_MAX_SPAN_MM) {
        for (
          let distanceFromStartMm = PITCH_DIVIDER_SUPPORT_INTERVAL_MM;
          distanceFromStartMm < spanLengthMm - 0.001;
          distanceFromStartMm += PITCH_DIVIDER_SUPPORT_INTERVAL_MM
        ) {
          const ratio = distanceFromStartMm / spanLengthMm;
          supportPoints.push({
            x: startAnchor.point.x + (endAnchor.point.x - startAnchor.point.x) * ratio,
            y: startAnchor.point.y + (endAnchor.point.y - startAnchor.point.y) * ratio
          });
        }
      }
      return {
        startAnchor,
        endAnchor,
        spanLengthMm,
        supportPoints,
        isValid: startAnchor.segment.id !== endAnchor.segment.id && spanLengthMm <= PITCH_DIVIDER_MAX_SPAN_MM
      };
    },
    []
  );

  const resolveDrawPoint = useCallback(
    (worldPoint: PointMm): DrawResolveResult => {
      const angleCandidate =
        disableSnap || !drawStart ? quantize(worldPoint) : snapPointToAngle(drawStart, worldPoint, 5);
      const nearestNode = findNearestNode(angleCandidate, drawAnchorNodes, nodeSnapDistanceMm);
      if (nearestNode) {
        return {
          point: quantize(nearestNode),
          guide: null,
          snapMeta: buildSnapMeta("NODE", "Endpoint")
        };
      }

      if (!drawStart) {
        const hoverSnap = findNearestPreDrawHoverSnap(angleCandidate, drawSegments, drawLineSnapDistanceMm);
        if (hoverSnap) {
          return {
            point: hoverSnap.point,
            guide: null,
            snapMeta: hoverSnap.snapMeta ?? buildSnapMeta("SEGMENT", "Fence line")
          };
        }
      }

      const basePoint = quantize(angleCandidate);
      const snapMeta: PreviewSnapMeta | null = null;

      if (!drawStart) {
        return { point: basePoint, guide: null, snapMeta };
      }

      const guided = snapToAxisGuide(drawStart, basePoint, drawAnchorNodes, axisGuideSnapDistanceMm);
      const guidedNearestNode = findNearestNode(guided.point, drawAnchorNodes, nodeSnapDistanceMm);
      if (guidedNearestNode) {
        const clampedPoint = clampSegmentEndToBlockingIntersection(drawStart, quantize(guidedNearestNode), drawSegments);
        return {
          point: quantize(clampedPoint),
          guide: guided.guide,
          snapMeta:
            distanceMm(drawStart, clampedPoint) + 0.001 < distanceMm(drawStart, quantize(guidedNearestNode))
              ? buildSnapMeta("SEGMENT", "Fence intersection")
              : buildSnapMeta("NODE", "Endpoint")
        };
      }
      const guidedLineSnap = findNearestSegmentSnap(guided.point, drawSegments, drawLineSnapDistanceMm);
      if (guidedLineSnap) {
        const clampedPoint = clampSegmentEndToBlockingIntersection(drawStart, guidedLineSnap.point, drawSegments);
        return {
          point: quantize(clampedPoint),
          guide: guided.guide,
          snapMeta:
            distanceMm(drawStart, clampedPoint) + 0.001 < distanceMm(drawStart, guidedLineSnap.point)
              ? buildSnapMeta("SEGMENT", "Fence intersection")
              : buildSnapMeta("SEGMENT", "Fence line")
        };
      }
      const unclampedPoint = guided.point;
      const clampedPoint = clampSegmentEndToBlockingIntersection(drawStart, unclampedPoint, drawSegments);
      return {
        point: quantize(clampedPoint),
        guide: guided.guide,
        snapMeta:
          distanceMm(drawStart, clampedPoint) + 0.001 < distanceMm(drawStart, unclampedPoint)
            ? buildSnapMeta("SEGMENT", "Fence intersection")
            : guided.guide
              ? buildSnapMeta("AXIS", "Axis aligned")
              : snapMeta
      };
    },
    [
      axisGuideSnapDistanceMm,
      disableSnap,
      drawAnchorNodes,
      drawSegments,
      drawLineSnapDistanceMm,
      drawStart,
      nodeSnapDistanceMm,
      segments
    ]
  );

  const ghostSnap = useMemo(() => {
    if (!drawStart || !pointerWorld) {
      return null;
    }
    return resolveDrawPoint(pointerWorld);
  }, [drawStart, pointerWorld, resolveDrawPoint]);
  const ghostEnd = ghostSnap?.point ?? null;
  const axisGuide = ghostSnap?.guide ?? null;
  const drawSnapLabel = ghostSnap?.snapMeta?.label ?? null;
  const activeDrawNodeSnap = useMemo<DrawNodeSnapPreview | null>(() => {
    if (
      interactionMode !== "DRAW" ||
      !drawStart ||
      !ghostEnd ||
      (ghostSnap?.snapMeta?.kind !== "NODE" && ghostSnap?.snapMeta?.kind !== "SEGMENT")
    ) {
      return null;
    }
    const toleranceMm = DRAW_INCREMENT_MM * 0.6;
    const connectedSegments = segments.filter((segment) =>
      ghostSnap?.snapMeta?.kind === "NODE"
      ? distanceMm(segment.start, ghostEnd) <= toleranceMm || distanceMm(segment.end, ghostEnd) <= toleranceMm
        : projectPointOntoSegment(ghostEnd, segment).distanceMm <= toleranceMm
    );
    return connectedSegments.length > 0
      ? {
          point: ghostEnd,
          segments: connectedSegments
        }
      : null;
  }, [drawSegments, drawStart, ghostEnd, ghostSnap?.snapMeta?.kind, interactionMode]);
  const closeLoopPoint = useMemo(() => {
    if (!drawStart || !drawChainStart || !ghostEnd) {
      return null;
    }
    const closesLoop =
      distanceMm(drawStart, drawChainStart) > 0.001 && distanceMm(ghostEnd, drawChainStart) <= DRAW_INCREMENT_MM * 0.5;
    return closesLoop ? drawChainStart : null;
  }, [drawChainStart, drawStart, ghostEnd]);

  const recessPreview = useMemo(() => {
    if (interactionMode !== "RECESS") {
      return null;
    }
    return resolveRecessLikePreview(recessWidthMm, recessDepthMm);
  }, [interactionMode, recessDepthMm, recessWidthMm, resolveRecessLikePreview]);

  const goalUnitPreview = useMemo<GoalUnitInsertionPreview | null>(() => {
    if (interactionMode !== "GOAL_UNIT") {
      return null;
    }
    const goalUnitAlignmentAnchors: RecessAlignmentAnchor[] = [
      ...recessAlignmentAnchors,
      ...placedGoalUnitVisuals.map((goalUnit) => ({
        sourceSegmentId: goalUnit.segmentId,
        point: {
          x: (goalUnit.entryPoint.x + goalUnit.exitPoint.x) / 2,
          y: (goalUnit.entryPoint.y + goalUnit.exitPoint.y) / 2
        },
        tangent: goalUnit.tangent
      }))
    ];
    const preview = resolveRecessLikePreview(goalUnitWidthMm, goalUnitDepthMm, goalUnitAlignmentAnchors);
    if (!preview) {
      return null;
    }
    return {
      ...preview,
      widthMm: goalUnitWidthMm,
      goalHeightMm: goalUnitHeightMm
    };
  }, [goalUnitDepthMm, goalUnitHeightMm, goalUnitWidthMm, interactionMode, placedGoalUnitVisuals, recessAlignmentAnchors, resolveRecessLikePreview]);

  const placedGateVisualById = useMemo(
    () => new Map(placedGateVisuals.map((gate) => [gate.id, gate] as const)),
    [placedGateVisuals]
  );
  const placedBasketballPostVisualById = useMemo(
    () => new Map(placedBasketballPostVisuals.map((post) => [post.id, post] as const)),
    [placedBasketballPostVisuals]
  );
  const placedFloodlightColumnVisualById = useMemo(
    () => new Map(placedFloodlightColumnVisuals.map((column) => [column.id, column] as const)),
    [placedFloodlightColumnVisuals]
  );

  const placementGatePreview = useMemo(() => {
    if (interactionMode !== "GATE" || !pointerWorld) {
      return null;
    }

    let best: { segment: LayoutSegment; offsetMm: number; distanceMm: number } | null = null;
    for (const segment of segments) {
      const projection = projectPointOntoSegment(pointerWorld, segment);
      if (projection.distanceMm > gatePointerSnapMm) {
        continue;
      }
      if (!best || projection.distanceMm < best.distanceMm) {
        best = {
          segment,
          offsetMm: projection.offsetMm,
          distanceMm: projection.distanceMm
        };
      }
    }

    if (!best) {
      return null;
    }

    return buildSnappedGatePreview(best.segment, best.offsetMm, requestedGateWidthMm);
  }, [buildSnappedGatePreview, gatePointerSnapMm, interactionMode, pointerWorld, requestedGateWidthMm, segments]);

  const selectDragGatePreview = useMemo(() => {
    if (interactionMode !== "SELECT" || !pointerWorld || !activeGateDragId) {
      return null;
    }
    const activeGate = placedGateVisualById.get(activeGateDragId);
    const activeSegment = activeGate ? segments.find((segment) => segment.id === activeGate.segmentId) : null;
    if (!activeGate || !activeSegment) {
      return null;
    }
    const projection = projectPointOntoSegment(pointerWorld, activeSegment);
    return buildSnappedGatePreview(activeSegment, projection.offsetMm, activeGate.widthMm, activeGate.id);
  }, [activeGateDragId, buildSnappedGatePreview, interactionMode, placedGateVisualById, pointerWorld, segments]);

  const gatePreview = selectDragGatePreview ?? placementGatePreview;
  const activeDraggedGateType = activeGateDragId ? placedGateVisualById.get(activeGateDragId)?.gateType ?? null : null;

  const gatePreviewVisual = useMemo(() => {
    if (!gatePreview) {
      return null;
    }
    return {
      key: `preview-${gatePreview.segment.id}`,
      startPoint: gatePreview.entryPoint,
      endPoint: gatePreview.exitPoint,
      centerPoint: {
        x: (gatePreview.entryPoint.x + gatePreview.exitPoint.x) / 2,
        y: (gatePreview.entryPoint.y + gatePreview.exitPoint.y) / 2
      },
      widthMm: gatePreview.widthMm,
      tangent: gatePreview.tangent,
      normal: gatePreview.normal,
      leafCount: resolveGatePreviewLeafCount(activeDraggedGateType ?? gateType, gatePreview.widthMm)
    } satisfies GateVisual;
  }, [activeDraggedGateType, gatePreview, gateType]);

  const resolveBasketballPostPreview = useCallback(
    (worldPoint: PointMm): BasketballPostInsertionPreview | null => {
      const best = findNearestProjectedSegment(
        worldPoint,
        segments,
        basketballPostPointerSnapMm,
        (segment) => {
          const fenceHeightMm = getFenceHeightMm(segment);
          return basketballPlacementType === "DEDICATED_POST"
            ? fenceHeightMm === 3000 || fenceHeightMm === 4000
            : fenceHeightMm >= 3000;
        }
      );

      if (!best) {
        return null;
      }

      return buildSnappedBasketballPostPreview(best.segment, best.offsetMm, best.signedDistanceMm);
    },
    [basketballPlacementType, basketballPostPointerSnapMm, buildSnappedBasketballPostPreview, segments]
  );

  const placementBasketballPostPreview = useMemo(() => {
    if (interactionMode !== "BASKETBALL_POST" || !pointerWorld) {
      return null;
    }
    return resolveBasketballPostPreview(pointerWorld);
  }, [interactionMode, pointerWorld, resolveBasketballPostPreview]);

  const selectDragBasketballPostPreview = useMemo(() => {
    if (interactionMode !== "SELECT" || !pointerWorld || !activeBasketballPostDragId) {
      return null;
    }
    const activeBasketballPost = placedBasketballPostVisualById.get(activeBasketballPostDragId);
    const activeSegment = activeBasketballPost
      ? segments.find((segment) => segment.id === activeBasketballPost.segmentId)
      : null;
    if (!activeBasketballPost || !activeSegment) {
      return null;
    }
    const projection = projectPointOntoSegment(pointerWorld, activeSegment);
    return buildSnappedBasketballPostPreview(
      activeSegment,
      projection.offsetMm,
      projection.signedDistanceMm,
      activeBasketballPost.id,
      activeBasketballPost.facing
    );
  }, [
    activeBasketballPostDragId,
    buildSnappedBasketballPostPreview,
    interactionMode,
    placedBasketballPostVisualById,
    pointerWorld,
    segments
  ]);

  const basketballPostPreview = selectDragBasketballPostPreview ?? placementBasketballPostPreview;

  const resolveFloodlightColumnPreview = useCallback(
    (worldPoint: PointMm): FloodlightColumnInsertionPreview | null => {
      let best: { segment: LayoutSegment; offsetMm: number; distanceMm: number; signedDistanceMm: number } | null = null;
      for (const segment of segments) {
        const projection = projectPointOntoSegment(worldPoint, segment);
        if (projection.distanceMm > floodlightColumnPointerSnapMm) {
          continue;
        }
        if (!best || projection.distanceMm < best.distanceMm) {
          best = {
            segment,
            offsetMm: projection.offsetMm,
            distanceMm: projection.distanceMm,
            signedDistanceMm: projection.signedDistanceMm
          };
        }
      }

      if (!best) {
        return null;
      }

      return buildSnappedFloodlightColumnPreview(best.segment, best.offsetMm, best.signedDistanceMm);
    },
    [buildSnappedFloodlightColumnPreview, floodlightColumnPointerSnapMm, segments]
  );

  const placementFloodlightColumnPreview = useMemo(() => {
    if (interactionMode !== "FLOODLIGHT_COLUMN" || !pointerWorld) {
      return null;
    }
    return resolveFloodlightColumnPreview(pointerWorld);
  }, [interactionMode, pointerWorld, resolveFloodlightColumnPreview]);

  const selectDragFloodlightColumnPreview = useMemo(() => {
    if (interactionMode !== "SELECT" || !pointerWorld || !activeFloodlightColumnDragId) {
      return null;
    }
    const activeFloodlightColumn = placedFloodlightColumnVisualById.get(activeFloodlightColumnDragId);
    const activeSegment = activeFloodlightColumn
      ? segments.find((segment) => segment.id === activeFloodlightColumn.segmentId)
      : null;
    if (!activeFloodlightColumn || !activeSegment) {
      return null;
    }
    const projection = projectPointOntoSegment(pointerWorld, activeSegment);
    return buildSnappedFloodlightColumnPreview(
      activeSegment,
      projection.offsetMm,
      projection.signedDistanceMm,
      activeFloodlightColumn.id,
      activeFloodlightColumn.facing
    );
  }, [
    activeFloodlightColumnDragId,
    buildSnappedFloodlightColumnPreview,
    interactionMode,
    placedFloodlightColumnVisualById,
    pointerWorld,
    segments
  ]);

  const floodlightColumnPreview = selectDragFloodlightColumnPreview ?? placementFloodlightColumnPreview;

  const kickboardPreview = useMemo<SegmentAttachmentPreview | null>(() => {
    if (interactionMode !== "KICKBOARD" || !pointerWorld) {
      return null;
    }
    const best = findNearestProjectedSegment(pointerWorld, segments, hoverSegmentSnapMm);
    if (!best) {
      return null;
    }
    return {
      segment: best.segment,
      snapMeta: buildSnapMeta("SEGMENT", "Fence line")
    };
  }, [hoverSegmentSnapMm, interactionMode, pointerWorld, segments]);

  const resolveSideNettingAnchorPreview = useCallback(
    (worldPoint: PointMm): PitchDividerAnchorPreview | null => {
      const best = findNearestProjectedSegment(worldPoint, segments, pitchDividerPointerSnapMm);
      if (!best) {
        return null;
      }
      const snappedOffsetMm = findNearestSegmentPostOffsetMm(best.segment, best.offsetMm);
      if (snappedOffsetMm === null) {
        return null;
      }
      const segmentLengthMm = distanceMm(best.segment.start, best.segment.end);
      const isEndpoint = snappedOffsetMm <= 0.001 || Math.abs(snappedOffsetMm - segmentLengthMm) <= 0.001;
      return {
        segment: best.segment,
        offsetMm: snappedOffsetMm,
        point: interpolateAlongSegment(best.segment, snappedOffsetMm),
        snapMeta: buildSnapMeta(isEndpoint ? "NODE" : "SEGMENT", isEndpoint ? "End post" : "Existing post")
      };
    },
    [pitchDividerPointerSnapMm, segments]
  );

  const sideNettingAnchorPreview = useMemo<PitchDividerAnchorPreview | null>(() => {
    if (interactionMode !== "SIDE_NETTING" || !pointerWorld) {
      return null;
    }
    return resolveSideNettingAnchorPreview(pointerWorld);
  }, [interactionMode, pointerWorld, resolveSideNettingAnchorPreview]);

  const sideNettingPreview = useMemo<SegmentRangePreview | null>(() => {
    if (interactionMode !== "SIDE_NETTING" || !pendingSideNettingStart || !sideNettingAnchorPreview) {
      return null;
    }

    if (pendingSideNettingStart.segment.id !== sideNettingAnchorPreview.segment.id) {
      return null;
    }

    const startOffsetMm = Math.min(pendingSideNettingStart.offsetMm, sideNettingAnchorPreview.offsetMm);
    const endOffsetMm = Math.max(pendingSideNettingStart.offsetMm, sideNettingAnchorPreview.offsetMm);
    if (endOffsetMm - startOffsetMm <= DRAW_INCREMENT_MM * 0.5) {
      return null;
    }

    return {
      segment: sideNettingAnchorPreview.segment,
      startOffsetMm,
      endOffsetMm,
      startPoint: interpolateAlongSegment(sideNettingAnchorPreview.segment, startOffsetMm),
      endPoint: interpolateAlongSegment(sideNettingAnchorPreview.segment, endOffsetMm),
      lengthMm: endOffsetMm - startOffsetMm,
      snapMeta: buildSnapMeta("SEGMENT", "Fence line")
    };
  }, [interactionMode, pendingSideNettingStart, sideNettingAnchorPreview]);

  const pitchDividerAnchorPreview = useMemo<PitchDividerAnchorPreview | null>(() => {
    if (interactionMode !== "PITCH_DIVIDER" || !pointerWorld) {
      return null;
    }
    return resolvePitchDividerAnchorPreview(pointerWorld);
  }, [interactionMode, pointerWorld, resolvePitchDividerAnchorPreview]);

  const pitchDividerPreview = useMemo<PitchDividerSpanPreview | null>(() => {
    if (interactionMode !== "PITCH_DIVIDER" || !pendingPitchDividerStart || !pitchDividerAnchorPreview) {
      return null;
    }
    return buildPitchDividerSpanPreview(pendingPitchDividerStart, pitchDividerAnchorPreview);
  }, [buildPitchDividerSpanPreview, interactionMode, pendingPitchDividerStart, pitchDividerAnchorPreview]);

  const drawHoverSnap = useMemo(() => {
    if (interactionMode !== "DRAW" || !pointerWorld || drawStart) {
      return null;
    }
    if (resolveDrawPoint(pointerWorld).snapMeta?.kind === "NODE") {
      return null;
    }
    return findNearestPreDrawHoverSnap(quantize(pointerWorld), drawSegments, drawLineSnapDistanceMm);
  }, [drawLineSnapDistanceMm, drawSegments, drawStart, interactionMode, pointerWorld, resolveDrawPoint]);
  const effectiveDrawSnapLabel = drawStart ? drawSnapLabel : drawHoverSnap?.snapMeta?.label ?? null;

  const hoveredBasketballPostId = useMemo(() => {
    if (!pointerWorld || interactionMode !== "SELECT") {
      return null;
    }
    let best: { id: string; distanceMm: number } | null = null;
    for (const basketballPost of placedBasketballPostVisuals) {
      const candidateDistanceMm = distanceMm(pointerWorld, basketballPost.point);
      const maxDistanceMm = Math.max(240, 26 / viewScale);
      if (candidateDistanceMm > maxDistanceMm) {
        continue;
      }
      if (!best || candidateDistanceMm < best.distanceMm) {
        best = {
          id: basketballPost.id,
          distanceMm: candidateDistanceMm
        };
      }
    }
    return best?.id ?? null;
  }, [interactionMode, placedBasketballPostVisuals, pointerWorld, viewScale]);

  const hoveredFloodlightColumnId = useMemo(() => {
    if (!pointerWorld || interactionMode !== "SELECT") {
      return null;
    }
    let best: { id: string; distanceMm: number } | null = null;
    for (const floodlightColumn of placedFloodlightColumnVisuals) {
      const candidateDistanceMm = distanceMm(pointerWorld, floodlightColumn.point);
      const maxDistanceMm = Math.max(240, 26 / viewScale);
      if (candidateDistanceMm > maxDistanceMm) {
        continue;
      }
      if (!best || candidateDistanceMm < best.distanceMm) {
        best = {
          id: floodlightColumn.id,
          distanceMm: candidateDistanceMm
        };
      }
    }
    return best?.id ?? null;
  }, [interactionMode, placedFloodlightColumnVisuals, pointerWorld, viewScale]);

  const hoveredGateId = useMemo(() => {
    if (!pointerWorld || interactionMode !== "SELECT" || hoveredBasketballPostId || hoveredFloodlightColumnId) {
      return null;
    }
    let best: { id: string; distanceMm: number } | null = null;
    for (const gate of placedGateVisuals) {
      const projection = projectPointOntoSegment(pointerWorld, {
        id: gate.id,
        start: gate.startPoint,
        end: gate.endPoint,
        spec: gate.spec
      });
      if (projection.distanceMm > hoverGateSnapMm) {
        continue;
      }
      if (!best || projection.distanceMm < best.distanceMm) {
        best = {
          id: gate.id,
          distanceMm: projection.distanceMm
        };
      }
    }
    return best?.id ?? null;
  }, [hoveredBasketballPostId, hoveredFloodlightColumnId, hoverGateSnapMm, interactionMode, placedGateVisuals, pointerWorld]);

  const hoveredSegmentId = useMemo(() => {
    if (!pointerWorld || interactionMode !== "SELECT" || hoveredBasketballPostId || hoveredFloodlightColumnId || hoveredGateId) {
      return null;
    }
    let best: { id: string; distanceMm: number } | null = null;
    for (const segment of segments) {
      const projection = projectPointOntoSegment(pointerWorld, segment);
      if (projection.distanceMm > hoverSegmentSnapMm) {
        continue;
      }
      if (!best || projection.distanceMm < best.distanceMm) {
        best = {
          id: segment.id,
          distanceMm: projection.distanceMm
        };
      }
    }
    return best?.id ?? null;
  }, [hoveredBasketballPostId, hoveredFloodlightColumnId, hoveredGateId, hoverSegmentSnapMm, interactionMode, pointerWorld, segments]);

  const rectanglePreviewEnd = useMemo(() => {
    if (interactionMode !== "RECTANGLE" || !rectangleStart || !pointerWorld) {
      return null;
    }
    return resolveDrawPoint(pointerWorld).point;
  }, [interactionMode, pointerWorld, rectangleStart, resolveDrawPoint]);

  const ghostLengthMm = useMemo(() => {
    if (!drawStart || !ghostEnd) {
      return 0;
    }
    return Math.round(distanceMm(drawStart, ghostEnd));
  }, [drawStart, ghostEnd]);

  return {
    activeDrawNodeSnap,
    axisGuide,
    drawHoverSnap,
    basketballPostPreview,
    goalUnitPreview,
    floodlightColumnPreview,
    drawSnapLabel: effectiveDrawSnapLabel,
    gatePreview,
    gatePreviewVisual,
    ghostEnd,
    ghostLengthMm,
    hoveredBasketballPostId,
    hoveredFloodlightColumnId,
    hoveredGateId,
    hoveredSegmentId,
    kickboardPreview,
    pitchDividerAnchorPreview,
    pitchDividerPreview,
    rectanglePreviewEnd,
    recessPreview,
    resolveBasketballPostPreview,
    resolveFloodlightColumnPreview,
    resolvePitchDividerAnchorPreview,
    resolveSideNettingAnchorPreview,
    sideNettingAnchorPreview,
    sideNettingPreview,
    closeLoopPoint,
    resolveDrawPoint
  };
}
