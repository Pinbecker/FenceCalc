import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthSessionEnvelope } from "@fence-estimator/contracts";

type Route = "dashboard" | "drawings" | "editor" | "admin" | "login";

type InteractionMode = "DRAW" | "SELECT" | "RECTANGLE" | "RECESS" | "GATE" | "BASKETBALL_POST" | "FLOODLIGHT_COLUMN";

const mockSelectionState = {
  drawStart: null,
  drawChainStart: null,
  rectangleStart: null,
  selectedSegmentId: null as string | null,
  selectedGateId: null as string | null,
  selectedBasketballPostId: null as string | null,
  selectedFloodlightColumnId: null as string | null,
  selectedLengthInputM: "",
  isLengthEditorOpen: false,
  activeSegmentDrag: null,
  activeGateDrag: null,
  activeBasketballPostDrag: null,
  activeFloodlightColumnDrag: null,
  setDrawStart: vi.fn(),
  setDrawChainStart: vi.fn(),
  setRectangleStart: vi.fn(),
  setSelectedSegmentId: vi.fn(),
  setSelectedGateId: vi.fn(),
  setSelectedBasketballPostId: vi.fn(),
  setSelectedFloodlightColumnId: vi.fn(),
  setSelectedLengthInputM: vi.fn(),
  setIsLengthEditorOpen: vi.fn(),
  setActiveSegmentDrag: vi.fn(),
  setActiveGateDrag: vi.fn(),
  setActiveBasketballPostDrag: vi.fn(),
  setActiveFloodlightColumnDrag: vi.fn(),
  resetLoadedWorkspaceState: vi.fn(),
  clearHistorySelection: vi.fn()
};

const mockShellState = {
  interactionMode: "SELECT" as InteractionMode,
  recessWidthMm: 1500,
  recessDepthMm: 1000,
  recessSide: "AUTO" as const,
  gateType: "SINGLE_LEAF" as const,
  customGateWidthMm: 1200,
  customGateWidthInputM: "1.20",
  recessWidthInputM: "1.50",
  recessDepthInputM: "1.00",
  disableSnap: false,
  activeSpec: {
    system: "TWIN_BAR" as const,
    height: "2m" as const,
    twinBarVariant: "STANDARD" as const
  },
  selectedPlanId: null as string | null,
  isOptimizationInspectorOpen: false,
  isTutorialOpen: false,
  setInteractionMode: vi.fn(),
  setDisableSnap: vi.fn(),
  setSelectedPlanId: vi.fn(),
  setRecessWidthMm: vi.fn(),
  setRecessDepthMm: vi.fn(),
  setRecessWidthInputM: vi.fn(),
  setRecessDepthInputM: vi.fn(),
  setCustomGateWidthMm: vi.fn(),
  setCustomGateWidthInputM: vi.fn(),
  setRecessSide: vi.fn(),
  setGateType: vi.fn(),
  setActiveSpec: vi.fn(),
  setIsOptimizationInspectorOpen: vi.fn(),
  setIsTutorialOpen: vi.fn()
};

const baseSession: AuthSessionEnvelope = {
  company: {
    id: "company-1",
    name: "Acme Fencing",
    createdAtIso: "2026-03-10T10:00:00.000Z"
  },
  user: {
    id: "user-1",
    companyId: "company-1",
    email: "jane@example.com",
    displayName: "Jane Owner",
    role: "OWNER",
    createdAtIso: "2026-03-10T10:00:00.000Z"
  },
  session: {
    id: "session-1",
    companyId: "company-1",
    userId: "user-1",
    createdAtIso: "2026-03-10T10:00:00.000Z",
    expiresAtIso: "2026-04-10T10:00:00.000Z"
  }
};

const mockWorkspace = {
  session: baseSession as AuthSessionEnvelope | null,
  currentDrawingId: "drawing-1" as string | null,
  currentDrawingName: "Perimeter A",
  currentCustomerName: "Cleveland Land Services",
  isDirty: false,
  isSavingDrawing: false,
  setCurrentDrawingName: vi.fn(),
  setCurrentCustomerName: vi.fn(),
  saveDrawing: vi.fn(async () => undefined),
  saveDrawingAsNew: vi.fn(async () => undefined),
  startNewDraft: vi.fn(),
  currentDrawingVersion: 1,
  drawings: [],
  isRestoringSession: false,
  isAuthenticating: false,
  isLoadingDrawings: false,
  errorMessage: null,
  noticeMessage: null,
  register: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refreshDrawings: vi.fn(),
  loadDrawing: vi.fn()
};

