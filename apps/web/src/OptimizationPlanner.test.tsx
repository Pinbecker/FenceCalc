import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LayoutSegment, OptimizationSummary } from "@fence-estimator/contracts";

import { OptimizationPlanner } from "./OptimizationPlanner.js";

function buildSummary(): OptimizationSummary {
  return {
    strategy: "CHAINED_CUT_PLANNER",
    twinBar: {
      reuseAllowanceMm: 200,
      stockPanelWidthMm: 2525,
      fixedFullPanels: 4,
      baselinePanels: 8,
      optimizedPanels: 6,
      panelsSaved: 2,
      totalCutDemands: 4,
      stockPanelsOpened: 2,
      reusedCuts: 2,
      totalConsumedMm: 4100,
      totalLeftoverMm: 950,
      reusableLeftoverMm: 950,
      utilizationRate: 0.81,
      buckets: [
        {
          variant: "STANDARD",
          stockPanelHeightMm: 2000,
          solver: "EXACT_SEARCH",
          fullPanels: 4,
          cutDemands: 4,
          stockPanelsOpened: 2,
          reusedCuts: 2,
          baselinePanels: 8,
          optimizedPanels: 6,
          panelsSaved: 2,
          totalConsumedMm: 4100,
          totalLeftoverMm: 950,
          reusableLeftoverMm: 950,
          utilizationRate: 0.81,
          plans: [
            {
              id: "save-plan",
              variant: "STANDARD",
              stockPanelHeightMm: 2000,
              stockPanelWidthMm: 2525,
              consumedMm: 2400,
              leftoverMm: 125,
              reusableLeftoverMm: 0,
              reusedCuts: 2,
              panelsSaved: 2,
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
                },
                {
                  id: "save-plan-cut-3",
                  step: 3,
                  mode: "REUSE_OFFCUT",
                  demand: { segmentId: "seg-save-c", startOffsetMm: 0, endOffsetMm: 600, lengthMm: 600 },
                  lengthMm: 600,
                  effectiveLengthMm: 800,
                  offcutBeforeMm: 925,
                  offcutAfterMm: 125
                }
              ]
            },
            {
              id: "hidden-plan",
              variant: "STANDARD",
              stockPanelHeightMm: 2000,
              stockPanelWidthMm: 2525,
              consumedMm: 475,
              leftoverMm: 2050,
              reusableLeftoverMm: 2050,
              reusedCuts: 0,
              panelsSaved: 0,
              cuts: [
                {
                  id: "hidden-plan-cut-1",
                  step: 1,
                  mode: "OPEN_STOCK_PANEL",
                  demand: { segmentId: "seg-hidden", startOffsetMm: 0, endOffsetMm: 475, lengthMm: 475 },
                  lengthMm: 475,
                  effectiveLengthMm: 675,
                  offcutBeforeMm: 2525,
                  offcutAfterMm: 2050
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

function buildEstimateSegments(): LayoutSegment[] {
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
    },
    {
      id: "seg-save-c",
      start: { x: 5050, y: 0 },
      end: { x: 7575, y: 0 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
    },
    {
      id: "seg-hidden",
      start: { x: 7575, y: 0 },
      end: { x: 10100, y: 0 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
    }
  ];
}

describe("OptimizationPlanner", () => {
  it("renders all generated stock-panel plans", () => {
    const html = renderToStaticMarkup(
      <OptimizationPlanner
        summary={buildSummary()}
        estimateSegments={buildEstimateSegments()}
        gates={[]}
        basketballPosts={[]}
        floodlightColumns={[]}
        canInspect
        isOpen
        selectedPlanId="save-plan"
        segmentOrdinalById={
          new Map([
            ["seg-save-a", 1],
            ["seg-save-b", 2],
            ["seg-save-c", 3],
            ["seg-hidden", 99]
          ])
        }
        onOpen={() => undefined}
        onClose={() => undefined}
        onSelectPlan={() => undefined}
      />,
    );

    expect(html).toContain("3D Reuse View");
    expect(html).toContain("The 3D picker only shows opened panels that actually get reused");
    expect(html).toContain("2 panels saved in live cut layout");
    expect(html).toContain("4 cut pieces are covered by 2 opened stock panels.");
    expect(html).toContain("Open panel on segment #1");
    expect(html).toContain("Reuse offcut on segment #2");
    expect(html).toContain("Open panel on segment #99");
    expect(html).toContain("Shown in 3D view");
    expect(html).toContain("Opened panel 1");
    expect(html).toContain("2 reuses");
    expect(html).not.toContain("Opened panel 2</span>");
  });

  it("shows all plans even when none save a panel", () => {
    const summary = buildSummary();
    summary.twinBar.buckets[0]!.plans = summary.twinBar.buckets[0]!.plans.filter((plan) => plan.panelsSaved === 0);
    summary.twinBar.panelsSaved = 0;
    summary.twinBar.reusedCuts = 0;

    const html = renderToStaticMarkup(
      <OptimizationPlanner
        summary={summary}
        estimateSegments={buildEstimateSegments()}
        gates={[]}
        basketballPosts={[]}
        floodlightColumns={[]}
        canInspect
        isOpen
        selectedPlanId={null}
        segmentOrdinalById={new Map()}
        onOpen={() => undefined}
        onClose={() => undefined}
        onSelectPlan={() => undefined}
      />,
    );

    expect(html).toContain("3D Reuse View");
    expect(html).toContain("The 3D picker only shows opened panels that actually get reused");
    expect(html).toContain("No panels saved in live cut layout");
    expect(html).not.toContain("No stock-panel plans available");
  });

  it("defaults the first visible saving plan into the 3D view when none is selected", () => {
    const html = renderToStaticMarkup(
      <OptimizationPlanner
        summary={buildSummary()}
        estimateSegments={buildEstimateSegments()}
        gates={[]}
        basketballPosts={[]}
        floodlightColumns={[]}
        canInspect
        isOpen
        selectedPlanId={null}
        segmentOrdinalById={
          new Map([
            ["seg-save-a", 1],
            ["seg-save-b", 2],
            ["seg-save-c", 3]
          ])
        }
        onOpen={() => undefined}
        onClose={() => undefined}
        onSelectPlan={() => undefined}
      />
    );

    expect(html).toContain("Shown in 3D view");
  });
});
