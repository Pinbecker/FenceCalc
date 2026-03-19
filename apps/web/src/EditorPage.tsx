import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import type Konva from "konva";
import {
  type BasketballPostPlacement,
  type FloodlightColumnPlacement,
  type GatePlacement,
  type GoalUnitPlacement,
  type KickboardAttachment,
  type LayoutModel,
  type LayoutSegment,
  type PitchDividerPlacement,
  type SideNettingAttachment
} from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import { EditorCanvasStage } from "./EditorCanvasStage";
import { EditorCanvasControls } from "./EditorCanvasControls";
import { EditorLengthEditor } from "./EditorLengthEditor";
import { EditorOverlayPanels } from "./EditorOverlayPanels";
import { EditorSidebar } from "./EditorSidebar";
import { EditorWorkspaceHeader } from "./EditorWorkspaceHeader";
import { exportDrawingPdfReport } from "./drawingPdfReport";
import { useEditorCommands } from "./editor/useEditorCommands";
import { useEditorDerivedState } from "./editor/useEditorDerivedState";
import { useEditorInteractionPreviews } from "./editor/useEditorInteractionPreviews";
import { useEditorNavigationGuards } from "./editor/useEditorNavigationGuards";
import { useEditorSelectionEffects } from "./editor/useEditorSelectionEffects";
import { useEditorSelectionState } from "./editor/useEditorSelectionState";
import { useEditorShellState } from "./editor/useEditorShellState";
import { useEditorWorkspaceBridge } from "./editor/useEditorWorkspaceBridge";
import {
  clampGatePlacementToSegment,
  chooseGridStep,
  useEditorCanvasViewport,
  useElementSize,
  BASKETBALL_ARM_LENGTH_OPTIONS_MM,
  formatHeightLabelFromMm,
  formatLengthMm,
  formatMetersInputFromMm,
  GATE_WIDTH_OPTIONS_MM,
  GOAL_UNIT_HEIGHT_OPTIONS_MM,
  GOAL_UNIT_WIDTH_OPTIONS_MM,
  getSegmentColor,
  historyReducer,
  INITIAL_VISIBLE_WIDTH_MM,
  KICKBOARD_SECTION_HEIGHT_OPTIONS_MM,
  MAX_SCALE,
  MIN_SCALE,
  OptimizationPlanner,
  RECESS_DEPTH_OPTIONS_MM,
  RECESS_INPUT_STEP_M,
  RECESS_WIDTH_OPTIONS_MM,
  ROLL_FORM_HEIGHT_OPTIONS,
  samePointApprox,
  SIDE_NETTING_HEIGHT_OPTIONS_MM,
  type HistoryState,
  TWIN_BAR_HEIGHT_OPTIONS,
  useEditorKeyboardShortcuts
} from "./editor";

interface EditorPageProps {
  initialDrawingId?: string | null;
  onNavigate: (
    route: "dashboard" | "drawings" | "editor" | "estimate" | "pricing" | "admin" | "login",
    query?: Record<string, string>
  ) => void;
}

function reconcileGatePlacementsForSegments(
  previousGates: GatePlacement[],
  previousSegments: LayoutSegment[],
  nextSegments: LayoutSegment[],
): GatePlacement[] {
  const previousSegmentsById = new Map(previousSegments.map((segment) => [segment.id, segment]));
  const nextSegmentsById = new Map(nextSegments.map((segment) => [segment.id, segment]));
  const next: GatePlacement[] = [];

  for (const placement of previousGates) {
    const nextSegment = nextSegmentsById.get(placement.segmentId);
    if (!nextSegment) {
      continue;
    }

    let adjustedPlacement = placement;
    const previousSegment = previousSegmentsById.get(placement.segmentId);
    if (previousSegment) {
      const startMoved = !samePointApprox(previousSegment.start, nextSegment.start);
      const endMoved = !samePointApprox(previousSegment.end, nextSegment.end);

      if (startMoved && !endMoved) {
        const previousLengthMm = distanceMm(previousSegment.start, previousSegment.end);
        const nextLengthMm = distanceMm(nextSegment.start, nextSegment.end);
        const lengthDeltaMm = nextLengthMm - previousLengthMm;
        if (Math.abs(lengthDeltaMm) > 0.001) {
          adjustedPlacement = {
            ...adjustedPlacement,
            startOffsetMm: adjustedPlacement.startOffsetMm + lengthDeltaMm,
            endOffsetMm: adjustedPlacement.endOffsetMm + lengthDeltaMm
          };
        }
      }
    }

    const segmentLengthMm = distanceMm(nextSegment.start, nextSegment.end);
    const clamped = clampGatePlacementToSegment(adjustedPlacement, segmentLengthMm);
    if (!clamped) {
      continue;
    }

    next.push({
      ...adjustedPlacement,
      startOffsetMm: clamped.startOffsetMm,
      endOffsetMm: clamped.endOffsetMm
    });
  }

  next.sort((left, right) => left.id.localeCompare(right.id));
  return next;
}

function reconcileBasketballPostsForSegments(
  previousBasketballPosts: BasketballPostPlacement[],
  nextSegments: LayoutSegment[],
): BasketballPostPlacement[] {
  const nextSegmentsById = new Map(nextSegments.map((segment) => [segment.id, segment]));
  const next: BasketballPostPlacement[] = [];

  for (const basketballPost of previousBasketballPosts) {
    const nextSegment = nextSegmentsById.get(basketballPost.segmentId);
    if (!nextSegment) {
      continue;
    }

    const segmentLengthMm = distanceMm(nextSegment.start, nextSegment.end);
    next.push({
      ...basketballPost,
      offsetMm: Math.max(0, Math.min(segmentLengthMm, basketballPost.offsetMm))
    });
  }

  next.sort((left, right) => left.id.localeCompare(right.id));
  return next;
}

