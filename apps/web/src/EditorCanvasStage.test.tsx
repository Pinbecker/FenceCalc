import type { GatePlacement, LayoutSegment, TwinBarOptimizationPlan } from "@fence-estimator/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-konva", async () => import("./test/reactKonvaMock.js"));

import { EditorCanvasStage } from "./EditorCanvasStage.js";
import { defaultFenceSpec, formatLengthMm } from "./editor/index.js";
import { buildGatePreview } from "./editor/gateMath.js";
import { buildRecessPreview } from "./editor/recess.js";
import { resolveGatePlacements } from "./editor/segmentTopology.js";
import type { OptimizationPlanVisual } from "./optimizationVisual.js";
import { getKonvaMockRegistry, resetKonvaMockRegistry } from "./test/reactKonvaMock.js";

const spec = defaultFenceSpec();

function buildSegments(): LayoutSegment[] {
  return [
    { id: "s1", start: { x: 0, y: 0 }, end: { x: 5000, y: 0 }, spec },
    { id: "s2", start: { x: 5000, y: 0 }, end: { x: 5000, y: 3000 }, spec: { ...spec, system: "ROLL_FORM" } }
  ];
}

function buildProps(overrides: Partial<Parameters<typeof EditorCanvasStage>[0]> = {}) {
  const segments = overrides.segments ?? buildSegments();
  const gates: GatePlacement[] = [
    {
      id: "g1",
      segmentId: "s1",
      startOffsetMm: 1200,
      endOffsetMm: 2200,
      gateType: "SINGLE_LEAF"
    },
    {
      id: "g2",
      segmentId: "s2",
      startOffsetMm: 800,
      endOffsetMm: 2800,
      gateType: "DOUBLE_LEAF"
    }
  ];
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment] as const));
  const placedGateVisuals = resolveGatePlacements(segmentsById, gates);
  const gatePreview = buildGatePreview(segments[0]!, 2500, 1800);
  const selectedPlan: TwinBarOptimizationPlan = {
    id: "plan-1",
    variant: "STANDARD",
    stockPanelHeightMm: 2400,
    stockPanelWidthMm: 2500,
    cuts: [
      {
        id: "cut-1",
        step: 1,
        mode: "OPEN_STOCK_PANEL",
        demand: {
          segmentId: "s1",
          startOffsetMm: 500,
          endOffsetMm: 1800,
          lengthMm: 1300
        },
        lengthMm: 1300,
        effectiveLengthMm: 1300,
        offcutBeforeMm: 0,
        offcutAfterMm: 1200
      }
    ],
    consumedMm: 1300,
    leftoverMm: 1200,
    reusableLeftoverMm: 1200,
    reusedCuts: 0,
    panelsSaved: 1
  };
  const selectedPlanVisual: OptimizationPlanVisual = {
    plan: selectedPlan,
    cuts: [
      {
        cut: selectedPlan.cuts[0]!,
        start: { x: 500, y: 0 },
        end: { x: 1800, y: 0 },
        center: { x: 1150, y: 0 }
      }
    ],
    links: [
      {
        start: { x: 1150, y: 0 },
        end: { x: 5000, y: 1500 }
      }
    ]
  };

  return {
    stageRef: { current: null },
    canvasWidth: 900,
    canvasHeight: 600,
    view: { x: 12, y: 24, scale: 0.5 },
    visibleBounds: { left: -500, top: -500, right: 6000, bottom: 4000 },
    verticalLines: [
      { coordinate: 0, major: true },
      { coordinate: 500, major: false }
    ],
    horizontalLines: [
      { coordinate: 0, major: true },
      { coordinate: 500, major: false }
    ],
    interactionMode: "SELECT" as const,
    disableSnap: true,
    isPanning: false,
    drawStart: { x: 0, y: 0 },
    rectangleStart: { x: 0, y: 0 },
    ghostEnd: { x: 2400, y: 0 },
    ghostLengthMm: 2400,
    axisGuide: {
      orientation: "VERTICAL" as const,
      coordinateMm: 2400,
      anchor: { x: 0, y: 0 }
    },
    drawHoverSnap: {
      segment: segments[0]!,
      point: { x: 2400, y: 0 },
      startOffsetMm: 2400,
      endOffsetMm: 2600,
      distanceMm: 0,
      snapMeta: { kind: "SEGMENT" as const, label: "Fence line" }
    },
    drawSnapLabel: "Axis aligned",
    rectanglePreviewEnd: { x: 1600, y: 1400 },
    recessPreview: buildRecessPreview(segments[0]!, 2500, 1500, 1000, "LEFT"),
    gatePreview,
    gatePreviewVisual: gatePreview
      ? {
          key: "preview-s1",
          startPoint: gatePreview.entryPoint,
          endPoint: gatePreview.exitPoint,
          centerPoint: {
            x: (gatePreview.entryPoint.x + gatePreview.exitPoint.x) / 2,
            y: (gatePreview.entryPoint.y + gatePreview.exitPoint.y) / 2
          },
          widthMm: gatePreview.widthMm,
          tangent: gatePreview.tangent,
          normal: gatePreview.normal,
          leafCount: 1 as const
        }
      : null,
    hoveredSegmentId: "s1",
    hoveredGateId: "g1",
    closeLoopPoint: { x: 0, y: 0 },
    visualPosts: [
      { key: "post-end", point: { x: 0, y: 0 }, kind: "END" as const, heightMm: 2400 },
      { key: "post-intermediate", point: { x: 2500, y: 0 }, kind: "INTERMEDIATE" as const, heightMm: 2400 },
      { key: "post-corner", point: { x: 5000, y: 0 }, kind: "CORNER" as const, heightMm: 2400 },
      { key: "post-junction", point: { x: 5000, y: 1500 }, kind: "JUNCTION" as const, heightMm: 2400 },
      { key: "post-inline", point: { x: 5000, y: 3000 }, kind: "INLINE_JOIN" as const, heightMm: 2400 },
      { key: "post-gate", point: { x: 1700, y: 0 }, kind: "GATE" as const, heightMm: 2400 }
    ],
    segments,
    selectedSegmentId: "s1",
    selectedGateId: "g1",
    gatesBySegmentId: new Map(
      segments.map((segment) => [
        segment.id,
        placedGateVisuals.filter((gate) => gate.segmentId === segment.id)
      ])
    ),
    segmentLengthLabelsBySegmentId: new Map([
      [
        "s1",
        [
          {
            key: "label-s1",
            segmentId: "s1",
            x: 2500,
            y: -120,
            text: formatLengthMm(5000),
            lengthMm: 5000,
            isSelected: true
          }
        ]
      ],
      ["s2", []]
    ]),
    visibleSegmentLabelKeys: new Set(["label-s1"]),
    placedGateVisuals,
    oppositeGateGuides: [
      {
        key: "guide-g1",
        start: { x: 1700, y: -800 },
        end: { x: 1700, y: 800 }
      }
    ],
    selectedPlanVisual,
    scaleBar: { lengthMm: 2000, lengthPx: 120, label: "2m" },
    onStageMouseDown: vi.fn(),
    onStageMouseMove: vi.fn(),
    onStageMouseUp: vi.fn(),
    onStageDoubleClick: vi.fn(),
    onStageWheel: vi.fn(),
    onContextMenu: vi.fn(),
    onSelectSegment: vi.fn(),
    onStartSegmentDrag: vi.fn(),
    onOpenSegmentLengthEditor: vi.fn(),
    onUpdateSegmentEndpoint: vi.fn(),
    onSelectGate: vi.fn(),
    onStartGateDrag: vi.fn(),
    ...overrides
  };
}

