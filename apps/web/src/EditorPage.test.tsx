import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthSessionEnvelope, DrawingStatus } from "@fence-estimator/contracts";

type InteractionMode =
  | "DRAW"
  | "SELECT"
  | "RECTANGLE"
  | "RECESS"
  | "GOAL_UNIT"
  | "GATE"
  | "BASKETBALL_POST"
  | "FLOODLIGHT_COLUMN"
  | "KICKBOARD"
  | "PITCH_DIVIDER"
  | "SIDE_NETTING";

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
  goalUnitWidthMm: 3000 as const,
  goalUnitHeightMm: 3000 as const,
  goalUnitDepthMm: 1200,
  basketballPlacementType: "DEDICATED_POST" as const,
  basketballArmLengthMm: 1800 as const,
  kickboardSectionHeightMm: 200 as const,
  kickboardProfile: "SQUARE" as const,
  sideNettingHeightMm: 2000,
  pendingPitchDividerStart: null,
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
  setGoalUnitWidthMm: vi.fn(),
  setGoalUnitHeightMm: vi.fn(),
  setBasketballPlacementType: vi.fn(),
  setBasketballArmLengthMm: vi.fn(),
  setKickboardSectionHeightMm: vi.fn(),
  setKickboardProfile: vi.fn(),
  setSideNettingHeightMm: vi.fn(),
  setPendingPitchDividerStart: vi.fn(),
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

const baseCustomer = {
  id: "customer-1",
  companyId: "company-1",
  name: "Cleveland Land Services",
  primaryContactName: "",
  primaryEmail: "",
  primaryPhone: "",
  siteAddress: "",
  notes: "",
  isArchived: false,
  createdByUserId: "user-1",
  updatedByUserId: "user-1",
  createdAtIso: "2026-03-10T10:00:00.000Z",
  updatedAtIso: "2026-03-10T11:00:00.000Z",
  activeDrawingCount: 1,
  archivedDrawingCount: 0,
  lastActivityAtIso: "2026-03-10T11:00:00.000Z"
};

