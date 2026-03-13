import type { GatePlacement, LayoutModel, LayoutSegment, PointMm } from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";
import { describe, expect, it, vi } from "vitest";

import { formatMetersInputFromMm } from "../formatters.js";
import { defaultFenceSpec } from "./constants.js";
import { buildResolvedGateMap } from "./editorDerivedStateUtils.js";
import { buildGatePreview } from "./gateMath.js";
import { buildRecessPreview } from "./recess.js";
import { buildSegmentConnectivity, resolveGatePlacements } from "./segmentTopology.js";
import { useEditorCommands } from "./useEditorCommands.js";
import type {
  BasketballPostInsertionPreview,
  GateInsertionPreview,
  InteractionMode,
  RecessInsertionPreview
} from "./types.js";
import { renderHookServer } from "../test/renderHookServer.js";

interface CommandHarnessState {
  activeGateDrag: { gateId: string; lastPointer: PointMm } | null;
  activeSegmentDrag: { segmentId: string; lastPointer: PointMm } | null;
  customGateWidthInputM: string;
  customGateWidthMm: number;
  basketballPostPreview: BasketballPostInsertionPreview | null;
  drawStart: PointMm | null;
  drawChainStart: PointMm | null;
  gatePreview: GateInsertionPreview | null;
  interactionMode: InteractionMode;
  isLengthEditorOpen: boolean;
  isPanning: boolean;
  isSpacePressed: boolean;
  layout: LayoutModel;
  pointerWorld: PointMm | null;
  recessDepthInputM: string;
  recessDepthMm: number;
  recessPreview: RecessInsertionPreview | null;
  recessWidthInputM: string;
  recessWidthMm: number;
  rectangleStart: PointMm | null;
  selectedGateId: string | null;
  selectedLengthInputM: string;
  selectedPlanId: string | null;
  selectedSegmentId: string | null;
}

function buildBaseSegments(): LayoutSegment[] {
  const spec = defaultFenceSpec();
  return [
    { id: "s1", start: { x: 0, y: 0 }, end: { x: 5000, y: 0 }, spec },
    { id: "s2", start: { x: 5000, y: 0 }, end: { x: 5000, y: 2500 }, spec }
  ];
}

function buildBaseGates(): GatePlacement[] {
  return [
    {
      id: "g1",
      segmentId: "s1",
      startOffsetMm: 1200,
      endOffsetMm: 2200,
      gateType: "SINGLE_LEAF"
    }
  ];
}

function createStateSetter<TState, TKey extends keyof TState>(state: TState, key: TKey) {
  return (value: TState[TKey] | ((previous: TState[TKey]) => TState[TKey])) => {
    state[key] = typeof value === "function" ? (value as (previous: TState[TKey]) => TState[TKey])(state[key]) : value;
  };
}

