import type { FenceSpec, GatePlacement, LayoutSegment } from "@fence-estimator/contracts";
import { describe, expect, it } from "vitest";

import {
  moveBasketballPostPlacementCollection,
  moveBasketballPostPlacementCollectionToOffset,
  moveGatePlacementCollection,
  moveGatePlacementCollectionToOffsets,
  offsetSegmentCollection,
  remapBasketballPostPlacementsForRecess,
  remapGatePlacementsForRecess,
  resizeSegmentCollection
} from "./editorCommandUtils.js";
import { buildRecessPreview, buildRecessReplacementSegments } from "./recess.js";
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

  it("snaps a moved segment back to its original position and lines it up with nearby nodes and runs", () => {
    const segments = [
      createSegment("a", { x: 0, y: 0 }, { x: 1000, y: 0 }),
      createSegment("b", { x: 1000, y: 0 }, { x: 1000, y: 1000 }),
      createSegment("c", { x: 0, y: 300 }, { x: 1000, y: 300 }),
    ];

    const snappedBack = offsetSegmentCollection(segments, "a", { x: 0, y: 40 }, {
      snapToIncrement: true,
      snapNodes: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 0, y: 300 },
        { x: 1000, y: 300 }
      ],
      lineSnapSegments: segments
    });
    const snappedToRun = offsetSegmentCollection(segments, "a", { x: 0, y: 260 }, {
      snapToIncrement: true,
      snapNodes: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 0, y: 300 },
        { x: 1000, y: 300 }
      ],
      lineSnapSegments: segments
    });

    expect(snappedBack[0]?.start).toEqual({ x: 0, y: 0 });
    expect(snappedBack[0]?.end).toEqual({ x: 1000, y: 0 });
    expect(snappedToRun[0]?.start).toEqual({ x: 0, y: 300 });
    expect(snappedToRun[0]?.end).toEqual({ x: 1000, y: 300 });
    expect(snappedToRun[1]?.start).toEqual({ x: 1000, y: 300 });
  });

  it("moves a selected connected segment group together when multiple run ids are supplied", () => {
    const segments = [
      createSegment("a", { x: 0, y: 0 }, { x: 1000, y: 0 }),
      createSegment("b", { x: 1000, y: 0 }, { x: 1000, y: 1000 }),
      createSegment("c", { x: 1000, y: 1000 }, { x: 2000, y: 1000 })
    ];

    const offset = offsetSegmentCollection(segments, "a", { x: 0, y: 300 }, {
      segmentIds: ["a", "b"],
      snapToIncrement: true
    });

    expect(offset.find((segment) => segment.id === "a")).toMatchObject({
      start: { x: 0, y: 300 },
      end: { x: 1000, y: 300 }
    });
    expect(offset.find((segment) => segment.id === "b")).toMatchObject({
      start: { x: 1000, y: 300 },
      end: { x: 1000, y: 1300 }
    });
    expect(offset.find((segment) => segment.id === "c")).toMatchObject({
      start: { x: 1000, y: 1300 },
      end: { x: 2000, y: 1000 }
    });
  });

  it("moves gates to the nearest valid gap without overlapping peers", () => {
    const segment = createSegment("segment-1", { x: 0, y: 0 }, { x: 5000, y: 0 });
    const placements: GatePlacement[] = [
      { id: "gate-a", segmentId: "segment-1", startOffsetMm: 1000, endOffsetMm: 1500, gateType: "CUSTOM" },
      { id: "gate-b", segmentId: "segment-1", startOffsetMm: 2500, endOffsetMm: 3000, gateType: "CUSTOM" }
    ];

    const moved = moveGatePlacementCollection(placements, "gate-a", 2000, new Map([[segment.id, segment]]));

    expect(moved[0]).toMatchObject({
      id: "gate-a",
      startOffsetMm: 3000,
      endOffsetMm: 3500
    });
  });

  it("hops a dragged gate across peers without changing its width", () => {
    const segment = createSegment("segment-1", { x: 0, y: 0 }, { x: 7000, y: 0 });
    const placements: GatePlacement[] = [
      { id: "gate-a", segmentId: "segment-1", startOffsetMm: 1000, endOffsetMm: 2200, gateType: "SINGLE_LEAF" },
      { id: "gate-b", segmentId: "segment-1", startOffsetMm: 2800, endOffsetMm: 4000, gateType: "DOUBLE_LEAF" }
    ];

    const moved = moveGatePlacementCollectionToOffsets(
      placements,
      "gate-a",
      3200,
      6200,
      new Map([[segment.id, segment]])
    );

    expect(moved.find((placement) => placement.id === "gate-a")).toMatchObject({
      startOffsetMm: 4100,
      endOffsetMm: 5300,
      gateType: "SINGLE_LEAF"
    });
  });

  it("hops basketball posts over occupied offsets on the same segment", () => {
    const segment = createSegment("segment-1", { x: 0, y: 0 }, { x: 5000, y: 0 });
    const placements = [
      { id: "post-a", segmentId: "segment-1", offsetMm: 1000, facing: "LEFT" as const },
      { id: "post-b", segmentId: "segment-1", offsetMm: 1500, facing: "RIGHT" as const }
    ];

    const movedByPreview = moveBasketballPostPlacementCollectionToOffset(
      placements,
      "post-a",
      1500,
      new Map([[segment.id, segment]])
    );
    const movedByDelta = moveBasketballPostPlacementCollection(
      placements,
      "post-a",
      500,
      new Map([[segment.id, segment]])
    );

    expect(movedByPreview.find((placement) => placement.id === "post-a")?.offsetMm).toBe(1550);
    expect(movedByDelta.find((placement) => placement.id === "post-a")?.offsetMm).toBe(1550);
  });

  it("remaps gates onto recess replacement segments without dropping the original gate", () => {
    const segment = createSegment("source", { x: 0, y: 0 }, { x: 4000, y: 0 });
    const preview = buildRecessPreview(segment, 2000, 1000, 500, "LEFT");
    if (!preview) {
      throw new Error("expected a recess preview");
    }
    const replacement = buildRecessReplacementSegments(preview);
    const replacementIds = new Set(replacement.map((segment) => segment.id));

    const remapped = remapGatePlacementsForRecess(
      [
        { id: "left", segmentId: "source", startOffsetMm: 200, endOffsetMm: 600, gateType: "CUSTOM" },
        { id: "middle", segmentId: "source", startOffsetMm: 1600, endOffsetMm: 2000, gateType: "CUSTOM" },
        { id: "right", segmentId: "source", startOffsetMm: 3400, endOffsetMm: 3800, gateType: "CUSTOM" }
      ],
      preview,
      new Map(),
      replacement
    );

    expect(remapped).toHaveLength(3);
    expect(remapped.every((placement) => replacementIds.has(placement.segmentId))).toBe(true);
    expect(remapped.find((placement) => placement.id === "middle")?.segmentId).not.toBe("source");
    expect(remapped.find((placement) => placement.id === "right")).toMatchObject({
      startOffsetMm: 900,
      endOffsetMm: 1300
    });
  });

  it("remaps basketball posts onto recess replacement segments without deleting them", () => {
    const segment = createSegment("source", { x: 0, y: 0 }, { x: 4000, y: 0 });
    const preview = buildRecessPreview(segment, 2000, 1000, 500, "LEFT");
    if (!preview) {
      throw new Error("expected a recess preview");
    }
    const replacement = buildRecessReplacementSegments(preview);
    const replacementIds = new Set(replacement.map((segment) => segment.id));

    const remapped = remapBasketballPostPlacementsForRecess(
      [
        { id: "left", segmentId: "source", offsetMm: 300, facing: "LEFT" },
        { id: "middle", segmentId: "source", offsetMm: 2000, facing: "RIGHT" },
        { id: "right", segmentId: "source", offsetMm: 3600, facing: "LEFT" }
      ],
      preview,
      replacement
    );

    expect(remapped).toHaveLength(3);
    expect(remapped.every((placement) => replacementIds.has(placement.segmentId))).toBe(true);
    expect(remapped.find((placement) => placement.id === "middle")?.offsetMm).toBe(500);
    expect(remapped.find((placement) => placement.id === "right")).toMatchObject({
      offsetMm: 1100
    });
  });
});
