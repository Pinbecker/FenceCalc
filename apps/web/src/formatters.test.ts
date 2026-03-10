import { describe, expect, it } from "vitest";

import { formatDistanceLabel, formatHeightLabelFromMm, formatLengthMm, formatMetersInputFromMm, formatPointMeters } from "./formatters.js";

describe("formatters", () => {
  it("formats lengths and meter inputs consistently", () => {
    expect(formatLengthMm(2525)).toBe("2.52m");
    expect(formatMetersInputFromMm(1800)).toBe("1.80");
  });

  it("formats points and heights", () => {
    expect(formatPointMeters({ x: 1500, y: 3250 })).toBe("1.50m, 3.25m");
    expect(formatHeightLabelFromMm(3000)).toBe("3m");
    expect(formatHeightLabelFromMm(2400)).toBe("2.4m");
  });

  it("formats long distances differently from short ones", () => {
    expect(formatDistanceLabel(9500)).toBe("9.5m");
    expect(formatDistanceLabel(12000)).toBe("12m");
    expect(formatDistanceLabel(1200000)).toBe("1.2km");
  });
});