describe("EditorCanvasStage", () => {
  beforeEach(() => {
    resetKonvaMockRegistry();
  });

  it("renders stage layers, geometry symbols, previews, and optimization visuals", () => {
    const props = buildProps();
    const html = renderToStaticMarkup(<EditorCanvasStage {...props} />);
    const registry = getKonvaMockRegistry();

    expect(html).toContain("Canvas scale bar");
    expect(html).toContain("<strong>Mode</strong><em>SELECT</em>");
    expect(html).toContain("Click select, drag slide");
    expect(registry.Stage).toHaveLength(1);
    expect(registry.Layer.length).toBeGreaterThanOrEqual(4);
    expect(registry.RegularPolygon.length).toBeGreaterThan(0);
    expect(registry.Rect.length).toBeGreaterThan(0);
    expect(registry.Circle.length).toBeGreaterThan(0);
    expect(registry.Text.length).toBeGreaterThan(0);
    expect(registry.Arrow).toHaveLength(1);
    expect(registry.Stage[0]?.width).toBe(900);
    expect(registry.Stage[0]?.scaleX).toBe(0.5);
  });

  it("wires geometry interactions for selection, dragging, and gate operations", () => {
    const props = buildProps();
    renderToStaticMarkup(<EditorCanvasStage {...props} />);
    const registry = getKonvaMockRegistry();

    registry.Line
      .filter((entry) => typeof entry.onMouseDown === "function")
      .forEach((entry) => {
        (entry.onMouseDown as ((event: { evt: { button: number }; cancelBubble: boolean }) => void) | undefined)?.({
          evt: { button: 0 },
          cancelBubble: false
        });
      });
    registry.Line
      .filter((entry) => typeof entry.onTouchStart === "function")
      .forEach((entry) => {
        (entry.onTouchStart as ((event: { cancelBubble: boolean }) => void) | undefined)?.({
          cancelBubble: false
        });
      });
    registry.Line
      .filter((entry) => typeof entry.onClick === "function")
      .forEach((entry) => {
        (entry.onClick as ((event: { cancelBubble: boolean }) => void) | undefined)?.({
          cancelBubble: false
        });
      });
    registry.Line
      .filter((entry) => typeof entry.onTap === "function")
      .forEach((entry) => {
        (entry.onTap as ((event: { cancelBubble: boolean }) => void) | undefined)?.({
          cancelBubble: false
        });
      });
    registry.Text
      .filter((entry) => typeof entry.onClick === "function")
      .forEach((entry) => {
        (entry.onClick as ((event: { cancelBubble: boolean }) => void) | undefined)?.({
          cancelBubble: false
        });
      });
    registry.Text
      .filter((entry) => typeof entry.onTap === "function")
      .forEach((entry) => {
        (entry.onTap as ((event: { cancelBubble: boolean }) => void) | undefined)?.({
          cancelBubble: false
        });
      });
    registry.Group
      .filter((entry) => typeof entry.onClick === "function")
      .forEach((entry) => {
        (entry.onClick as ((event: { cancelBubble: boolean }) => void) | undefined)?.({
          cancelBubble: false
        });
      });
    registry.Group
      .filter((entry) => typeof entry.onTap === "function")
      .forEach((entry) => {
        (entry.onTap as ((event: { cancelBubble: boolean }) => void) | undefined)?.({
          cancelBubble: false
        });
      });
    registry.Circle
      .filter((entry) => typeof entry.onDragMove === "function")
      .forEach((entry) => {
        (entry.onDragMove as ((event: { target: { x: () => number; y: () => number } }) => void) | undefined)?.({
          target: {
            x: () => 1000,
            y: () => 250
          }
        });
      });

    expect(props.onStartSegmentDrag).toHaveBeenCalledWith("s1");
    expect(props.onSelectSegment).toHaveBeenCalledWith("s1");
    expect(props.onOpenSegmentLengthEditor).toHaveBeenCalledWith("s1");
    expect(props.onUpdateSegmentEndpoint).toHaveBeenCalled();
    expect(props.onStartGateDrag).toHaveBeenCalled();
    expect(props.onSelectGate).toHaveBeenCalled();
  });

  it("renders each preview mode without relying on a browser canvas", () => {
    renderToStaticMarkup(
      <EditorCanvasStage
        {...buildProps({
          interactionMode: "RECESS"
        })}
      />
    );
    renderToStaticMarkup(
      <EditorCanvasStage
        {...buildProps({
          interactionMode: "GATE"
        })}
      />
    );
    renderToStaticMarkup(
      <EditorCanvasStage
        {...buildProps({
          interactionMode: "DRAW"
        })}
      />
    );
    renderToStaticMarkup(
      <EditorCanvasStage
        {...buildProps({
          interactionMode: "RECTANGLE"
        })}
      />
    );

    const registry = getKonvaMockRegistry();
    const previewLabels = registry.Text
      .map((entry) => entry.text)
      .filter((value): value is string => typeof value === "string");

    expect(previewLabels.some((text) => text.includes("1.5") && text.includes("1"))).toBe(true);
    expect(previewLabels.some((text) => text.includes("Gate"))).toBe(true);
    expect(previewLabels.some((text) => text.includes("2.4"))).toBe(true);
    expect(registry.Line.length).toBeGreaterThan(10);
  });
});
