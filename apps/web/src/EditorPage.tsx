import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import type { LayoutSegment } from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import { EditorDrawingSaveModal } from "./EditorDrawingSaveModal";
import { EditorLengthEditor } from "./EditorLengthEditor";
import { EditorMenuBar } from "./EditorMenuBar";
import { EditorWorkspaceShell } from "./EditorWorkspaceShell";
import { getPricingConfig } from "./apiClient";
import {
  DEFAULT_EDITOR_PRICING_OPTIONS,
  buildEditorPricingOptions,
  type EditorPricingOptions,
} from "./editor/pricingEditorOptions";
import { useEditorCommands } from "./editor/useEditorCommands";
import { useEditorDerivedState } from "./editor/useEditorDerivedState";
import { useEditorInteractionPreviews } from "./editor/useEditorInteractionPreviews";
import { useEditorLayoutHistory } from "./editor/useEditorLayoutHistory";
import { useEditorNavigationGuards } from "./editor/useEditorNavigationGuards";
import { useEditorPageActions } from "./editor/useEditorPageActions";
import { useEditorSelectionEffects } from "./editor/useEditorSelectionEffects";
import { useEditorSelectionState } from "./editor/useEditorSelectionState";
import { useEditorShellState } from "./editor/useEditorShellState";
import { useEditorWorkspaceBridge } from "./editor/useEditorWorkspaceBridge";
import {
  chooseGridStep,
  useEditorCanvasViewport,
  useElementSize,
  formatHeightLabelFromMm,
  formatLengthMm,
  formatMetersInputFromMm,
  GATE_WIDTH_OPTIONS_MM,
  getSegmentColor,
  INITIAL_VISIBLE_WIDTH_MM,
  MAX_SCALE,
  MIN_SCALE,
  pointCoordinateKey,
  RECESS_DEPTH_OPTIONS_MM,
  RECESS_INPUT_STEP_M,
  RECESS_WIDTH_OPTIONS_MM,
  ROLL_FORM_HEIGHT_OPTIONS,
  TWIN_BAR_HEIGHT_OPTIONS,
  useEditorKeyboardShortcuts,
} from "./editor";

interface EditorPageProps {
  initialDrawingId?: string | null;
  onNavigate: (
    route:
      | "dashboard"
      | "tasks"
      | "drawings"
      | "customers"
      | "customer"
      | "job"
      | "drawing"
      | "editor"
      | "estimate"
      | "pricing"
      | "admin"
      | "login",
    query?: Record<string, string>,
  ) => void;
}

function normalizeSelectedSegmentIds(
  selectedSegmentIds: string[],
  selectedSegmentId: string | null,
  segmentsById: Map<string, LayoutSegment>
) {
  if (selectedSegmentIds.length > 0) {
    return selectedSegmentIds.filter((segmentId) => segmentsById.has(segmentId));
  }
  return selectedSegmentId && segmentsById.has(selectedSegmentId) ? [selectedSegmentId] : [];
}

function buildConnectedSegmentSelection(
  currentSelectionIds: string[],
  segmentId: string,
  segmentsById: Map<string, LayoutSegment>,
  append = false
) {
  if (!append) {
    return {
      selectedIds: [segmentId],
      primaryId: segmentId
    };
  }

  const normalizedCurrentSelection = currentSelectionIds.filter((selectedId) => segmentsById.has(selectedId));
  if (normalizedCurrentSelection.length === 0 || normalizedCurrentSelection.includes(segmentId)) {
    return {
      selectedIds: normalizedCurrentSelection.length > 0 ? normalizedCurrentSelection : [segmentId],
      primaryId: segmentId
    };
  }

  const candidate = segmentsById.get(segmentId);
  if (!candidate) {
    return {
      selectedIds: normalizedCurrentSelection,
      primaryId: normalizedCurrentSelection[0] ?? segmentId
    };
  }

  const selectedNodeKeys = new Set<string>();
  normalizedCurrentSelection.forEach((selectedId) => {
    const segment = segmentsById.get(selectedId);
    if (!segment) {
      return;
    }
    selectedNodeKeys.add(pointCoordinateKey(segment.start));
    selectedNodeKeys.add(pointCoordinateKey(segment.end));
  });

  const sharesNode =
    selectedNodeKeys.has(pointCoordinateKey(candidate.start)) ||
    selectedNodeKeys.has(pointCoordinateKey(candidate.end));

  if (!sharesNode) {
    return {
      selectedIds: [segmentId],
      primaryId: segmentId
    };
  }

  return {
    selectedIds: [...normalizedCurrentSelection, segmentId],
    primaryId: segmentId
  };
}

