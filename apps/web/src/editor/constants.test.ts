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

  it("uses pastel standard colors and stronger rebound colors for the same twin-bar heights", () => {
    expect(getSegmentColor(createTwinBarSpec("1.2m", "STANDARD"))).toBe("#c8c29b");
    expect(getSegmentColor(createTwinBarSpec("1.2m", "SUPER_REBOUND"))).toBe("#9e8444");
    expect(getSegmentColor(createTwinBarSpec("2m", "STANDARD"))).toBe("#86aabd");
    expect(getSegmentColor(createTwinBarSpec("2m", "SUPER_REBOUND"))).toBe("#3d6e92");
  });
});
