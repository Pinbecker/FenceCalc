import type { FenceSpec, LayoutSegment } from "@fence-estimator/contracts";
import { describe, expect, it } from "vitest";

import {
  buildGatePreview,
  findNearestSegmentSnap,
  interpolateAlongSegment,
  projectPointOntoSegment,
  resolveGateWidthMm
} from "./gateMath.js";

const BASE_SPEC: FenceSpec = {
  system: "TWIN_BAR",
  height: "2m",
  twinBarVariant: "STANDARD"
};

function createSegment(id: string, start: { x: number; y: number }, end: { x: number; y: number }): LayoutSegment {
  return { id, start, end, spec: BASE_SPEC };
}

describe("gateMath", () => {
  it("interpolates and projects points along a segment", () => {
    const segment = createSegment("segment-1", { x: 0, y: 0 }, { x: 2000, y: 0 });

    expect(interpolateAlongSegment(segment, 500)).toEqual({ x: 500, y: 0 });
    expect(projectPointOntoSegment({ x: 600, y: 300 }, segment)).toEqual({
      projected: { x: 600, y: 0 },
      offsetMm: 600,
      distanceMm: 300
    });
  });

  it("finds the nearest segment snap and quantizes the offset", () => {
    const segments = [
      createSegment("horizontal", { x: 0, y: 0 }, { x: 2000, y: 0 }),
      createSegment("vertical", { x: 3000, y: 0 }, { x: 3000, y: 2000 })
    ];

    const snap = findNearestSegmentSnap({ x: 640, y: 40 }, segments, 100);

    expect(snap).toMatchObject({
      segment: segments[0],
      point: { x: 650, y: 0 },
      startOffsetMm: 650
    });
  });

  it("resolves gate widths for fixed and custom gate types", () => {
    expect(resolveGateWidthMm("SINGLE_LEAF", 1800)).toBe(1200);
    expect(resolveGateWidthMm("DOUBLE_LEAF", 1800)).toBe(3000);
    expect(resolveGateWidthMm("CUSTOM", 1800)).toBe(1800);
  });

  it("builds a clamped gate preview inside the segment bounds", () => {
    const segment = createSegment("segment-1", { x: 0, y: 0 }, { x: 5000, y: 0 });

    const preview = buildGatePreview(segment, 4700, 900,);

    expect(preview).toMatchObject({
      startOffsetMm: 4050,
      endOffsetMm: 4950,
      widthMm: 900
    });
    expect(preview?.tangent).toEqual({ x: 1, y: 0 });
    expect(preview?.normal?.x).toBeCloseTo(0, 6);
    expect(preview?.normal?.y).toBeCloseTo(1, 6);
  });
});
