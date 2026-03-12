import { describe, expect, it } from "vitest";

import type { FenceSpec } from "@fence-estimator/contracts";

import { getSegmentColor } from "./constants.js";

function createTwinBarSpec(height: FenceSpec["height"], twinBarVariant: "STANDARD" | "SUPER_REBOUND"): FenceSpec {
  return {
    system: "TWIN_BAR",
    height,
    twinBarVariant
  };
}

describe("editor constants", () => {
  it("uses pastel standard colors and stronger rebound colors for the same twin-bar heights", () => {
    expect(getSegmentColor(createTwinBarSpec("1.2m", "STANDARD"))).toBe("#f6e58d");
    expect(getSegmentColor(createTwinBarSpec("1.2m", "SUPER_REBOUND"))).toBe("#d4a700");
    expect(getSegmentColor(createTwinBarSpec("2m", "STANDARD"))).toBe("#a9d6ff");
    expect(getSegmentColor(createTwinBarSpec("2m", "SUPER_REBOUND"))).toBe("#1d6fd6");
  });
});
