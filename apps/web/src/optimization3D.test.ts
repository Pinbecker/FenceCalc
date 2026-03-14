import { describe, expect, it } from "vitest";

import type { LayoutSegment, TwinBarOptimizationPlan } from "@fence-estimator/contracts";

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
});
