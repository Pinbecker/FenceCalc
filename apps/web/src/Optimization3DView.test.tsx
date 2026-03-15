import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { LayoutSegment, TwinBarOptimizationPlan } from "@fence-estimator/contracts";

import { Optimization3DView } from "./Optimization3DView.js";

function buildSegments(): LayoutSegment[] {
  return [
    {
      id: "seg-save-a",
      start: { x: 0, y: 0 },
      end: { x: 2525, y: 0 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
    },
    {
      id: "seg-save-b",
      start: { x: 2525, y: 0 },
      end: { x: 5050, y: 0 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
    }
  ];
}

function buildPlan(): TwinBarOptimizationPlan {
  return {
    id: "save-plan",
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
        id: "save-plan-cut-1",
        step: 1,
        mode: "OPEN_STOCK_PANEL",
        demand: { segmentId: "seg-save-a", startOffsetMm: 0, endOffsetMm: 700, lengthMm: 700 },
        lengthMm: 700,
        effectiveLengthMm: 900,
        offcutBeforeMm: 2525,
        offcutAfterMm: 1825
      },
      {
        id: "save-plan-cut-2",
        step: 2,
        mode: "REUSE_OFFCUT",
        demand: { segmentId: "seg-save-b", startOffsetMm: 0, endOffsetMm: 700, lengthMm: 700 },
        lengthMm: 700,
        effectiveLengthMm: 900,
        offcutBeforeMm: 1825,
        offcutAfterMm: 925
      }
    ]
  };
}

describe("Optimization3DView", () => {
  it("renders the plan selector, legend, and active cut steps", () => {
    const plan = buildPlan();
    const html = renderToStaticMarkup(
      <Optimization3DView
        estimateSegments={buildSegments()}
        activePlan={plan}
        activePlanIndex={0}
        planCount={1}
        plans={[plan]}
        segmentOrdinalById={
          new Map([
            ["seg-save-a", 1],
            ["seg-save-b", 2]
          ])
        }
        gates={[]}
        basketballPosts={[]}
        floodlightColumns={[]}
        onSelectPlan={vi.fn()}
      />
    );

    expect(html).toContain("3D Reuse View");
    expect(html).toContain("Opened panel view");
    expect(html).toContain("Opened panel 1");
    expect(html).toContain("1 reuse");
    expect(html).toContain("Fresh stock cut");
    expect(html).toContain("Reused offcut");
    expect(html).toContain("Open panel on segment #1");
    expect(html).toContain("Reuse offcut on segment #2");
  });
});
