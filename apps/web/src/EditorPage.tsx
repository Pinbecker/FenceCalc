import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type Konva from "konva";
import {
  type FenceSpec,
  type GatePlacement,
  type GateType,
  type LayoutModel,
  type LayoutSegment,
  type PointMm
} from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import { EditorCanvasStage } from "./EditorCanvasStage";
import { EditorLengthEditor } from "./EditorLengthEditor";
import { EditorSidebar } from "./EditorSidebar";
import { useEditorCommands } from "./editor/useEditorCommands";
import { useEditorDerivedState } from "./editor/useEditorDerivedState";
import { useEditorInteractionPreviews } from "./editor/useEditorInteractionPreviews";
import {
  clampGatePlacementToSegment,
  chooseGridStep,
  defaultFenceSpec,
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
  sameGatePlacementList,
  SINGLE_GATE_WIDTH_MM,
  type PanelOffset,
  type DraggablePanel,
  type HistoryState,
  type InteractionMode,
  type RecessSide,
  shouldLoadInitialDrawing,
  TWIN_BAR_HEIGHT_OPTIONS,
  useDraggablePanels,
  useEditorKeyboardShortcuts,
  useWindowSize
} from "./editor";
import { useWorkspacePersistence } from "./useWorkspacePersistence";

interface EditorPageProps {
  initialDrawingId?: string | null;
  onNavigate: (route: "dashboard" | "drawings" | "editor" | "admin" | "login", query?: Record<string, string>) => void;
}