const mockWorkspace = {
  session: baseSession as AuthSessionEnvelope | null,
  customers: [baseCustomer],
  currentDrawingId: "drawing-1" as string | null,
  currentDrawingName: "Perimeter A",
  currentDrawingStatus: "DRAFT" as DrawingStatus | null,
  currentCustomerId: "customer-1" as string | null,
  currentCustomerName: "Cleveland Land Services",
  isDirty: false,
  isSavingCustomer: false,
  isSavingDrawing: false,
  setCurrentDrawingName: vi.fn(),
  saveCustomer: vi.fn(() => Promise.resolve({ id: "customer-2" })),
  saveDrawing: vi.fn(() => Promise.resolve()),
  saveDrawingAsCopy: vi.fn(() => Promise.resolve(true)),
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
    gateCountsByHeight: {
      single: [],
      double: [],
      custom: []
    },
    basketballPostCountsByHeight: [],
    floodlightColumnCountsByHeight: [],
    twinBarFenceRows: [],
    panelCount: 6,
    featureCounts: {
      goalUnits: 0,
      kickboards: 0,
      pitchDividers: 0,
      sideNettings: 0
    },
    featureRowsByKind: {
      goalUnits: [],
      kickboards: [],
      pitchDividers: [],
      sideNettings: []
    }
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

vi.mock("./EditorLengthEditor", () => ({
  EditorLengthEditor: ({ isOpen }: { isOpen: boolean }) => <div>{isOpen ? "LengthEditorOpen" : "LengthEditorClosed"}</div>
}));

vi.mock("./EditorMenuBar", () => ({
  EditorMenuBar: ({
    drawingTitle,
    currentCustomerName,
    currentDrawingStatus,
    isDirty,
    isReadOnly,
    session
  }: {
    drawingTitle: string;
    currentCustomerName: string;
    currentDrawingStatus: string | null;
    isDirty: boolean;
    isReadOnly?: boolean;
    session: { user: { displayName: string } } | null;
  }) => (
    <div>{`MenuBar title:${drawingTitle} customer:${currentCustomerName} status:${currentDrawingStatus ?? ""} mode:${isReadOnly ? "view-only" : "editable"} save:${isDirty ? "Unsaved changes" : "Saved"} user:${session?.user?.displayName ?? ""}`}</div>
  )
}));

vi.mock("./EditorToolPalette", () => ({
  EditorToolPalette: ({ interactionMode, isReadOnly }: { interactionMode: string; isReadOnly?: boolean }) => <div>{`ToolPalette ${interactionMode} readonly:${isReadOnly ? "yes" : "no"}`}</div>
}));

vi.mock("./EditorFloatingPanels", () => ({
  EditorFloatingPanels: ({ panelCount, fenceRunCount }: { panelCount: number; fenceRunCount: number }) => (
    <div>{`FloatingPanels panels:${panelCount} runs:${fenceRunCount}`}</div>
  )
}));

vi.mock("./OptimizationPlanner", () => ({
  OptimizationPlanner: ({ canInspect }: { canInspect: boolean }) => <div>{`OptimizationPlanner ${canInspect}`}</div>
}));

const mockUseEditorCommands = vi.fn(() => mockCommands);
const mockUseEditorCommandsArgs = vi.fn();

vi.mock("./editor/useEditorCommands", () => ({
  useEditorCommands: (options: unknown) => {
    mockUseEditorCommandsArgs(options);
    return mockUseEditorCommands();
  }
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
    goalUnitPreview: null,
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
    kickboardPreview: null,
    pitchDividerAnchorPreview: null,
    pitchDividerPreview: null,
    rectanglePreviewEnd: null,
    recessPreview: null,
    resolveBasketballPostPreview: vi.fn(),
    resolveFloodlightColumnPreview: vi.fn(),
    resolvePitchDividerAnchorPreview: vi.fn(),
    sideNettingPreview: null,
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
  GOAL_UNIT_WIDTH_OPTIONS_MM: [3000, 3600, 4800],
  GOAL_UNIT_HEIGHT_OPTIONS_MM: [3000, 4000],
  BASKETBALL_ARM_LENGTH_OPTIONS_MM: [1200, 1800],
  GATE_WIDTH_OPTIONS_MM: [1200, 1800],
  getSegmentColor: () => "#a9d6ff",
  historyReducer: (state: unknown) => state,
  INITIAL_VISIBLE_WIDTH_MM: 150000,
  KICKBOARD_SECTION_HEIGHT_OPTIONS_MM: [200, 225, 250],
  MAX_SCALE: 3,
  MIN_SCALE: 0.003,
  RECESS_DEPTH_OPTIONS_MM: [500, 1000],
  RECESS_INPUT_STEP_M: 0.05,
  RECESS_WIDTH_OPTIONS_MM: [500, 1000],
  ROLL_FORM_HEIGHT_OPTIONS: ["2m", "3m"],
  samePointApprox: () => true,
  SIDE_NETTING_HEIGHT_OPTIONS_MM: [500, 1000, 1500, 2000],
  TWIN_BAR_HEIGHT_OPTIONS: ["2m", "2.4m"],
  useEditorKeyboardShortcuts: vi.fn()
}));

import { EditorPage } from "./EditorPage.js";

describe("EditorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShellState.interactionMode = "SELECT";
    mockWorkspace.session = baseSession;
    mockWorkspace.customers = [baseCustomer];
    mockWorkspace.currentDrawingId = "drawing-1";
    mockWorkspace.currentDrawingName = "Perimeter A";
    mockWorkspace.currentDrawingStatus = "DRAFT";
    mockWorkspace.currentCustomerId = "customer-1";
    mockWorkspace.currentCustomerName = "Cleveland Land Services";
    mockWorkspace.isDirty = false;
    mockSelectionState.selectedSegmentId = null;
    mockSelectionState.selectedGateId = null;
    mockSelectionState.selectedBasketballPostId = null;
    mockSelectionState.selectedFloodlightColumnId = null;
    mockSelectionState.isLengthEditorOpen = false;
    mockDerivedState.selectedSegment = null;
  });

  it("renders the authenticated workspace shell with menu bar and tool palette", () => {
    const html = renderToStaticMarkup(<EditorPage initialDrawingId="drawing-1" onNavigate={vi.fn()} />);

    expect(html).toContain("MenuBar title:Perimeter A");
    expect(html).toContain("customer:Cleveland Land Services");
    expect(html).toContain("mode:editable");
    expect(html).toContain("user:Jane Owner");
    expect(html).toContain("ToolPalette SELECT readonly:no");
    expect(html).toContain("CanvasStage");
    expect(html).toContain("FloatingPanels panels:6 runs:3");
    expect(html).toContain("LengthEditorClosed");
  });

  it("renders the guest state with tool palette and no user in menu bar", () => {
    mockWorkspace.session = null;
    mockWorkspace.currentDrawingId = null;
    mockWorkspace.currentDrawingName = "";
    mockShellState.interactionMode = "GATE";

    const html = renderToStaticMarkup(<EditorPage onNavigate={vi.fn()} />);

    expect(html).toContain("ToolPalette GATE readonly:no");
    expect(html).toContain("CanvasStage");
    expect(html).toContain("MenuBar title:Open a workspace drawing");
  });

  it("shows dirty save state and the length editor when conditions match", () => {
    mockWorkspace.currentDrawingName = "   ";
    mockWorkspace.currentDrawingId = "drawing-2";
    mockWorkspace.isDirty = true;
    mockShellState.interactionMode = "RECTANGLE";
    mockSelectionState.isLengthEditorOpen = true;
    mockDerivedState.selectedSegment = { id: "segment-1" };

    const html = renderToStaticMarkup(<EditorPage onNavigate={vi.fn()} />);

    expect(html).toContain("title:Untitled drawing");
    expect(html).toContain("save:Unsaved changes");
    expect(html).toContain("ToolPalette RECTANGLE readonly:no");
    expect(html).toContain("LengthEditorOpen");
  });

  it("shows the workspace drawing fallback title for authenticated users without a current drawing", () => {
    mockWorkspace.currentDrawingId = null;
    mockWorkspace.currentDrawingName = "";
    mockWorkspace.currentCustomerId = null;
    mockWorkspace.currentCustomerName = "";

    const html = renderToStaticMarkup(<EditorPage onNavigate={vi.fn()} />);

    expect(html).toContain("MenuBar title:Open a workspace drawing");
    expect(html).toContain("save:Saved");
  });

  it("renders member user name in menu bar", () => {
    mockWorkspace.session = {
      ...baseSession,
      user: {
        ...baseSession.user,
        role: "MEMBER",
        displayName: "Casey Member"
      }
    };

    const html = renderToStaticMarkup(<EditorPage onNavigate={vi.fn()} />);

    expect(html).toContain("user:Casey Member");
    expect(html).toContain("CanvasStage");
    expect(html).toContain("ToolPalette SELECT readonly:no");
  });

  it("forces quoted drawings into view-only select mode", () => {
    mockWorkspace.currentDrawingStatus = "QUOTED";
    mockShellState.interactionMode = "DRAW";

    const html = renderToStaticMarkup(<EditorPage onNavigate={vi.fn()} />);

    expect(html).toContain("status:QUOTED");
    expect(html).toContain("mode:view-only");
    expect(html).toContain("ToolPalette SELECT readonly:yes");
    expect(mockUseEditorCommandsArgs).toHaveBeenLastCalledWith(expect.objectContaining({
      interactionMode: "SELECT",
      isReadOnly: true
    }));
  });
});
