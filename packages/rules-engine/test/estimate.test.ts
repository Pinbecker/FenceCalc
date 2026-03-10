import { describe, expect, it } from "vitest";

import type { LayoutModel } from "@fence-estimator/contracts";

import { estimateDrawingLayout, estimateLayout } from "../src/index.js";

describe("estimateLayout", () => {
  it("counts panels and posts on a straight twin bar run", () => {
    const layout: LayoutModel = {
      segments: [
        {
          id: "s1",
          start: { x: 0, y: 0 },
          end: { x: 10000, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m" }
        }
      ]
    };

    const result = estimateLayout(layout);
    expect(result.materials.twinBarPanels).toBe(4);
    expect(result.posts.terminal).toBe(2);
    expect(result.posts.intermediate).toBe(3);
    expect(result.posts.total).toBe(5);
    expect(result.corners.total).toBe(0);
  });

  it("marks open-path corner as unclassified", () => {
    const layout: LayoutModel = {
      segments: [
        {
          id: "s1",
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m" }
        },
        {
          id: "s2",
          start: { x: 5000, y: 0 },
          end: { x: 5000, y: 5000 },
          spec: { system: "TWIN_BAR", height: "2m" }
        }
      ]
    };

    const result = estimateLayout(layout);
    expect(result.corners.total).toBe(1);
    expect(result.corners.unclassified).toBe(1);
  });

  it("classifies rectangle corners as external", () => {
    const layout: LayoutModel = {
      segments: [
        {
          id: "s1",
          start: { x: 0, y: 0 },
          end: { x: 10000, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m" }
        },
        {
          id: "s2",
          start: { x: 10000, y: 0 },
          end: { x: 10000, y: 5000 },
          spec: { system: "TWIN_BAR", height: "2m" }
        },
        {
          id: "s3",
          start: { x: 10000, y: 5000 },
          end: { x: 0, y: 5000 },
          spec: { system: "TWIN_BAR", height: "2m" }
        },
        {
          id: "s4",
          start: { x: 0, y: 5000 },
          end: { x: 0, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m" }
        }
      ]
    };

    const result = estimateLayout(layout);
    expect(result.corners.total).toBe(4);
    expect(result.corners.external).toBe(4);
    expect(result.corners.internal).toBe(0);
    expect(result.corners.unclassified).toBe(0);
  });

  it("counts roll-form stacked layers for 3m", () => {
    const layout: LayoutModel = {
      segments: [
        {
          id: "s1",
          start: { x: 0, y: 0 },
          end: { x: 30000, y: 0 },
          spec: { system: "ROLL_FORM", height: "3m" }
        }
      ]
    };

    const result = estimateLayout(layout);
    expect(result.materials.roll2100).toBe(2);
    expect(result.materials.roll900).toBe(2);
    expect(result.materials.totalRolls).toBe(4);
  });

  it("uses highest incident height for node post height", () => {
    const layout: LayoutModel = {
      segments: [
        {
          id: "a",
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m" }
        },
        {
          id: "b",
          start: { x: 5000, y: 0 },
          end: { x: 10000, y: 0 },
          spec: { system: "ROLL_FORM", height: "3m" }
        }
      ]
    };

    const result = estimateLayout(layout);
    expect(result.posts.byHeightMm["3000"]).toBe(3);
    expect(result.posts.byHeightMm["2000"]).toBe(2);
  });

  it("counts stacked twin bar heights using stock panel combinations", () => {
    const layout: LayoutModel = {
      segments: [
        {
          id: "stacked",
          start: { x: 0, y: 0 },
          end: { x: 10000, y: 0 },
          spec: { system: "TWIN_BAR", height: "4m", twinBarVariant: "STANDARD" }
        }
      ]
    };

    const result = estimateLayout(layout);
    expect(result.materials.twinBarPanels).toBe(8);
    expect(result.materials.twinBarPanelsByStockHeightMm["3000"]).toBe(4);
    expect(result.materials.twinBarPanelsByStockHeightMm["1000"]).toBe(4);
    expect(result.posts.byHeightMm["4000"]).toBe(5);
  });

  it("builds an optimization summary with saved panels when offcuts can be reused", () => {
    const layout: LayoutModel = {
      segments: [
        {
          id: "reuse-a",
          start: { x: 0, y: 0 },
          end: { x: 3000, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
        },
        {
          id: "reuse-b",
          start: { x: 4000, y: 0 },
          end: { x: 4500, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
        }
      ]
    };

    const result = estimateLayout(layout);
    expect(result.optimization.twinBar.panelsSaved).toBeGreaterThan(0);
    expect(result.optimization.twinBar.buckets.length).toBeGreaterThan(0);
  });

  it("uses a 200mm allowance and builds a chained cut plan from one stock panel", () => {
    const layout: LayoutModel = {
      segments: [
        {
          id: "cut-a",
          start: { x: 0, y: 0 },
          end: { x: 700, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
        },
        {
          id: "cut-b",
          start: { x: 1000, y: 0 },
          end: { x: 1700, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
        },
        {
          id: "cut-c",
          start: { x: 2000, y: 0 },
          end: { x: 2600, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
        }
      ]
    };

    const result = estimateLayout(layout);
    expect(result.optimization.twinBar.reuseAllowanceMm).toBe(200);
    expect(result.optimization.twinBar.totalCutDemands).toBe(3);
    expect(result.optimization.twinBar.stockPanelsOpened).toBe(1);
    expect(result.optimization.twinBar.panelsSaved).toBe(2);

    const bucket = result.optimization.twinBar.buckets[0];
    const plan = bucket?.plans[0];

    expect(bucket?.reusedCuts).toBe(2);
    expect(plan?.cuts).toHaveLength(3);
    expect(plan?.cuts[0]?.mode).toBe("OPEN_STOCK_PANEL");
    expect(plan?.cuts[0]?.lengthMm).toBe(700);
    expect(plan?.cuts[0]?.offcutAfterMm).toBe(1825);
    expect(plan?.cuts[1]?.mode).toBe("REUSE_OFFCUT");
    expect(plan?.cuts[1]?.effectiveLengthMm).toBe(900);
    expect(plan?.cuts[1]?.offcutAfterMm).toBe(925);
    expect(plan?.cuts[2]?.mode).toBe("REUSE_OFFCUT");
    expect(plan?.cuts[2]?.effectiveLengthMm).toBe(800);
    expect(plan?.leftoverMm).toBe(125);
  });

  it("shares stock-height offcuts across different twin bar fence heights", () => {
    const layout: LayoutModel = {
      segments: [
        {
          id: "five",
          start: { x: 0, y: 0 },
          end: { x: 3000, y: 0 },
          spec: { system: "TWIN_BAR", height: "5m", twinBarVariant: "STANDARD" }
        },
        {
          id: "two",
          start: { x: 4000, y: 0 },
          end: { x: 5800, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
        },
        {
          id: "three",
          start: { x: 7000, y: 0 },
          end: { x: 8800, y: 0 },
          spec: { system: "TWIN_BAR", height: "3m", twinBarVariant: "STANDARD" }
        }
      ]
    };

    const result = estimateLayout(layout);
    expect(result.optimization.strategy).toBe("CHAINED_CUT_PLANNER");
    expect(result.optimization.twinBar.panelsSaved).toBe(2);
    expect(result.optimization.twinBar.buckets).toHaveLength(2);

    const bucket2000 = result.optimization.twinBar.buckets.find((bucket) => bucket.stockPanelHeightMm === 2000);
    const bucket3000 = result.optimization.twinBar.buckets.find((bucket) => bucket.stockPanelHeightMm === 3000);

    expect(bucket2000?.plans[0]?.reusedCuts).toBe(1);
    expect(bucket3000?.plans[0]?.reusedCuts).toBe(1);
    expect(bucket2000?.plans[0]?.cuts.map((cut) => cut.demand.segmentId).sort()).toEqual(["five", "two"]);
    expect(bucket3000?.plans[0]?.cuts.map((cut) => cut.demand.segmentId).sort()).toEqual(["five", "three"]);
  });

  it("removes gate spans before calculating materials", () => {
    const layout: LayoutModel = {
      segments: [
        {
          id: "gate-run",
          start: { x: 0, y: 0 },
          end: { x: 10000, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m" }
        }
      ],
      gates: [
        {
          id: "gate-1",
          segmentId: "gate-run",
          startOffsetMm: 4000,
          endOffsetMm: 5200,
          gateType: "SINGLE_LEAF"
        }
      ]
    };

    const result = estimateDrawingLayout(layout);
    expect(result.materials.twinBarPanels).toBe(4);
    expect(result.posts.total).toBe(6);
  });
});
