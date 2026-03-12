import type { FenceSpec, LayoutSegment } from "@fence-estimator/contracts";
import { describe, expect, it } from "vitest";

import {
  buildEstimateSegments,
  buildSegmentConnectivity,
  buildSegmentRuns,
  resolveGatePlacements
} from "./segmentTopology.js";

const BASE_SPEC: FenceSpec = {
  system: "TWIN_BAR",
  height: "2m",
  twinBarVariant: "STANDARD"
};

function createSegment(id: string, start: { x: number; y: number }, end: { x: number; y: number }, spec = BASE_SPEC): LayoutSegment {
  return { id, start, end, spec };
}

describe("segmentTopology", () => {
  it("classifies closed and movable segment components", () => {
    const openSegment = createSegment("open", { x: 0, y: 0 }, { x: 1000, y: 0 });
    const closedSegments = [
      createSegment("square-a", { x: 2000, y: 0 }, { x: 3000, y: 0 }),
      createSegment("square-b", { x: 3000, y: 0 }, { x: 3000, y: 1000 }),
      createSegment("square-c", { x: 3000, y: 1000 }, { x: 2000, y: 1000 }),
      createSegment("square-d", { x: 2000, y: 1000 }, { x: 2000, y: 0 })
    ];

    const connectivity = buildSegmentConnectivity([openSegment, ...closedSegments]);

    const openComponentId = connectivity.segmentComponent.get("open");
    const closedComponentId = connectivity.segmentComponent.get("square-a");

    expect(openComponentId).toBeTruthy();
    expect(closedComponentId).toBeTruthy();
    expect(connectivity.movableComponentIds.has(openComponentId ?? "")).toBe(true);
    expect(connectivity.closedComponentIds.has(openComponentId ?? "")).toBe(false);
    expect(connectivity.closedComponentIds.has(closedComponentId ?? "")).toBe(true);
  });

  it("resolves, sorts, and clamps gate placements", () => {
    const segment = createSegment("segment-1", { x: 0, y: 0 }, { x: 5000, y: 0 });
    const resolved = resolveGatePlacements(
      new Map([[segment.id, segment]]),
      [
        { id: "gate-b", segmentId: "segment-1", startOffsetMm: 4750, endOffsetMm: 5200, gateType: "SINGLE_LEAF" },
        { id: "gate-a", segmentId: "segment-1", startOffsetMm: 1000, endOffsetMm: 3100, gateType: "CUSTOM" },
        { id: "missing", segmentId: "unknown", startOffsetMm: 0, endOffsetMm: 1000, gateType: "CUSTOM" }
      ]
    );

    expect(resolved.map((gate) => gate.id)).toEqual(["gate-a", "gate-b"]);
    expect(resolved[0]?.leafCount).toBe(2);
    expect(resolved[1]?.endOffsetMm).toBeLessThanOrEqual(4950);
  });

  it("builds estimate segments around gate openings", () => {
    const segment = createSegment("segment-1", { x: 0, y: 0 }, { x: 5000, y: 0 });
    const [gate] = resolveGatePlacements(
      new Map([[segment.id, segment]]),
      [{ id: "gate-1", segmentId: "segment-1", startOffsetMm: 2000, endOffsetMm: 3000, gateType: "CUSTOM" }]
    );

    expect(gate).toBeTruthy();

    const runs = buildSegmentRuns(segment, gate ? [gate] : []);
    const estimateSegments = buildEstimateSegments(
      [segment],
      new Map(gate ? [[segment.id, [gate]]] : [])
    );

    expect(runs).toHaveLength(2);
    expect(estimateSegments).toHaveLength(2);
    expect(estimateSegments[0]?.id).toBe("segment-1::run-0");
    expect(estimateSegments[1]?.start.x).toBe(3000);
  });
});
