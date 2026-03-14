import { describe, expect, it } from "vitest";

import type { LayoutSegment, TwinBarOptimizationPlan } from "@fence-estimator/contracts";
import type { ResolvedBasketballPostPlacement, ResolvedFloodlightColumnPlacement } from "./editor/types.js";

import { buildOptimization3DScene } from "./optimization3D.js";

describe("buildOptimization3DScene", () => {
  it("places upper-lift cut overlays on the correct height band", () => {
    const segment: LayoutSegment = {
      id: "seg-4m",
      start: { x: 0, y: 0 },
      end: { x: 2525, y: 0 },
      spec: { system: "TWIN_BAR", height: "4m", twinBarVariant: "STANDARD" }
    };
    const plan: TwinBarOptimizationPlan = {
      id: "plan-top-lift",
      variant: "STANDARD",
      stockPanelHeightMm: 1000,
      stockPanelWidthMm: 2525,
      consumedMm: 900,
      leftoverMm: 125,
      reusableLeftoverMm: 0,
      reusedCuts: 0,
      panelsSaved: 1,
      cuts: [
        {
          id: "cut-top",
          step: 1,
          mode: "OPEN_STOCK_PANEL",
          demand: { segmentId: "seg-4m", startOffsetMm: 0, endOffsetMm: 900, lengthMm: 900 },
          lengthMm: 900,
          effectiveLengthMm: 1100,
          offcutBeforeMm: 2525,
          offcutAfterMm: 1625
        }
      ]
    };

    const scene = buildOptimization3DScene([segment], [plan], new Map([["seg-4m", 4]]));

    expect(scene.cutOverlays).toHaveLength(1);
    expect(scene.cutOverlays[0]?.baseHeightMm).toBe(3000);
  });

  it("creates a dedicated super-rebound lower mesh zone", () => {
    const segment: LayoutSegment = {
      id: "seg-sr",
      start: { x: 0, y: 0 },
      end: { x: 2525, y: 0 },
      spec: { system: "TWIN_BAR", height: "2.4m", twinBarVariant: "SUPER_REBOUND" }
    };

    const scene = buildOptimization3DScene([segment], [], new Map());
    const reboundSlices = scene.panelSlices.filter((slice) => slice.tone === "REBOUND");

    expect(reboundSlices.length).toBeGreaterThan(0);
    expect(reboundSlices[0]?.apertureHeightMm).toBe(66);
    expect(reboundSlices[0]?.heightMm).toBe(1200);
  });

  it("includes basketball posts and floodlight columns in the 3D scene", () => {
    const segment: LayoutSegment = {
      id: "seg-features",
      start: { x: 0, y: 0 },
      end: { x: 2525, y: 0 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
    };
    const basketballPost: ResolvedBasketballPostPlacement = {
      id: "bb-1",
      key: "bb-1",
      segmentId: "seg-features",
      offsetMm: 1200,
      point: { x: 1200, y: 0 },
      tangent: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      facing: "LEFT",
      spec: segment.spec,
      placement: { id: "bb-1", segmentId: "seg-features", offsetMm: 1200, facing: "LEFT" }
    };
    const floodlightColumn: ResolvedFloodlightColumnPlacement = {
      id: "fc-1",
      key: "fc-1",
      segmentId: "seg-features",
      offsetMm: 2200,
      point: { x: 2200, y: 0 },
      tangent: { x: 1, y: 0 },
      normal: { x: 0, y: -1 },
      facing: "RIGHT",
      spec: segment.spec,
      placement: { id: "fc-1", segmentId: "seg-features", offsetMm: 2200, facing: "RIGHT" }
    };

    const scene = buildOptimization3DScene([segment], [], new Map(), [], [basketballPost], [floodlightColumn]);

    expect(scene.basketballPosts).toHaveLength(1);
    expect(scene.floodlightColumns).toHaveLength(1);
    expect(scene.bounds.maxHeightMm).toBeGreaterThan(5000);
  });

  it("keeps overlays for each plan separate when several plans are shown together", () => {
    const segment: LayoutSegment = {
      id: "seg-multi",
      start: { x: 0, y: 0 },
      end: { x: 2525, y: 0 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
    };
    const plans: TwinBarOptimizationPlan[] = [
      {
        id: "plan-a",
        variant: "STANDARD",
        stockPanelHeightMm: 2000,
        stockPanelWidthMm: 2525,
        consumedMm: 1200,
        leftoverMm: 1325,
        reusableLeftoverMm: 1325,
        reusedCuts: 1,
        panelsSaved: 0,
        cuts: [
          {
            id: "plan-a-cut-1",
            step: 1,
            mode: "OPEN_STOCK_PANEL",
            demand: { segmentId: "seg-multi", startOffsetMm: 0, endOffsetMm: 700, lengthMm: 700 },
            lengthMm: 700,
            effectiveLengthMm: 900,
            offcutBeforeMm: 2525,
            offcutAfterMm: 1825
          },
          {
            id: "plan-a-cut-2",
            step: 2,
            mode: "REUSE_OFFCUT",
            demand: { segmentId: "seg-multi", startOffsetMm: 700, endOffsetMm: 1200, lengthMm: 500 },
            lengthMm: 500,
            effectiveLengthMm: 700,
            offcutBeforeMm: 1825,
            offcutAfterMm: 1125
          }
        ]
      },
      {
        id: "plan-b",
        variant: "STANDARD",
        stockPanelHeightMm: 2000,
        stockPanelWidthMm: 2525,
        consumedMm: 900,
        leftoverMm: 1625,
        reusableLeftoverMm: 1625,
        reusedCuts: 0,
        panelsSaved: 0,
        cuts: [
          {
            id: "plan-b-cut-1",
            step: 1,
            mode: "OPEN_STOCK_PANEL",
            demand: { segmentId: "seg-multi", startOffsetMm: 200, endOffsetMm: 1100, lengthMm: 900 },
            lengthMm: 900,
            effectiveLengthMm: 1100,
            offcutBeforeMm: 2525,
            offcutAfterMm: 1425
          }
        ]
      }
    ];

    const scene = buildOptimization3DScene([segment], plans, new Map([["seg-multi", 1]]));

    expect(scene.cutOverlays).toHaveLength(3);
    expect(scene.cutOverlays.map((overlay) => overlay.planId)).toEqual(["plan-a", "plan-a", "plan-b"]);
    expect(scene.cutOverlays.map((overlay) => overlay.planIndex)).toEqual([0, 0, 1]);
    expect(scene.reuseLinks).toHaveLength(1);
    expect(scene.reuseLinks[0]?.planId).toBe("plan-a");
  });
});