const mockCommands = {
  applySelectedLengthEdit: vi.fn(),
  cancelActiveDrawing: vi.fn(),
  deleteSelectedBasketballPost: vi.fn(() => false),
  deleteSelectedFloodlightColumn: vi.fn(() => false),
  deleteSelectedGate: vi.fn(() => false),
  deleteSelectedSegment: vi.fn(() => false),
  handleClearLayout: vi.fn(),
  handleDeleteSelection: vi.fn(),
  normalizeGateInputs: vi.fn(),
  normalizeRecessInputs: vi.fn(),
  onContextMenu: vi.fn(),
  onCustomGateWidthInputChange: vi.fn(),
  onRecessDepthInputChange: vi.fn(),
  onRecessWidthInputChange: vi.fn(),
  onStageMouseDown: vi.fn(),
  onStageMouseMove: vi.fn(),
  onStageMouseUp: vi.fn(),
  onStageWheel: vi.fn(),
  openLengthEditor: vi.fn(),
  resetWorkspaceCanvas: vi.fn(),
  startSelectedBasketballPostDrag: vi.fn(),
  startSelectedFloodlightColumnDrag: vi.fn(),
  startSelectedGateDrag: vi.fn(),
  startSelectedSegmentDrag: vi.fn(),
  updateSegment: vi.fn()
};

const mockGuards = {
  confirmDiscardChanges: vi.fn(() => true),
  guardedNavigate: vi.fn()
};

const mockDerivedState = {
  activeHeightOptions: ["2m"],
  connectivity: {
    segmentComponent: new Map(),
    segmentIdsByComponent: new Map(),
    movableComponentIds: new Set(),
    closedComponentIds: new Set(),
    nodeDegreeByKey: new Map()
  },
  drawAnchorNodes: [],
  editorSummary: {
    postRowsByType: {
      end: [],
      intermediate: [],
      corner: [],
      junction: [],
      inlineJoin: []
    },
    gateCounts: {
      total: 0,
      single: 0,
      double: 0,
      custom: 0
    },
    gateCountsByHeight: [],
    basketballPostCountsByHeight: [],
    twinBarFenceRows: []
  },
  estimate: {
    materials: {
      twinBarPanels: 4,
      twinBarPanelsSuperRebound: 2
    },
    optimization: {
      strategy: "CHAINED_CUT_PLANNER" as const,
      twinBar: {
        reuseAllowanceMm: 200,
        stockPanelWidthMm: 2525,
        fixedFullPanels: 0,
        baselinePanels: 0,
        optimizedPanels: 0,
        panelsSaved: 0,
        totalCutDemands: 0,
        stockPanelsOpened: 0,
        reusedCuts: 0,
        totalConsumedMm: 0,
        totalLeftoverMm: 0,
        reusableLeftoverMm: 0,
        utilizationRate: 0,
        buckets: []
      }
    }
  },
  estimateSegments: [{ id: "run-1" }, { id: "run-2" }, { id: "run-3" }],
  gatesBySegmentId: new Map(),
  highlightableOptimizationPlans: [],
  oppositeGateGuides: [],
  resolvedBasketballPostPlacements: [],
  resolvedFloodlightColumnPlacements: [],
  resolvedGatePlacements: [],
  placedGateVisuals: [],
  postTypeCounts: {
    END: 0,
    INTERMEDIATE: 0,
    CORNER: 0,
    JUNCTION: 0,
    INLINE_JOIN: 0,
    GATE: 0
  },
  recessAlignmentAnchors: [],
  resolvedGateById: new Map(),
  scaleBar: null,
  segmentLengthLabelsBySegmentId: new Map(),
  segmentOrdinalById: new Map(),
  segmentsById: new Map(),
  selectedComponentClosed: false,
  selectedPlanVisual: null,
  selectedSegment: null as null | { id: string },
  visualPosts: [],
  visibleSegmentLabelKeys: new Set()
};

