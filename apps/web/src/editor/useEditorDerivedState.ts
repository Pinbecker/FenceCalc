import { useMemo } from "react";
import type { GatePlacement, LayoutSegment } from "@fence-estimator/contracts";
import { estimateDrawingLayout } from "@fence-estimator/rules-engine";

import { buildOptimizationPlanVisual } from "../optimizationVisual";
import { getVisibleOptimizationPlans } from "../optimizationDisplay";
import {
  buildGateNodeHeightByKey,
  buildGatesBySegmentId,
  buildPostTypeCounts,
  buildResolvedGateMap,
  buildSegmentLengthLabelsBySegmentId,
  buildSegmentMap,
  buildVisibleSegmentLabelKeys,
  buildVisualPosts
} from "./editorDerivedStateUtils";
import { interpolateAlongSegment } from "./gateMath";
import { ROLL_FORM_HEIGHT_OPTIONS, TWIN_BAR_HEIGHT_OPTIONS } from "./constants";
import { buildOppositeGateGuides, buildScaleBar } from "./editorMath";
import { buildRecessAlignmentAnchors } from "./recess";
import { buildEstimateSegments, buildSegmentConnectivity, resolveGatePlacements } from "./segmentTopology";
import { buildEditorSummaryData } from "./summaryData";

interface EditorDerivedStateOptions {
  segments: LayoutSegment[];
  gatePlacements: GatePlacement[];
  selectedSegmentId: string | null;
  selectedPlanId: string | null;
  activeSpecSystem: "TWIN_BAR" | "ROLL_FORM";
  viewScale: number;
  canvasWidth: number;
}

export function useEditorDerivedState({
  segments,
  gatePlacements,
  selectedSegmentId,
  selectedPlanId,
  activeSpecSystem,
  viewScale,
  canvasWidth
}: EditorDerivedStateOptions) {
  const segmentsById = useMemo(() => buildSegmentMap(segments), [segments]);
  const resolvedGatePlacements = useMemo(
    () => resolveGatePlacements(segmentsById, gatePlacements),
    [gatePlacements, segmentsById]
  );
  const resolvedGateById = useMemo(
    () => buildResolvedGateMap(resolvedGatePlacements),
    [resolvedGatePlacements]
  );
  const gatesBySegmentId = useMemo(
    () => buildGatesBySegmentId(resolvedGatePlacements),
    [resolvedGatePlacements]
  );
  const gateNodeHeightByKey = useMemo(
    () => buildGateNodeHeightByKey(resolvedGatePlacements),
    [resolvedGatePlacements]
  );
  const estimateSegments = useMemo(
    () => buildEstimateSegments(segments, gatesBySegmentId),
    [gatesBySegmentId, segments]
  );
  const estimateSegmentsById = useMemo(
    () => buildSegmentMap(estimateSegments),
    [estimateSegments]
  );
  const estimate = useMemo(() => {
    return estimateDrawingLayout({
      segments,
      gates: gatePlacements
    });
  }, [gatePlacements, segments]);
  const visualPosts = useMemo(
    () => buildVisualPosts(estimateSegments, gateNodeHeightByKey),
    [estimateSegments, gateNodeHeightByKey]
  );
  const recessAlignmentAnchors = useMemo(
    () => buildRecessAlignmentAnchors(segments),
    [segments]
  );
  const drawAnchorNodes = useMemo(
    () =>
      visualPosts
        .filter((post) => post.kind === "END" || post.kind === "CORNER")
        .map((post) => post.point),
    [visualPosts]
  );
  const postTypeCounts = useMemo(
    () => buildPostTypeCounts(visualPosts),
    [visualPosts]
  );
  const postHeightRows = useMemo(
    () =>
      Object.entries(estimate.posts.byHeightAndType)
        .map(([heightMm, counts]) => ({
          heightMm: Number(heightMm),
          ...counts
        }))
        .sort((left, right) => left.heightMm - right.heightMm),
    [estimate.posts.byHeightAndType]
  );
  const connectivity = useMemo(
    () => buildSegmentConnectivity(segments),
    [segments]
  );
  const placedGateVisuals = useMemo(
    () => resolvedGatePlacements,
    [resolvedGatePlacements]
  );
  const segmentLengthLabelsBySegmentId = useMemo(
    () => buildSegmentLengthLabelsBySegmentId(segments, selectedSegmentId, viewScale),
    [segments, selectedSegmentId, viewScale]
  );
  const visibleSegmentLabelKeys = useMemo(
    () => buildVisibleSegmentLabelKeys(segmentLengthLabelsBySegmentId, viewScale),
    [segmentLengthLabelsBySegmentId, viewScale]
  );
  const oppositeGateGuides = useMemo(
    () => buildOppositeGateGuides(placedGateVisuals),
    [placedGateVisuals]
  );
  const selectedComponentId = useMemo(() => {
    if (!selectedSegmentId) {
      return null;
    }
    return connectivity.segmentComponent.get(selectedSegmentId) ?? null;
  }, [connectivity.segmentComponent, selectedSegmentId]);
  const selectedComponentClosed = useMemo(() => {
    if (!selectedComponentId) {
      return false;
    }
    return connectivity.closedComponentIds.has(selectedComponentId);
  }, [connectivity.closedComponentIds, selectedComponentId]);
  const activeHeightOptions =
    activeSpecSystem === "TWIN_BAR" ? TWIN_BAR_HEIGHT_OPTIONS : ROLL_FORM_HEIGHT_OPTIONS;
  const editorSummary = useMemo(
    () =>
      buildEditorSummaryData({
        postHeightRows,
        resolvedGatePlacements,
        estimate
      }),
    [estimate, postHeightRows, resolvedGatePlacements]
  );
  const optimizationSummary = estimate.optimization;
  const highlightableOptimizationPlans = useMemo(
    () => getVisibleOptimizationPlans(optimizationSummary),
    [optimizationSummary]
  );
  const selectedSegment = useMemo(() => {
    if (!selectedSegmentId) {
      return null;
    }
    return segmentsById.get(selectedSegmentId) ?? null;
  }, [segmentsById, selectedSegmentId]);
  const segmentOrdinalById = useMemo(() => {
    const map = new Map<string, number>();
    estimateSegments.forEach((segment, index) => {
      map.set(segment.id, index + 1);
    });
    return map;
  }, [estimateSegments]);
  const scaleBar = useMemo(
    () => buildScaleBar(viewScale, canvasWidth),
    [canvasWidth, viewScale]
  );
  const selectedPlan = useMemo(() => {
    if (!selectedPlanId) {
      return null;
    }
    return highlightableOptimizationPlans.find((plan) => plan.id === selectedPlanId) ?? null;
  }, [highlightableOptimizationPlans, selectedPlanId]);
  const selectedPlanVisual = useMemo(
    () => buildOptimizationPlanVisual(selectedPlan, estimateSegmentsById, interpolateAlongSegment),
    [estimateSegmentsById, selectedPlan]
  );

  return {
    connectivity,
    drawAnchorNodes,
    editorSummary,
    estimate,
    estimateSegments,
    gatesBySegmentId,
    highlightableOptimizationPlans,
    oppositeGateGuides,
    placedGateVisuals,
    postTypeCounts,
    recessAlignmentAnchors,
    resolvedGateById,
    resolvedGatePlacements,
    scaleBar,
    segmentLengthLabelsBySegmentId,
    segmentOrdinalById,
    segmentsById,
    selectedComponentClosed,
    selectedPlanVisual,
    selectedSegment,
    visualPosts,
    visibleSegmentLabelKeys,
    activeHeightOptions
  };
}
