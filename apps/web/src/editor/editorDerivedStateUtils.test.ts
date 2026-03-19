import type { FenceSpec, LayoutSegment } from "@fence-estimator/contracts";
import { describe, expect, it } from "vitest";

import {
  buildGateNodeHeightByKey,
  buildGatesBySegmentId,
  buildPostTypeCounts,
  buildResolvedGateMap,
  buildSegmentLengthLabelsBySegmentId,
  buildVisibleSegmentLabelKeys,
  buildVisualPosts
} from "./editorDerivedStateUtils.js";
import type { ResolvedGatePlacement, SegmentLengthLabel } from "./types.js";

const BASE_SPEC: FenceSpec = {
  system: "TWIN_BAR",
  height: "2m",
  twinBarVariant: "STANDARD"
};

const TALL_SPEC: FenceSpec = {
  system: "TWIN_BAR",
  height: "4m",
  twinBarVariant: "STANDARD"
};

function createSegment(id: string, start: { x: number; y: number }, end: { x: number; y: number }, spec = BASE_SPEC): LayoutSegment {
  return { id, start, end, spec };
}

function createResolvedGate(
  id: string,
  segmentId: string,
  startOffsetMm: number,
  endOffsetMm: number,
  startPoint: { x: number; y: number },
  endPoint: { x: number; y: number },
  spec: FenceSpec = BASE_SPEC
): ResolvedGatePlacement {
  return {
    id,
    key: id,
    segmentId,
    startOffsetMm,
    endOffsetMm,
    gateType: "CUSTOM",
    startPoint,
    endPoint,
    centerPoint: {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2
    },
    widthMm: endOffsetMm - startOffsetMm,
    tangent: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    leafCount: 1,
    spec
  };
}

describe("editorDerivedStateUtils", () => {
  it("builds resolved gate lookup structures and keeps the tallest gate-node height", () => {
    const firstGate = createResolvedGate("gate-b", "segment-1", 800, 1400, { x: 800, y: 0 }, { x: 1400, y: 0 });
    const secondGate = createResolvedGate("gate-a", "segment-1", 1400, 2000, { x: 1400, y: 0 }, { x: 2000, y: 0 }, TALL_SPEC);

    const resolvedMap = buildResolvedGateMap([firstGate, secondGate]);
    const gatesBySegmentId = buildGatesBySegmentId([firstGate, secondGate]);
    const gateNodeHeightByKey = buildGateNodeHeightByKey([firstGate, secondGate]);

    expect(resolvedMap.get("gate-a")?.segmentId).toBe("segment-1");
    expect(gatesBySegmentId.get("segment-1")?.map((gate) => gate.id)).toEqual(["gate-b", "gate-a"]);
    expect(gateNodeHeightByKey.get("1400:0")).toBeGreaterThan(gateNodeHeightByKey.get("800:0") ?? 0);
  });

  it("builds visual posts and post-type counts from estimate segments", () => {
    const estimateSegments = [
      createSegment("bottom", { x: 0, y: 0 }, { x: 5000, y: 0 }),
      createSegment("right", { x: 5000, y: 0 }, { x: 5000, y: 3000 })
    ];

    const visualPosts = buildVisualPosts(estimateSegments, new Map());
    const counts = buildPostTypeCounts(visualPosts);

    expect(visualPosts.some((post) => post.kind === "CORNER" && post.point.x === 5000 && post.point.y === 0)).toBe(true);
    expect(visualPosts.some((post) => post.kind === "END" && post.point.x === 0 && post.point.y === 0)).toBe(true);
    expect(counts.CORNER).toBe(1);
    expect(counts.END).toBe(2);
    expect(counts.INTERMEDIATE).toBeGreaterThan(0);
  });

  it("skips normal post markers where replacement posts sit in the run", () => {
    const estimateSegments = [
      createSegment("left", { x: 0, y: 0 }, { x: 2500, y: 0 }),
      createSegment("right", { x: 2500, y: 0 }, { x: 5000, y: 0 })
    ];

    const visualPosts = buildVisualPosts(estimateSegments, new Map(), new Set(["2500:0"]));

    expect(visualPosts.some((post) => post.point.x === 2500 && post.point.y === 0)).toBe(false);
  });

  it("splits length labels around interior intersections", () => {
    const segments = [
      createSegment("main", { x: 0, y: 0 }, { x: 1000, y: 0 }),
      createSegment("cross", { x: 500, y: -500 }, { x: 500, y: 500 })
    ];

    const labelsBySegmentId = buildSegmentLengthLabelsBySegmentId(segments, "main", 1);
    const mainLabels = labelsBySegmentId.get("main");

    expect(mainLabels).toHaveLength(2);
    expect(mainLabels?.every((label) => label.isSelected)).toBe(true);
    expect(mainLabels?.map((label) => label.text)).toEqual(["0.50m", "0.50m"]);
  });

  it("splits length labels around replacement post offsets", () => {
    const segments = [createSegment("main", { x: 0, y: 0 }, { x: 67000, y: 0 })];
    const labelsBySegmentId = buildSegmentLengthLabelsBySegmentId(
      segments,
      "main",
      1,
      new Map([["main", [33500]]])
    );

    expect(labelsBySegmentId.get("main")?.map((label) => label.text)).toEqual(["33.50m", "33.50m"]);
  });

  it("keeps selected labels visible when label bounds overlap", () => {
    const labelsBySegmentId = new Map<string, SegmentLengthLabel[]>([
      [
        "segment-1",
        [
          {
            key: "plain",
            segmentId: "segment-1",
            x: 100,
            y: 100,
            text: "1.00m",
            lengthMm: 1000,
            isSelected: false
          },
          {
            key: "selected",
            segmentId: "segment-1",
            x: 100,
            y: 100,
            text: "0.80m",
            lengthMm: 800,
            isSelected: true
          }
        ]
      ]
    ]);

    const visible = buildVisibleSegmentLabelKeys(labelsBySegmentId, 1);

    expect(visible.has("selected")).toBe(true);
  });
});