vi.mock("./EditorCanvasStage", () => ({
  EditorCanvasStage: () => <div>CanvasStage</div>
}));

vi.mock("./EditorCanvasControls", () => ({
  EditorCanvasControls: ({ canUndo, canRedo }: { canUndo: boolean; canRedo: boolean }) => (
    <div>{`CanvasControls ${canUndo ? "undo" : "no-undo"} ${canRedo ? "redo" : "no-redo"}`}</div>
  )
}));

vi.mock("./EditorLengthEditor", () => ({
  EditorLengthEditor: ({ isOpen }: { isOpen: boolean }) => <div>{isOpen ? "LengthEditorOpen" : "LengthEditorClosed"}</div>
}));

vi.mock("./EditorOverlayPanels", () => ({
  EditorOverlayPanels: ({ panelCount, fenceRunCount }: { panelCount: number; fenceRunCount: number }) => (
    <div>{`OverlayPanels panels:${panelCount} runs:${fenceRunCount}`}</div>
  )
}));

vi.mock("./EditorSidebar", () => ({
  EditorSidebar: ({ interactionMode }: { interactionMode: string }) => <div>{`Sidebar ${interactionMode}`}</div>
}));

vi.mock("./editor/useEditorCommands", () => ({
  useEditorCommands: () => mockCommands
}));

vi.mock("./editor/useEditorDerivedState", () => ({
  useEditorDerivedState: () => mockDerivedState
}));

vi.mock("./editor/useEditorInteractionPreviews", () => ({
  useEditorInteractionPreviews: () => ({
    activeDrawNodeSnap: null,
    axisGuide: null,
    drawHoverSnap: null,
    basketballPostPreview: null,
    floodlightColumnPreview: null,
    drawSnapLabel: null,
    gatePreview: null,
    gatePreviewVisual: null,
    ghostEnd: null,
    ghostLengthMm: null,
    hoveredBasketballPostId: null,
    hoveredFloodlightColumnId: null,
    hoveredGateId: null,
    hoveredSegmentId: null,
    rectanglePreviewEnd: null,
    recessPreview: null,
    resolveBasketballPostPreview: vi.fn(),
    resolveFloodlightColumnPreview: vi.fn(),
    closeLoopPoint: null,
    resolveDrawPoint: vi.fn()
  })
}));

vi.mock("./editor/useEditorNavigationGuards", () => ({
  useEditorNavigationGuards: () => mockGuards
}));

vi.mock("./editor/useEditorSelectionEffects", () => ({
  useEditorSelectionEffects: vi.fn()
}));

vi.mock("./editor/useEditorSelectionState", () => ({
  useEditorSelectionState: () => mockSelectionState
}));

vi.mock("./editor/useEditorShellState", () => ({
  useEditorShellState: () => mockShellState
}));

vi.mock("./editor/useEditorWorkspaceBridge", () => ({
  useEditorWorkspaceBridge: () => mockWorkspace
}));

