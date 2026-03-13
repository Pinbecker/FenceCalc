import type { LayoutSegment } from "@fence-estimator/contracts";
import { describe, expect, it } from "vitest";

import { defaultFenceSpec } from "./constants.js";
import { resolveGatePlacements } from "./segmentTopology.js";
import { useEditorInteractionPreviews } from "./useEditorInteractionPreviews.js";
import { renderHookServer } from "../test/renderHookServer.js";

const spec = defaultFenceSpec();
const segments: LayoutSegment[] = [
  { id: "s1", start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, spec },
  { id: "s2", start: { x: 6000, y: 0 }, end: { x: 6000, y: 3000 }, spec }
];
const placedGateVisuals = resolveGatePlacements(
  new Map(segments.map((segment) => [segment.id, segment] as const)),
  [{ id: "g1", segmentId: "s1", startOffsetMm: 2000, endOffsetMm: 3200, gateType: "SINGLE_LEAF" }]
);

describe("useEditorInteractionPreviews", () => {
  it("resolves draw snapping, guides, hover preview, and rectangle previews", () => {
    const result = renderHookServer(() =>
      useEditorInteractionPreviews({
        segments,
        interactionMode: "DRAW",
        pointerWorld: { x: 5940, y: 200 },
        drawStart: { x: 0, y: 0 },
        rectangleStart: { x: 0, y: 0 },
        drawAnchorNodes: [{ x: 6000, y: 0 }],
        disableSnap: false,
        viewScale: 0.2,
        recessAlignmentAnchors: [],
        recessWidthMm: 1500,
        recessDepthMm: 1000,
        recessSide: "LEFT",
        gateType: "SINGLE_LEAF",
        customGateWidthMm: 1200,
        placedGateVisuals,
        drawChainStart: { x: 0, y: 0 }
      })
    );

    expect(result.ghostEnd).toEqual({ x: 6000, y: 0 });
    expect(result.axisGuide?.orientation).toBe("VERTICAL");
    expect(["s1", "s2"]).toContain(result.drawHoverSnap?.segment.id);
    expect(result.ghostLengthMm).toBe(6000);
    expect(result.resolveDrawPoint({ x: 5940, y: 200 }).guide?.orientation).toBe("VERTICAL");
    expect(result.closeLoopPoint).toBeNull();
    expect(result.drawSnapLabel).toBe("Axis aligned");

    const rectangleResult = renderHookServer(() =>
      useEditorInteractionPreviews({
        segments,
        interactionMode: "RECTANGLE",
        pointerWorld: { x: 2190, y: 1410 },
        drawStart: null,
        rectangleStart: { x: 0, y: 0 },
        drawAnchorNodes: [],
        disableSnap: true,
        viewScale: 1,
        recessAlignmentAnchors: [],
        recessWidthMm: 1500,
        recessDepthMm: 1000,
        recessSide: "LEFT",
        gateType: "SINGLE_LEAF",
        customGateWidthMm: 1200,
        placedGateVisuals,
        drawChainStart: null
      })
    );

    expect(rectangleResult.rectanglePreviewEnd).toEqual({ x: 2200, y: 1400 });
  });

  it("builds recess and gate previews with snapping and visual metadata", () => {
    const recessResult = renderHookServer(() =>
      useEditorInteractionPreviews({
        segments,
        interactionMode: "RECESS",
        pointerWorld: { x: 3230, y: 10 },
        drawStart: null,
        rectangleStart: null,
        drawAnchorNodes: [],
        disableSnap: false,
        viewScale: 1,
        recessAlignmentAnchors: [
          {
            sourceSegmentId: "s2",
            point: { x: 3200, y: 0 },
            tangent: { x: 1, y: 0 }
          }
        ],
        recessWidthMm: 1600,
        recessDepthMm: 900,
        recessSide: "AUTO",
        gateType: "SINGLE_LEAF",
        customGateWidthMm: 1200,
        placedGateVisuals,
        drawChainStart: null
      })
    );

    expect(recessResult.recessPreview?.segment.id).toBe("s1");
    expect(recessResult.recessPreview?.alignmentGuide?.anchorPoint).toEqual({ x: 3200, y: 0 });
    expect(recessResult.recessPreview?.side).toBe("LEFT");
    expect(recessResult.recessPreview?.sideSource).toBe("AUTO");
    expect(recessResult.gatePreview).toBeNull();
    expect(recessResult.hoveredGateId).toBeNull();

    const gateResult = renderHookServer(() =>
      useEditorInteractionPreviews({
        segments,
        interactionMode: "GATE",
        pointerWorld: { x: 2980, y: 10 },
        drawStart: null,
        rectangleStart: null,
        drawAnchorNodes: [],
        disableSnap: false,
        viewScale: 1,
        recessAlignmentAnchors: [],
        recessWidthMm: 1600,
        recessDepthMm: 900,
        recessSide: "LEFT",
        gateType: "DOUBLE_LEAF",
        customGateWidthMm: 2400,
        placedGateVisuals,
        drawChainStart: null
      })
    );

    expect(gateResult.gatePreview?.segment.id).toBe("s1");
    expect(gateResult.gatePreview?.widthMm).toBe(3000);
    expect(gateResult.gatePreview?.snapMeta.label).toBe("Centered");
    expect(gateResult.gatePreviewVisual?.leafCount).toBe(2);
    expect(gateResult.drawHoverSnap).toBeNull();
    expect(gateResult.hoveredGateId).toBeNull();

    const hoverResult = renderHookServer(() =>
      useEditorInteractionPreviews({
        segments,
        interactionMode: "SELECT",
        pointerWorld: { x: 2600, y: 20 },
        drawStart: null,
        rectangleStart: null,
        drawAnchorNodes: [],
        disableSnap: false,
        viewScale: 1,
        recessAlignmentAnchors: [],
        recessWidthMm: 1600,
        recessDepthMm: 900,
        recessSide: "AUTO",
        gateType: "SINGLE_LEAF",
        customGateWidthMm: 1200,
        placedGateVisuals,
        drawChainStart: null
      })
    );

    expect(hoverResult.hoveredSegmentId).toBe("s1");
    expect(hoverResult.hoveredGateId).toBe("g1");
  });

  it("aligns gate previews to existing parallel gates", () => {
    const parallelSegments: LayoutSegment[] = [
      { id: "top", start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, spec },
      { id: "bottom", start: { x: 0, y: 3000 }, end: { x: 6000, y: 3000 }, spec }
    ];
    const parallelGateVisuals = resolveGatePlacements(
      new Map(parallelSegments.map((segment) => [segment.id, segment] as const)),
      [{ id: "g-top", segmentId: "top", startOffsetMm: 2000, endOffsetMm: 3200, gateType: "SINGLE_LEAF" }]
    );

    const result = renderHookServer(() =>
      useEditorInteractionPreviews({
        segments: parallelSegments,
        interactionMode: "GATE",
        pointerWorld: { x: 2620, y: 3010 },
        drawStart: null,
        rectangleStart: null,
        drawAnchorNodes: [],
        disableSnap: false,
        viewScale: 1,
        recessAlignmentAnchors: [],
        recessWidthMm: 1600,
        recessDepthMm: 900,
        recessSide: "AUTO",
        gateType: "SINGLE_LEAF",
        customGateWidthMm: 1200,
        placedGateVisuals: parallelGateVisuals,
        drawChainStart: null
      })
    );

    expect(result.gatePreview?.snapMeta.label).toBe("Aligned gate");
    expect(result.gatePreview?.alignmentGuide?.anchorPoint).toEqual({ x: 2600, y: 0 });
  });
});
