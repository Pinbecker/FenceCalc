import type { LayoutModel, LayoutSegment } from "@fence-estimator/contracts";
import { describe, expect, it } from "vitest";

import {
  classifySegmentIntersection,
  clampSegmentEndToBlockingIntersection,
  validateLayoutIntegrity,
} from "../src/layoutIntegrity.js";

const spec = { system: "TWIN_BAR", height: "2m" } as const;

function segment(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): LayoutSegment {
  return { id, start, end, spec };
}

function issueCodes(layout: LayoutModel): string[] {
  return validateLayoutIntegrity(layout).map((issue) => issue.code);
}

describe("layout integrity", () => {
  it("accepts shared endpoints and separate collinear fence lines", () => {
    const layout: LayoutModel = {
      segments: [
        segment("a", { x: 0, y: 0 }, { x: 1000, y: 0 }),
        segment("b", { x: 1000, y: 0 }, { x: 1000, y: 1000 }),
        segment("c", { x: 1500, y: 0 }, { x: 2500, y: 0 }),
      ],
    };

    expect(validateLayoutIntegrity(layout)).toEqual([]);
  });

  it("rejects crossings, unsplit junctions, and collinear overlaps", () => {
    expect(
      issueCodes({
        segments: [
          segment("horizontal", { x: 0, y: 500 }, { x: 1000, y: 500 }),
          segment("vertical", { x: 500, y: 0 }, { x: 500, y: 1000 }),
        ],
      }),
    ).toContain("SEGMENT_CROSSING");

    expect(
      issueCodes({
        segments: [
          segment("run", { x: 0, y: 0 }, { x: 1000, y: 0 }),
          segment("branch", { x: 500, y: 0 }, { x: 500, y: 500 }),
        ],
      }),
    ).toContain("UNSPLIT_JUNCTION");

    expect(
      issueCodes({
        segments: [
          segment("first", { x: 0, y: 0 }, { x: 1000, y: 0 }),
          segment("second", { x: 750, y: 0 }, { x: 1500, y: 0 }),
        ],
      }),
    ).toContain("SEGMENT_OVERLAP");
  });

  it("rejects gates that cannot physically fit their fence line", () => {
    const layout: LayoutModel = {
      segments: [segment("line", { x: 0, y: 0 }, { x: 2000, y: 0 })],
      gates: [
        {
          id: "near-end",
          segmentId: "line",
          startOffsetMm: 0,
          endOffsetMm: 800,
          gateType: "SINGLE_LEAF",
        },
        {
          id: "overlap",
          segmentId: "line",
          startOffsetMm: 700,
          endOffsetMm: 2200,
          gateType: "DOUBLE_LEAF",
        },
      ],
    };

    expect(issueCodes(layout)).toEqual(
      expect.arrayContaining(["GATE_END_CLEARANCE", "GATE_OUT_OF_BOUNDS", "GATE_OVERLAP"]),
    );
  });

  it("clamps a new fence line to its first blocking intersection", () => {
    const result = clampSegmentEndToBlockingIntersection({ x: 0, y: 0 }, { x: 2000, y: 0 }, [
      segment("later", { x: 1500, y: -500 }, { x: 1500, y: 500 }),
      segment("first", { x: 700, y: -500 }, { x: 700, y: 500 }),
    ]);

    expect(result).toEqual({ x: 700, y: 0 });
  });

  it("preserves intersection classification across generated order and direction changes", () => {
    let seed = 0x5eed1234;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };

    for (let index = 0; index < 500; index += 1) {
      const x = Math.round(100 + random() * 4000);
      const y = Math.round(100 + random() * 4000);
      const halfWidth = Math.round(60 + random() * 900);
      const halfHeight = Math.round(60 + random() * 900);
      const horizontal = segment("h", { x: x - halfWidth, y }, { x: x + halfWidth, y });
      const vertical = segment("v", { x, y: y - halfHeight }, { x, y: y + halfHeight });
      const reversedHorizontal = { ...horizontal, start: horizontal.end, end: horizontal.start };
      const reversedVertical = { ...vertical, start: vertical.end, end: vertical.start };

      expect(classifySegmentIntersection(horizontal, vertical).kind).toBe("CROSSING");
      expect(classifySegmentIntersection(vertical, horizontal).kind).toBe("CROSSING");
      expect(classifySegmentIntersection(reversedHorizontal, reversedVertical).kind).toBe(
        "CROSSING",
      );
    }
  });
});