vi.mock("./editor", () => ({
  clampGatePlacementToSegment: (placement: { startOffsetMm: number; endOffsetMm: number }) => placement,
  chooseGridStep: () => 250,
  useEditorCanvasViewport: () => ({
    view: { x: 120, y: 120, scale: 0.2 },
    setView: vi.fn(),
    pointerWorld: null,
    setPointerWorld: vi.fn(),
    isSpacePressed: false,
    setIsSpacePressed: vi.fn(),
    isPanning: false,
    beginPan: vi.fn(),
    updatePan: vi.fn(),
    endPan: vi.fn(),
    zoomAtPointer: vi.fn(),
    restoreView: vi.fn(),
    resetView: vi.fn(),
    toWorld: vi.fn(),
    visibleBounds: { left: 0, right: 1000, top: 0, bottom: 1000 },
    verticalLines: [],
    horizontalLines: []
  }),
  useElementSize: () => ({
    ref: { current: null },
    size: { width: 900, height: 600 }
  }),
  formatHeightLabelFromMm: (value: number) => `${value}mm`,
  formatLengthMm: (value: number) => `${value} mm`,
  formatMetersInputFromMm: (value: number) => `${(value / 1000).toFixed(2)}`,
  GATE_WIDTH_OPTIONS_MM: [1200, 1800],
  getSegmentColor: () => "#a9d6ff",
  historyReducer: (state: unknown) => state,
  INITIAL_VISIBLE_WIDTH_MM: 150000,
  MAX_SCALE: 3,
  MIN_SCALE: 0.003,
  OptimizationPlanner: ({ canInspect }: { canInspect: boolean }) => <div>{`OptimizationPlanner ${canInspect}`}</div>,
  RECESS_DEPTH_OPTIONS_MM: [500, 1000],
  RECESS_INPUT_STEP_M: 0.05,
  RECESS_WIDTH_OPTIONS_MM: [500, 1000],
  ROLL_FORM_HEIGHT_OPTIONS: ["2m", "3m"],
  samePointApprox: () => true,
  TWIN_BAR_HEIGHT_OPTIONS: ["2m", "2.4m"],
  useEditorKeyboardShortcuts: vi.fn()
}));

import { EditorPage } from "./EditorPage.js";

describe("EditorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShellState.interactionMode = "SELECT";
    mockWorkspace.session = baseSession;
    mockWorkspace.currentDrawingId = "drawing-1";
    mockWorkspace.currentDrawingName = "Perimeter A";
    mockWorkspace.currentCustomerName = "Cleveland Land Services";
    mockWorkspace.isDirty = false;
    mockSelectionState.selectedSegmentId = null;
    mockSelectionState.selectedGateId = null;
    mockSelectionState.selectedBasketballPostId = null;
    mockSelectionState.selectedFloodlightColumnId = null;
    mockSelectionState.isLengthEditorOpen = false;
    mockDerivedState.selectedSegment = null;
  });

  it("renders the authenticated workspace shell with admin navigation and editor rails", () => {
    const html = renderToStaticMarkup(<EditorPage initialDrawingId="drawing-1" onNavigate={vi.fn()} />);

    expect(html).toContain("Workspace Editor");
    expect(html).toContain("Perimeter A");
    expect(html).toContain("Cleveland Land Services");
    expect(html).toContain("Acme Fencing workspace");
    expect(html).toContain("Jane Owner");
    expect(html).toContain("Admin");
    expect(html).toContain("Sidebar SELECT");
    expect(html).toContain("CanvasStage");
    expect(html).toContain("OptimizationPlanner false");
    expect(html).toContain("OverlayPanels panels:6 runs:3");
    expect(html).toContain("LengthEditorClosed");
  });

  it("renders the guest state with a login action and new drawing draft title", () => {
    mockWorkspace.session = null;
    mockWorkspace.currentDrawingId = null;
    mockWorkspace.currentDrawingName = "";
    mockShellState.interactionMode = "GATE";

    const html = renderToStaticMarkup(<EditorPage onNavigate={vi.fn()} />);

    expect(html).toContain("New drawing draft");
    expect(html).toContain("Review the drawing canvas and sign in when you need to save or reopen company work.");
    expect(html).toContain("Go To Login");
    expect(html).toContain("Sidebar GATE");
    expect(html).toContain("<h2>Gate</h2>");
    expect(html).not.toContain("Admin");
  });

  it("shows untitled state, dirty save copy, and the length editor when a saved drawing has no name", () => {
    mockWorkspace.currentDrawingName = "   ";
    mockWorkspace.currentDrawingId = "drawing-2";
    mockWorkspace.isDirty = true;
    mockShellState.interactionMode = "RECTANGLE";
    mockSelectionState.isLengthEditorOpen = true;
    mockDerivedState.selectedSegment = { id: "segment-1" };

    const html = renderToStaticMarkup(<EditorPage onNavigate={vi.fn()} />);

    expect(html).toContain("Untitled drawing");
    expect(html).toContain("Unsaved changes");
    expect(html).toContain("<h2>Rectangle</h2>");
    expect(html).toContain("LengthEditorOpen");
  });
});