export function EditorPage({ initialDrawingId = null, onNavigate }: EditorPageProps) {
  const { width, height } = useWindowSize();
  const canvasWidth = width;
  const canvasHeight = height;
  const stageRef = useRef<Konva.Stage | null>(null);
  const [history, dispatchHistory] = useReducer(historyReducer, {
    past: [],
    present: [],
    future: []
  } satisfies HistoryState);
  const segments = history.present;
  const [activeSpec, setActiveSpec] = useState<FenceSpec>(defaultFenceSpec());
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("DRAW");
  const [drawStart, setDrawStart] = useState<PointMm | null>(null);
  const [rectangleStart, setRectangleStart] = useState<PointMm | null>(null);
  const [recessWidthMm, setRecessWidthMm] = useState<number>(1500);
  const [recessDepthMm, setRecessDepthMm] = useState<number>(1000);
  const [recessWidthInputM, setRecessWidthInputM] = useState<string>(() => formatMetersInputFromMm(1500));
  const [recessDepthInputM, setRecessDepthInputM] = useState<string>(() => formatMetersInputFromMm(1000));
  const [recessSide, setRecessSide] = useState<RecessSide>("LEFT");
  const [gateType, setGateType] = useState<GateType>("SINGLE_LEAF");
  const [customGateWidthMm, setCustomGateWidthMm] = useState<number>(SINGLE_GATE_WIDTH_MM);
  const [customGateWidthInputM, setCustomGateWidthInputM] = useState<string>(() => formatMetersInputFromMm(SINGLE_GATE_WIDTH_MM));
  const [gatePlacements, setGatePlacements] = useState<GatePlacement[]>([]);
  const [disableSnap, setDisableSnap] = useState(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [activeSegmentDrag, setActiveSegmentDrag] = useState<{ segmentId: string; lastPointer: PointMm } | null>(null);
  const [activeGateDrag, setActiveGateDrag] = useState<{ gateId: string; lastPointer: PointMm } | null>(null);
  const [isLengthEditorOpen, setIsLengthEditorOpen] = useState(false);
  const [selectedLengthInputM, setSelectedLengthInputM] = useState<string>("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isOptimizationInspectorOpen, setIsOptimizationInspectorOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const initialPanelOffsets: Record<DraggablePanel, PanelOffset> = {
    controls: { x: 0, y: 0 },
    itemCounts: { x: 0, y: 0 },
    postKey: { x: 0, y: 0 },
    tutorial: { x: 0, y: 0 }
  };
  const { panelDragStyle, startPanelDrag } = useDraggablePanels(initialPanelOffsets);
  const previousSegmentsByIdRef = useRef<Map<string, LayoutSegment>>(new Map());
  const requestedInitialDrawingIdRef = useRef<string | null>(null);
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
    canvasWidth,
    canvasHeight,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
    initialVisibleWidthMm: INITIAL_VISIBLE_WIDTH_MM,
    chooseGridStep
  });
  const currentLayout = useMemo<LayoutModel>(
    () => ({
      segments,
      gates: gatePlacements
    }),
    [gatePlacements, segments],
  );

  const applySegments = useCallback((updater: (previous: LayoutSegment[]) => LayoutSegment[]) => {
    dispatchHistory({ type: "APPLY", updater });
  }, []);

  const loadWorkspaceLayout = useCallback((layout: LayoutModel) => {
    dispatchHistory({ type: "SET", segments: layout.segments });
    setGatePlacements(layout.gates ?? []);
    setDrawStart(null);
    setRectangleStart(null);
    setSelectedSegmentId(null);
    setSelectedGateId(null);
    setSelectedPlanId(null);
    setIsLengthEditorOpen(false);
  }, []);

  const workspace = useWorkspacePersistence({
    layout: currentLayout,
    onLoadLayout: loadWorkspaceLayout
  });

  useEffect(() => {
    const requestedDrawingId = initialDrawingId;
    if (
      !shouldLoadInitialDrawing({
        requestedDrawingId,
        currentDrawingId: workspace.currentDrawingId,
        lastRequestedDrawingId: requestedInitialDrawingIdRef.current,
        hasSession: workspace.session !== null,
        isRestoringSession: workspace.isRestoringSession
      })
    ) {
      if (!requestedDrawingId) {
        requestedInitialDrawingIdRef.current = null;
      } else if (workspace.currentDrawingId === requestedDrawingId) {
        requestedInitialDrawingIdRef.current = requestedDrawingId;
      }
      return;
    }

    if (!requestedDrawingId) {
      return;
    }

    requestedInitialDrawingIdRef.current = requestedDrawingId;
    void workspace.loadDrawing(requestedDrawingId);
  }, [
    initialDrawingId,
    workspace.currentDrawingId,
    workspace.isRestoringSession,
    workspace.loadDrawing,
    workspace.session
  ]);

  const undoSegments = useCallback(() => {
    dispatchHistory({ type: "UNDO" });
    setDrawStart(null);
    setSelectedSegmentId(null);
  }, []);

  const redoSegments = useCallback(() => {
    dispatchHistory({ type: "REDO" });
    setDrawStart(null);
    setSelectedSegmentId(null);
  }, []);

  useEffect(() => {
    if (interactionMode !== "SELECT") {
      setSelectedSegmentId(null);
      setSelectedGateId(null);
      setIsLengthEditorOpen(false);
      setActiveSegmentDrag(null);
      setActiveGateDrag(null);
    }
    if (interactionMode !== "DRAW") {
      setDrawStart(null);
    }
    if (interactionMode !== "RECTANGLE") {
      setRectangleStart(null);
    }
  }, [interactionMode]);

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
    selectedSegmentId,
    selectedPlanId,
    activeSpecSystem: activeSpec.system,
    viewScale: view.scale,
    canvasWidth
  });
  useEffect(() => {
    const previousSegmentsById = previousSegmentsByIdRef.current;
    setGatePlacements((previous) => {
      const next: GatePlacement[] = [];

      for (const placement of previous) {
        const nextSegment = segmentsById.get(placement.segmentId);
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
      return sameGatePlacementList(previous, next) ? previous : next;
    });
    previousSegmentsByIdRef.current = new Map(segmentsById);
  }, [segmentsById]);
  const { postRowsByType, gateCounts, gateCountsByHeight, twinBarFenceRows } = editorSummary;
  const optimizationSummary = estimate.optimization;
  useEffect(() => {
    if (!selectedSegment) {
      setIsLengthEditorOpen(false);
      setSelectedLengthInputM("");
      return;
    }
    setSelectedLengthInputM((distanceMm(selectedSegment.start, selectedSegment.end) / 1000).toFixed(2));
  }, [selectedSegment]);
  useEffect(() => {
    if (!selectedGateId) {
      return;
    }
    if (!resolvedGateById.has(selectedGateId)) {
      setSelectedGateId(null);
      setActiveGateDrag(null);
    }
  }, [resolvedGateById, selectedGateId]);
  useEffect(() => {
    if (highlightableOptimizationPlans.length === 0) {
      setSelectedPlanId(null);
      return;
    }
    if (!selectedPlanId || !highlightableOptimizationPlans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(highlightableOptimizationPlans[0]?.id ?? null);
    }
  }, [highlightableOptimizationPlans, selectedPlanId]);
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
    interactionMode,
    pointerWorld,
    drawStart,
    rectangleStart,
    drawAnchorNodes,
    disableSnap,
    viewScale: view.scale,
    recessAlignmentAnchors,
    recessWidthMm,
    recessDepthMm,
    recessSide,
    gateType,
    customGateWidthMm
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
    dispatchHistory,
    applySegments,
    segmentsById,
    resolvedGateById,
    connectivity,
    activeSpec,
    interactionMode,
    gateType,
    drawStart,
    rectangleStart,
    selectedSegmentId,
    selectedGateId,
    selectedLengthInputM,
    isSpacePressed,
    isPanning,
    activeSegmentDrag,
    activeGateDrag,
    recessWidthMm,
    recessDepthMm,
    customGateWidthMm,
    recessPreview,
    gatePreview,
    resolveDrawPoint,
    toWorld,
    beginPan,
    updatePan,
    endPan,
    zoomAtPointer,
    setPointerWorld,
    setGatePlacements,
    setDrawStart,
    setRectangleStart,
    setSelectedSegmentId,
    setSelectedGateId,
    setSelectedPlanId,
    setSelectedLengthInputM,
    setIsLengthEditorOpen,
    setActiveSegmentDrag,
    setActiveGateDrag,
    setRecessWidthMm,
    setRecessDepthMm,
    setRecessWidthInputM,
    setRecessDepthInputM,
    setCustomGateWidthMm,
    setCustomGateWidthInputM
  });
  const keyboardShortcutOptions = useMemo(
    () => ({
      undo: undoSegments,
      redo: redoSegments,
      deleteSelectedGate,
      deleteSelectedSegment,
      setInteractionMode,
      setIsSpacePressed,
      setDisableSnap,
      cancelActiveDrawing
    }),
    [cancelActiveDrawing, deleteSelectedGate, deleteSelectedSegment, redoSegments, undoSegments]
  );

  useEditorKeyboardShortcuts(keyboardShortcutOptions);

  function openOptimizationInspector(): void {
    setIsOptimizationInspectorOpen(true);
  }

  function handleStartNewDraft(): void {
    if (workspace.isDirty && !window.confirm("Discard unsaved changes and start a new draft?")) {
      return;
    }
    resetWorkspaceCanvas();
    workspace.startNewDraft();
  }

  function handleOpenDrawings(): void {
    if (workspace.isDirty && !window.confirm("Discard unsaved changes and go back to the drawings library?")) {
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
        onNavigate={onNavigate}
        interactionMode={interactionMode}
        recessWidthInputM={recessWidthInputM}
        recessDepthInputM={recessDepthInputM}
        recessSide={recessSide}
        gateType={gateType}
        customGateWidthInputM={customGateWidthInputM}
        recessWidthOptionsMm={RECESS_WIDTH_OPTIONS_MM}
        recessDepthOptionsMm={RECESS_DEPTH_OPTIONS_MM}
        gateWidthOptionsMm={GATE_WIDTH_OPTIONS_MM}
        recessPreview={recessPreview}
        gatePreview={gatePreview}
        activeSpec={activeSpec}
        activeHeightOptions={activeHeightOptions}
        twinBarHeightOptions={TWIN_BAR_HEIGHT_OPTIONS}
        rollFormHeightOptions={ROLL_FORM_HEIGHT_OPTIONS}
        postRowsByType={postRowsByType}
        gateCounts={gateCounts}
        gateCountsByHeight={gateCountsByHeight}
        twinBarFenceRows={twinBarFenceRows}
        postTypeCounts={postTypeCounts}
        isTutorialOpen={isTutorialOpen}
        controlsStyle={panelDragStyle("controls")}
        itemCountsStyle={panelDragStyle("itemCounts")}
        postKeyStyle={panelDragStyle("postKey")}
        tutorialStyle={panelDragStyle("tutorial")}
        canUndo={canUndo}
        canRedo={canRedo}
        canDeleteSelection={interactionMode === "SELECT" && (!!selectedSegmentId || !!selectedGateId)}
        formatLengthMm={formatLengthMm}
        formatMetersInputFromMm={formatMetersInputFromMm}
        formatHeightLabelFromMm={formatHeightLabelFromMm}
        getSegmentColor={getSegmentColor}
        onSetInteractionMode={setInteractionMode}
        onRecessWidthInputChange={onRecessWidthInputChange}
        onRecessDepthInputChange={onRecessDepthInputChange}
        onNormalizeRecessInputs={normalizeRecessInputs}
        onSetRecessSide={setRecessSide}
        onSetGateType={setGateType}
        onCustomGateWidthInputChange={onCustomGateWidthInputChange}
        onNormalizeGateInputs={normalizeGateInputs}
        onSetActiveSpec={setActiveSpec}
        onOpenTutorial={() => setIsTutorialOpen(true)}
        onCloseTutorial={() => setIsTutorialOpen(false)}
        onStartItemCountsDrag={(event) => startPanelDrag("itemCounts", event)}
        onStartPostKeyDrag={(event) => startPanelDrag("postKey", event)}
        onStartTutorialDrag={(event) => startPanelDrag("tutorial", event)}
        onStartControlsDrag={(event) => startPanelDrag("controls", event)}
        onUndo={undoSegments}
        onRedo={redoSegments}
        onDeleteSelection={handleDeleteSelection}
        onClearLayout={handleClearLayout}
      />

      <OptimizationPlanner
        summary={optimizationSummary}
        canInspect={segments.length > 0}
        isOpen={isOptimizationInspectorOpen}
        selectedPlanId={selectedPlanId}
        segmentOrdinalById={segmentOrdinalById}
        onOpen={openOptimizationInspector}
        onClose={() => setIsOptimizationInspectorOpen(false)}
        onSelectPlan={setSelectedPlanId}
      />

      <EditorLengthEditor
        isOpen={isLengthEditorOpen && selectedSegment !== null}
        selectedComponentClosed={selectedComponentClosed}
        selectedLengthInputM={selectedLengthInputM}
        inputStepM={RECESS_INPUT_STEP_M}
        onChangeLength={setSelectedLengthInputM}
        onApply={applySelectedLengthEdit}
        onCancel={() => setIsLengthEditorOpen(false)}
      />

      <EditorCanvasStage
        stageRef={stageRef}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        view={view}
        visibleBounds={visibleBounds}
        verticalLines={verticalLines}
        horizontalLines={horizontalLines}
        interactionMode={interactionMode}
        disableSnap={disableSnap}
        drawStart={drawStart}
        rectangleStart={rectangleStart}
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
        selectedSegmentId={selectedSegmentId}
        selectedGateId={selectedGateId}
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
          setSelectedSegmentId(segmentId);
          setSelectedGateId(null);
          setDrawStart(null);
        }}
        onStartSegmentDrag={(segmentId) => {
          setSelectedGateId(null);
          startSelectedSegmentDrag(segmentId);
        }}
        onOpenSegmentLengthEditor={(segmentId) => {
          setSelectedGateId(null);
          openLengthEditor(segmentId);
        }}
        onUpdateSegmentEndpoint={(segmentId, endpoint, point) => {
          updateSegment(segmentId, (current) => ({ ...current, [endpoint]: point }));
        }}
        onSelectGate={(gateId) => {
          setSelectedSegmentId(null);
          setSelectedGateId(gateId);
          setIsLengthEditorOpen(false);
        }}
        onStartGateDrag={(gateId) => {
          setSelectedSegmentId(null);
          setSelectedGateId(gateId);
          setIsLengthEditorOpen(false);
          startSelectedGateDrag(gateId);
        }}
      />
    </div>
  );
}



