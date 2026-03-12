import { useCallback, useMemo, useReducer, useRef } from "react";
import type Konva from "konva";
import {
  type GatePlacement,
  type LayoutModel,
  type LayoutSegment
} from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import { EditorCanvasStage } from "./EditorCanvasStage";
import { EditorLengthEditor } from "./EditorLengthEditor";
import { EditorSidebar } from "./EditorSidebar";
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
  formatHeightLabelFromMm,
  formatLengthMm,
  formatMetersInputFromMm,
  GATE_WIDTH_OPTIONS_MM,
  getSegmentColor,
  historyReducer,
  INITIAL_VISIBLE_WIDTH_MM,
  MAX_SCALE,
  MIN_SCALE,
  OptimizationPlanner,
  RECESS_DEPTH_OPTIONS_MM,
  RECESS_INPUT_STEP_M,
  RECESS_WIDTH_OPTIONS_MM,
  ROLL_FORM_HEIGHT_OPTIONS,
  samePointApprox,
  type HistoryState,
  TWIN_BAR_HEIGHT_OPTIONS,
  useEditorKeyboardShortcuts,
  useWindowSize
} from "./editor";

interface EditorPageProps {
  initialDrawingId?: string | null;
  onNavigate: (route: "dashboard" | "drawings" | "editor" | "admin" | "login", query?: Record<string, string>) => void;
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

export function EditorPage({ initialDrawingId = null, onNavigate }: EditorPageProps) {
  const { width, height } = useWindowSize();
  const stageRef = useRef<Konva.Stage | null>(null);
  const [history, dispatchHistory] = useReducer(historyReducer, {
    past: [],
    present: { segments: [], gates: [] },
    future: []
  } satisfies HistoryState);
  const shellState = useEditorShellState();
  const selectionState = useEditorSelectionState(shellState.interactionMode);
  const currentLayout = history.present;
  const segments = currentLayout.segments;
  const gatePlacements = currentLayout.gates ?? [];
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

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
    toWorld,
    visibleBounds,
    verticalLines,
    horizontalLines
  } = useEditorCanvasViewport({
    canvasWidth: width,
    canvasHeight: height,
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
          segments: nextSegments,
          gates: reconcileGatePlacementsForSegments(previous.gates ?? [], previous.segments, nextSegments)
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

  const workspace = useEditorWorkspaceBridge({
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
    }
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
    gatesBySegmentId,
    highlightableOptimizationPlans,
    oppositeGateGuides,
    placedGateVisuals,
    postTypeCounts,
    recessAlignmentAnchors,
    resolvedGateById,
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
    selectedSegmentId: selectionState.selectedSegmentId,
    selectedPlanId: shellState.selectedPlanId,
    activeSpecSystem: shellState.activeSpec.system,
    viewScale: view.scale,
    canvasWidth: width
  });
  const { postRowsByType, gateCounts, gateCountsByHeight, twinBarFenceRows } = editorSummary;
  const optimizationSummary = estimate.optimization;

  useEditorSelectionEffects({
    selectedSegment,
    selectedGateId: selectionState.selectedGateId,
    selectedPlanId: shellState.selectedPlanId,
    hasSelectedGate: selectionState.selectedGateId !== null && resolvedGateById.has(selectionState.selectedGateId),
    highlightablePlanIds: highlightableOptimizationPlans.map((plan) => plan.id),
    setSelectedGateId: selectionState.setSelectedGateId,
    setActiveGateDrag: selectionState.setActiveGateDrag,
    setIsLengthEditorOpen: selectionState.setIsLengthEditorOpen,
    setSelectedLengthInputM: selectionState.setSelectedLengthInputM,
    setSelectedPlanId: shellState.setSelectedPlanId
  });

  const {
    axisGuide,
    drawHoverSnap,
    gatePreview,
    gatePreviewVisual,
    ghostEnd,
    ghostLengthMm,
    rectanglePreviewEnd,
    recessPreview,
    resolveDrawPoint
  } = useEditorInteractionPreviews({
    segments,
    interactionMode: shellState.interactionMode,
    pointerWorld,
    drawStart: selectionState.drawStart,
    rectangleStart: selectionState.rectangleStart,
    drawAnchorNodes,
    disableSnap: shellState.disableSnap,
    viewScale: view.scale,
    recessAlignmentAnchors,
    recessWidthMm: shellState.recessWidthMm,
    recessDepthMm: shellState.recessDepthMm,
    recessSide: shellState.recessSide,
    gateType: shellState.gateType,
    customGateWidthMm: shellState.customGateWidthMm
  });

  const {
    applySelectedLengthEdit,
    cancelActiveDrawing,
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
    startSelectedGateDrag,
    startSelectedSegmentDrag,
    updateSegment
  } = useEditorCommands({
    stageRef,
    applyLayout,
    applySegments,
    applyGatePlacements,
    segmentsById,
    resolvedGateById,
    connectivity,
    activeSpec: shellState.activeSpec,
    interactionMode: shellState.interactionMode,
    gateType: shellState.gateType,
    drawStart: selectionState.drawStart,
    rectangleStart: selectionState.rectangleStart,
    selectedSegmentId: selectionState.selectedSegmentId,
    selectedGateId: selectionState.selectedGateId,
    selectedLengthInputM: selectionState.selectedLengthInputM,
    isSpacePressed,
    isPanning,
    activeSegmentDrag: selectionState.activeSegmentDrag,
    activeGateDrag: selectionState.activeGateDrag,
    recessWidthMm: shellState.recessWidthMm,
    recessDepthMm: shellState.recessDepthMm,
    customGateWidthMm: shellState.customGateWidthMm,
    recessPreview,
    gatePreview,
    resolveDrawPoint,
    toWorld,
    beginPan,
    updatePan,
    endPan,
    zoomAtPointer,
    setPointerWorld,
    setDrawStart: selectionState.setDrawStart,
    setRectangleStart: selectionState.setRectangleStart,
    setSelectedSegmentId: selectionState.setSelectedSegmentId,
    setSelectedGateId: selectionState.setSelectedGateId,
    setSelectedPlanId: shellState.setSelectedPlanId,
    setSelectedLengthInputM: selectionState.setSelectedLengthInputM,
    setIsLengthEditorOpen: selectionState.setIsLengthEditorOpen,
    setActiveSegmentDrag: selectionState.setActiveSegmentDrag,
    setActiveGateDrag: selectionState.setActiveGateDrag,
    setRecessWidthMm: shellState.setRecessWidthMm,
    setRecessDepthMm: shellState.setRecessDepthMm,
    setRecessWidthInputM: shellState.setRecessWidthInputM,
    setRecessDepthInputM: shellState.setRecessDepthInputM,
    setCustomGateWidthMm: shellState.setCustomGateWidthMm,
    setCustomGateWidthInputM: shellState.setCustomGateWidthInputM
  });

  const keyboardShortcutOptions = useMemo(
    () => ({
      undo: undoSegments,
      redo: redoSegments,
      deleteSelectedGate,
      deleteSelectedSegment,
      setInteractionMode: shellState.setInteractionMode,
      setIsSpacePressed,
      setDisableSnap: shellState.setDisableSnap,
      cancelActiveDrawing
    }),
    [
      cancelActiveDrawing,
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

  function handleStartNewDraft(): void {
    if (!confirmDiscardChanges("Discard unsaved changes and start a new draft?")) {
      return;
    }

    resetWorkspaceCanvas();
    workspace.startNewDraft();
  }

  function handleOpenDrawings(): void {
    if (!confirmDiscardChanges("Discard unsaved changes and go back to the drawings library?")) {
      return;
    }

    onNavigate("drawings");
  }

  return (
    <div className="app-shell">
      <EditorSidebar
        workspace={workspace}
        onOpenDrawings={handleOpenDrawings}
        onStartNewDraft={handleStartNewDraft}
        onNavigate={guardedNavigate}
        interactionMode={shellState.interactionMode}
        recessWidthInputM={shellState.recessWidthInputM}
        recessDepthInputM={shellState.recessDepthInputM}
        recessSide={shellState.recessSide}
        gateType={shellState.gateType}
        customGateWidthInputM={shellState.customGateWidthInputM}
        recessWidthOptionsMm={RECESS_WIDTH_OPTIONS_MM}
        recessDepthOptionsMm={RECESS_DEPTH_OPTIONS_MM}
        gateWidthOptionsMm={GATE_WIDTH_OPTIONS_MM}
        recessPreview={recessPreview}
        gatePreview={gatePreview}
        activeSpec={shellState.activeSpec}
        activeHeightOptions={activeHeightOptions}
        twinBarHeightOptions={TWIN_BAR_HEIGHT_OPTIONS}
        rollFormHeightOptions={ROLL_FORM_HEIGHT_OPTIONS}
        postRowsByType={postRowsByType}
        gateCounts={gateCounts}
        gateCountsByHeight={gateCountsByHeight}
        twinBarFenceRows={twinBarFenceRows}
        postTypeCounts={postTypeCounts}
        isTutorialOpen={shellState.isTutorialOpen}
        controlsStyle={shellState.panelDragStyle("controls")}
        itemCountsStyle={shellState.panelDragStyle("itemCounts")}
        postKeyStyle={shellState.panelDragStyle("postKey")}
        tutorialStyle={shellState.panelDragStyle("tutorial")}
        canUndo={canUndo}
        canRedo={canRedo}
        canDeleteSelection={
          shellState.interactionMode === "SELECT" && (!!selectionState.selectedSegmentId || !!selectionState.selectedGateId)
        }
        formatLengthMm={formatLengthMm}
        formatMetersInputFromMm={formatMetersInputFromMm}
        formatHeightLabelFromMm={formatHeightLabelFromMm}
        getSegmentColor={getSegmentColor}
        onSetInteractionMode={shellState.setInteractionMode}
        onRecessWidthInputChange={onRecessWidthInputChange}
        onRecessDepthInputChange={onRecessDepthInputChange}
        onNormalizeRecessInputs={normalizeRecessInputs}
        onSetRecessSide={shellState.setRecessSide}
        onSetGateType={shellState.setGateType}
        onCustomGateWidthInputChange={onCustomGateWidthInputChange}
        onNormalizeGateInputs={normalizeGateInputs}
        onSetActiveSpec={shellState.setActiveSpec}
        onOpenTutorial={() => shellState.setIsTutorialOpen(true)}
        onCloseTutorial={() => shellState.setIsTutorialOpen(false)}
        onStartItemCountsDrag={(event) => shellState.startPanelDrag("itemCounts", event)}
        onStartPostKeyDrag={(event) => shellState.startPanelDrag("postKey", event)}
        onStartTutorialDrag={(event) => shellState.startPanelDrag("tutorial", event)}
        onStartControlsDrag={(event) => shellState.startPanelDrag("controls", event)}
        onUndo={undoSegments}
        onRedo={redoSegments}
        onDeleteSelection={handleDeleteSelection}
        onClearLayout={handleClearLayout}
      />

      <OptimizationPlanner
        summary={optimizationSummary}
        canInspect={segments.length > 0}
        isOpen={shellState.isOptimizationInspectorOpen}
        selectedPlanId={shellState.selectedPlanId}
        segmentOrdinalById={segmentOrdinalById}
        onOpen={() => shellState.setIsOptimizationInspectorOpen(true)}
        onClose={() => shellState.setIsOptimizationInspectorOpen(false)}
        onSelectPlan={shellState.setSelectedPlanId}
      />

      <EditorLengthEditor
        isOpen={selectionState.isLengthEditorOpen && selectedSegment !== null}
        selectedComponentClosed={selectedComponentClosed}
        selectedLengthInputM={selectionState.selectedLengthInputM}
        inputStepM={RECESS_INPUT_STEP_M}
        onChangeLength={selectionState.setSelectedLengthInputM}
        onApply={applySelectedLengthEdit}
        onCancel={() => selectionState.setIsLengthEditorOpen(false)}
      />

      <EditorCanvasStage
        stageRef={stageRef}
        canvasWidth={width}
        canvasHeight={height}
        view={view}
        visibleBounds={visibleBounds}
        verticalLines={verticalLines}
        horizontalLines={horizontalLines}
        interactionMode={shellState.interactionMode}
        disableSnap={shellState.disableSnap}
        drawStart={selectionState.drawStart}
        rectangleStart={selectionState.rectangleStart}
        ghostEnd={ghostEnd}
        ghostLengthMm={ghostLengthMm}
        axisGuide={axisGuide}
        drawHoverSnap={drawHoverSnap}
        rectanglePreviewEnd={rectanglePreviewEnd}
        recessPreview={recessPreview}
        gatePreview={gatePreview}
        gatePreviewVisual={gatePreviewVisual}
        visualPosts={visualPosts}
        segments={segments}
        selectedSegmentId={selectionState.selectedSegmentId}
        selectedGateId={selectionState.selectedGateId}
        gatesBySegmentId={gatesBySegmentId}
        segmentLengthLabelsBySegmentId={segmentLengthLabelsBySegmentId}
        visibleSegmentLabelKeys={visibleSegmentLabelKeys}
        placedGateVisuals={placedGateVisuals}
        oppositeGateGuides={oppositeGateGuides}
        selectedPlanVisual={selectedPlanVisual}
        scaleBar={scaleBar}
        onStageMouseDown={onStageMouseDown}
        onStageMouseMove={onStageMouseMove}
        onStageMouseUp={onStageMouseUp}
        onStageWheel={onStageWheel}
        onContextMenu={onContextMenu}
        onSelectSegment={(segmentId) => {
          selectionState.setSelectedSegmentId(segmentId);
          selectionState.setSelectedGateId(null);
          selectionState.setDrawStart(null);
        }}
        onStartSegmentDrag={(segmentId) => {
          selectionState.setSelectedGateId(null);
          startSelectedSegmentDrag(segmentId);
        }}
        onOpenSegmentLengthEditor={(segmentId) => {
          selectionState.setSelectedGateId(null);
          openLengthEditor(segmentId);
        }}
        onUpdateSegmentEndpoint={(segmentId, endpoint, point) => {
          updateSegment(segmentId, (current) => ({ ...current, [endpoint]: point }));
        }}
        onSelectGate={(gateId) => {
          selectionState.setSelectedSegmentId(null);
          selectionState.setSelectedGateId(gateId);
          selectionState.setIsLengthEditorOpen(false);
        }}
        onStartGateDrag={(gateId) => {
          selectionState.setSelectedSegmentId(null);
          selectionState.setSelectedGateId(gateId);
          selectionState.setIsLengthEditorOpen(false);
          startSelectedGateDrag(gateId);
        }}
      />
    </div>
  );
}
