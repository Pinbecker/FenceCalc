import { describe, expect, it } from "vitest";

import type { LayoutModel, LayoutSegment } from "@fence-estimator/contracts";

import {
  estimateDrawingLayout,
  findOppositeBasketballPairCandidate,
  resolveGoalUnitPlacements,
  resolveKickboardAttachments,
  resolvePitchDividerPlacements,
  resolveSideNettingAttachments
} from "../src/index.js";

function buildSegment(id: string, startX: number, startY: number, endX: number, endY: number, height: LayoutSegment["spec"]["height"]): LayoutSegment {
  return {
    id,
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    spec: { system: "TWIN_BAR", height, twinBarVariant: "STANDARD" }
  };
}

describe("feature helpers", () => {
  it("derives goal-unit enclosure height from the goal-unit type rather than the host fence height", () => {
    const host = buildSegment("host", 0, 0, 12000, 0, "2m");
    const segmentsById = new Map([[host.id, host]]);

    const placements = resolveGoalUnitPlacements(segmentsById, [
      {
        id: "goal-3m",
        segmentId: "host",
        centerOffsetMm: 4000,
        side: "LEFT",
        widthMm: 3000,
        depthMm: 1200,
        goalHeightMm: 3000
      },
      {
        id: "goal-4m",
        segmentId: "host",
        centerOffsetMm: 8500,
        side: "RIGHT",
        widthMm: 3000,
        depthMm: 1200,
        goalHeightMm: 4000
      }
    ]);

    expect(placements.map((placement) => placement.enclosureHeightMm)).toEqual([3000, 4000]);
  });

  it("finds an opposite basketball pair candidate on the opposite fence line", () => {
    const top = buildSegment("top", 0, 0, 10100, 0, "3m");
    const bottom = buildSegment("bottom", 10100, 9000, 0, 9000, "3m");

    const candidate = findOppositeBasketballPairCandidate([top, bottom], "top", 5050, "LEFT");

    expect(candidate).toMatchObject({
      segmentId: "bottom",
      offsetMm: 5050,
      facing: "RIGHT"
    });
  });

  it("counts dedicated basketball posts as intermediate-post replacements where applicable", () => {
    const layout: LayoutModel = {
      segments: [buildSegment("run", 0, 0, 5050, 0, "3m")],
      basketballFeatures: [
        {
          id: "bb-1",
          segmentId: "run",
          offsetMm: 2525,
          facing: "LEFT",
          type: "DEDICATED_POST",
          mountingMode: "PROJECTING_ARM",
          armLengthMm: 1800,
          replacesIntermediatePost: true
        }
      ]
    };

    const estimate = estimateDrawingLayout(layout);

    expect(estimate.posts.intermediate).toBe(0);
    expect(estimate.featureQuantities?.some((line) => line.component === "DEDICATED_POST" && line.quantity === 1)).toBe(
      true
    );
    expect(
      estimate.featureQuantities?.some((line) => line.component === "INTERMEDIATE_POST_REPLACED" && line.quantity === 1)
    ).toBe(true);
  });

  it("calculates kickboard board quantities from the host fence-line length", () => {
    const attachment = resolveKickboardAttachments(
      new Map([["run", buildSegment("run", 0, 0, 6200, 0, "2m")]]),
      [
        {
          id: "kb-1",
          segmentId: "run",
          sectionHeightMm: 225,
          thicknessMm: 50,
          profile: "CHAMFERED",
          boardLengthMm: 2500
        }
      ]
    )[0];

    expect(attachment?.sourceAttachmentId).toBe("kb-1");
    expect(attachment?.boardCount).toBe(3);
  });

  it("routes kickboards around goal-unit recesses instead of across the goal mouth", () => {
    const segment = buildSegment("run", 0, 0, 12000, 0, "3m");
    const segmentsById = new Map([[segment.id, segment]]);
    const goalUnit = resolveGoalUnitPlacements(segmentsById, [
      {
        id: "goal-1",
        segmentId: "run",
        centerOffsetMm: 5000,
        side: "LEFT",
        widthMm: 3000,
        depthMm: 1200,
        goalHeightMm: 3000
      }
    ]);

    const kickboards = resolveKickboardAttachments(
      segmentsById,
      [
        {
          id: "kb-1",
          segmentId: "run",
          sectionHeightMm: 200,
          thicknessMm: 50,
          profile: "SQUARE",
          boardLengthMm: 2500
        }
      ],
      goalUnit
    );

    expect(kickboards).toHaveLength(5);
    expect(kickboards.map((kickboard) => Math.round(kickboard.lengthMm))).toEqual([3500, 1200, 3000, 1200, 5500]);
    expect(kickboards[0]?.boardCount).toBe(6);
  });

  it("adds pitch-divider supports every 15m and flags spans beyond 70m", () => {
    const segmentsById = new Map([
      ["left", buildSegment("left", 0, 0, 0, 5000, "4m")],
      ["right", buildSegment("right", 45000, 0, 45000, 5000, "4m")],
      ["too-far", buildSegment("too-far", 75000, 0, 75000, 5000, "4m")]
    ]);

    const valid = resolvePitchDividerPlacements(segmentsById, [
      {
        id: "divider-ok",
        startAnchor: { segmentId: "left", offsetMm: 2500 },
        endAnchor: { segmentId: "right", offsetMm: 2500 }
      }
    ])[0];
    const invalid = resolvePitchDividerPlacements(segmentsById, [
      {
        id: "divider-bad",
        startAnchor: { segmentId: "left", offsetMm: 2500 },
        endAnchor: { segmentId: "too-far", offsetMm: 2500 }
      }
    ])[0];

    expect(valid?.supportPostCount).toBe(2);
    expect(valid?.supportPoints).toHaveLength(2);
    expect(invalid?.isValid).toBe(false);
  });

  it("extends every third post for side netting and replaces the underlying post heights", () => {
    const layout: LayoutModel = {
      segments: [buildSegment("side-run", 0, 0, 15150, 0, "3m")],
      sideNettings: [
        {
          id: "net-1",
          segmentId: "side-run",
          additionalHeightMm: 2000,
          extendedPostInterval: 3
        }
      ]
    };

    const resolved = resolveSideNettingAttachments(new Map([["side-run", layout.segments[0]!]]), layout.sideNettings ?? [])[0];
    const estimate = estimateDrawingLayout(layout);

    expect(resolved?.extendedPostIndices).toEqual([0, 3, 6]);
    expect(estimate.posts.byHeightAndType["3000"]).toMatchObject({
      end: 0,
      intermediate: 4,
      total: 4
    });
    expect(estimate.posts.byHeightAndType["5000"]).toMatchObject({
      end: 2,
      intermediate: 1,
      total: 3
    });
    expect(estimate.featureQuantities?.some((line) => line.component === "EXTENDED_POSTS")).toBe(false);
    expect(
      estimate.featureQuantities?.find((line) => line.component === "NETTING_AREA")
        ?.quantity
    ).toBe(30.3);
  });

  it("supports side netting over a partial fence-line range", () => {
    const layout: LayoutModel = {
      segments: [buildSegment("partial-run", 0, 0, 15150, 0, "3m")],
      sideNettings: [
        {
          id: "net-partial",
          segmentId: "partial-run",
          additionalHeightMm: 2000,
          startOffsetMm: 2525,
          endOffsetMm: 10100,
          extendedPostInterval: 3
        }
      ]
    };

    const resolved = resolveSideNettingAttachments(new Map([["partial-run", layout.segments[0]!]]), layout.sideNettings ?? [])[0];
    const estimate = estimateDrawingLayout(layout);

    expect(resolved?.lengthMm).toBe(7575);
    expect(resolved?.startOffsetMm).toBe(2525);
    expect(resolved?.endOffsetMm).toBe(10100);
    expect(resolved?.extendedPostIndices).toEqual([0, 3]);
    expect(resolved?.extendedPostPoints).toHaveLength(2);
    expect(estimate.posts.byHeightAndType["3000"]).toMatchObject({
      end: 2,
      intermediate: 3,
      total: 5
    });
    expect(estimate.posts.byHeightAndType["5000"]).toMatchObject({
      end: 0,
      intermediate: 2,
      total: 2
    });
    expect(
      estimate.featureQuantities?.find((line) => line.component === "NETTING_RUN")
        ?.quantity
    ).toBe(7.575);
  });

  it("emits quantity placeholder rows for goal units, kickboards, pitch dividers, and side netting", () => {
    const layout: LayoutModel = {
      segments: [
        buildSegment("host", 0, 0, 12000, 0, "2m"),
        buildSegment("kick-run", 0, 6000, 5000, 6000, "2m"),
        buildSegment("divider-left", 0, 12000, 0, 17000, "4m"),
        buildSegment("divider-right", 30000, 12000, 30000, 17000, "4m"),
        buildSegment("net-run", 0, 22000, 10100, 22000, "3m")
      ],
      goalUnits: [
        {
          id: "goal-1",
          segmentId: "host",
          centerOffsetMm: 5000,
          side: "LEFT",
          widthMm: 3600,
          depthMm: 1200,
          goalHeightMm: 3000
        }
      ],
      kickboards: [
        {
          id: "kb-1",
          segmentId: "kick-run",
          sectionHeightMm: 200,
          thicknessMm: 50,
          profile: "SQUARE",
          boardLengthMm: 2500
        }
      ],
      pitchDividers: [
        {
          id: "divider-1",
          startAnchor: { segmentId: "divider-left", offsetMm: 2500 },
          endAnchor: { segmentId: "divider-right", offsetMm: 2500 }
        }
      ],
      sideNettings: [
        {
          id: "net-1",
          segmentId: "net-run",
          additionalHeightMm: 1500,
          extendedPostInterval: 3
        }
      ]
    };

    const estimate = estimateDrawingLayout(layout);
    const components = new Set((estimate.featureQuantities ?? []).map((line) => line.component));

    expect(components.has("GOAL_UNIT")).toBe(true);
    expect(components.has("LINTEL_PANEL")).toBe(true);
    expect(components.has("BOARDS")).toBe(true);
    expect(components.has("ANCHOR_POSTS")).toBe(true);
    expect(components.has("NETTING_AREA")).toBe(true);
  });
});
