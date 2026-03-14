import { useMemo, useRef } from "react";
import type {
  BasketballPostPlacement,
  FloodlightColumnPlacement,
  GatePlacement,
  LayoutSegment
} from "@fence-estimator/contracts";
import { estimateDrawingLayout } from "@fence-estimator/rules-engine";

import { buildOptimizationPlanVisual } from "../optimizationVisual";
import type { OptimizationPlanVisual } from "../optimizationVisual";
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
import {
  buildEstimateSegments,
  buildSegmentConnectivity,
  resolveBasketballPostPlacements,
  resolveFloodlightColumnPlacements,
  resolveGatePlacements
} from "./segmentTopology";
import { buildEditorSummaryData } from "./summaryData";

interface EditorDerivedStateOptions {
  segments: LayoutSegment[];
  gatePlacements: GatePlacement[];
  basketballPostPlacements: BasketballPostPlacement[];
  floodlightColumnPlacements?: FloodlightColumnPlacement[];
  selectedSegmentId: string | null;
  selectedPlanId: string | null;
  activeSpecSystem: "TWIN_BAR" | "ROLL_FORM";
  viewScale: number;
  canvasWidth: number;
  freezeOptimization?: boolean;
}

interface FrozenOptimizationState {
  estimate: ReturnType<typeof estimateDrawingLayout>;
  highlightableOptimizationPlans: ReturnType<typeof getVisibleOptimizationPlans>;
  selectedPlanVisual: OptimizationPlanVisual | null;
}

export function useEditorDerivedState({
  segments,
  gatePlacements,
  basketballPostPlacements,
  floodlightColumnPlacements = [],
  selectedSegmentId,
  selectedPlanId,
  activeSpecSystem,
  viewScale,
  canvasWidth,
  freezeOptimization = false
}: EditorDerivedStateOptions) {
  const segmentsById = useMemo(() => buildSegmentMap(segments), [segments]);
  const resolvedGatePlacements = useMemo(
    () => resolveGatePlacements(segmentsById, gatePlacements),
    [gatePlacements, segmentsById]
  );
  const resolvedBasketballPostPlacements = useMemo(
    () => resolveBasketballPostPlacements(segmentsById, basketballPostPlacements),
    [basketballPostPlacements, segmentsById]
  );
  const resolvedFloodlightColumnPlacements = useMemo(
    () => resolveFloodlightColumnPlacements(segmentsById, floodlightColumnPlacements),
    [floodlightColumnPlacements, segmentsById]
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
  const liveEstimate = useMemo(() => {
    return estimateDrawingLayout({
      segments,
      gates: gatePlacements
    });
  }, [gatePlacements, segments]);
  const liveOptimizationSummary = liveEstimate.optimization;
  const liveHighlightableOptimizationPlans = useMemo(
    () => getVisibleOptimizationPlans(liveOptimizationSummary),
    [liveOptimizationSummary]
  );
  const liveSelectedPlan = useMemo(() => {
    if (!selectedPlanId) {
      return null;
    }
    return liveHighlightableOptimizationPlans.find((plan) => plan.id === selectedPlanId) ?? null;
  }, [liveHighlightableOptimizationPlans, selectedPlanId]);
  const liveSelectedPlanVisual = useMemo(
    () => buildOptimizationPlanVisual(liveSelectedPlan, estimateSegmentsById, interpolateAlongSegment),
    [estimateSegmentsById, liveSelectedPlan]
  );
  const frozenOptimizationRef = useRef<FrozenOptimizationState | null>(null);

  if (!freezeOptimization) {
    frozenOptimizationRef.current = {
      estimate: liveEstimate,
      highlightableOptimizationPlans: liveHighlightableOptimizationPlans,
      selectedPlanVisual: liveSelectedPlanVisual
    };
  }

  const estimate = freezeOptimization && frozenOptimizationRef.current
    ? frozenOptimizationRef.current.estimate
    : liveEstimate;
  const highlightableOptimizationPlans = freezeOptimization && frozenOptimizationRef.current
    ? frozenOptimizationRef.current.highlightableOptimizationPlans
    : liveHighlightableOptimizationPlans;
  const selectedPlanVisual = freezeOptimization && frozenOptimizationRef.current
    ? frozenOptimizationRef.current.selectedPlanVisual
    : liveSelectedPlanVisual;
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
        resolvedBasketballPostPlacements,
        estimate
      }),
    [estimate, postHeightRows, resolvedBasketballPostPlacements, resolvedGatePlacements]
  );
  const optimizationSummary = estimate.optimization;
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
    resolvedBasketballPostPlacements,
    resolvedFloodlightColumnPlacements,
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
