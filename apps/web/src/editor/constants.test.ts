import { describe, expect, it } from "vitest";

import type { FenceSpec } from "@fence-estimator/contracts";

import { defaultFenceSpec, getSegmentColor } from "./constants.js";

function createTwinBarSpec(height: FenceSpec["height"], twinBarVariant: "STANDARD" | "SUPER_REBOUND"): FenceSpec {
  return {
    system: "TWIN_BAR",
    height,
    twinBarVariant
  };
}

describe("editor constants", () => {
  it("defaults new work to 3m standard twin-bar", () => {
    expect(defaultFenceSpec()).toEqual({
      system: "TWIN_BAR",
      height: "3m",
      twinBarVariant: "STANDARD"
    });
  });

  it("uses height-based hues with pastel standard and royal super rebound variants", () => {
    expect(getSegmentColor(createTwinBarSpec("1.2m", "STANDARD"))).toBe("#f0e4a4");
    expect(getSegmentColor(createTwinBarSpec("1.2m", "SUPER_REBOUND"))).toBe("#d4af1f");
    expect(getSegmentColor(createTwinBarSpec("2m", "STANDARD"))).toBe("#a9d6ff");
    expect(getSegmentColor(createTwinBarSpec("2m", "SUPER_REBOUND"))).toBe("#2f6bff");
    expect(getSegmentColor(createTwinBarSpec("4.5m", "STANDARD"))).toBe("#f5b7d5");
    expect(getSegmentColor(createTwinBarSpec("4.5m", "SUPER_REBOUND"))).toBe("#c2458b");
    expect(getSegmentColor({ system: "ROLL_FORM", height: "2m" })).toBe("#a9d6ff");
    expect(getSegmentColor({ system: "ROLL_FORM", height: "3m" })).toBe("#ffbfab");
  });
});