export function EditorPage({ initialDrawingId = null, onNavigate }: EditorPageProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const { ref: canvasFrameRef, size: canvasFrameSize } = useElementSize<HTMLDivElement>();
  const [isEndpointDragActive, setIsEndpointDragActive] = useState(false);
  const [isItemCountsVisible, setIsItemCountsVisible] = useState(false);
  const [isPostKeyVisible, setIsPostKeyVisible] = useState(false);
  const [drawingModalMode, setDrawingModalMode] = useState<"saveAs" | null>(null);
  const [editorPricingOptions, setEditorPricingOptions] = useState<EditorPricingOptions>(
    DEFAULT_EDITOR_PRICING_OPTIONS,
  );
  const {
    currentLayout,
    segments,
    gatePlacements,
    basketballPostPlacements,
    floodlightColumnPlacements,
    goalUnitPlacements,
    kickboardAttachments,
    pitchDividerPlacements,
    sideNettingAttachments,
    canUndo,
    canRedo,
    applyLayout,
    applySegments,
    applyGatePlacements,
    applyBasketballPostPlacements,
    applyFloodlightColumnPlacements,
    beginLayoutBatch,
    commitLayoutBatch,
    resetLayout,
    undoLayout,
    redoLayout,
  } = useEditorLayoutHistory();
  const shellState = useEditorShellState();
  const selectionState = useEditorSelectionState(shellState.interactionMode);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pricingConfig = await getPricingConfig();
        if (!cancelled) {
          setEditorPricingOptions(buildEditorPricingOptions(pricingConfig.workbook));
        }
      } catch {
        if (!cancelled) {
          setEditorPricingOptions(DEFAULT_EDITOR_PRICING_OPTIONS);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const firstKickboardOption = editorPricingOptions.kickboardOptions[0];
    if (
      firstKickboardOption &&
      !editorPricingOptions.kickboardOptions.some(
        (option) =>
          option.sectionHeightMm === shellState.kickboardSectionHeightMm &&
          option.thicknessMm === shellState.kickboardThicknessMm &&
          option.profile === shellState.kickboardProfile &&
          option.boardLengthMm === shellState.kickboardBoardLengthMm,
      )
    ) {
      shellState.setKickboardSectionHeightMm(firstKickboardOption.sectionHeightMm);
      shellState.setKickboardThicknessMm(firstKickboardOption.thicknessMm);
      shellState.setKickboardProfile(firstKickboardOption.profile);
      shellState.setKickboardBoardLengthMm(firstKickboardOption.boardLengthMm);
    }
    const firstGoalUnitOption = editorPricingOptions.goalUnitOptions[0];
    if (
      firstGoalUnitOption &&
      !editorPricingOptions.goalUnitOptions.some(
        (option) =>
          option.widthMm === shellState.goalUnitWidthMm &&
          option.goalHeightMm === shellState.goalUnitHeightMm &&
          option.hasBasketballPost === shellState.goalUnitHasBasketballPost,
      )
    ) {
      shellState.setGoalUnitWidthMm(firstGoalUnitOption.widthMm);
      shellState.setGoalUnitHeightMm(firstGoalUnitOption.goalHeightMm);
      shellState.setGoalUnitHasBasketballPost(firstGoalUnitOption.hasBasketballPost);
    }
    const firstBasketballArm = editorPricingOptions.basketballArmLengthOptionsMm[0];
    if (firstBasketballArm && !editorPricingOptions.basketballArmLengthOptionsMm.includes(shellState.basketballArmLengthMm)) {
      shellState.setBasketballArmLengthMm(firstBasketballArm);
    }
    const firstFloodlightHeight = editorPricingOptions.floodlightColumnHeightOptionsMm[0];
    if (firstFloodlightHeight && !editorPricingOptions.floodlightColumnHeightOptionsMm.includes(shellState.floodlightColumnHeightMm)) {
      shellState.setFloodlightColumnHeightMm(firstFloodlightHeight);
    }
    const firstSideNettingHeight = editorPricingOptions.sideNettingHeightOptionsMm[0];
    if (firstSideNettingHeight && !editorPricingOptions.sideNettingHeightOptionsMm.includes(shellState.sideNettingHeightMm)) {
      shellState.setSideNettingHeightMm(firstSideNettingHeight);
    }
  }, [
    editorPricingOptions,
    shellState.basketballArmLengthMm,
    shellState.floodlightColumnHeightMm,
    shellState.goalUnitHasBasketballPost,
    shellState.goalUnitHeightMm,
    shellState.goalUnitWidthMm,
    shellState.kickboardBoardLengthMm,
    shellState.kickboardProfile,
    shellState.kickboardSectionHeightMm,
    shellState.kickboardThicknessMm,
    shellState.setBasketballArmLengthMm,
    shellState.setFloodlightColumnHeightMm,
    shellState.setGoalUnitHasBasketballPost,
    shellState.setGoalUnitHeightMm,
    shellState.setGoalUnitWidthMm,
    shellState.setKickboardBoardLengthMm,
    shellState.setKickboardProfile,
    shellState.setKickboardSectionHeightMm,
    shellState.setKickboardThicknessMm,
    shellState.setSideNettingHeightMm,
    shellState.sideNettingHeightMm,
  ]);
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
    resetView,
    fitWorldBounds,
    restoreView,
    toWorld,
    visibleBounds,
    verticalLines,
    horizontalLines,
  } = useEditorCanvasViewport({
    canvasWidth,
    canvasHeight,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
    initialVisibleWidthMm: INITIAL_VISIBLE_WIDTH_MM,
    chooseGridStep,
  });
  const workspace = useEditorWorkspaceBridge({
    getSavedViewport: () => view,
    layout: currentLayout,
    initialDrawingId,
    onResetLayout: (layout) => {
      resetLayout(layout);
    },
    onResetEditorState: () => {
      selectionState.resetLoadedWorkspaceState();
      shellState.setSelectedPlanId(null);
    },
    onRestoreViewport: restoreView,
  });
  const isQuotedViewOnly = workspace.currentDrawingStatus === "QUOTED";
  const interactionMode = isQuotedViewOnly ? "SELECT" : shellState.interactionMode;

  const undoSegments = useCallback(() => {
    undoLayout();
    selectionState.clearHistorySelection();
  }, [selectionState, undoLayout]);

  const redoSegments = useCallback(() => {
    redoLayout();
    selectionState.clearHistorySelection();
  }, [redoLayout, selectionState]);

  const {
    activeHeightOptions,
    connectivity,
    drawAnchorNodes,
    editorSummary,
    estimate,
    estimateSegments,
    featureHostSegments,
    featureHostSegmentsById,
    gatesBySegmentId,
    goalUnitOpeningsBySegmentId,
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
    visibleSegmentLabelKeys,
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
    freezeOptimization: isOptimizationFrozen,
  });
  const normalizedSelectedSegmentIds = useMemo(
    () =>
      normalizeSelectedSegmentIds(
        selectionState.selectedSegmentIds,
        selectionState.selectedSegmentId,
        segmentsById
      ),
    [segmentsById, selectionState.selectedSegmentId, selectionState.selectedSegmentIds]
  );
  const {
    postRowsByType,
    gateCounts,
    gateCountsByHeight,
    basketballPostCountsByHeight,
    floodlightColumnCountsByHeight,
    twinBarFenceRows,
    panelCount,
    featureCounts,
    featureRowsByKind,
  } = editorSummary;
  const optimizationSummary = estimate.optimization;
  const fenceRunCount = estimateSegments.length;
  const resolvedBasketballPostById = useMemo(
    () =>
      new Map(
        resolvedBasketballPostPlacements.map(
          (basketballPost) => [basketballPost.id, basketballPost] as const,
        ),
      ),
    [resolvedBasketballPostPlacements],
  );
  const resolvedFloodlightColumnById = useMemo(
    () =>
      new Map(
        resolvedFloodlightColumnPlacements.map(
          (floodlightColumn) => [floodlightColumn.id, floodlightColumn] as const,
        ),
      ),
    [resolvedFloodlightColumnPlacements],
  );

  useEditorSelectionEffects({
    selectedSegment,
    selectedGateId: selectionState.selectedGateId,
    selectedBasketballPostId: selectionState.selectedBasketballPostId,
    selectedFloodlightColumnId: selectionState.selectedFloodlightColumnId,
    selectedPlanId: shellState.selectedPlanId,
    hasSelectedGate:
      selectionState.selectedGateId !== null && resolvedGateById.has(selectionState.selectedGateId),
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
    setSelectedPlanId: shellState.setSelectedPlanId,
  });

  useEffect(() => {
    if (normalizedSelectedSegmentIds.length <= 1) {
      return;
    }
    selectionState.setIsLengthEditorOpen(false);
  }, [normalizedSelectedSegmentIds.length, selectionState.setIsLengthEditorOpen]);

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
    sideNettingAnchorPreview,
    sideNettingPreview,
    rectanglePreviewEnd,
    recessPreview,
    resolveBasketballPostPreview,
    resolveFloodlightColumnPreview,
    resolvePitchDividerAnchorPreview,
    resolveSideNettingAnchorPreview,
    resolveSideNettingSegmentPreview,
    sideNettingSegmentPreview,
    closeLoopPoint,
    resolveDrawPoint,
  } = useEditorInteractionPreviews({
    segments,
    featureHostSegments,
    goalUnitOpeningsBySegmentId,
    lineSnapSegments: estimateSegments,
    interactionMode,
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
    activeFloodlightColumnDragId:
      selectionState.activeFloodlightColumnDrag?.floodlightColumnId ?? null,
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
    startSelectedBasketballPostDrag,
    startSelectedFloodlightColumnDrag,
    startSelectedGateDrag,
    startSelectedSegmentDrag,
    updateSegment,
  } = useEditorCommands({
    stageRef,
    applyLayout,
    applySegments,
    applyGatePlacements,
    applyBasketballPostPlacements,
    applyFloodlightColumnPlacements,
    beginLayoutBatch,
    commitLayoutBatch,
    segments,
    segmentsById,
    featureHostSegmentsById,
    goalUnitOpeningsBySegmentId,
    resolvedGateById,
    resolvedBasketballPostById,
    resolvedFloodlightColumnById,
    connectivity,
    activeSpec: shellState.activeSpec,
    isReadOnly: isQuotedViewOnly,
    interactionMode,
    goalUnitDepthMm: shellState.goalUnitDepthMm,
    goalUnitHasBasketballPost: shellState.goalUnitHasBasketballPost,
    goalUnitHeightMm: shellState.goalUnitHeightMm,
    gateType: shellState.gateType,
    basketballPlacementType: shellState.basketballPlacementType,
    basketballArmLengthMm: shellState.basketballArmLengthMm,
    kickboardSectionHeightMm: shellState.kickboardSectionHeightMm,
    kickboardProfile: shellState.kickboardProfile,
    kickboardThicknessMm: shellState.kickboardThicknessMm,
    kickboardBoardLengthMm: shellState.kickboardBoardLengthMm,
    floodlightColumnHeightMm: shellState.floodlightColumnHeightMm,
    sideNettingHeightMm: shellState.sideNettingHeightMm,
    pendingPitchDividerStart: shellState.pendingPitchDividerStart,
    drawAnchorNodes,
    lineSnapSegments: estimateSegments,
    drawStart: selectionState.drawStart,
    drawChainStart: selectionState.drawChainStart,
    rectangleStart: selectionState.rectangleStart,
    selectedSegmentId: selectionState.selectedSegmentId,
    selectedSegmentIds: selectionState.selectedSegmentIds,
    selectedGateId: selectionState.selectedGateId,
    selectedBasketballPostId: selectionState.selectedBasketballPostId,
    selectedFloodlightColumnId: selectionState.selectedFloodlightColumnId,
    selectedLengthInputM: selectionState.selectedLengthInputM,
    disableSnap: shellState.disableSnap,
    isSpacePressed,
    isPanning,
    activeSegmentDrag: selectionState.activeSegmentDrag,
    segmentDragReference: selectionState.segmentDragReference,
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
    pendingSideNettingStart: shellState.pendingSideNettingStart,
    sideNettingAnchorPreview,
    sideNettingPreview,
    sideNettingSegmentPreview,
    resolveBasketballPostPreview,
    resolveFloodlightColumnPreview,
    resolvePitchDividerAnchorPreview,
    resolveSideNettingAnchorPreview,
    resolveSideNettingSegmentPreview,
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
    setSelectedSegmentIds: selectionState.setSelectedSegmentIds,
    setSelectedGateId: selectionState.setSelectedGateId,
    setSelectedBasketballPostId: selectionState.setSelectedBasketballPostId,
    setSelectedFloodlightColumnId: selectionState.setSelectedFloodlightColumnId,
    setSuppressNextSegmentClick: selectionState.setSuppressNextSegmentClick,
    setSelectedPlanId: shellState.setSelectedPlanId,
    setSelectedLengthInputM: selectionState.setSelectedLengthInputM,
    setIsLengthEditorOpen: selectionState.setIsLengthEditorOpen,
    setActiveSegmentDrag: selectionState.setActiveSegmentDrag,
    setSegmentDragReference: selectionState.setSegmentDragReference,
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
    setPendingSideNettingStart: shellState.setPendingSideNettingStart,
  });

  const keyboardShortcutOptions = useMemo(
    () => ({
      undo: () => {
        if (isQuotedViewOnly) {
          return;
        }
        undoSegments();
      },
      redo: () => {
        if (isQuotedViewOnly) {
          return;
        }
        redoSegments();
      },
      deleteSelectedBasketballPost,
      deleteSelectedFloodlightColumn,
      deleteSelectedGate,
      deleteSelectedSegment,
      setInteractionMode: (mode: Parameters<typeof shellState.setInteractionMode>[0]) => {
        if (isQuotedViewOnly) {
          return;
        }
        shellState.setInteractionMode(mode);
      },
      setIsSpacePressed,
      setDisableSnap: shellState.setDisableSnap,
      cancelActiveDrawing,
      finishActiveInteraction: cancelActiveDrawing,
    }),
    [
      cancelActiveDrawing,
      deleteSelectedBasketballPost,
      deleteSelectedFloodlightColumn,
      deleteSelectedGate,
      deleteSelectedSegment,
      isQuotedViewOnly,
      redoSegments,
      setIsSpacePressed,
      shellState.setDisableSnap,
      shellState.setInteractionMode,
      undoSegments,
    ],
  );
  useEditorKeyboardShortcuts(keyboardShortcutOptions);

  const { confirmDiscardChanges, guardedNavigate } = useEditorNavigationGuards({
    isDirty: workspace.isDirty,
    onNavigate,
  });
  const session = workspace.session;
  useEffect(() => {
    if (!session) {
      setDrawingModalMode(null);
    }
  }, [session]);

  useEffect(() => {
    if (!isQuotedViewOnly) {
      return;
    }
    if (shellState.interactionMode !== "SELECT") {
      shellState.setInteractionMode("SELECT");
    }
    selectionState.setIsLengthEditorOpen(false);
    setIsEndpointDragActive(false);
    setDrawingModalMode((current) => (current === "saveAs" ? null : current));
  }, [
    isQuotedViewOnly,
    selectionState.setIsLengthEditorOpen,
    shellState.interactionMode,
    shellState.setInteractionMode,
  ]);

  const handleSelectSegment = useCallback(
    (segmentId: string, options?: { append?: boolean }) => {
      if (selectionState.suppressNextSegmentClick) {
        selectionState.setSuppressNextSegmentClick(false);
        return;
      }
      const nextSelection = buildConnectedSegmentSelection(
        normalizedSelectedSegmentIds,
        segmentId,
        segmentsById,
        options?.append ?? false
      );
      selectionState.setSelectedSegmentId(nextSelection.primaryId);
      selectionState.setSelectedSegmentIds(nextSelection.selectedIds);
      selectionState.setSelectedGateId(null);
      selectionState.setSelectedBasketballPostId(null);
      selectionState.setSelectedFloodlightColumnId(null);
      selectionState.setDrawStart(null);
      if (nextSelection.selectedIds.length !== 1 || nextSelection.primaryId !== selectionState.selectedSegmentId) {
        selectionState.setIsLengthEditorOpen(false);
      }
      selectionState.setSuppressNextSegmentClick(false);
    },
    [
      normalizedSelectedSegmentIds,
      segmentsById,
      selectionState.selectedSegmentId,
      selectionState.setSuppressNextSegmentClick,
      selectionState.setDrawStart,
      selectionState.setIsLengthEditorOpen,
      selectionState.setSelectedBasketballPostId,
      selectionState.setSelectedFloodlightColumnId,
      selectionState.setSelectedGateId,
      selectionState.setSelectedSegmentId,
      selectionState.setSelectedSegmentIds,
      selectionState.suppressNextSegmentClick,
    ]
  );

  const handleStartSegmentDrag = useCallback(
    (segmentId: string) => {
      selectionState.setSelectedSegmentId(segmentId);
      selectionState.setSelectedSegmentIds(
        normalizedSelectedSegmentIds.includes(segmentId) ? normalizedSelectedSegmentIds : [segmentId]
      );
      selectionState.setSelectedGateId(null);
      selectionState.setSelectedBasketballPostId(null);
      selectionState.setSelectedFloodlightColumnId(null);
      selectionState.setIsLengthEditorOpen(false);
      selectionState.setSuppressNextSegmentClick(false);
      startSelectedSegmentDrag(segmentId);
    },
    [
      normalizedSelectedSegmentIds,
      selectionState.setIsLengthEditorOpen,
      selectionState.setSelectedBasketballPostId,
      selectionState.setSelectedFloodlightColumnId,
      selectionState.setSelectedGateId,
      selectionState.setSelectedSegmentId,
      selectionState.setSelectedSegmentIds,
      selectionState.setSuppressNextSegmentClick,
      startSelectedSegmentDrag,
    ]
  );

  const handleOpenSegmentLengthEditor = useCallback(
    (segmentId: string) => {
      selectionState.setSelectedSegmentId(segmentId);
      selectionState.setSelectedSegmentIds([segmentId]);
      selectionState.setSelectedGateId(null);
      selectionState.setSelectedBasketballPostId(null);
      selectionState.setSelectedFloodlightColumnId(null);
      selectionState.setSuppressNextSegmentClick(false);
      openLengthEditor(segmentId);
    },
    [
      openLengthEditor,
      selectionState.setSelectedBasketballPostId,
      selectionState.setSelectedFloodlightColumnId,
      selectionState.setSelectedGateId,
      selectionState.setSelectedSegmentId,
      selectionState.setSelectedSegmentIds,
      selectionState.setSuppressNextSegmentClick,
    ]
  );

  const {
    canManageAdmin,
    canManagePricing,
    currentDrawingSummary,
    drawingTitle,
    handleChangeDrawingStatus,
    handleExportPdf,
    handleOpenCustomers,
    isChangingStatus,
  } = useEditorPageActions({
    stageRef,
    workspace,
    session,
    currentLayout,
    interactionMode,
    estimate,
    estimateSegments,
    segmentOrdinalById,
    resolvedGatePlacements,
    resolvedBasketballPostPlacements,
    resolvedFloodlightColumnPlacements,
    confirmDiscardChanges,
    onNavigate,
  });
  const canDeleteSelection =
    !isQuotedViewOnly &&
    interactionMode === "SELECT" &&
    (normalizedSelectedSegmentIds.length > 0 ||
      !!selectionState.selectedSegmentId ||
      !!selectionState.selectedGateId ||
      !!selectionState.selectedBasketballPostId ||
      !!selectionState.selectedFloodlightColumnId);
  const estimateTitle = workspace.currentDrawingId
    ? workspace.isDirty
      ? "Save the drawing before opening its estimate."
      : "Open estimate"
    : "Save this drawing first to open its estimate.";
  const canNavigateEstimate = !!workspace.currentDrawingId && !workspace.isDirty;
  const toggleItemCounts = useCallback(() => setIsItemCountsVisible((c) => !c), []);
  const togglePostKey = useCallback(() => setIsPostKeyVisible((c) => !c), []);
  const toggleOptimization = useCallback(
    () => shellState.setIsOptimizationInspectorOpen((c: boolean) => !c),
    [shellState],
  );
  const fitViewToDrawing = useCallback(() => {
    const points = [
      ...currentLayout.segments.flatMap((segment) => [segment.start, segment.end]),
      ...resolvedGoalUnits.flatMap((goalUnit) => [
        goalUnit.entryPoint,
        goalUnit.exitPoint,
        goalUnit.recessEntryPoint,
        goalUnit.recessExitPoint,
        goalUnit.rearCenterPoint,
      ]),
      ...resolvedKickboards.flatMap((kickboard) => [kickboard.start, kickboard.end]),
      ...resolvedPitchDividers.flatMap((pitchDivider) => [
        pitchDivider.startPoint,
        pitchDivider.endPoint,
        ...pitchDivider.supportPoints,
      ]),
      ...resolvedSideNettings.flatMap((sideNetting) => [
        sideNetting.start,
        sideNetting.end,
        ...sideNetting.extendedPostPoints,
      ]),
    ];
    const firstPoint = points[0];
    if (!firstPoint) {
      resetView();
      return;
    }

    const bounds = points.reduce(
      (accumulator, point) => ({
        minX: Math.min(accumulator.minX, point.x),
        minY: Math.min(accumulator.minY, point.y),
        maxX: Math.max(accumulator.maxX, point.x),
        maxY: Math.max(accumulator.maxY, point.y),
      }),
      {
        minX: firstPoint.x,
        minY: firstPoint.y,
        maxX: firstPoint.x,
        maxY: firstPoint.y,
      },
    );
    fitWorldBounds(bounds, 104);
  }, [
    currentLayout.segments,
    fitWorldBounds,
    resetView,
    resolvedGoalUnits,
    resolvedKickboards,
    resolvedPitchDividers,
    resolvedSideNettings,
  ]);
  const selectionInspector = useMemo(() => {
    if (normalizedSelectedSegmentIds.length > 1) {
      const selectedSegments = normalizedSelectedSegmentIds
        .map((segmentId) => segmentsById.get(segmentId))
        .filter((segment): segment is LayoutSegment => segment !== undefined);
      const totalLengthMm = selectedSegments.reduce(
        (sum, segment) => sum + distanceMm(segment.start, segment.end),
        0
      );

      return {
        title: "Selected Fence Group",
        subtitle: `${selectedSegments.length} connected runs`,
        rows: [
          { label: "Total length", value: formatLengthMm(totalLengthMm) },
          { label: "Runs", value: selectedSegments.length.toString() },
          { label: "Primary", value: segmentOrdinalById.get(selectionState.selectedSegmentId ?? "")?.toString() ?? "Run" },
        ],
        hint: "Shift-click connected runs, then drag any selected run to move the whole group together.",
      };
    }

    if (selectedSegment) {
      return {
        title: "Selected Fence Run",
        subtitle:
          selectedSegment.spec.system === "ROLL_FORM"
            ? `Roll Form · ${selectedSegment.spec.height}`
            : `Twin Bar${selectedSegment.spec.twinBarVariant === "SUPER_REBOUND" ? " SR" : ""} · ${selectedSegment.spec.height}`,
        rows: [
          { label: "Length", value: formatLengthMm(distanceMm(selectedSegment.start, selectedSegment.end)) },
        ],
        hint: "Drag the run to offset it. Drag an endpoint to reshape and snap against nearby nodes.",
        actionLabel: "Edit length",
        onAction: () => openLengthEditor(selectedSegment.id),
      };
    }

    if (selectionState.selectedGateId) {
      const selectedGate = resolvedGateById.get(selectionState.selectedGateId);
      if (selectedGate) {
        return {
          title: "Selected Gate",
          subtitle:
            selectedGate.gateType === "DOUBLE_LEAF"
              ? "Double leaf"
              : selectedGate.gateType === "CUSTOM"
                ? "Custom opening"
                : "Single leaf",
          rows: [
            { label: "Width", value: formatLengthMm(selectedGate.widthMm) },
            { label: "Segment", value: segmentOrdinalById.get(selectedGate.segmentId)?.toString() ?? "Run" },
            { label: "Offset", value: formatLengthMm(selectedGate.startOffsetMm) },
          ],
          hint: "Click once to select, then drag to slide along the host run.",
        };
      }
    }

    if (selectionState.selectedBasketballPostId) {
      const selectedBasketballPost = resolvedBasketballPostById.get(selectionState.selectedBasketballPostId);
      if (selectedBasketballPost) {
        return {
          title: "Selected Basketball Post",
          subtitle:
            selectedBasketballPost.type === "MOUNTED_TO_EXISTING_POST"
              ? "Mounted to existing post"
              : "Dedicated post",
          rows: [
            { label: "Facing", value: selectedBasketballPost.facing === "LEFT" ? "Left" : "Right" },
            {
              label: "Arm",
              value:
                selectedBasketballPost.armLengthMm && selectedBasketballPost.armLengthMm > 0
                  ? formatLengthMm(selectedBasketballPost.armLengthMm)
                  : "Mounted",
            },
            { label: "Offset", value: formatLengthMm(selectedBasketballPost.offsetMm) },
          ],
          hint: "Click once to select, then drag to slide to the next valid position.",
        };
      }
    }

    if (selectionState.selectedFloodlightColumnId) {
      const selectedFloodlightColumn = resolvedFloodlightColumnById.get(selectionState.selectedFloodlightColumnId);
      if (selectedFloodlightColumn) {
        return {
          title: "Selected Floodlight Column",
          subtitle: "Lighting support",
          rows: [
            {
              label: "Height",
              value:
                selectedFloodlightColumn.placement.heightMm !== undefined
                  ? formatLengthMm(selectedFloodlightColumn.placement.heightMm)
                  : "Not set",
            },
            { label: "Facing", value: selectedFloodlightColumn.facing === "LEFT" ? "Left" : "Right" },
            { label: "Offset", value: formatLengthMm(selectedFloodlightColumn.offsetMm) },
          ],
          hint: "Click once to select, then drag to reposition without colliding with nearby openings.",
        };
      }
    }

    return null;
  }, [
    formatLengthMm,
    openLengthEditor,
    resolvedBasketballPostById,
    resolvedFloodlightColumnById,
    resolvedGateById,
    normalizedSelectedSegmentIds,
    segmentOrdinalById,
    segmentsById,
    selectedSegment,
    selectionState.selectedBasketballPostId,
    selectionState.selectedFloodlightColumnId,
    selectionState.selectedGateId,
    selectionState.selectedSegmentId,
  ]);
  const menuBarProps = {
    session,
    drawingTitle,
    currentDrawingId: workspace.currentDrawingId,
    currentWorkspaceId: workspace.currentWorkspaceId,
    currentCustomerId: workspace.currentCustomerId,
    currentDrawingName: workspace.currentDrawingName,
    currentCustomerName: workspace.currentCustomerName,
    isDirty: workspace.isDirty,
    isSavingDrawing: workspace.isSavingDrawing,
    currentDrawingStatus: workspace.currentDrawingStatus ?? currentDrawingSummary?.status ?? null,
    isReadOnly: isQuotedViewOnly,
    isChangingStatus,
    canManagePricing,
    canManageAdmin,
    canUndo: !isQuotedViewOnly && canUndo,
    canRedo: !isQuotedViewOnly && canRedo,
    canDeleteSelection,
    isItemCountsVisible,
    isPostKeyVisible,
    isOptimizationVisible: shellState.isOptimizationInspectorOpen,
    isGridVisible: shellState.isGridVisible,
    isSnapDisabled: shellState.disableSnap,
    canFitView: currentLayout.segments.length > 0,
    onSetCurrentDrawingName: workspace.setCurrentDrawingName,
    onChangeDrawingStatus: (status: Parameters<typeof handleChangeDrawingStatus>[0]) => {
      void handleChangeDrawingStatus(status);
    },
    onSaveDrawing: () => {
      void workspace.saveDrawing();
    },
    onOpenSaveAs: () => {
      if (isQuotedViewOnly) {
        return;
      }
      setDrawingModalMode("saveAs");
    },
    onExportPdf: handleExportPdf,
    onUndo: () => {
      if (isQuotedViewOnly) {
        return;
      }
      undoSegments();
    },
    onRedo: () => {
      if (isQuotedViewOnly) {
        return;
      }
      redoSegments();
    },
    onDeleteSelection: handleDeleteSelection,
    onClearLayout: handleClearLayout,
    onFitView: fitViewToDrawing,
    onResetView: resetView,
    onToggleGrid: () => shellState.setIsGridVisible((current: boolean) => !current),
    onToggleSnap: () => shellState.setDisableSnap((current: boolean) => !current),
    onToggleItemCounts: toggleItemCounts,
    onTogglePostKey: togglePostKey,
    onToggleOptimization: toggleOptimization,
    onGoToLogin: () => guardedNavigate("login"),
    onNavigateDashboard: () => guardedNavigate("dashboard"),
    onNavigateWorkspace: () => {
      if (!workspace.currentDrawingId && !workspace.currentWorkspaceId) {
        return;
      }
      guardedNavigate("drawing", {
        ...(workspace.currentWorkspaceId ? { workspaceId: workspace.currentWorkspaceId } : {}),
        ...(workspace.currentDrawingId ? { drawingId: workspace.currentDrawingId } : {}),
      });
    },
    onNavigateCurrentCustomer: () => {
      if (!workspace.currentCustomerId) {
        return;
      }
      guardedNavigate("customer", { customerId: workspace.currentCustomerId });
    },
    onNavigateCustomers: handleOpenCustomers,
    onNavigateEstimate: () => {
      if (!workspace.currentDrawingId || workspace.isDirty) {
        return;
      }
      guardedNavigate("drawing", {
        ...(workspace.currentWorkspaceId ? { workspaceId: workspace.currentWorkspaceId } : {}),
        drawingId: workspace.currentDrawingId,
        estimateDrawingId: workspace.currentDrawingId,
      });
    },
    onNavigatePricing: () => guardedNavigate("pricing"),
    onNavigateAdmin: () => guardedNavigate("admin"),
    canNavigateEstimate,
    estimateTitle,
  };
  const workspaceShellProps = {
    toolPaletteProps: {
      isReadOnly: isQuotedViewOnly,
      interactionMode,
      activeSpec: shellState.activeSpec,
      activeHeightOptions,
      twinBarHeightOptions: TWIN_BAR_HEIGHT_OPTIONS,
      rollFormHeightOptions: ROLL_FORM_HEIGHT_OPTIONS,
      recessWidthInputM: shellState.recessWidthInputM,
      recessDepthInputM: shellState.recessDepthInputM,
      goalUnitWidthMm: shellState.goalUnitWidthMm,
      goalUnitHeightMm: shellState.goalUnitHeightMm,
      goalUnitHasBasketballPost: shellState.goalUnitHasBasketballPost,
      basketballPlacementType: shellState.basketballPlacementType,
      basketballArmLengthMm: shellState.basketballArmLengthMm,
      kickboardSectionHeightMm: shellState.kickboardSectionHeightMm,
      kickboardProfile: shellState.kickboardProfile,
      kickboardThicknessMm: shellState.kickboardThicknessMm,
      kickboardBoardLengthMm: shellState.kickboardBoardLengthMm,
      floodlightColumnHeightMm: shellState.floodlightColumnHeightMm,
      sideNettingHeightMm: shellState.sideNettingHeightMm,
      gateType: shellState.gateType,
      customGateWidthInputM: shellState.customGateWidthInputM,
      recessWidthOptionsMm: RECESS_WIDTH_OPTIONS_MM,
      recessDepthOptionsMm: RECESS_DEPTH_OPTIONS_MM,
      goalUnitOptions: editorPricingOptions.goalUnitOptions,
      basketballArmLengthOptionsMm: editorPricingOptions.basketballArmLengthOptionsMm,
      floodlightColumnHeightOptionsMm: editorPricingOptions.floodlightColumnHeightOptionsMm,
      kickboardOptions: editorPricingOptions.kickboardOptions,
      sideNettingHeightOptionsMm: editorPricingOptions.sideNettingHeightOptionsMm,
      gateWidthOptionsMm: GATE_WIDTH_OPTIONS_MM,
      formatLengthMm,
      formatMetersInputFromMm,
      getSegmentColor,
      onSetInteractionMode: (mode: Parameters<typeof shellState.setInteractionMode>[0]) => {
        if (isQuotedViewOnly) {
          return;
        }
        shellState.setInteractionMode(mode);
      },
      onRecessWidthInputChange,
      onRecessDepthInputChange,
      onNormalizeRecessInputs: normalizeRecessInputs,
      onSetGoalUnitWidthMm: shellState.setGoalUnitWidthMm,
      onSetGoalUnitHeightMm: shellState.setGoalUnitHeightMm,
      onSetGoalUnitHasBasketballPost: shellState.setGoalUnitHasBasketballPost,
      onSetGateType: shellState.setGateType,
      onSetBasketballPlacementType: shellState.setBasketballPlacementType,
      onSetBasketballArmLengthMm: shellState.setBasketballArmLengthMm,
      onSetKickboardSectionHeightMm: shellState.setKickboardSectionHeightMm,
      onSetKickboardProfile: shellState.setKickboardProfile,
      onSetKickboardThicknessMm: shellState.setKickboardThicknessMm,
      onSetKickboardBoardLengthMm: shellState.setKickboardBoardLengthMm,
      onSetFloodlightColumnHeightMm: shellState.setFloodlightColumnHeightMm,
      onSetSideNettingHeightMm: shellState.setSideNettingHeightMm,
      onCustomGateWidthInputChange,
      onNormalizeGateInputs: normalizeGateInputs,
      onSetActiveSpec: shellState.setActiveSpec,
    },
    canvasFrameRef,
    canvasStageProps: {
      stageRef,
      canvasWidth,
      canvasHeight,
      view,
      visibleBounds,
      verticalLines,
      horizontalLines,
      interactionMode,
      gateType: shellState.gateType,
      disableSnap: shellState.disableSnap,
      isGridVisible: shellState.isGridVisible,
      isReadOnly: isQuotedViewOnly,
      isPanning,
      drawStart: selectionState.drawStart,
      rectangleStart: selectionState.rectangleStart,
      ghostEnd,
      ghostLengthMm,
      axisGuide,
      activeDrawNodeSnap,
      drawHoverSnap,
      drawSnapLabel,
      rectanglePreviewEnd,
      recessPreview,
      goalUnitPreview,
      gatePreview,
      basketballPostPreview,
      floodlightColumnPreview,
      kickboardPreview,
      pitchDividerPreview,
      pitchDividerAnchorPreview,
      sideNettingAnchorPreview,
      sideNettingPreview,
      pendingSideNettingStart: shellState.pendingSideNettingStart,
      sideNettingSegmentPreview,
      pendingPitchDividerStart: shellState.pendingPitchDividerStart,
      gatePreviewVisual,
      hoveredBasketballPostId,
      hoveredFloodlightColumnId,
      hoveredSegmentId,
      hoveredGateId,
      activeSegmentDrag: selectionState.activeSegmentDrag,
      closeLoopPoint,
      drawAnchorNodes,
      visualPosts,
      segments,
      selectedSegmentId: selectionState.selectedSegmentId,
      selectedSegmentIds: normalizedSelectedSegmentIds,
      selectedGateId: selectionState.selectedGateId,
      selectedBasketballPostId: selectionState.selectedBasketballPostId,
      selectedFloodlightColumnId: selectionState.selectedFloodlightColumnId,
      gatesBySegmentId,
      segmentLengthLabelsBySegmentId,
      visibleSegmentLabelKeys,
      placedBasketballPostVisuals: resolvedBasketballPostPlacements,
      placedFloodlightColumnVisuals: resolvedFloodlightColumnPlacements,
      goalUnitVisuals: resolvedGoalUnits,
      kickboardVisuals: resolvedKickboards,
      pitchDividerVisuals: resolvedPitchDividers,
      sideNettingVisuals: resolvedSideNettings,
      placedGateVisuals,
      oppositeGateGuides,
      selectedPlanVisual,
      scaleBar,
      onStageMouseDown,
      onStageMouseMove,
      onStageMouseUp,
      onStageDoubleClick: cancelActiveDrawing,
      onStageWheel,
      onContextMenu,
      onSelectSegment: handleSelectSegment,
      onStartSegmentDrag: handleStartSegmentDrag,
      onOpenSegmentLengthEditor: handleOpenSegmentLengthEditor,
      onUpdateSegmentEndpoint: (
        segmentId: string,
        endpoint: "start" | "end",
        point: { x: number; y: number },
      ) => {
        updateSegment(segmentId, (current) => ({ ...current, [endpoint]: point }));
      },
      onStartSegmentEndpointDrag: () => {
        if (isQuotedViewOnly) {
          return;
        }
        commitLayoutBatch();
        beginLayoutBatch();
        selectionState.setSegmentDragReference(null);
        setIsEndpointDragActive(true);
      },
      onEndSegmentEndpointDrag: () => {
        if (isQuotedViewOnly) {
          return;
        }
        setIsEndpointDragActive(false);
        commitLayoutBatch();
      },
      onSelectGate: (gateId: string) => {
        selectionState.setSelectedSegmentId(null);
        selectionState.setSelectedSegmentIds([]);
        selectionState.setSelectedGateId(gateId);
        selectionState.setSelectedBasketballPostId(null);
        selectionState.setSelectedFloodlightColumnId(null);
        selectionState.setSuppressNextSegmentClick(false);
        selectionState.setIsLengthEditorOpen(false);
      },
      onStartGateDrag: (gateId: string) => {
        selectionState.setSelectedSegmentId(null);
        selectionState.setSelectedSegmentIds([]);
        selectionState.setSelectedGateId(gateId);
        selectionState.setSelectedBasketballPostId(null);
        selectionState.setSelectedFloodlightColumnId(null);
        selectionState.setSuppressNextSegmentClick(false);
        selectionState.setIsLengthEditorOpen(false);
        startSelectedGateDrag(gateId);
      },
      onSelectBasketballPost: (basketballPostId: string) => {
        selectionState.setSelectedSegmentId(null);
        selectionState.setSelectedSegmentIds([]);
        selectionState.setSelectedGateId(null);
        selectionState.setSelectedBasketballPostId(basketballPostId);
        selectionState.setSelectedFloodlightColumnId(null);
        selectionState.setSuppressNextSegmentClick(false);
        selectionState.setIsLengthEditorOpen(false);
      },
      onStartBasketballPostDrag: (basketballPostId: string) => {
        selectionState.setSelectedSegmentId(null);
        selectionState.setSelectedSegmentIds([]);
        selectionState.setSelectedGateId(null);
        selectionState.setSelectedBasketballPostId(basketballPostId);
        selectionState.setSelectedFloodlightColumnId(null);
        selectionState.setSuppressNextSegmentClick(false);
        selectionState.setIsLengthEditorOpen(false);
        startSelectedBasketballPostDrag(basketballPostId);
      },
      onSelectFloodlightColumn: (floodlightColumnId: string) => {
        selectionState.setSelectedSegmentId(null);
        selectionState.setSelectedSegmentIds([]);
        selectionState.setSelectedGateId(null);
        selectionState.setSelectedBasketballPostId(null);
        selectionState.setSelectedFloodlightColumnId(floodlightColumnId);
        selectionState.setSuppressNextSegmentClick(false);
        selectionState.setIsLengthEditorOpen(false);
      },
      onStartFloodlightColumnDrag: (floodlightColumnId: string) => {
        selectionState.setSelectedSegmentId(null);
        selectionState.setSelectedSegmentIds([]);
        selectionState.setSelectedGateId(null);
        selectionState.setSelectedBasketballPostId(null);
        selectionState.setSelectedFloodlightColumnId(floodlightColumnId);
        selectionState.setSuppressNextSegmentClick(false);
        selectionState.setIsLengthEditorOpen(false);
        startSelectedFloodlightColumnDrag(floodlightColumnId);
      },
    },
    optimizationPlannerProps: {
      summary: optimizationSummary,
      estimateSegments,
      gates: resolvedGatePlacements,
      basketballPosts: resolvedBasketballPostPlacements,
      floodlightColumns: resolvedFloodlightColumnPlacements,
      goalUnits: resolvedGoalUnits,
      kickboards: resolvedKickboards,
      pitchDividers: resolvedPitchDividers,
      sideNettings: resolvedSideNettings,
      canInspect: segments.length > 0,
      isOpen: shellState.isOptimizationInspectorOpen,
      selectedPlanId: shellState.selectedPlanId,
      segmentOrdinalById,
      onOpen: () => shellState.setIsOptimizationInspectorOpen(true),
      onClose: () => shellState.setIsOptimizationInspectorOpen(false),
      onSelectPlan: shellState.setSelectedPlanId,
    },
    floatingPanelsProps: {
      selectionInspector,
      isItemCountsVisible,
      isPostKeyVisible,
      postRowsByType,
      gateCounts,
      gateCountsByHeight,
      basketballPostCountsByHeight,
      floodlightColumnCountsByHeight,
      twinBarFenceRows,
      featureCounts,
      featureRowsByKind,
      postTypeCounts,
      panelCount,
      fenceRunCount,
      formatHeightLabelFromMm,
      onToggleItemCounts: toggleItemCounts,
      onTogglePostKey: togglePostKey,
    },
    isOptimizationVisible: shellState.isOptimizationInspectorOpen,
    isReadOnly: isQuotedViewOnly,
  };
  const lengthEditorProps = {
    isOpen: !isQuotedViewOnly && selectionState.isLengthEditorOpen && selectedSegment !== null,
    selectedComponentClosed,
    selectedLengthInputM: selectionState.selectedLengthInputM,
    inputStepM: RECESS_INPUT_STEP_M,
    onChangeLength: selectionState.setSelectedLengthInputM,
    onApply: applySelectedLengthEdit,
    onCancel: () => selectionState.setIsLengthEditorOpen(false),
  };

  return (
    <div className="editor-page">
      <EditorMenuBar {...menuBarProps} />
      <EditorWorkspaceShell {...workspaceShellProps} />
      <EditorLengthEditor {...lengthEditorProps} />
      <EditorDrawingSaveModal
        isOpen={drawingModalMode !== null}
        customers={workspace.customers}
        currentDrawingName={workspace.currentDrawingName}
        initialCustomerId={workspace.currentCustomerId}
        isSavingDrawing={workspace.isSavingDrawing}
        isSavingCustomer={workspace.isSavingCustomer}
        onClose={() => setDrawingModalMode(null)}
        onCreateCustomer={workspace.saveCustomer}
        onSubmit={workspace.saveDrawingAsCopy}
      />
    </div>
  );
}
