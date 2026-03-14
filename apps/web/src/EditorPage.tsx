import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import type Konva from "konva";
import {
  type BasketballPostPlacement,
  type FloodlightColumnPlacement,
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

export function EditorPage({ initialDrawingId = null, onNavigate }: EditorPageProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const { ref: canvasFrameRef, size: canvasFrameSize } = useElementSize<HTMLDivElement>();
  const [isEndpointDragActive, setIsEndpointDragActive] = useState(false);
  const [history, dispatchHistory] = useReducer(historyReducer, {
    past: [],
    present: { segments: [], gates: [], basketballPosts: [], floodlightColumns: [] },
    future: []
  } satisfies HistoryState);
  const shellState = useEditorShellState();
  const selectionState = useEditorSelectionState(shellState.interactionMode);
  const currentLayout = history.present;
  const segments = currentLayout.segments;
  const gatePlacements = currentLayout.gates ?? [];
  const basketballPostPlacements = currentLayout.basketballPosts ?? [];
  const floodlightColumnPlacements = currentLayout.floodlightColumns ?? [];
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
          segments: nextSegments,
          gates: reconcileGatePlacementsForSegments(previous.gates ?? [], previous.segments, nextSegments),
          basketballPosts: reconcileBasketballPostsForSegments(previous.basketballPosts ?? [], nextSegments),
          floodlightColumns: reconcileFloodlightColumnsForSegments(previous.floodlightColumns ?? [], nextSegments)
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
    basketballPostPlacements,
    floodlightColumnPlacements,
    selectedSegmentId: selectionState.selectedSegmentId,
    selectedPlanId: shellState.selectedPlanId,
    activeSpecSystem: shellState.activeSpec.system,
    viewScale: view.scale,
    canvasWidth,
    freezeOptimization: isOptimizationFrozen
  });
  const { postRowsByType, gateCounts, gateCountsByHeight, basketballPostCountsByHeight, twinBarFenceRows } = editorSummary;
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
    rectanglePreviewEnd,
    recessPreview,
    resolveBasketballPostPreview,
    resolveFloodlightColumnPreview,
    closeLoopPoint,
    resolveDrawPoint
  } = useEditorInteractionPreviews({
    segments,
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
    gateType: shellState.gateType,
    customGateWidthMm: shellState.customGateWidthMm,
    placedGateVisuals,
    placedBasketballPostVisuals: resolvedBasketballPostPlacements,
    placedFloodlightColumnVisuals: resolvedFloodlightColumnPlacements,
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
    segmentsById,
    resolvedGateById,
    resolvedBasketballPostById,
    resolvedFloodlightColumnById,
    connectivity,
    activeSpec: shellState.activeSpec,
    interactionMode: shellState.interactionMode,
    gateType: shellState.gateType,
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
    gatePreview,
    basketballPostPreview,
    floodlightColumnPreview,
    resolveBasketballPostPreview,
    resolveFloodlightColumnPreview,
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
    setCustomGateWidthInputM: shellState.setCustomGateWidthInputM
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
              : shellState.interactionMode === "GATE"
                ? "Gate"
                : shellState.interactionMode === "BASKETBALL_POST"
                  ? "Basketball Post"
                  : "Floodlight Column";

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
              <div className="editor-document-fields">
                <label className="editor-document-name">
                  <span>Customer</span>
                  <input
                    type="text"
                    value={workspace.currentCustomerName}
                    placeholder="Customer name"
                    onChange={(event) => workspace.setCurrentCustomerName(event.target.value)}
                  />
                </label>
                <label className="editor-document-name">
                  <span>Drawing Name</span>
                  <input
                    type="text"
                    value={workspace.currentDrawingName}
                    placeholder="Name this drawing"
                    onChange={(event) => workspace.setCurrentDrawingName(event.target.value)}
                  />
                </label>
              </div>
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
          gateType={shellState.gateType}
          customGateWidthInputM={shellState.customGateWidthInputM}
          recessWidthOptionsMm={RECESS_WIDTH_OPTIONS_MM}
          recessDepthOptionsMm={RECESS_DEPTH_OPTIONS_MM}
          gateWidthOptionsMm={GATE_WIDTH_OPTIONS_MM}
          recessPreview={recessPreview}
          gatePreview={gatePreview}
          basketballPostPreview={basketballPostPreview}
          floodlightColumnPreview={floodlightColumnPreview}
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
                gatePreview={gatePreview}
                basketballPostPreview={basketballPostPreview}
                floodlightColumnPreview={floodlightColumnPreview}
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
