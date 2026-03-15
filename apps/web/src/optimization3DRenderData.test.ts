import { describe, expect, it } from "vitest";

import type { LayoutSegment, TwinBarOptimizationPlan } from "@fence-estimator/contracts";

import { buildOptimization3DScene } from "./optimization3D.js";
import { buildOptimization3DRenderData, DEFAULT_ORBIT } from "./optimization3DRenderData.js";

describe("buildOptimization3DRenderData", () => {
  it("builds sorted scene faces, strokes, and badges for an active reuse plan", () => {
    const segment: LayoutSegment = {
      id: "seg-render",
      start: { x: 0, y: 0 },
      end: { x: 2525, y: 0 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
    };
    const plan: TwinBarOptimizationPlan = {
      id: "plan-render",
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
          id: "plan-render-cut-1",
          step: 1,
          mode: "OPEN_STOCK_PANEL",
          demand: { segmentId: "seg-render", startOffsetMm: 0, endOffsetMm: 700, lengthMm: 700 },
          lengthMm: 700,
          effectiveLengthMm: 900,
          offcutBeforeMm: 2525,
          offcutAfterMm: 1825
        },
        {
          id: "plan-render-cut-2",
          step: 2,
          mode: "REUSE_OFFCUT",
          demand: { segmentId: "seg-render", startOffsetMm: 700, endOffsetMm: 1200, lengthMm: 500 },
          lengthMm: 500,
          effectiveLengthMm: 700,
          offcutBeforeMm: 1825,
          offcutAfterMm: 1125
        }
      ]
    };

    const scene = buildOptimization3DScene([segment], [plan], new Map([["seg-render", 1]]));
    const renderData = buildOptimization3DRenderData(scene, DEFAULT_ORBIT, 920, 320);

    expect(renderData.faces[0]?.key).toBeDefined();
    expect(renderData.faces.some((face) => face.key === "ground")).toBe(true);
    expect(renderData.strokes.some((stroke) => stroke.key.includes("grid-"))).toBe(true);
    expect(renderData.badges).toHaveLength(2);
    expect(renderData.badges[0]?.segmentLabel).toBe("S1");
    expect(renderData.faces.every((face) => Number.isFinite(face.depth))).toBe(true);
    expect(renderData.strokes.every((stroke) => Number.isFinite(stroke.depth))).toBe(true);
  });
});
