import type { FenceSpec, GatePlacement, LayoutSegment } from "@fence-estimator/contracts";
import { describe, expect, it } from "vitest";

import {
  moveGatePlacementCollection,
  offsetSegmentCollection,
  remapGatePlacementsForRecess,
  resizeSegmentCollection
} from "./editorCommandUtils.js";
import { buildRecessPreview } from "./recess.js";
import { buildSegmentConnectivity } from "./segmentTopology.js";

const BASE_SPEC: FenceSpec = {
  system: "TWIN_BAR",
  height: "2m",
  twinBarVariant: "STANDARD"
};

function createSegment(id: string, start: { x: number; y: number }, end: { x: number; y: number }, spec = BASE_SPEC): LayoutSegment {
  return { id, start, end, spec };
}

describe("editorCommandUtils", () => {
  it("resizes an open component by moving downstream nodes", () => {
    const segments = [
      createSegment("a", { x: 0, y: 0 }, { x: 1000, y: 0 }),
      createSegment("b", { x: 1000, y: 0 }, { x: 2000, y: 0 })
    ];

    const resized = resizeSegmentCollection(segments, "a", 1500, buildSegmentConnectivity(segments));

    expect(resized[0]?.end).toEqual({ x: 1500, y: 0 });
    expect(resized[1]?.start).toEqual({ x: 1500, y: 0 });
    expect(resized[1]?.end).toEqual({ x: 2500, y: 0 });
  });

  it("rescales a closed component along the resized segment axis", () => {
    const segments = [
      createSegment("a", { x: 0, y: 0 }, { x: 1000, y: 0 }),
      createSegment("b", { x: 1000, y: 0 }, { x: 1000, y: 1000 }),
      createSegment("c", { x: 1000, y: 1000 }, { x: 0, y: 1000 }),
      createSegment("d", { x: 0, y: 1000 }, { x: 0, y: 0 })
    ];

    const resized = resizeSegmentCollection(segments, "a", 1500, buildSegmentConnectivity(segments));

    expect(resized[0]?.end).toEqual({ x: 1500, y: 0 });
    expect(resized[1]?.start).toEqual({ x: 1500, y: 0 });
    expect(resized[1]?.end).toEqual({ x: 1500, y: 1000 });
    expect(resized[2]?.start).toEqual({ x: 1500, y: 1000 });
  });

  it("offsets a segment perpendicular to its axis and moves shared endpoints", () => {
    const segments = [
      createSegment("a", { x: 0, y: 0 }, { x: 1000, y: 0 }),
      createSegment("b", { x: 1000, y: 0 }, { x: 1000, y: 1000 })
    ];

    const offset = offsetSegmentCollection(segments, "a", { x: 40, y: 100 });

    expect(offset[0]?.start).toEqual({ x: 0, y: 100 });
    expect(offset[0]?.end).toEqual({ x: 1000, y: 100 });
    expect(offset[1]?.start).toEqual({ x: 1000, y: 100 });
    expect(offset[1]?.end).toEqual({ x: 1000, y: 1000 });
  });

  it("moves gates along a segment without crossing peers", () => {
    const segment = createSegment("segment-1", { x: 0, y: 0 }, { x: 5000, y: 0 });
    const placements: GatePlacement[] = [
      { id: "gate-a", segmentId: "segment-1", startOffsetMm: 1000, endOffsetMm: 1500, gateType: "CUSTOM" },
      { id: "gate-b", segmentId: "segment-1", startOffsetMm: 2500, endOffsetMm: 3000, gateType: "CUSTOM" }
    ];

    const moved = moveGatePlacementCollection(placements, "gate-a", 2000, new Map([[segment.id, segment]]));

    expect(moved[0]).toMatchObject({
      id: "gate-a",
      startOffsetMm: 2000,
      endOffsetMm: 2500
    });
  });

  it("remaps gates onto recess replacement segments and drops overlapping gates", () => {
    const segment = createSegment("source", { x: 0, y: 0 }, { x: 4000, y: 0 });
    const preview = buildRecessPreview(segment, 2000, 1000, 500, "LEFT");
    if (!preview) {
      throw new Error("expected a recess preview");
    }

    const remapped = remapGatePlacementsForRecess(
      [
        { id: "left", segmentId: "source", startOffsetMm: 200, endOffsetMm: 600, gateType: "CUSTOM" },
        { id: "middle", segmentId: "source", startOffsetMm: 1600, endOffsetMm: 2000, gateType: "CUSTOM" },
        { id: "right", segmentId: "source", startOffsetMm: 3400, endOffsetMm: 3800, gateType: "CUSTOM" }
      ],
      preview,
      new Map()
    );

    expect(remapped).toHaveLength(2);
    expect(remapped.every((placement) => placement.segmentId !== "source")).toBe(true);
    expect(remapped.find((placement) => placement.id === "right")).toMatchObject({
      startOffsetMm: 900,
      endOffsetMm: 1300
    });
  });
});
