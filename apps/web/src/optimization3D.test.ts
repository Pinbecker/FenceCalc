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

    const scene = buildOptimization3DScene([segment], plan, new Map([["seg-4m", 4]]));

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

    const scene = buildOptimization3DScene([segment], null, new Map());
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

    const scene = buildOptimization3DScene([segment], null, new Map(), [basketballPost], [floodlightColumn]);

    expect(scene.basketballPosts).toHaveLength(1);
    expect(scene.floodlightColumns).toHaveLength(1);
    expect(scene.bounds.maxHeightMm).toBeGreaterThan(5000);
  });
});
