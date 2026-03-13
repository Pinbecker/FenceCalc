import { useCallback, useMemo } from "react";
import type { GateType, LayoutSegment, PointMm } from "@fence-estimator/contracts";
import { distanceMm, snapPointToAngle } from "@fence-estimator/geometry";

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
  dot,
  findNearestNode,
  normalizeVector,
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
import type {
  BasketballPostInsertionPreview,
  DrawResolveResult,
  GateVisual,
  InteractionMode,
  PreviewSnapMeta,
  RecessAlignmentAnchor,
  RecessSide,
  RecessSidePreference,
  ResolvedBasketballPostPlacement,
  ResolvedGatePlacement
} from "./types";

interface EditorInteractionPreviewsOptions {
  segments: LayoutSegment[];
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
  gateType: GateType;
  customGateWidthMm: number;
  placedGateVisuals: ResolvedGatePlacement[];
  placedBasketballPostVisuals: ResolvedBasketballPostPlacement[];
  drawChainStart: PointMm | null;
}

function buildSnapMeta(kind: PreviewSnapMeta["kind"], label: string): PreviewSnapMeta {
  return { kind, label };
}

export function useEditorInteractionPreviews({
  segments,
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
  gateType,
  customGateWidthMm,
  placedGateVisuals,
  placedBasketballPostVisuals,
  drawChainStart
}: EditorInteractionPreviewsOptions) {
  const nodeSnapDistanceMm = Math.min(600, NODE_SNAP_DISTANCE_PX / viewScale);
  const axisGuideSnapDistanceMm = Math.min(600, AXIS_GUIDE_SNAP_PX / viewScale);
  const drawLineSnapDistanceMm = Math.min(900, DRAW_LINE_SNAP_PX / viewScale);
  const recessPointerSnapMm = Math.max(500, RECESS_POINTER_SNAP_PX / viewScale);
  const gatePointerSnapMm = Math.max(500, GATE_POINTER_SNAP_PX / viewScale);
  const basketballPostPointerSnapMm = Math.max(650, 48 / viewScale);
  const hoverSegmentSnapMm = Math.max(180, 16 / viewScale);
  const hoverGateSnapMm = Math.max(180, 22 / viewScale);
  const requestedGateWidthMm = useMemo(
    () => resolveGateWidthMm(gateType, customGateWidthMm),
    [customGateWidthMm, gateType]
  );

  const resolveDrawPoint = useCallback(
    (worldPoint: PointMm): DrawResolveResult => {
      const angleCandidate =
        disableSnap || !drawStart ? quantize(worldPoint) : snapPointToAngle(drawStart, worldPoint, 5);
      const nearestNode = findNearestNode(angleCandidate, drawAnchorNodes, nodeSnapDistanceMm);
      const nearestLine = findNearestSegmentSnap(angleCandidate, segments, drawLineSnapDistanceMm);
      const nodeDistanceMm = nearestNode ? distanceMm(angleCandidate, nearestNode) : Number.POSITIVE_INFINITY;
      let basePoint = quantize(angleCandidate);
      let snapMeta: PreviewSnapMeta | null = null;
      if (nearestLine && nearestLine.distanceMm < nodeDistanceMm) {
        basePoint = nearestLine.point;
        snapMeta = buildSnapMeta("SEGMENT", "Fence line");
      } else if (nearestNode) {
        basePoint = quantize(nearestNode);
        snapMeta = buildSnapMeta("NODE", "Endpoint");
      }

      if (!drawStart) {
        return { point: basePoint, guide: null, snapMeta };
      }

      const guided = snapToAxisGuide(drawStart, basePoint, drawAnchorNodes, axisGuideSnapDistanceMm);
      const guidedLineSnap = findNearestSegmentSnap(guided.point, segments, drawLineSnapDistanceMm);
      if (guidedLineSnap) {
        return {
          point: guidedLineSnap.point,
          guide: guided.guide,
          snapMeta: guided.guide ? buildSnapMeta("AXIS", "Axis aligned") : buildSnapMeta("SEGMENT", "Fence line")
        };
      }
      return {
        point: guided.point,
        guide: guided.guide,
        snapMeta: guided.guide ? buildSnapMeta("AXIS", "Axis aligned") : snapMeta
      };
    },
    [
      axisGuideSnapDistanceMm,
      disableSnap,
      drawAnchorNodes,
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
  const closeLoopPoint = useMemo(() => {
    if (!drawStart || !drawChainStart || !ghostEnd) {
      return null;
    }
    const closesLoop =
      distanceMm(drawStart, drawChainStart) > 0.001 && distanceMm(ghostEnd, drawChainStart) <= DRAW_INCREMENT_MM * 0.5;
    return closesLoop ? drawChainStart : null;
  }, [drawChainStart, drawStart, ghostEnd]);

  const recessPreview = useMemo(() => {
    if (interactionMode !== "RECESS" || !pointerWorld) {
      return null;
    }

    let best:
      | {
          segment: LayoutSegment;
          offsetMm: number;
          distanceMm: number;
          signedDistanceMm: number;
        }
      | null = null;
    for (const segment of segments) {
      const projection = projectPointOntoSegment(pointerWorld, segment);
      if (projection.distanceMm > recessPointerSnapMm) {
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

    const segmentLengthMm = distanceMm(best.segment.start, best.segment.end);
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
    const alignmentAnchors = !segmentTangent
      ? []
      : recessAlignmentAnchors
          .filter(
            (anchor) =>
              anchor.sourceSegmentId !== best.segment.id && Math.abs(dot(segmentTangent, anchor.tangent)) >= 0.9
          )
          .map((anchor) => anchor.point);
    const anchorSnapResult = snapOffsetToAnchorAlongSegment(best.segment, baseOffsetMm, alignmentAnchors, anchorWindowMm);
    const anchorSnappedOffsetMm = anchorSnapResult.offsetMm;
    const anchorSnapDistanceMm = Math.abs(anchorSnappedOffsetMm - baseOffsetMm);
    let selectedAnchorPoint: PointMm | null = null;
    if (anchorSnapDistanceMm <= anchorWindowMm && anchorSnapDistanceMm < bestSnapDistanceMm) {
      snappedOffsetMm = anchorSnappedOffsetMm;
      selectedAnchorPoint = anchorSnapResult.anchorPoint;
      snapMeta = buildSnapMeta("ALIGNMENT", "Aligned recess");
    }

    snappedOffsetMm = Math.max(
      0,
      Math.min(segmentLengthMm, Math.round(snappedOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM)
    );

    const inferredSide: RecessSide = best.signedDistanceMm >= 0 ? "LEFT" : "RIGHT";
    const previewSide = recessSide === "AUTO" ? inferredSide : recessSide;
    const preview = buildRecessPreview(
      best.segment,
      snappedOffsetMm,
      recessWidthMm,
      recessDepthMm,
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
  }, [
    interactionMode,
    pointerWorld,
    recessAlignmentAnchors,
    recessDepthMm,
    recessPointerSnapMm,
    recessSide,
    recessWidthMm,
    segments
  ]);

  const gatePreview = useMemo(() => {
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

    const segmentLengthMm = distanceMm(best.segment.start, best.segment.end);
    const baseOffsetMm = best.offsetMm;
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
      x: best.segment.end.x - best.segment.start.x,
      y: best.segment.end.y - best.segment.start.y
    });
    const gateAlignmentAnchors = !segmentTangent
      ? []
      : placedGateVisuals
          .filter(
            (gate) => gate.segmentId !== best.segment.id && Math.abs(dot(segmentTangent, gate.tangent)) >= 0.9
          )
          .map((gate) => gate.centerPoint);
    const anchorSnapResult = snapOffsetToAnchorAlongSegment(best.segment, baseOffsetMm, gateAlignmentAnchors, anchorWindowMm);
    const anchorSnapDistanceMm = Math.abs(anchorSnapResult.offsetMm - baseOffsetMm);
    if (
      anchorSnapResult.anchorPoint &&
      anchorSnapDistanceMm <= anchorWindowMm &&
      anchorSnapDistanceMm < bestSnapDistanceMm
    ) {
      snappedOffsetMm = anchorSnapResult.offsetMm;
      bestSnapDistanceMm = anchorSnapDistanceMm;
      selectedAnchorPoint = anchorSnapResult.anchorPoint;
      snapMeta = buildSnapMeta("ALIGNMENT", "Aligned gate");
    }

    snappedOffsetMm = Math.max(
      0,
      Math.min(segmentLengthMm, Math.round(snappedOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM)
    );

    const preview = buildGatePreview(best.segment, snappedOffsetMm, requestedGateWidthMm);
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
  }, [gatePointerSnapMm, interactionMode, placedGateVisuals, pointerWorld, requestedGateWidthMm, segments]);

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
      leafCount: resolveGatePreviewLeafCount(gateType, gatePreview.widthMm)
    } satisfies GateVisual;
  }, [gatePreview, gateType]);

  const resolveBasketballPostPreview = useCallback(
    (worldPoint: PointMm): BasketballPostInsertionPreview | null => {
      let best:
        | {
            segment: LayoutSegment;
            offsetMm: number;
            distanceMm: number;
            signedDistanceMm: number;
          }
        | null = null;
      for (const segment of segments) {
        const projection = projectPointOntoSegment(worldPoint, segment);
        if (projection.distanceMm > basketballPostPointerSnapMm) {
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

      const segmentLengthMm = distanceMm(best.segment.start, best.segment.end);
      const midpointMm = segmentLengthMm / 2;
      const midpointWindowMm = recessMidpointSnapWindowMm(segmentLengthMm);
      const anchorWindowMm = recessAnchorSnapWindowMm(segmentLengthMm);
      let snappedOffsetMm = best.offsetMm;
      let bestSnapDistanceMm = Number.POSITIVE_INFINITY;
      let snapMeta = buildSnapMeta("FREE", "Free placement");
      let selectedAnchorPoint: PointMm | null = null;

      const midpointDistanceMm = Math.abs(best.offsetMm - midpointMm);
      if (midpointDistanceMm <= midpointWindowMm && midpointDistanceMm < bestSnapDistanceMm) {
        snappedOffsetMm = midpointMm;
        bestSnapDistanceMm = midpointDistanceMm;
        snapMeta = buildSnapMeta("CENTERED", "Centered");
      }

      const segmentTangent = normalizeVector({
        x: best.segment.end.x - best.segment.start.x,
        y: best.segment.end.y - best.segment.start.y
      });
      const alignmentAnchors = !segmentTangent
        ? []
        : placedBasketballPostVisuals
            .filter(
              (post) => post.segmentId !== best.segment.id && Math.abs(dot(segmentTangent, post.tangent)) >= 0.9
            )
            .map((post) => post.point);
      const anchorSnapResult = snapOffsetToAnchorAlongSegment(best.segment, best.offsetMm, alignmentAnchors, anchorWindowMm);
      const anchorSnapDistanceMm = Math.abs(anchorSnapResult.offsetMm - best.offsetMm);
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

      const point = interpolateAlongSegment(best.segment, snappedOffsetMm);
      const tangent =
        segmentTangent ??
        normalizeVector({
          x: best.segment.end.x - best.segment.start.x,
          y: best.segment.end.y - best.segment.start.y
        });
      if (!tangent) {
        return null;
      }

      const facing = best.signedDistanceMm >= 0 ? "LEFT" : "RIGHT";
      const leftNormal = { x: -tangent.y, y: tangent.x };
      const normal =
        facing === "RIGHT"
          ? { x: -leftNormal.x, y: -leftNormal.y }
          : leftNormal;

      const preview: BasketballPostInsertionPreview = {
        segment: best.segment,
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
    [basketballPostPointerSnapMm, placedBasketballPostVisuals, segments]
  );

  const basketballPostPreview = useMemo(() => {
    if (interactionMode !== "BASKETBALL_POST" || !pointerWorld) {
      return null;
    }
    return resolveBasketballPostPreview(pointerWorld);
  }, [interactionMode, pointerWorld, resolveBasketballPostPreview]);

  const drawHoverSnap = useMemo(() => {
    if (interactionMode !== "DRAW" || !pointerWorld) {
      return null;
    }
    const preview = findNearestSegmentSnap(pointerWorld, segments, drawLineSnapDistanceMm);
    return preview
      ? {
          ...preview,
          snapMeta: buildSnapMeta("SEGMENT", "Fence line")
        }
      : null;
  }, [drawLineSnapDistanceMm, interactionMode, pointerWorld, segments]);

  const hoveredGateId = useMemo(() => {
    if (!pointerWorld || interactionMode !== "SELECT") {
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
  }, [hoverGateSnapMm, interactionMode, placedGateVisuals, pointerWorld]);

  const hoveredSegmentId = useMemo(() => {
    if (!pointerWorld || interactionMode !== "SELECT") {
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
  }, [hoverSegmentSnapMm, interactionMode, pointerWorld, segments]);

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
    axisGuide,
    drawHoverSnap,
    basketballPostPreview,
    drawSnapLabel,
    gatePreview,
    gatePreviewVisual,
    ghostEnd,
    ghostLengthMm,
    hoveredGateId,
    hoveredSegmentId,
    rectanglePreviewEnd,
    recessPreview,
    resolveBasketballPostPreview,
    closeLoopPoint,
    resolveDrawPoint
  };
}
