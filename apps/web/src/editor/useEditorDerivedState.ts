import { useMemo, useRef } from "react";
import type {
  BasketballPostPlacement,
  FloodlightColumnPlacement,
  GatePlacement,
  GoalUnitPlacement,
  KickboardAttachment,
  LayoutSegment
} from "@fence-estimator/contracts";
import type { PitchDividerPlacement, SideNettingAttachment } from "@fence-estimator/contracts";
import {
  buildDerivedFenceTopology,
  estimateDrawingLayout,
  resolveGoalUnitPlacements,
  resolveKickboardAttachments,
  resolvePitchDividerPlacements,
  resolveSideNettingAttachments
} from "@fence-estimator/rules-engine";

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
  goalUnitPlacements?: GoalUnitPlacement[];
  kickboardAttachments?: KickboardAttachment[];
  pitchDividerPlacements?: PitchDividerPlacement[];
  sideNettingAttachments?: SideNettingAttachment[];
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

function buildOptimizationState(
  segments: LayoutSegment[],
  gatePlacements: GatePlacement[],
  basketballPostPlacements: BasketballPostPlacement[],
  floodlightColumnPlacements: FloodlightColumnPlacement[],
  goalUnitPlacements: GoalUnitPlacement[],
  kickboardAttachments: KickboardAttachment[],
  pitchDividerPlacements: PitchDividerPlacement[],
  sideNettingAttachments: SideNettingAttachment[],
  selectedPlanId: string | null,
  estimateSegmentsById: Map<string, LayoutSegment>
): FrozenOptimizationState {
  const estimate = estimateDrawingLayout({
    segments,
    gates: gatePlacements,
    basketballPosts: basketballPostPlacements,
    floodlightColumns: floodlightColumnPlacements,
    goalUnits: goalUnitPlacements,
    kickboards: kickboardAttachments,
    pitchDividers: pitchDividerPlacements,
    sideNettings: sideNettingAttachments
  });
  const highlightableOptimizationPlans = getVisibleOptimizationPlans(estimate.optimization);
  const selectedPlan =
    selectedPlanId === null ? null : highlightableOptimizationPlans.find((plan) => plan.id === selectedPlanId) ?? null;

  return {
    estimate,
    highlightableOptimizationPlans,
    selectedPlanVisual: buildOptimizationPlanVisual(selectedPlan, estimateSegmentsById, interpolateAlongSegment)
  };
}

export function useEditorDerivedState({
  segments,
  gatePlacements,
  basketballPostPlacements,
  floodlightColumnPlacements = [],
  goalUnitPlacements = [],
  kickboardAttachments = [],
  pitchDividerPlacements = [],
  sideNettingAttachments = [],
  selectedSegmentId,
  selectedPlanId,
  activeSpecSystem,
  viewScale,
  canvasWidth,
  freezeOptimization = false
}: EditorDerivedStateOptions) {
  const segmentsById = useMemo(() => buildSegmentMap(segments), [segments]);
  const resolvedGoalUnits = useMemo(
    () => resolveGoalUnitPlacements(segmentsById, goalUnitPlacements),
    [goalUnitPlacements, segmentsById]
  );
  const resolvedKickboards = useMemo(
    () => resolveKickboardAttachments(segmentsById, kickboardAttachments),
    [kickboardAttachments, segmentsById]
  );
  const resolvedPitchDividers = useMemo(
    () => resolvePitchDividerPlacements(segmentsById, pitchDividerPlacements),
    [pitchDividerPlacements, segmentsById]
  );
  const resolvedSideNettings = useMemo(
    () => resolveSideNettingAttachments(segmentsById, sideNettingAttachments),
    [segmentsById, sideNettingAttachments]
  );
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
  const derivedFenceTopology = useMemo(
    () =>
      buildDerivedFenceTopology({
        segments,
        gates: gatePlacements,
        basketballPosts: basketballPostPlacements,
        floodlightColumns: floodlightColumnPlacements,
        goalUnits: goalUnitPlacements,
        kickboards: kickboardAttachments,
        pitchDividers: pitchDividerPlacements,
        sideNettings: sideNettingAttachments
      }),
    [
      basketballPostPlacements,
      floodlightColumnPlacements,
      gatePlacements,
      goalUnitPlacements,
      kickboardAttachments,
      pitchDividerPlacements,
      segments,
      sideNettingAttachments
    ]
  );
  const estimateSegments = useMemo(
    () => derivedFenceTopology.estimateSegments,
    [derivedFenceTopology]
  );
  const estimateSegmentsById = useMemo(
    () => buildSegmentMap(estimateSegments),
    [estimateSegments]
  );
  const liveOptimizationState = useMemo(() => {
    if (freezeOptimization) {
      return null;
    }

    return buildOptimizationState(
      segments,
      gatePlacements,
      basketballPostPlacements,
      floodlightColumnPlacements,
      goalUnitPlacements,
      kickboardAttachments,
      pitchDividerPlacements,
      sideNettingAttachments,
      selectedPlanId,
      estimateSegmentsById
    );
  }, [
    basketballPostPlacements,
    estimateSegmentsById,
    floodlightColumnPlacements,
    freezeOptimization,
    gatePlacements,
    goalUnitPlacements,
    kickboardAttachments,
    pitchDividerPlacements,
    segments,
    selectedPlanId,
    sideNettingAttachments
  ]);
  const frozenOptimizationRef = useRef<FrozenOptimizationState | null>(null);

  if (liveOptimizationState) {
    frozenOptimizationRef.current = liveOptimizationState;
  }

  const optimizationState =
    frozenOptimizationRef.current ??
    buildOptimizationState(
      segments,
      gatePlacements,
      basketballPostPlacements,
      floodlightColumnPlacements,
      goalUnitPlacements,
      kickboardAttachments,
      pitchDividerPlacements,
      sideNettingAttachments,
      selectedPlanId,
      estimateSegmentsById
    );

  const estimate = freezeOptimization && frozenOptimizationRef.current
    ? frozenOptimizationRef.current.estimate
    : optimizationState.estimate;
  const highlightableOptimizationPlans = freezeOptimization && frozenOptimizationRef.current
    ? frozenOptimizationRef.current.highlightableOptimizationPlans
    : optimizationState.highlightableOptimizationPlans;
  const selectedPlanVisual = freezeOptimization && frozenOptimizationRef.current
    ? frozenOptimizationRef.current.selectedPlanVisual
    : optimizationState.selectedPlanVisual;
  const visualPosts = useMemo(
    () => buildVisualPosts(estimateSegments, gateNodeHeightByKey, derivedFenceTopology.replacementNodeKeys),
    [derivedFenceTopology.replacementNodeKeys, estimateSegments, gateNodeHeightByKey]
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
    () =>
      buildSegmentLengthLabelsBySegmentId(
        segments,
        selectedSegmentId,
        viewScale,
        derivedFenceTopology.segmentSplitOffsetsBySegmentId
      ),
    [derivedFenceTopology.segmentSplitOffsetsBySegmentId, segments, selectedSegmentId, viewScale]
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
        resolvedFloodlightColumnPlacements,
        estimate
      }),
    [estimate, postHeightRows, resolvedBasketballPostPlacements, resolvedFloodlightColumnPlacements, resolvedGatePlacements]
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
    resolvedGoalUnits,
    resolvedKickboards,
    resolvedGateById,
    resolvedGatePlacements,
    resolvedPitchDividers,
    resolvedSideNettings,
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