function createCommandHarness(overrides: Partial<CommandHarnessState> = {}) {
  const baseSegments = buildBaseSegments();
  const state: CommandHarnessState = {
    activeGateDrag: null,
    activeSegmentDrag: null,
    basketballPostPreview: null,
    customGateWidthInputM: formatMetersInputFromMm(1200),
    customGateWidthMm: 1200,
    drawStart: null,
    drawChainStart: null,
    gatePreview: buildGatePreview(baseSegments[0]!, 1700, 1000),
    interactionMode: "SELECT",
    isLengthEditorOpen: false,
    isPanning: false,
    isSpacePressed: false,
    layout: {
      segments: baseSegments,
      gates: buildBaseGates(),
      basketballPosts: []
    },
    pointerWorld: null,
    recessDepthInputM: formatMetersInputFromMm(1000),
    recessDepthMm: 1000,
    recessPreview: null,
    recessWidthInputM: formatMetersInputFromMm(1500),
    recessWidthMm: 1500,
    rectangleStart: null,
    selectedGateId: null,
    selectedLengthInputM: "",
    selectedPlanId: null,
    selectedSegmentId: null,
    ...overrides
  };
  const stage = {
    pointer: { x: 0, y: 0 },
    getPointerPosition: vi.fn(() => stage.pointer)
  };
  const beginPan = vi.fn();
  const updatePan = vi.fn(() => false);
  const endPan = vi.fn();
  const zoomAtPointer = vi.fn();
  const toWorld = vi.fn((point: { x: number; y: number }) => ({ x: point.x, y: point.y }));
  const resolveDrawPoint = vi.fn((point: PointMm) => ({
    point: { x: Math.round(point.x / 100) * 100, y: Math.round(point.y / 100) * 100 },
    guide: null,
    snapMeta: null
  }));
  const resolveBasketballPostPreview = vi.fn((point: PointMm) => ({
    segment: state.layout.segments[0]!,
    segmentLengthMm: distanceMm(state.layout.segments[0]!.start, state.layout.segments[0]!.end),
    offsetMm: point.x,
    point: { x: point.x, y: state.layout.segments[0]!.start.y },
    tangent: { x: 1, y: 0 },
    normal: { x: 0, y: -1 },
    facing: "LEFT" as const,
    targetPoint: { x: point.x, y: state.layout.segments[0]!.start.y },
    snapMeta: { kind: "FREE" as const, label: "Free placement" }
  }));
  let commands: ReturnType<typeof useEditorCommands>;

  const applyLayout = (updater: (previous: LayoutModel) => LayoutModel) => {
    state.layout = updater(state.layout);
  };
  const applySegments = (updater: (previous: LayoutSegment[]) => LayoutSegment[]) => {
    state.layout = {
      ...state.layout,
      segments: updater(state.layout.segments)
    };
  };
  const applyGatePlacements = (updater: (previous: GatePlacement[]) => GatePlacement[]) => {
    state.layout = {
      ...state.layout,
      gates: updater(state.layout.gates ?? [])
    };
  };
  const applyBasketballPostPlacements = (
    updater: (previous: NonNullable<LayoutModel["basketballPosts"]>) => NonNullable<LayoutModel["basketballPosts"]>
  ) => {
    state.layout = {
      ...state.layout,
      basketballPosts: updater(state.layout.basketballPosts ?? [])
    };
  };

  function rerender() {
    const segmentsById = new Map(state.layout.segments.map((segment) => [segment.id, segment] as const));
    const resolvedGatePlacements = resolveGatePlacements(segmentsById, state.layout.gates ?? []);
    const resolvedGateById = buildResolvedGateMap(resolvedGatePlacements);
    const connectivity = buildSegmentConnectivity(state.layout.segments);

    commands = renderHookServer(() =>
      useEditorCommands({
        stageRef: { current: stage as never },
        applyLayout,
        applySegments,
        applyGatePlacements,
        applyBasketballPostPlacements,
        segmentsById,
        resolvedGateById,
        connectivity,
        activeSpec: defaultFenceSpec(),
        interactionMode: state.interactionMode,
        gateType: "SINGLE_LEAF",
        drawStart: state.drawStart,
        drawChainStart: state.drawChainStart,
        rectangleStart: state.rectangleStart,
        selectedSegmentId: state.selectedSegmentId,
        selectedGateId: state.selectedGateId,
        selectedLengthInputM: state.selectedLengthInputM,
        isSpacePressed: state.isSpacePressed,
        isPanning: state.isPanning,
        activeSegmentDrag: state.activeSegmentDrag,
        activeGateDrag: state.activeGateDrag,
        recessWidthMm: state.recessWidthMm,
        recessDepthMm: state.recessDepthMm,
        customGateWidthMm: state.customGateWidthMm,
        recessPreview: state.recessPreview,
        gatePreview: state.gatePreview,
        basketballPostPreview: state.basketballPostPreview,
        resolveBasketballPostPreview,
        resolveDrawPoint,
        toWorld,
        beginPan,
        updatePan,
        endPan,
        zoomAtPointer,
        setPointerWorld: createStateSetter(state, "pointerWorld"),
        setDrawStart: createStateSetter(state, "drawStart"),
        setDrawChainStart: createStateSetter(state, "drawChainStart"),
        setRectangleStart: createStateSetter(state, "rectangleStart"),
        setSelectedSegmentId: createStateSetter(state, "selectedSegmentId"),
        setSelectedGateId: createStateSetter(state, "selectedGateId"),
        setSelectedPlanId: createStateSetter(state, "selectedPlanId"),
        setSelectedLengthInputM: createStateSetter(state, "selectedLengthInputM"),
        setIsLengthEditorOpen: createStateSetter(state, "isLengthEditorOpen"),
        setActiveSegmentDrag: createStateSetter(state, "activeSegmentDrag"),
        setActiveGateDrag: createStateSetter(state, "activeGateDrag"),
        setRecessWidthMm: createStateSetter(state, "recessWidthMm"),
        setRecessDepthMm: createStateSetter(state, "recessDepthMm"),
        setRecessWidthInputM: createStateSetter(state, "recessWidthInputM"),
        setRecessDepthInputM: createStateSetter(state, "recessDepthInputM"),
        setCustomGateWidthMm: createStateSetter(state, "customGateWidthMm"),
        setCustomGateWidthInputM: createStateSetter(state, "customGateWidthInputM")
      })
    );
  }

  rerender();

  return {
    beginPan,
    endPan,
    get commands() {
      return commands;
    },
    rerender,
    stage,
    state,
    updatePan,
    zoomAtPointer
  };
}

