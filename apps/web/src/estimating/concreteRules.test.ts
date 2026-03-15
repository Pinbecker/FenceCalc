import { describe, expect, it } from "vitest";

import {
  calculateConcreteVolumeFromDimensionsMm,
  calculateFenceConcreteVolumeM3,
  calculateFloodlightConsumables,
  getConcreteRuleForHeight
} from "./concreteRules.js";

describe("concreteRules", () => {
  it("converts millimetre dimensions to cubic metres", () => {
    expect(calculateConcreteVolumeFromDimensionsMm({ depthMm: 1000, widthMm: 500, lengthMm: 500 })).toBe(0.25);
  });

  it("builds fence concrete volume from post counts by height", () => {
    const rule = getConcreteRuleForHeight("2m");
    const perPostVolume = calculateConcreteVolumeFromDimensionsMm(rule);

    expect(calculateFenceConcreteVolumeM3({ "2000": 3 })).toBeCloseTo(perPostVolume * 3, 6);
  });

  it("calculates provisional floodlight consumables", () => {
    expect(calculateFloodlightConsumables(0)).toEqual({ bolts: 0, chemfixTubes: 0 });
    expect(calculateFloodlightConsumables(2)).toEqual({ bolts: 8, chemfixTubes: 12 });
  });
});
