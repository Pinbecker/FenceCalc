import { describe, expect, it } from "vitest";

import type { LayoutModel, LayoutSegment } from "@fence-estimator/contracts";

import { reconcileLayoutForSegments } from "./layoutReconciliation";

function buildSegment(id: string, startX: number, endX: number): LayoutSegment {
  return {
    id,
    start: { x: startX, y: 0 },
    end: { x: endX, y: 0 },
    spec: {
      system: "TWIN_BAR",
      height: "2m",
      twinBarVariant: "STANDARD"
    }
  };
}

describe("reconcileLayoutForSegments", () => {
  it("removes attachments for deleted segments and clamps surviving placements", () => {
    const previous: LayoutModel = {
      segments: [buildSegment("segment-a", 0, 4000), buildSegment("segment-b", 0, 2000)],
      gates: [{ id: "gate-a", segmentId: "segment-a", gateType: "SINGLE_LEAF", startOffsetMm: 3200, endOffsetMm: 4000 }],
      basketballPosts: [{ id: "post-a", segmentId: "segment-a", type: "DEDICATED_POST", facing: "LEFT", offsetMm: 4500, armLengthMm: 1800 }],
      floodlightColumns: [{ id: "light-b", segmentId: "segment-b", offsetMm: 1200, facing: "LEFT" }],
      goalUnits: [{ id: "goal-b", segmentId: "segment-b", centerOffsetMm: 1500, side: "LEFT", widthMm: 3000, goalHeightMm: 3000, depthMm: 1200 }],
      kickboards: [{ id: "kick-a", segmentId: "segment-a", sectionHeightMm: 200, thicknessMm: 50, profile: "SQUARE", boardLengthMm: 2500 }],
      pitchDividers: [{
        id: "divider-a",
        startAnchor: { segmentId: "segment-a", offsetMm: 1000 },
        endAnchor: { segmentId: "segment-b", offsetMm: 2500 }
      }],
      sideNettings: [{ id: "net-a", segmentId: "segment-a", additionalHeightMm: 2000, extendedPostInterval: 3 }]
    };

    const nextSegments = [buildSegment("segment-a", 0, 3000)];
    const next = reconcileLayoutForSegments(previous, nextSegments);

    expect(next.segments).toEqual(nextSegments);
    expect(next.gates).toEqual([
      {
        id: "gate-a",
        segmentId: "segment-a",
        gateType: "SINGLE_LEAF",
        startOffsetMm: 2150,
        endOffsetMm: 2950
      }
    ]);
    expect(next.basketballPosts).toEqual([
      {
        id: "post-a",
        segmentId: "segment-a",
        type: "DEDICATED_POST",
        facing: "LEFT",
        offsetMm: 3000,
        armLengthMm: 1800
      }
    ]);
    expect(next.floodlightColumns).toEqual([]);
    expect(next.goalUnits).toEqual([]);
    expect(next.kickboards).toEqual([{ id: "kick-a", segmentId: "segment-a", sectionHeightMm: 200, thicknessMm: 50, profile: "SQUARE", boardLengthMm: 2500 }]);
    expect(next.pitchDividers).toEqual([]);
    expect(next.sideNettings).toEqual([{ id: "net-a", segmentId: "segment-a", additionalHeightMm: 2000, extendedPostInterval: 3 }]);
  });

  it("keeps goal units on surviving segments within segment bounds", () => {
    const previous: LayoutModel = {
      segments: [buildSegment("segment-a", 0, 5000)],
      gates: [],
      basketballPosts: [],
      floodlightColumns: [],
      goalUnits: [{ id: "goal-a", segmentId: "segment-a", centerOffsetMm: 4800, side: "LEFT", widthMm: 3000, goalHeightMm: 4000, depthMm: 1200 }],
      kickboards: [],
      pitchDividers: [],
      sideNettings: []
    };

    const next = reconcileLayoutForSegments(previous, [buildSegment("segment-a", 0, 4500)]);

    expect(next.goalUnits).toEqual([
      {
        id: "goal-a",
        segmentId: "segment-a",
        centerOffsetMm: 3000,
        side: "LEFT",
        widthMm: 3000,
        goalHeightMm: 4000,
        depthMm: 1200
      }
    ]);
  });
});
