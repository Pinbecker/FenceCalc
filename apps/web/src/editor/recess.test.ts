import type { FenceSpec, LayoutSegment } from "@fence-estimator/contracts";
import { describe, expect, it } from "vitest";

import {
  buildRecessAlignmentAnchors,
  buildRecessPreview,
  buildRecessReplacementSegments,
  chooseGridStep,
  recessAnchorSnapWindowMm,
  recessFractionSnapWindowMm,
  recessMidpointSnapWindowMm,
  recessSnapTargetsMm,
  snapOffsetToAnchorAlongSegment
} from "./recess.js";

const BASE_SPEC: FenceSpec = {
  system: "TWIN_BAR",
  height: "2m",
  twinBarVariant: "STANDARD"
};

function createSegment(id: string, start: { x: number; y: number }, end: { x: number; y: number }): LayoutSegment {
  return { id, start, end, spec: BASE_SPEC };
}

describe("recess helpers", () => {
  it("builds a recess preview and corner-snaps near the segment start", () => {
    const segment = createSegment("main", { x: 0, y: 0 }, { x: 4000, y: 0 });

    const preview = buildRecessPreview(segment, 300, 1000, 500, "LEFT");

    expect(preview).toMatchObject({
      startOffsetMm: 0,
      endOffsetMm: 1000,
      depthMm: 500,
      recessEntryPoint: { x: 0, y: 500 },
      recessExitPoint: { x: 1000, y: 500 }
    });
  });

  it("chooses grid steps and bounded snap windows", () => {
    expect(chooseGridStep(0.02)).toBe(2500);
    expect(recessMidpointSnapWindowMm(2000)).toBe(300);
    expect(recessFractionSnapWindowMm(20000)).toBe(1000);
    expect(recessAnchorSnapWindowMm(1000)).toBe(220);
    expect(recessSnapTargetsMm(4000)).toEqual([1000, 1350, 2000, 2650, 3000]);
  });

  it("snaps offsets to anchors projected along the segment", () => {
    const segment = createSegment("main", { x: 0, y: 0 }, { x: 4000, y: 0 });

    const snapped = snapOffsetToAnchorAlongSegment(
      segment,
      1800,
      [{ x: 2000, y: 300 }, { x: 3200, y: 100 }],
      300
    );

    expect(snapped).toEqual({
      offsetMm: 2000,
      anchorPoint: { x: 2000, y: 300 }
    });
  });

  it("builds alignment anchors and replacement segments for perpendicular recess legs", () => {
    const main = createSegment("main", { x: 0, y: 0 }, { x: 4000, y: 0 });
    const startLeg = createSegment("start-leg", { x: 0, y: 0 }, { x: 0, y: 1000 });
    const endLeg = createSegment("end-leg", { x: 4000, y: 0 }, { x: 4000, y: 1000 });

    const anchors = buildRecessAlignmentAnchors([main, startLeg, endLeg]);
    const preview = buildRecessPreview(main, 2000, 1000, 500, "LEFT");
    if (!preview) {
      throw new Error("expected a recess preview");
    }
    const replacementSegments = buildRecessReplacementSegments(preview);

    expect(anchors).toEqual([
      {
        sourceSegmentId: "main",
        point: { x: 2000, y: 0 },
        tangent: { x: 1, y: 0 }
      }
    ]);
    expect(replacementSegments).toHaveLength(5);
    expect(replacementSegments[1]?.start).toEqual({ x: 1500, y: 0 });
    expect(replacementSegments[1]?.end).toEqual({ x: 1500, y: 500 });
  });
});
