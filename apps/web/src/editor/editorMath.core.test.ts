import type { FenceSpec } from "@fence-estimator/contracts";
import { describe, expect, it } from "vitest";

import {
  buildOppositeGateGuides,
  buildScaleBar,
  clampGatePlacementToSegment,
  classifyIncidentNode,
  collectInteriorIntersectionOffsetsMm,
  findNearestNode,
  isPointOnSegmentInterior,
  normalizeVector,
  offsetAlongSegmentMm,
  pointCoordinateKey,
  rangesOverlap,
  rotateVector,
  sameSpec,
  segmentIntersectionPoint,
  snapToAxisGuide
} from "./editorMath.js";
import type { GateVisual } from "./types.js";

const BASE_SPEC: FenceSpec = {
  system: "TWIN_BAR",
  height: "2m",
  twinBarVariant: "STANDARD"
};

const ALT_SPEC: FenceSpec = {
  system: "ROLL_FORM",
  height: "3m"
};

function createSegment(id: string, start: { x: number; y: number }, end: { x: number; y: number }) {
  return { id, start, end, spec: BASE_SPEC };
}

function createGateVisual(key: string, centerX: number, centerY: number): GateVisual {
  return {
    key,
    startPoint: { x: centerX - 500, y: centerY },
    endPoint: { x: centerX + 500, y: centerY },
    centerPoint: { x: centerX, y: centerY },
    widthMm: 1000,
    tangent: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    leafCount: 1
  };
}

describe("editorMath core helpers", () => {
  it("handles spec, vector, and overlap helpers", () => {
    expect(sameSpec(BASE_SPEC, { ...BASE_SPEC })).toBe(true);
    expect(sameSpec(BASE_SPEC, ALT_SPEC)).toBe(false);
    expect(normalizeVector({ x: 0, y: 0 })).toBeNull();
    expect(rotateVector({ x: 1, y: 0 }, 90).y).toBeCloseTo(1, 6);
    expect(rangesOverlap(0, 100, 50, 150)).toBe(true);
    expect(rangesOverlap(0, 100, 100, 150)).toBe(false);
  });

  it("computes offsets, interior points, and intersections", () => {
    const horizontal = createSegment("h", { x: 0, y: 0 }, { x: 1000, y: 0 });
    const vertical = createSegment("v", { x: 500, y: -500 }, { x: 500, y: 500 });

    expect(offsetAlongSegmentMm(horizontal, { x: 600, y: 40 })).toBe(600);
    expect(isPointOnSegmentInterior({ x: 500, y: 0 }, horizontal)).toBe(true);
    expect(isPointOnSegmentInterior({ x: 0, y: 0 }, horizontal)).toBe(false);
    expect(segmentIntersectionPoint(horizontal, vertical)).toEqual({ x: 500, y: 0 });
  });

  it("deduplicates interior intersection offsets and clamps gate placements", () => {
    const target = createSegment("target", { x: 0, y: 0 }, { x: 1000, y: 0 });
    const allSegments = [
      target,
      createSegment("cross-a", { x: 500, y: -500 }, { x: 500, y: 500 }),
      createSegment("cross-b", { x: 500, y: -250 }, { x: 500, y: 250 }),
      createSegment("endpoint", { x: 750, y: 0 }, { x: 900, y: 300 })
    ];

    const offsets = collectInteriorIntersectionOffsetsMm(target, allSegments);
    const clamped = clampGatePlacementToSegment(
      { id: "gate-1", segmentId: "target", startOffsetMm: 0, endOffsetMm: 300, gateType: "CUSTOM" },
      1000
    );

    expect(offsets).toEqual([500, 750]);
    expect(clamped).toEqual({
      startOffsetMm: 50,
      endOffsetMm: 350
    });
  });

  it("builds opposite-gate guides and nearest-node lookups", () => {
    const guides = buildOppositeGateGuides([
      createGateVisual("first", 1000, 0),
      createGateVisual("second", 1000, 1200)
    ]);

    const nearest = findNearestNode({ x: 90, y: 90 }, [{ x: 0, y: 0 }, { x: 100, y: 100 }], 30);

    expect(guides).toHaveLength(1);
    expect(guides[0]?.key).toBe("first::second");
    expect(nearest).toEqual({ x: 100, y: 100 });
  });

  it("snaps to axis guides and classifies incident nodes", () => {
    const horizontalSnap = snapToAxisGuide(
      { x: 0, y: 0 },
      { x: 980, y: 10 },
      [{ x: 1000, y: 300 }],
      50
    );
    const verticalSnap = snapToAxisGuide(
      { x: 0, y: 0 },
      { x: 10, y: 980 },
      [{ x: 300, y: 1000 }],
      50
    );

    expect(horizontalSnap.point).toEqual({ x: 1000, y: 0 });
    expect(horizontalSnap.guide?.orientation).toBe("VERTICAL");
    expect(verticalSnap.point).toEqual({ x: 0, y: 1000 });
    expect(verticalSnap.guide?.orientation).toBe("HORIZONTAL");
    expect(pointCoordinateKey({ x: 10, y: 20 })).toBe("10:20");
    expect(classifyIncidentNode([{ x: 1, y: 0 }])).toBe("END");
    expect(classifyIncidentNode([{ x: 1, y: 0 }, { x: -1, y: 0 }])).toBe("INLINE_JOIN");
    expect(classifyIncidentNode([{ x: 1, y: 0 }, { x: 0, y: 1 }])).toBe("CORNER");
    expect(classifyIncidentNode([{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }])).toBe("JUNCTION");
  });

  it("chooses a bounded scale bar", () => {
    const scaleBar = buildScaleBar(0.08, 800);

    expect(scaleBar.lengthMm).toBeGreaterThan(0);
    expect(scaleBar.lengthPx).toBeLessThanOrEqual(320);
    expect(scaleBar.label.length).toBeGreaterThan(0);
  });
});
