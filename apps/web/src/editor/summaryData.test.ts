import { describe, expect, it } from "vitest";

import type { EstimateResult } from "@fence-estimator/contracts";

import { buildEditorSummaryData } from "./summaryData.js";

const estimate: EstimateResult = {
  posts: {
    terminal: 0,
    intermediate: 0,
    total: 0,
    cornerPosts: 0,
    byHeightAndType: {},
    byHeightMm: {}
  },
  corners: {
    total: 0,
    internal: 0,
    external: 0,
    unclassified: 0
  },
  materials: {
    twinBarPanels: 0,
    twinBarPanelsSuperRebound: 0,
    twinBarPanelsByStockHeightMm: {},
    twinBarPanelsByFenceHeight: {
      "2m": { standard: 4, superRebound: 1, total: 5 },
      "3m": { standard: 2, superRebound: 0, total: 2 }
    },
    roll2100: 0,
    roll900: 0,
    totalRolls: 0,
    rollsByFenceHeight: {}
  },
  optimization: {
    strategy: "CHAINED_CUT_PLANNER",
    twinBar: {
      reuseAllowanceMm: 200,
      stockPanelWidthMm: 2525,
      fixedFullPanels: 0,
      baselinePanels: 0,
      optimizedPanels: 0,
      panelsSaved: 0,
      totalCutDemands: 0,
      stockPanelsOpened: 0,
      reusedCuts: 0,
      totalConsumedMm: 0,
      totalLeftoverMm: 0,
      reusableLeftoverMm: 0,
      utilizationRate: 0,
      buckets: []
    }
  },
  segments: []
};

describe("buildEditorSummaryData", () => {
  it("aggregates post and gate summary data deterministically", () => {
    const summary = buildEditorSummaryData({
      postHeightRows: [
        { heightMm: 2000, end: 2, intermediate: 4, corner: 1, junction: 0, inlineJoin: 0, total: 7 },
        { heightMm: 3000, end: 0, intermediate: 1, corner: 0, junction: 1, inlineJoin: 2, total: 4 }
      ],
      resolvedGatePlacements: [
        { gateType: "SINGLE_LEAF", leafCount: 1, spec: { height: "2m" } },
        { gateType: "CUSTOM", leafCount: 2, spec: { height: "3m" } }
      ],
      resolvedBasketballPostPlacements: [
        {
          id: "bp-1",
          segmentId: "segment-1",
          offsetMm: 1200,
          key: "bp-1",
          point: { x: 1200, y: 0 },
          tangent: { x: 1, y: 0 },
          normal: { x: 0, y: -1 },
          facing: "LEFT",
          spec: { system: "TWIN_BAR", height: "2m" },
          placement: { id: "bp-1", segmentId: "segment-1", offsetMm: 1200, facing: "LEFT" }
        },
        {
          id: "bp-2",
          segmentId: "segment-2",
          offsetMm: 1800,
          key: "bp-2",
          point: { x: 1800, y: 0 },
          tangent: { x: 1, y: 0 },
          normal: { x: 0, y: -1 },
          facing: "RIGHT",
          spec: { system: "TWIN_BAR", height: "3m" },
          placement: { id: "bp-2", segmentId: "segment-2", offsetMm: 1800, facing: "RIGHT" }
        }
      ],
      resolvedFloodlightColumnPlacements: [
        {
          id: "fc-1",
          segmentId: "segment-3",
          offsetMm: 2400,
          key: "fc-1",
          point: { x: 2400, y: 0 },
          tangent: { x: 1, y: 0 },
          normal: { x: 0, y: -1 },
          facing: "LEFT",
          spec: { system: "TWIN_BAR", height: "2m" },
          placement: { id: "fc-1", segmentId: "segment-3", offsetMm: 2400, facing: "LEFT" }
        }
      ],
      estimate
    });

    expect(summary.postRowsByType.end).toEqual([{ heightMm: 2000, count: 2 }]);
    expect(summary.gateCounts).toEqual({ total: 2, single: 1, double: 1, custom: 1 });
    expect(summary.gateCountsByHeight).toEqual([
      { height: "2m", count: 1 },
      { height: "3m", count: 1 }
    ]);
    expect(summary.basketballPostCountsByHeight).toEqual([
      { height: "2m", count: 1 },
      { height: "3m", count: 1 }
    ]);
    expect(summary.floodlightColumnCountsByHeight).toEqual([{ height: "2m", count: 1 }]);
    expect(summary.twinBarFenceRows).toEqual([
      { height: "2m", standard: 4, superRebound: 1, total: 5 },
      { height: "3m", standard: 2, superRebound: 0, total: 2 }
    ]);
  });
});
