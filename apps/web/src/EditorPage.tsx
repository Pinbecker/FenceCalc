import { useCallback, useMemo, useReducer, useRef } from "react";
import type Konva from "konva";
import {
  type GatePlacement,
  type LayoutModel,
  type LayoutSegment
} from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import { EditorCanvasStage } from "./EditorCanvasStage";
import { EditorCanvasControls } from "./EditorCanvasControls";
import { EditorLengthEditor } from "./EditorLengthEditor";
import { EditorOverlayPanels } from "./EditorOverlayPanels";
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
  useElementSize,
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
  useEditorKeyboardShortcuts
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
  const stageRef = useRef<Konva.Stage | null>(null);
  const { ref: canvasFrameRef, size: canvasFrameSize } = useElementSize<HTMLDivElement>();
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
    canvasWidth
  });
  const { postRowsByType, gateCounts, gateCountsByHeight, twinBarFenceRows } = editorSummary;
  const optimizationSummary = estimate.optimization;
  const panelCount = estimate.materials.twinBarPanels + estimate.materials.twinBarPanelsSuperRebound;
  const fenceRunCount = estimateSegments.length;

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
  const session = workspace.session;
  const canManageAdmin = session?.user.role === "OWNER" || session?.user.role === "ADMIN";
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
            : "Gate";

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

  return (
    <div className="editor-page">
      <header className="editor-header">
        <div className="editor-header-main">
          <div className="editor-header-copy">
            <span className="portal-eyebrow">Workspace Editor</span>
            <h1>{drawingTitle}</h1>
            <p>
              {session
                ? `${session.company.name} workspace. Keep the canvas central and use the surrounding rails only when you need tooling or estimate detail.`
                : "Review the drawing canvas and sign in when you need to save or reopen company work."}
            </p>
          </div>
          {session ? (
            <div className="editor-document-bar">
              <label className="editor-document-name">
                <span>Drawing Name</span>
                <input
                  type="text"
                  value={workspace.currentDrawingName}
                  placeholder="Name this drawing"
                  onChange={(event) => workspace.setCurrentDrawingName(event.target.value)}
                />
              </label>
              <div className="editor-document-actions-compact">
                <button type="button" onClick={() => void workspace.saveDrawing()} disabled={workspace.isSavingDrawing}>
                  {workspace.currentDrawingId ? "Save" : "Save New"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void workspace.saveDrawingAsNew()}
                  disabled={workspace.isSavingDrawing}
                >
                  Save As
                </button>
                <button type="button" className="ghost" onClick={handleStartNewDraft}>
                  New Draft
                </button>
              </div>
            </div>
          ) : (
            <div className="editor-document-bar">
              <button type="button" onClick={() => guardedNavigate("login")}>
                Go To Login
              </button>
            </div>
          )}
        </div>
        <div className="editor-header-meta">
          {session ? (
            <>
              <span className="editor-session-chip">
                {session.user.displayName}
              </span>
              <span className="portal-user-chip">{session.user.role}</span>
              <span className={`editor-save-pill${workspace.isDirty ? " dirty" : ""}`}>
                {workspace.isDirty ? "Unsaved changes" : "All changes saved"}
              </span>
            </>
          ) : null}
          <nav className="editor-route-nav" aria-label="Editor navigation">
            <button type="button" className="ghost editor-link-btn" onClick={() => guardedNavigate("dashboard")}>
              Dashboard
            </button>
            <button type="button" className="ghost editor-link-btn" onClick={handleOpenDrawings}>
              Drawings
            </button>
            {canManageAdmin ? (
              <button type="button" className="ghost editor-link-btn" onClick={() => guardedNavigate("admin")}>
                Admin
              </button>
            ) : null}
          </nav>
        </div>
      </header>

      <div className="editor-workspace-shell">
        <EditorSidebar
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
          formatLengthMm={formatLengthMm}
          formatMetersInputFromMm={formatMetersInputFromMm}
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
                  shellState.interactionMode === "SELECT" && (!!selectionState.selectedSegmentId || !!selectionState.selectedGateId)
                }
                onUndo={undoSegments}
                onRedo={redoSegments}
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
          </div>
        </section>

        <aside className="editor-secondary-rail">
          <div className="editor-rail-scroll">
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
            <EditorOverlayPanels
              postRowsByType={postRowsByType}
              gateCounts={gateCounts}
              gateCountsByHeight={gateCountsByHeight}
              twinBarFenceRows={twinBarFenceRows}
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
