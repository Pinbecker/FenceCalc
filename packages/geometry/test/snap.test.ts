import { describe, expect, it } from "vitest";

import { distanceMm, snapPointToAngle } from "../src/snap.js";

describe("snapPointToAngle", () => {
  it("snaps to the nearest 5 degree increment", () => {
    const start = { x: 0, y: 0 };
    const rawEnd = { x: 1000, y: 123 };
    const snapped = snapPointToAngle(start, rawEnd, 5);
    const angle = (Math.atan2(snapped.y, snapped.x) * 180) / Math.PI;
    expect(Math.round(angle)).toBe(5);
  });

  it("preserves distance from start", () => {
    const start = { x: 20, y: 40 };
    const rawEnd = { x: 1400, y: 990 };
    const snapped = snapPointToAngle(start, rawEnd, 5);
    const before = distanceMm(start, rawEnd);
    const after = distanceMm(start, snapped);
    expect(Math.abs(before - after)).toBeLessThan(2);
  });
});