function createMouseEvent(button: number, target: unknown) {
  return {
    evt: {
      button,
      deltaY: 120,
      preventDefault: vi.fn()
    },
    cancelBubble: false,
    target
  } as never;
}

function createTouchEvent(target: unknown) {
  return {
    evt: {
      preventDefault: vi.fn()
    },
    cancelBubble: false,
    target
  } as never;
}

describe("useEditorCommands", () => {
  it("updates editor inputs, opens the length editor, and applies resized lengths", () => {
    const harness = createCommandHarness({
      interactionMode: "SELECT",
      selectedSegmentId: "s1",
      selectedLengthInputM: "5.00"
    });

    harness.commands.onRecessWidthInputChange("2.50");
    harness.commands.onRecessDepthInputChange("bad");
    harness.commands.onCustomGateWidthInputChange("2.40");

    expect(harness.state.recessWidthMm).toBe(2500);
    expect(harness.state.recessDepthMm).toBe(1000);
    expect(harness.state.customGateWidthMm).toBe(2400);

    harness.commands.normalizeRecessInputs();
    harness.commands.normalizeGateInputs();
    harness.commands.openLengthEditor("s1");

    expect(harness.state.isLengthEditorOpen).toBe(true);
    expect(harness.state.selectedSegmentId).toBe("s1");
    expect(harness.state.selectedLengthInputM).toBe("5.00");

    harness.state.selectedLengthInputM = "4.20";
    harness.rerender();
    harness.commands.applySelectedLengthEdit();

    expect(harness.state.isLengthEditorOpen).toBe(false);
    expect(Math.round(distanceMm(harness.state.layout.segments[0]!.start, harness.state.layout.segments[0]!.end))).toBe(4200);
  });

  it("handles draw, rectangle, gate, recess, selection, and pan mouse down flows", () => {
    const uuidSpy = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222")
      .mockReturnValueOnce("33333333-3333-4333-8333-333333333333")
      .mockReturnValueOnce("44444444-4444-4444-8444-444444444444")
      .mockReturnValueOnce("55555555-5555-4555-8555-555555555555")
      .mockReturnValueOnce("66666666-6666-4666-8666-666666666666")
      .mockReturnValueOnce("77777777-7777-4777-8777-777777777777");

    const harness = createCommandHarness({
      interactionMode: "DRAW",
      layout: { segments: [], gates: [], basketballPosts: [] },
      gatePreview: null
    });

    harness.stage.pointer = { x: 100, y: 100 };
    harness.commands.onStageMouseDown(createMouseEvent(0, harness.stage));
    expect(harness.state.drawStart).toEqual({ x: 100, y: 100 });
    expect(harness.state.drawChainStart).toEqual({ x: 100, y: 100 });

    harness.stage.pointer = { x: 2100, y: 100 };
    harness.rerender();
    harness.commands.onStageMouseDown(createMouseEvent(0, harness.stage));
    expect(harness.state.layout.segments).toHaveLength(1);
    expect(harness.state.layout.segments[0]?.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(harness.state.drawChainStart).toEqual({ x: 100, y: 100 });

    harness.state.interactionMode = "RECTANGLE";
    harness.state.drawStart = null;
    harness.stage.pointer = { x: 0, y: 0 };
    harness.rerender();
    harness.commands.onStageMouseDown(createMouseEvent(0, harness.stage));
    harness.stage.pointer = { x: 1600, y: 1400 };
    harness.rerender();
    harness.commands.onStageMouseDown(createMouseEvent(0, harness.stage));
    expect(harness.state.layout.segments).toHaveLength(5);

    const gateSegments = buildBaseSegments();
    harness.state.interactionMode = "GATE";
    harness.state.layout = {
      segments: gateSegments,
      gates: [],
      basketballPosts: []
    };
    harness.state.gatePreview = buildGatePreview(gateSegments[0]!, 1800, 1000);
    harness.rerender();
    harness.commands.onStageMouseDown(createMouseEvent(0, harness.stage));
    expect(harness.state.layout.gates?.[0]?.id).toBe("66666666-6666-4666-8666-666666666666");
    expect(harness.state.drawChainStart).toBeNull();

    harness.state.interactionMode = "BASKETBALL_POST";
    harness.state.basketballPostPreview = {
      segment: gateSegments[0]!,
      segmentLengthMm: 5000,
      offsetMm: 2000,
      point: { x: 2000, y: 0 },
      tangent: { x: 1, y: 0 },
      normal: { x: 0, y: -1 },
      facing: "LEFT",
      targetPoint: { x: 2000, y: 0 },
      snapMeta: { kind: "FREE", label: "Free placement" }
    };
    harness.rerender();
    harness.commands.onStageMouseDown(createMouseEvent(0, harness.stage));
    expect(harness.state.layout.basketballPosts?.[0]?.id).toBe("77777777-7777-4777-8777-777777777777");

    harness.state.interactionMode = "RECESS";
    harness.state.recessPreview = buildRecessPreview(harness.state.layout.segments[0]!, 2500, 1500, 1000, "LEFT");
    harness.rerender();
    harness.commands.onStageMouseDown(createMouseEvent(0, harness.stage));
    expect(harness.state.layout.segments.length).toBeGreaterThan(2);

    harness.state.interactionMode = "SELECT";
    harness.state.selectedSegmentId = "s1";
    harness.state.selectedGateId = "g1";
    harness.rerender();
    harness.commands.onStageMouseDown(createMouseEvent(0, harness.stage));
    expect(harness.state.selectedSegmentId).toBeNull();
    expect(harness.state.selectedGateId).toBeNull();

    harness.state.isSpacePressed = true;
    harness.rerender();
    harness.commands.onStageMouseDown(createMouseEvent(0, harness.stage));
    expect(harness.beginPan).toHaveBeenCalled();

    uuidSpy.mockRestore();
  });

  it("handles dragging, pointer updates, wheel, deletion, clearing, and reset flows", () => {
    const harness = createCommandHarness({
      interactionMode: "SELECT",
      selectedSegmentId: "s1",
      selectedGateId: "g1"
    });

    harness.commands.startSelectedSegmentDrag("s1");
    harness.commands.startSelectedGateDrag("g1");
    expect(harness.state.activeSegmentDrag).toBeNull();
    expect(harness.state.activeGateDrag?.gateId).toBe("g1");

    harness.stage.pointer = { x: 1700, y: 0 };
    harness.rerender();
    harness.commands.onStageMouseMove();
    expect(harness.state.layout.gates?.[0]?.startOffsetMm).toBeGreaterThan(1200);
    expect(harness.state.pointerWorld).toEqual({ x: 1700, y: 0 });

    harness.state.activeGateDrag = null;
    harness.state.activeSegmentDrag = {
      segmentId: "s1",
      lastPointer: { x: 0, y: 0 }
    };
    harness.stage.pointer = { x: 0, y: 200 };
    harness.rerender();
    harness.commands.onStageMouseMove();
    expect(harness.state.layout.segments[0]?.start.y).toBeGreaterThan(0);

    harness.state.activeSegmentDrag = null;
    harness.state.isPanning = true;
    harness.updatePan.mockReturnValueOnce(true);
    harness.stage.pointer = { x: 10, y: 10 };
    harness.rerender();
    harness.commands.onStageMouseMove();
    expect(harness.updatePan).toHaveBeenCalled();

    harness.state.isPanning = false;
    harness.stage.pointer = { x: 25, y: 25 };
    harness.rerender();
    harness.commands.onStageMouseMove();
    expect(harness.state.pointerWorld).toEqual({ x: 25, y: 25 });

    harness.commands.onStageMouseUp();
    expect(harness.state.activeSegmentDrag).toBeNull();
    expect(harness.state.activeGateDrag).toBeNull();
    expect(harness.endPan).toHaveBeenCalled();

    const wheelEvent = createMouseEvent(0, harness.stage);
    harness.commands.onStageWheel(wheelEvent);
    expect((wheelEvent as { evt: { preventDefault: ReturnType<typeof vi.fn> } }).evt.preventDefault).toHaveBeenCalled();
    expect(harness.zoomAtPointer).toHaveBeenCalledWith(harness.stage.pointer, 120);

    harness.state.drawStart = { x: 0, y: 0 };
    harness.state.rectangleStart = { x: 100, y: 100 };
    harness.rerender();
    harness.commands.onContextMenu(createMouseEvent(0, harness.stage));
    expect(harness.state.drawStart).toBeNull();
    expect(harness.state.rectangleStart).toBeNull();
    expect(harness.state.drawChainStart).toBeNull();

    expect(harness.commands.deleteSelectedGate()).toBe(true);
    harness.state.selectedSegmentId = "s1";
    harness.rerender();
    expect(harness.commands.deleteSelectedSegment()).toBe(true);

    harness.state.layout = {
      segments: buildBaseSegments(),
      gates: buildBaseGates()
    };
    harness.state.selectedGateId = "g1";
    harness.rerender();
    harness.commands.handleDeleteSelection();
    expect(harness.state.layout.gates).toHaveLength(0);

    harness.state.layout = {
      segments: buildBaseSegments(),
      gates: buildBaseGates()
    };
    harness.rerender();
    harness.commands.handleClearLayout();
    expect(harness.state.layout.segments).toHaveLength(0);
    expect(harness.state.layout.gates).toHaveLength(0);

    harness.state.layout = {
      segments: buildBaseSegments(),
      gates: buildBaseGates()
    };
    harness.rerender();
    harness.commands.resetWorkspaceCanvas();
    expect(harness.state.layout.segments).toHaveLength(0);
    expect(harness.state.selectedPlanId).toBeNull();
    expect(harness.state.isLengthEditorOpen).toBe(false);

    harness.state.layout = {
      segments: buildBaseSegments(),
      gates: []
    };
    harness.rerender();
    harness.commands.updateSegment("s1", (current) => ({
      ...current,
      end: { x: 5200, y: 0 }
    }));
    expect(harness.state.layout.segments[0]?.end.x).toBe(5200);
  });

  it("starts panning from a background touch in select mode", () => {
    const harness = createCommandHarness({
      interactionMode: "SELECT"
    });

    harness.stage.pointer = { x: 140, y: 260 };
    harness.commands.onStageMouseDown(createTouchEvent(harness.stage));

    expect(harness.beginPan).toHaveBeenCalledWith({ x: 140, y: 260 });
  });
});
