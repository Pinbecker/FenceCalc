import { describe, expect, it } from "vitest";

import type { LayoutSegment, TwinBarOptimizationPlan } from "@fence-estimator/contracts";

import { buildOptimizationPlanVisual } from "./optimizationVisual.js";

const segmentA: LayoutSegment = {
  id: "seg-a",
  start: { x: 0, y: 0 },
  end: { x: 2525, y: 0 },
  spec: { system: "TWIN_BAR", height: "2m" }
};

const segmentB: LayoutSegment = {
  id: "seg-b",
  start: { x: 0, y: 1000 },
  end: { x: 2525, y: 1000 },
  spec: { system: "TWIN_BAR", height: "2m" }
};

const plan: TwinBarOptimizationPlan = {
  id: "plan-1",
  variant: "STANDARD",
  stockPanelHeightMm: 2000,
  stockPanelWidthMm: 2525,
  consumedMm: 2400,
  leftoverMm: 125,
  reusableLeftoverMm: 0,
  reusedCuts: 1,
  panelsSaved: 1,
  cuts: [
    {
      id: "cut-1",
      step: 1,
      mode: "OPEN_STOCK_PANEL",
      demand: { segmentId: "seg-a", startOffsetMm: 0, endOffsetMm: 700, lengthMm: 700 },
      lengthMm: 700,
      effectiveLengthMm: 900,
      offcutBeforeMm: 2525,
      offcutAfterMm: 1825
    },
    {
      id: "cut-2",
      step: 2,
      mode: "REUSE_OFFCUT",
      demand: { segmentId: "seg-b", startOffsetMm: 0, endOffsetMm: 700, lengthMm: 700 },
      lengthMm: 700,
      effectiveLengthMm: 900,
      offcutBeforeMm: 1825,
      offcutAfterMm: 925
    }
  ]
};

function interpolateAlongSegment(segment: LayoutSegment, offsetMm: number) {
  const length = segment.end.x - segment.start.x;
  const ratio = offsetMm / length;
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
    y: segment.start.y + (segment.end.y - segment.start.y) * ratio
  };
}

describe("buildOptimizationPlanVisual", () => {
  it("returns cut geometries and links for a selected plan", () => {
    const visual = buildOptimizationPlanVisual(
      plan,
      new Map([
        ["seg-a", segmentA],
        ["seg-b", segmentB]
      ]),
      interpolateAlongSegment,
    );

    expect(visual?.cuts).toHaveLength(2);
    expect(visual?.links).toHaveLength(1);
    expect(visual?.cuts[0]?.center.y).toBe(0);
    expect(visual?.cuts[1]?.center.y).toBe(1000);
  });

  it("returns null when no selected plan is available", () => {
    expect(buildOptimizationPlanVisual(null, new Map(), interpolateAlongSegment)).toBeNull();
  });
});