function reconcileFloodlightColumnsForSegments(
  previousFloodlightColumns: FloodlightColumnPlacement[],
  nextSegments: LayoutSegment[],
): FloodlightColumnPlacement[] {
  const nextSegmentsById = new Map(nextSegments.map((segment) => [segment.id, segment]));
  const next: FloodlightColumnPlacement[] = [];

  for (const floodlightColumn of previousFloodlightColumns) {
    const nextSegment = nextSegmentsById.get(floodlightColumn.segmentId);
    if (!nextSegment) {
      continue;
    }

    const segmentLengthMm = distanceMm(nextSegment.start, nextSegment.end);
    next.push({
      ...floodlightColumn,
      offsetMm: Math.max(0, Math.min(segmentLengthMm, floodlightColumn.offsetMm))
    });
  }

  next.sort((left, right) => left.id.localeCompare(right.id));
  return next;
}

function reconcileGoalUnitsForSegments(
  previousGoalUnits: GoalUnitPlacement[],
  nextSegments: LayoutSegment[]
): GoalUnitPlacement[] {
  const nextSegmentsById = new Map(nextSegments.map((segment) => [segment.id, segment]));
  return previousGoalUnits
    .flatMap((goalUnit) => {
      const nextSegment = nextSegmentsById.get(goalUnit.segmentId);
      if (!nextSegment) {
        return [];
      }
      const segmentLengthMm = distanceMm(nextSegment.start, nextSegment.end);
      if (goalUnit.widthMm > segmentLengthMm) {
        return [];
      }
      const minCenterOffsetMm = goalUnit.widthMm / 2;
      const maxCenterOffsetMm = segmentLengthMm - goalUnit.widthMm / 2;
      return [{
        ...goalUnit,
        centerOffsetMm: Math.max(minCenterOffsetMm, Math.min(maxCenterOffsetMm, goalUnit.centerOffsetMm))
      }];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function reconcileKickboardsForSegments(
  previousKickboards: KickboardAttachment[],
  nextSegments: LayoutSegment[]
): KickboardAttachment[] {
  const nextSegmentIds = new Set(nextSegments.map((segment) => segment.id));
  return previousKickboards
    .filter((kickboard) => nextSegmentIds.has(kickboard.segmentId))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function reconcilePitchDividersForSegments(
  previousPitchDividers: PitchDividerPlacement[],
  nextSegments: LayoutSegment[]
): PitchDividerPlacement[] {
  const nextSegmentsById = new Map(nextSegments.map((segment) => [segment.id, segment]));
  return previousPitchDividers
    .flatMap((pitchDivider) => {
      const startSegment = nextSegmentsById.get(pitchDivider.startAnchor.segmentId);
      const endSegment = nextSegmentsById.get(pitchDivider.endAnchor.segmentId);
      if (!startSegment || !endSegment) {
        return [];
      }
      const startLengthMm = distanceMm(startSegment.start, startSegment.end);
      const endLengthMm = distanceMm(endSegment.start, endSegment.end);
      return [{
        ...pitchDivider,
        startAnchor: {
          ...pitchDivider.startAnchor,
          offsetMm: Math.max(0, Math.min(startLengthMm, pitchDivider.startAnchor.offsetMm))
        },
        endAnchor: {
          ...pitchDivider.endAnchor,
          offsetMm: Math.max(0, Math.min(endLengthMm, pitchDivider.endAnchor.offsetMm))
        }
      }];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function reconcileSideNettingsForSegments(
  previousSideNettings: SideNettingAttachment[],
  nextSegments: LayoutSegment[]
): SideNettingAttachment[] {
  const nextSegmentIds = new Set(nextSegments.map((segment) => segment.id));
  return previousSideNettings
    .filter((sideNetting) => nextSegmentIds.has(sideNetting.segmentId))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function EditorPage({ initialDrawingId = null, onNavigate }: EditorPageProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const { ref: canvasFrameRef, size: canvasFrameSize } = useElementSize<HTMLDivElement>();
  const [isEndpointDragActive, setIsEndpointDragActive] = useState(false);
  const [history, dispatchHistory] = useReducer(historyReducer, {
    past: [],
    present: {
      segments: [],
      gates: [],
      basketballPosts: [],
      floodlightColumns: [],
      goalUnits: [],
      kickboards: [],
      pitchDividers: [],
      sideNettings: []
    },
    future: []
  } satisfies HistoryState);
  const shellState = useEditorShellState();
  const selectionState = useEditorSelectionState(shellState.interactionMode);
  const currentLayout = history.present;
  const segments = currentLayout.segments;
  const gatePlacements = currentLayout.gates ?? [];
  const basketballPostPlacements = currentLayout.basketballPosts ?? [];
  const floodlightColumnPlacements = currentLayout.floodlightColumns ?? [];
  const goalUnitPlacements = currentLayout.goalUnits ?? [];
  const kickboardAttachments = currentLayout.kickboards ?? [];
  const pitchDividerPlacements = currentLayout.pitchDividers ?? [];
  const sideNettingAttachments = currentLayout.sideNettings ?? [];
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const isOptimizationFrozen =
    isEndpointDragActive ||
    selectionState.activeSegmentDrag !== null ||
    selectionState.activeGateDrag !== null ||
    selectionState.activeBasketballPostDrag !== null ||
    selectionState.activeFloodlightColumnDrag !== null;
  const canvasWidth = Math.max(Math.round(canvasFrameSize.width), 1);
  const canvasHeight = Math.max(Math.round(canvasFrameSize.height), 1);

  const {
    view,
    pointerWorld,
    setPointerWorld,
    isSpacePressed,
    setIsSpacePressed,
    isPanning,
    beginPan,
    updatePan,
    endPan,
    zoomAtPointer,
    restoreView,
    resetView,
    toWorld,
    visibleBounds,
    verticalLines,
    horizontalLines
  } = useEditorCanvasViewport({
    canvasWidth,
    canvasHeight,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
    initialVisibleWidthMm: INITIAL_VISIBLE_WIDTH_MM,
    chooseGridStep
  });

  const applyLayout = useCallback((updater: (previous: LayoutModel) => LayoutModel) => {
    dispatchHistory({ type: "APPLY", updater });
  }, []);

  const applySegments = useCallback(
    (updater: (previous: LayoutSegment[]) => LayoutSegment[]) => {
      applyLayout((previous) => {
        const nextSegments = updater(previous.segments);
        return {
          ...previous,
          segments: nextSegments,
          gates: reconcileGatePlacementsForSegments(previous.gates ?? [], previous.segments, nextSegments),
          basketballPosts: reconcileBasketballPostsForSegments(previous.basketballPosts ?? [], nextSegments),
          floodlightColumns: reconcileFloodlightColumnsForSegments(previous.floodlightColumns ?? [], nextSegments),
          goalUnits: reconcileGoalUnitsForSegments(previous.goalUnits ?? [], nextSegments),
          kickboards: reconcileKickboardsForSegments(previous.kickboards ?? [], nextSegments),
          pitchDividers: reconcilePitchDividersForSegments(previous.pitchDividers ?? [], nextSegments),
          sideNettings: reconcileSideNettingsForSegments(previous.sideNettings ?? [], nextSegments)
        };
      });
    },
    [applyLayout],
  );

  const applyGatePlacements = useCallback(
    (updater: (previous: GatePlacement[]) => GatePlacement[]) => {
      applyLayout((previous) => ({
        ...previous,
        gates: updater(previous.gates ?? [])
      }));
    },
    [applyLayout],
  );

  const applyBasketballPostPlacements = useCallback(
    (updater: (previous: BasketballPostPlacement[]) => BasketballPostPlacement[]) => {
      applyLayout((previous) => ({
        ...previous,
        basketballPosts: updater(previous.basketballPosts ?? [])
      }));
    },
    [applyLayout],
  );

  const applyFloodlightColumnPlacements = useCallback(
    (updater: (previous: FloodlightColumnPlacement[]) => FloodlightColumnPlacement[]) => {
      applyLayout((previous) => ({
        ...previous,
        floodlightColumns: updater(previous.floodlightColumns ?? [])
      }));
    },
    [applyLayout],
  );

  const workspace = useEditorWorkspaceBridge({
    getSavedViewport: () => view,
    layout: currentLayout,
    initialDrawingId,
    onResetLayout: (layout) => {
      dispatchHistory({
        type: "RESET",
        layout
      });
    },
    onResetEditorState: () => {
      selectionState.resetLoadedWorkspaceState();
      shellState.setSelectedPlanId(null);
    },
    onRestoreViewport: restoreView
  });

  const undoSegments = useCallback(() => {
    dispatchHistory({ type: "UNDO" });
    selectionState.clearHistorySelection();
  }, [selectionState]);

  const redoSegments = useCallback(() => {
    dispatchHistory({ type: "REDO" });
    selectionState.clearHistorySelection();
  }, [selectionState]);

  const {
    activeHeightOptions,
    connectivity,
    drawAnchorNodes,
    editorSummary,
    estimate,
    estimateSegments,
    gatesBySegmentId,
    highlightableOptimizationPlans,
    oppositeGateGuides,
    resolvedBasketballPostPlacements,
    resolvedFloodlightColumnPlacements,
    resolvedGatePlacements,
    resolvedGoalUnits,
    resolvedKickboards,
    placedGateVisuals,
    postTypeCounts,
    recessAlignmentAnchors,
    resolvedGateById,
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
    visibleSegmentLabelKeys
  } = useEditorDerivedState({
    segments,
    gatePlacements,
    basketballPostPlacements,
    floodlightColumnPlacements,
    goalUnitPlacements,
    kickboardAttachments,
    pitchDividerPlacements,
    sideNettingAttachments,
    selectedSegmentId: selectionState.selectedSegmentId,
    selectedPlanId: shellState.selectedPlanId,
    activeSpecSystem: shellState.activeSpec.system,
    viewScale: view.scale,
    canvasWidth,
    freezeOptimization: isOptimizationFrozen
  });
  const {
    postRowsByType,
    gateCounts,
    gateCountsByHeight,
    basketballPostCountsByHeight,
    floodlightColumnCountsByHeight,
    twinBarFenceRows,
    featureCounts,
    featureRowsByKind
  } = editorSummary;
  const optimizationSummary = estimate.optimization;
  const panelCount = estimate.materials.twinBarPanels + estimate.materials.twinBarPanelsSuperRebound;
  const fenceRunCount = estimateSegments.length;
  const resolvedBasketballPostById = useMemo(
    () => new Map(resolvedBasketballPostPlacements.map((basketballPost) => [basketballPost.id, basketballPost] as const)),
    [resolvedBasketballPostPlacements]
  );
  const resolvedFloodlightColumnById = useMemo(
    () => new Map(resolvedFloodlightColumnPlacements.map((floodlightColumn) => [floodlightColumn.id, floodlightColumn] as const)),
    [resolvedFloodlightColumnPlacements]
  );

  useEditorSelectionEffects({
    selectedSegment,
    selectedGateId: selectionState.selectedGateId,
    selectedBasketballPostId: selectionState.selectedBasketballPostId,
    selectedFloodlightColumnId: selectionState.selectedFloodlightColumnId,
    selectedPlanId: shellState.selectedPlanId,
    hasSelectedGate: selectionState.selectedGateId !== null && resolvedGateById.has(selectionState.selectedGateId),
    hasSelectedBasketballPost:
      selectionState.selectedBasketballPostId !== null &&
      resolvedBasketballPostById.has(selectionState.selectedBasketballPostId),
    hasSelectedFloodlightColumn:
      selectionState.selectedFloodlightColumnId !== null &&
      resolvedFloodlightColumnById.has(selectionState.selectedFloodlightColumnId),
    highlightablePlanIds: highlightableOptimizationPlans.map((plan) => plan.id),
    setSelectedGateId: selectionState.setSelectedGateId,
    setSelectedBasketballPostId: selectionState.setSelectedBasketballPostId,
    setSelectedFloodlightColumnId: selectionState.setSelectedFloodlightColumnId,
    setActiveGateDrag: selectionState.setActiveGateDrag,
    setActiveBasketballPostDrag: selectionState.setActiveBasketballPostDrag,
    setActiveFloodlightColumnDrag: selectionState.setActiveFloodlightColumnDrag,
    setIsLengthEditorOpen: selectionState.setIsLengthEditorOpen,
    setSelectedLengthInputM: selectionState.setSelectedLengthInputM,
    setSelectedPlanId: shellState.setSelectedPlanId
  });

  const {
    activeDrawNodeSnap,
    axisGuide,
    drawHoverSnap,
    basketballPostPreview,
    goalUnitPreview,
    floodlightColumnPreview,
    drawSnapLabel,
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
  } = useEditorInteractionPreviews({
    segments,
    lineSnapSegments: estimateSegments,
    interactionMode: shellState.interactionMode,
    pointerWorld,
    drawStart: selectionState.drawStart,
    drawChainStart: selectionState.drawChainStart,
    rectangleStart: selectionState.rectangleStart,
    drawAnchorNodes,
    disableSnap: shellState.disableSnap,
    viewScale: view.scale,
    recessAlignmentAnchors,
    recessWidthMm: shellState.recessWidthMm,
    recessDepthMm: shellState.recessDepthMm,
    recessSide: shellState.recessSide,
    goalUnitWidthMm: shellState.goalUnitWidthMm,
    goalUnitDepthMm: shellState.goalUnitDepthMm,
    goalUnitHeightMm: shellState.goalUnitHeightMm,
    gateType: shellState.gateType,
    customGateWidthMm: shellState.customGateWidthMm,
    basketballPlacementType: shellState.basketballPlacementType,
    basketballArmLengthMm: shellState.basketballArmLengthMm,
    placedGateVisuals,
    placedBasketballPostVisuals: resolvedBasketballPostPlacements,
    placedFloodlightColumnVisuals: resolvedFloodlightColumnPlacements,
    placedGoalUnitVisuals: resolvedGoalUnits,
    pendingPitchDividerStart: shellState.pendingPitchDividerStart,
    pendingSideNettingStart: shellState.pendingSideNettingStart,
    activeGateDragId: selectionState.activeGateDrag?.gateId ?? null,
    activeBasketballPostDragId: selectionState.activeBasketballPostDrag?.basketballPostId ?? null,
    activeFloodlightColumnDragId: selectionState.activeFloodlightColumnDrag?.floodlightColumnId ?? null
  });

  const {
    applySelectedLengthEdit,
    cancelActiveDrawing,
    deleteSelectedBasketballPost,
    deleteSelectedFloodlightColumn,
    deleteSelectedGate,
    deleteSelectedSegment,
    handleClearLayout,
    handleDeleteSelection,
    normalizeGateInputs,
    normalizeRecessInputs,
    onContextMenu,
    onCustomGateWidthInputChange,
    onRecessDepthInputChange,
    onRecessWidthInputChange,
    onStageMouseDown,
    onStageMouseMove,
    onStageMouseUp,
    onStageWheel,
    openLengthEditor,
    resetWorkspaceCanvas,
    startSelectedBasketballPostDrag,
    startSelectedFloodlightColumnDrag,
    startSelectedGateDrag,
    startSelectedSegmentDrag,
    updateSegment
  } = useEditorCommands({
    stageRef,
    applyLayout,
    applySegments,
    applyGatePlacements,
    applyBasketballPostPlacements,
    applyFloodlightColumnPlacements,
    segments,
    segmentsById,
    resolvedGateById,
    resolvedBasketballPostById,
    resolvedFloodlightColumnById,
    connectivity,
    activeSpec: shellState.activeSpec,
    interactionMode: shellState.interactionMode,
    goalUnitDepthMm: shellState.goalUnitDepthMm,
    goalUnitHeightMm: shellState.goalUnitHeightMm,
    gateType: shellState.gateType,
    basketballPlacementType: shellState.basketballPlacementType,
    basketballArmLengthMm: shellState.basketballArmLengthMm,
    kickboardSectionHeightMm: shellState.kickboardSectionHeightMm,
    kickboardProfile: shellState.kickboardProfile,
    sideNettingHeightMm: shellState.sideNettingHeightMm,
    pendingPitchDividerStart: shellState.pendingPitchDividerStart,
    pendingSideNettingStart: shellState.pendingSideNettingStart,
    drawStart: selectionState.drawStart,
    drawChainStart: selectionState.drawChainStart,
    rectangleStart: selectionState.rectangleStart,
    selectedSegmentId: selectionState.selectedSegmentId,
    selectedGateId: selectionState.selectedGateId,
    selectedBasketballPostId: selectionState.selectedBasketballPostId,
    selectedFloodlightColumnId: selectionState.selectedFloodlightColumnId,
    selectedLengthInputM: selectionState.selectedLengthInputM,
    isSpacePressed,
    isPanning,
    activeSegmentDrag: selectionState.activeSegmentDrag,
    activeGateDrag: selectionState.activeGateDrag,
    activeBasketballPostDrag: selectionState.activeBasketballPostDrag,
    activeFloodlightColumnDrag: selectionState.activeFloodlightColumnDrag,
    recessWidthMm: shellState.recessWidthMm,
    recessDepthMm: shellState.recessDepthMm,
    customGateWidthMm: shellState.customGateWidthMm,
    recessPreview,
    goalUnitPreview,
    gatePreview,
    basketballPostPreview,
    floodlightColumnPreview,
    kickboardPreview,
    pitchDividerAnchorPreview,
    pitchDividerPreview,
    sideNettingAnchorPreview,
    sideNettingPreview,
    resolveBasketballPostPreview,
    resolveFloodlightColumnPreview,
    resolvePitchDividerAnchorPreview,
    resolveSideNettingAnchorPreview,
    resolveDrawPoint,
    toWorld,
    beginPan,
    updatePan,
    endPan,
    zoomAtPointer,
    setPointerWorld,
    setDrawStart: selectionState.setDrawStart,
    setDrawChainStart: selectionState.setDrawChainStart,
    setRectangleStart: selectionState.setRectangleStart,
    setSelectedSegmentId: selectionState.setSelectedSegmentId,
    setSelectedGateId: selectionState.setSelectedGateId,
    setSelectedBasketballPostId: selectionState.setSelectedBasketballPostId,
    setSelectedFloodlightColumnId: selectionState.setSelectedFloodlightColumnId,
    setSelectedPlanId: shellState.setSelectedPlanId,
    setSelectedLengthInputM: selectionState.setSelectedLengthInputM,
    setIsLengthEditorOpen: selectionState.setIsLengthEditorOpen,
    setActiveSegmentDrag: selectionState.setActiveSegmentDrag,
    setActiveGateDrag: selectionState.setActiveGateDrag,
    setActiveBasketballPostDrag: selectionState.setActiveBasketballPostDrag,
    setActiveFloodlightColumnDrag: selectionState.setActiveFloodlightColumnDrag,
    setRecessWidthMm: shellState.setRecessWidthMm,
    setRecessDepthMm: shellState.setRecessDepthMm,
    setRecessWidthInputM: shellState.setRecessWidthInputM,
    setRecessDepthInputM: shellState.setRecessDepthInputM,
    setCustomGateWidthMm: shellState.setCustomGateWidthMm,
    setCustomGateWidthInputM: shellState.setCustomGateWidthInputM,
    setPendingPitchDividerStart: shellState.setPendingPitchDividerStart,
    setPendingSideNettingStart: shellState.setPendingSideNettingStart
  });

  const keyboardShortcutOptions = useMemo(
    () => ({
      undo: undoSegments,
      redo: redoSegments,
      deleteSelectedBasketballPost,
      deleteSelectedFloodlightColumn,
      deleteSelectedGate,
      deleteSelectedSegment,
      setInteractionMode: shellState.setInteractionMode,
      setIsSpacePressed,
      setDisableSnap: shellState.setDisableSnap,
      cancelActiveDrawing,
      finishActiveInteraction: cancelActiveDrawing
    }),
    [
      cancelActiveDrawing,
      deleteSelectedBasketballPost,
      deleteSelectedFloodlightColumn,
      deleteSelectedGate,
      deleteSelectedSegment,
      redoSegments,
      setIsSpacePressed,
      shellState.setDisableSnap,
      shellState.setInteractionMode,
      undoSegments
    ],
  );
  useEditorKeyboardShortcuts(keyboardShortcutOptions);

  const { confirmDiscardChanges, guardedNavigate } = useEditorNavigationGuards({
    isDirty: workspace.isDirty,
    onNavigate
  });
  const session = workspace.session;
  const canManageAdmin = session?.user.role === "OWNER" || session?.user.role === "ADMIN";
  const canManagePricing = session?.user.role === "OWNER" || session?.user.role === "ADMIN";
  const drawingTitle = workspace.currentDrawingName.trim() || (workspace.currentDrawingId ? "Untitled drawing" : "New drawing draft");
  const interactionLabel =
    shellState.interactionMode === "DRAW"
      ? "Draw"
      : shellState.interactionMode === "SELECT"
        ? "Select"
        : shellState.interactionMode === "RECTANGLE"
          ? "Rectangle"
          : shellState.interactionMode === "RECESS"
            ? "Recess"
            : shellState.interactionMode === "GOAL_UNIT"
              ? "Goal Unit"
              : shellState.interactionMode === "GATE"
                ? "Gate"
                : shellState.interactionMode === "BASKETBALL_POST"
                  ? "Basketball Post"
                  : shellState.interactionMode === "FLOODLIGHT_COLUMN"
                    ? "Floodlight Column"
                    : shellState.interactionMode === "KICKBOARD"
                      ? "Kickboard"
                      : shellState.interactionMode === "PITCH_DIVIDER"
                        ? "Pitch Divider"
                        : "Side Netting";

  function handleStartNewDraft(): void {
    if (!confirmDiscardChanges("Discard unsaved changes and start a new draft?")) {
      return;
    }

    resetWorkspaceCanvas();
    resetView();
    workspace.startNewDraft();
  }

  function handleOpenDrawings(): void {
    if (!confirmDiscardChanges("Discard unsaved changes and go back to the drawings library?")) {
      return;
    }

    onNavigate("drawings");
  }

  function handleExportPdf(): void {
    let canvasImageDataUrl: string | null = null;
    try {
      canvasImageDataUrl = stageRef.current?.toDataURL({
        pixelRatio: 2,
        mimeType: "image/png"
      }) ?? null;
    } catch {
      canvasImageDataUrl = null;
    }

    const opened = exportDrawingPdfReport({
      companyName: session?.company.name ?? null,
      preparedBy: session?.user.displayName ?? null,
      drawingTitle,
      drawingId: workspace.currentDrawingId,
      customerName: workspace.currentCustomerName,
      generatedAtIso: new Date().toISOString(),
      isDirty: workspace.isDirty,
      layout: currentLayout,
      canvasImageDataUrl,
      estimate,
      estimateSegments,
      segmentOrdinalById,
      resolvedGatePlacements,
      resolvedBasketballPostPlacements,
      resolvedFloodlightColumnPlacements
    });

    if (!opened) {
      window.alert("The PDF export could not open a new tab. Allow pop-ups for this site and try again.");
    }
  }

  return (
    <div className="editor-page">
      <EditorWorkspaceHeader
        session={session}
        drawingTitle={drawingTitle}
        currentDrawingId={workspace.currentDrawingId}
        currentDrawingName={workspace.currentDrawingName}
        currentCustomerName={workspace.currentCustomerName}
        isDirty={workspace.isDirty}
        isSavingDrawing={workspace.isSavingDrawing}
        canManagePricing={canManagePricing}
        canManageAdmin={canManageAdmin}
        onSetCurrentDrawingName={workspace.setCurrentDrawingName}
        onSetCurrentCustomerName={workspace.setCurrentCustomerName}
        onSaveDrawing={() => {
          void workspace.saveDrawing();
        }}
        onSaveDrawingAsNew={() => {
          void workspace.saveDrawingAsNew();
        }}
        onExportPdf={handleExportPdf}
        onStartNewDraft={handleStartNewDraft}
        onGoToLogin={() => guardedNavigate("login")}
        onNavigateDashboard={() => guardedNavigate("dashboard")}
        onNavigateDrawings={handleOpenDrawings}
        onNavigateEstimate={() => {
          if (!workspace.currentDrawingId || workspace.isDirty) {
            return;
          }
          guardedNavigate("estimate", { drawingId: workspace.currentDrawingId });
        }}
        onNavigatePricing={() => guardedNavigate("pricing")}
        onNavigateAdmin={() => guardedNavigate("admin")}
      />

      <div className="editor-workspace-shell">
        <EditorSidebar
          interactionMode={shellState.interactionMode}
          recessWidthInputM={shellState.recessWidthInputM}
          recessDepthInputM={shellState.recessDepthInputM}
          goalUnitWidthMm={shellState.goalUnitWidthMm}
          goalUnitHeightMm={shellState.goalUnitHeightMm}
          basketballPlacementType={shellState.basketballPlacementType}
          basketballArmLengthMm={shellState.basketballArmLengthMm}
          kickboardSectionHeightMm={shellState.kickboardSectionHeightMm}
          kickboardProfile={shellState.kickboardProfile}
          sideNettingHeightMm={shellState.sideNettingHeightMm}
          pendingPitchDividerStart={
            shellState.pendingPitchDividerStart
              ? {
                  segmentId: shellState.pendingPitchDividerStart.segment.id,
                  offsetMm: shellState.pendingPitchDividerStart.offsetMm
                }
              : null
          }
          pendingSideNettingStart={
            shellState.pendingSideNettingStart
              ? {
                  segmentId: shellState.pendingSideNettingStart.segment.id,
                  offsetMm: shellState.pendingSideNettingStart.offsetMm
                }
              : null
          }
          gateType={shellState.gateType}
          customGateWidthInputM={shellState.customGateWidthInputM}
          recessWidthOptionsMm={RECESS_WIDTH_OPTIONS_MM}
          recessDepthOptionsMm={RECESS_DEPTH_OPTIONS_MM}
          goalUnitWidthOptionsMm={GOAL_UNIT_WIDTH_OPTIONS_MM}
          goalUnitHeightOptionsMm={GOAL_UNIT_HEIGHT_OPTIONS_MM}
          basketballArmLengthOptionsMm={BASKETBALL_ARM_LENGTH_OPTIONS_MM}
          kickboardSectionHeightOptionsMm={KICKBOARD_SECTION_HEIGHT_OPTIONS_MM}
          sideNettingHeightOptionsMm={SIDE_NETTING_HEIGHT_OPTIONS_MM}
          gateWidthOptionsMm={GATE_WIDTH_OPTIONS_MM}
          recessPreview={recessPreview}
          gatePreview={gatePreview}
          basketballPostPreview={basketballPostPreview}
          floodlightColumnPreview={floodlightColumnPreview}
          goalUnitPreview={goalUnitPreview}
          kickboardPreview={
            kickboardPreview
              ? {
                  segmentId: kickboardPreview.segment.id,
                  snapMeta: kickboardPreview.snapMeta
                }
              : null
          }
          pitchDividerPreview={pitchDividerPreview}
          sideNettingPreview={
            sideNettingPreview
              ? {
                  lengthMm: sideNettingPreview.lengthMm,
                  snapMeta: sideNettingPreview.snapMeta
                }
              : null
          }
          activeSpec={shellState.activeSpec}
          activeHeightOptions={activeHeightOptions}
          twinBarHeightOptions={TWIN_BAR_HEIGHT_OPTIONS}
          rollFormHeightOptions={ROLL_FORM_HEIGHT_OPTIONS}
          formatLengthMm={formatLengthMm}
          formatMetersInputFromMm={formatMetersInputFromMm}
          getSegmentColor={getSegmentColor}
          onSetInteractionMode={shellState.setInteractionMode}
          onRecessWidthInputChange={onRecessWidthInputChange}
          onRecessDepthInputChange={onRecessDepthInputChange}
          onNormalizeRecessInputs={normalizeRecessInputs}
          onSetGoalUnitWidthMm={shellState.setGoalUnitWidthMm}
          onSetGoalUnitHeightMm={shellState.setGoalUnitHeightMm}
          onSetGateType={shellState.setGateType}
          onSetBasketballPlacementType={shellState.setBasketballPlacementType}
          onSetBasketballArmLengthMm={shellState.setBasketballArmLengthMm}
          onSetKickboardSectionHeightMm={shellState.setKickboardSectionHeightMm}
          onSetKickboardProfile={shellState.setKickboardProfile}
          onSetSideNettingHeightMm={shellState.setSideNettingHeightMm}
          onCustomGateWidthInputChange={onCustomGateWidthInputChange}
          onNormalizeGateInputs={normalizeGateInputs}
          onSetActiveSpec={shellState.setActiveSpec}
        />

        <section className="editor-stage-column">
          <div className="editor-stage-shell">
            <section className="panel-block editor-stage-toolbar editor-stage-toolbar-compact">
              <div className="editor-stage-toolbar-copy">
                <span className="portal-section-kicker">Mode</span>
                <h2>{interactionLabel}</h2>
              </div>
              <EditorCanvasControls
                canUndo={canUndo}
                canRedo={canRedo}
                canDeleteSelection={
                  shellState.interactionMode === "SELECT" &&
                  (!!selectionState.selectedSegmentId ||
                    !!selectionState.selectedGateId ||
                    !!selectionState.selectedBasketballPostId ||
                    !!selectionState.selectedFloodlightColumnId)
                }
                onUndo={undoSegments}
                onRedo={redoSegments}
                onResetView={resetView}
                onDeleteSelection={handleDeleteSelection}
                onClearLayout={handleClearLayout}
              />
            </section>

            <div className="editor-canvas-frame" ref={canvasFrameRef}>
              <EditorCanvasStage
                stageRef={stageRef}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                view={view}
                visibleBounds={visibleBounds}
                verticalLines={verticalLines}
                horizontalLines={horizontalLines}
                interactionMode={shellState.interactionMode}
                gateType={shellState.gateType}
                disableSnap={shellState.disableSnap}
                isPanning={isPanning}
                drawStart={selectionState.drawStart}
                rectangleStart={selectionState.rectangleStart}
                ghostEnd={ghostEnd}
                ghostLengthMm={ghostLengthMm}
                axisGuide={axisGuide}
                activeDrawNodeSnap={activeDrawNodeSnap}
                drawHoverSnap={drawHoverSnap}
                drawSnapLabel={drawSnapLabel}
                rectanglePreviewEnd={rectanglePreviewEnd}
                recessPreview={recessPreview}
                goalUnitPreview={goalUnitPreview}
                gatePreview={gatePreview}
                basketballPostPreview={basketballPostPreview}
                floodlightColumnPreview={floodlightColumnPreview}
                kickboardPreview={kickboardPreview}
                pitchDividerPreview={pitchDividerPreview}
                pitchDividerAnchorPreview={pitchDividerAnchorPreview}
                sideNettingPreview={sideNettingPreview}
                sideNettingAnchorPreview={sideNettingAnchorPreview}
                pendingPitchDividerStart={shellState.pendingPitchDividerStart}
                pendingSideNettingStart={shellState.pendingSideNettingStart}
                gatePreviewVisual={gatePreviewVisual}
                hoveredBasketballPostId={hoveredBasketballPostId}
                hoveredFloodlightColumnId={hoveredFloodlightColumnId}
                hoveredSegmentId={hoveredSegmentId}
                hoveredGateId={hoveredGateId}
                closeLoopPoint={closeLoopPoint}
                visualPosts={visualPosts}
                segments={segments}
                selectedSegmentId={selectionState.selectedSegmentId}
                selectedGateId={selectionState.selectedGateId}
                selectedBasketballPostId={selectionState.selectedBasketballPostId}
                selectedFloodlightColumnId={selectionState.selectedFloodlightColumnId}
                gatesBySegmentId={gatesBySegmentId}
                segmentLengthLabelsBySegmentId={segmentLengthLabelsBySegmentId}
                visibleSegmentLabelKeys={visibleSegmentLabelKeys}
                placedBasketballPostVisuals={resolvedBasketballPostPlacements}
                placedFloodlightColumnVisuals={resolvedFloodlightColumnPlacements}
                goalUnitVisuals={resolvedGoalUnits}
                kickboardVisuals={resolvedKickboards}
                pitchDividerVisuals={resolvedPitchDividers}
                sideNettingVisuals={resolvedSideNettings}
                placedGateVisuals={placedGateVisuals}
                oppositeGateGuides={oppositeGateGuides}
                selectedPlanVisual={selectedPlanVisual}
                scaleBar={scaleBar}
                onStageMouseDown={onStageMouseDown}
                onStageMouseMove={onStageMouseMove}
                onStageMouseUp={onStageMouseUp}
                onStageDoubleClick={cancelActiveDrawing}
                onStageWheel={onStageWheel}
                onContextMenu={onContextMenu}
                onSelectSegment={(segmentId) => {
                  selectionState.setSelectedSegmentId(segmentId);
                  selectionState.setSelectedGateId(null);
                  selectionState.setSelectedBasketballPostId(null);
                  selectionState.setSelectedFloodlightColumnId(null);
                  selectionState.setDrawStart(null);
                }}
                onStartSegmentDrag={(segmentId) => {
                  selectionState.setSelectedGateId(null);
                  selectionState.setSelectedBasketballPostId(null);
                  selectionState.setSelectedFloodlightColumnId(null);
                  startSelectedSegmentDrag(segmentId);
                }}
                onOpenSegmentLengthEditor={(segmentId) => {
                  selectionState.setSelectedGateId(null);
                  selectionState.setSelectedBasketballPostId(null);
                  selectionState.setSelectedFloodlightColumnId(null);
                  openLengthEditor(segmentId);
                }}
                onUpdateSegmentEndpoint={(segmentId, endpoint, point) => {
                  updateSegment(segmentId, (current) => ({ ...current, [endpoint]: point }));
                }}
                onStartSegmentEndpointDrag={() => setIsEndpointDragActive(true)}
                onEndSegmentEndpointDrag={() => setIsEndpointDragActive(false)}
                onSelectGate={(gateId) => {
                  selectionState.setSelectedSegmentId(null);
                  selectionState.setSelectedGateId(gateId);
                  selectionState.setSelectedBasketballPostId(null);
                  selectionState.setSelectedFloodlightColumnId(null);
                  selectionState.setIsLengthEditorOpen(false);
                }}
                onStartGateDrag={(gateId) => {
                  selectionState.setSelectedSegmentId(null);
                  selectionState.setSelectedGateId(gateId);
                  selectionState.setSelectedBasketballPostId(null);
                  selectionState.setSelectedFloodlightColumnId(null);
                  selectionState.setIsLengthEditorOpen(false);
                  startSelectedGateDrag(gateId);
                }}
                onSelectBasketballPost={(basketballPostId) => {
                  selectionState.setSelectedSegmentId(null);
                  selectionState.setSelectedGateId(null);
                  selectionState.setSelectedBasketballPostId(basketballPostId);
                  selectionState.setSelectedFloodlightColumnId(null);
                  selectionState.setIsLengthEditorOpen(false);
                }}
                onStartBasketballPostDrag={(basketballPostId) => {
                  selectionState.setSelectedSegmentId(null);
                  selectionState.setSelectedGateId(null);
                  selectionState.setSelectedBasketballPostId(basketballPostId);
                  selectionState.setSelectedFloodlightColumnId(null);
                  selectionState.setIsLengthEditorOpen(false);
                  startSelectedBasketballPostDrag(basketballPostId);
                }}
                onSelectFloodlightColumn={(floodlightColumnId) => {
                  selectionState.setSelectedSegmentId(null);
                  selectionState.setSelectedGateId(null);
                  selectionState.setSelectedBasketballPostId(null);
                  selectionState.setSelectedFloodlightColumnId(floodlightColumnId);
                  selectionState.setIsLengthEditorOpen(false);
                }}
                onStartFloodlightColumnDrag={(floodlightColumnId) => {
                  selectionState.setSelectedSegmentId(null);
                  selectionState.setSelectedGateId(null);
                  selectionState.setSelectedBasketballPostId(null);
                  selectionState.setSelectedFloodlightColumnId(floodlightColumnId);
                  selectionState.setIsLengthEditorOpen(false);
                  startSelectedFloodlightColumnDrag(floodlightColumnId);
                }}
              />
            </div>
          </div>
        </section>

        <aside className="editor-secondary-rail">
          <div className="editor-rail-scroll">
            <OptimizationPlanner
              summary={optimizationSummary}
              estimateSegments={estimateSegments}
              gates={resolvedGatePlacements}
              basketballPosts={resolvedBasketballPostPlacements}
              floodlightColumns={resolvedFloodlightColumnPlacements}
              goalUnits={resolvedGoalUnits}
              kickboards={resolvedKickboards}
              pitchDividers={resolvedPitchDividers}
              sideNettings={resolvedSideNettings}
              canInspect={segments.length > 0}
              isOpen={shellState.isOptimizationInspectorOpen}
              selectedPlanId={shellState.selectedPlanId}
              segmentOrdinalById={segmentOrdinalById}
              onOpen={() => shellState.setIsOptimizationInspectorOpen(true)}
              onClose={() => shellState.setIsOptimizationInspectorOpen(false)}
              onSelectPlan={shellState.setSelectedPlanId}
            />
            <EditorOverlayPanels
              postRowsByType={postRowsByType}
              gateCounts={gateCounts}
              gateCountsByHeight={gateCountsByHeight}
              basketballPostCountsByHeight={basketballPostCountsByHeight}
              floodlightColumnCountsByHeight={floodlightColumnCountsByHeight}
              twinBarFenceRows={twinBarFenceRows}
              featureCounts={featureCounts}
              featureRowsByKind={featureRowsByKind}
              postTypeCounts={postTypeCounts}
              panelCount={panelCount}
              fenceRunCount={fenceRunCount}
              isTutorialOpen={shellState.isTutorialOpen}
              onOpenTutorial={() => shellState.setIsTutorialOpen(true)}
              onCloseTutorial={() => shellState.setIsTutorialOpen(false)}
              formatHeightLabelFromMm={formatHeightLabelFromMm}
            />
          </div>
        </aside>
      </div>

      <EditorLengthEditor
        isOpen={selectionState.isLengthEditorOpen && selectedSegment !== null}
        selectedComponentClosed={selectedComponentClosed}
        selectedLengthInputM={selectionState.selectedLengthInputM}
        inputStepM={RECESS_INPUT_STEP_M}
        onChangeLength={selectionState.setSelectedLengthInputM}
        onApply={applySelectedLengthEdit}
        onCancel={() => selectionState.setIsLengthEditorOpen(false)}
      />
    </div>
  );
}
