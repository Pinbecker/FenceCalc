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
  segments: [],
  featureQuantities: [
    {
      key: "goal-1::goal-unit",
      kind: "GOAL_UNIT",
      component: "GOAL_UNIT",
      description: "Goal unit 3m x 3m",
      quantity: 1,
      unit: "item"
    },
    {
      key: "kick-1::boards",
      kind: "KICKBOARD",
      component: "BOARDS",
      description: "200 x 50 square kickboards",
      quantity: 2,
      unit: "board"
    },
    {
      key: "divider-1::netting",
      kind: "PITCH_DIVIDER",
      component: "NETTING_RUN",
      description: "Pitch-divider netting run",
      quantity: 12,
      unit: "m"
    },
    {
      key: "net-1::run",
      kind: "SIDE_NETTING",
      component: "NETTING_RUN",
      description: "Side-netting run length",
      quantity: 10.1,
      unit: "m"
    }
  ]
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
      resolvedGoalUnits: [
        {
          id: "goal-1",
          segmentId: "segment-4",
          centerOffsetMm: 3000,
          startOffsetMm: 1500,
          endOffsetMm: 4500,
          widthMm: 3000,
          depthMm: 1200,
          goalHeightMm: 3000,
          enclosureHeightMm: 3000,
          entryPoint: { x: 1500, y: 0 },
          exitPoint: { x: 4500, y: 0 },
          recessEntryPoint: { x: 1500, y: 1200 },
          recessExitPoint: { x: 4500, y: 1200 },
          rearCenterPoint: { x: 3000, y: 1200 },
          tangent: { x: 1, y: 0 },
          normal: { x: 0, y: 1 },
          spec: { system: "TWIN_BAR", height: "2m" },
          enclosureSpec: { system: "TWIN_BAR", height: "3m" },
          placement: {
            id: "goal-1",
            segmentId: "segment-4",
            centerOffsetMm: 3000,
            side: "LEFT",
            widthMm: 3000,
            depthMm: 1200,
            goalHeightMm: 3000
          }
        }
      ],
      resolvedKickboards: [
        {
          id: "kick-1",
          sourceAttachmentId: "kick-1",
          segmentId: "segment-1",
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
          lengthMm: 5000,
          boardCount: 2,
          placement: {
            id: "kick-1",
            segmentId: "segment-1",
            sectionHeightMm: 200,
            thicknessMm: 50,
            profile: "SQUARE",
            boardLengthMm: 2500
          }
        }
      ],
      resolvedPitchDividers: [
        {
          id: "divider-1",
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 0, y: 12000 },
          spanMm: 12000,
          supportPoints: [],
          supportPostCount: 0,
          isValid: true,
          validationMessage: null,
          placement: {
            id: "divider-1",
            startAnchor: { segmentId: "segment-1", offsetMm: 0 },
            endAnchor: { segmentId: "segment-2", offsetMm: 0 }
          }
        }
      ],
      resolvedSideNettings: [
        {
          id: "net-1",
          segmentId: "segment-1",
          startOffsetMm: 0,
          endOffsetMm: 10100,
          start: { x: 0, y: 0 },
          end: { x: 10100, y: 0 },
          lengthMm: 10100,
          baseFenceHeightMm: 3000,
          additionalHeightMm: 2000,
          totalHeightMm: 5000,
          extendedPostIndices: [0, 2, 4],
          extendedPostPoints: [{ x: 0, y: 0 }, { x: 5050, y: 0 }, { x: 10100, y: 0 }],
          placement: {
            id: "net-1",
            segmentId: "segment-1",
            additionalHeightMm: 2000,
            extendedPostInterval: 3
          }
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
    expect(summary.featureCounts).toEqual({
      goalUnits: 1,
      kickboards: 1,
      pitchDividers: 1,
      sideNettings: 1
    });
    expect(summary.featureRowsByKind.goalUnits).toEqual([{ label: "Goal unit 3m x 3m", value: "1 item" }]);
  });
});
