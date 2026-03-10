import { describe, expect, it } from "vitest";

import { angleBetweenDegrees, areOpposite, cross, dot, magnitude, normalize, subtract } from "../src/vector.js";

describe("vector utilities", () => {
  it("subtracts points into a vector", () => {
    expect(subtract({ x: 12, y: 9 }, { x: 2, y: 4 })).toEqual({ x: 10, y: 5 });
  });

  it("computes dot, cross, and magnitude", () => {
    const a = { x: 3, y: 4 };
    const b = { x: -4, y: 3 };

    expect(dot(a, b)).toBe(0);
    expect(cross(a, b)).toBe(25);
    expect(magnitude(a)).toBe(5);
  });

  it("normalizes non-zero vectors and clamps zero vectors", () => {
    expect(normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("measures angle and opposite vectors correctly", () => {
    expect(angleBetweenDegrees({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 6);
    expect(angleBetweenDegrees({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0);
    expect(areOpposite({ x: 1, y: 0 }, { x: -1, y: 0 })).toBe(true);
    expect(areOpposite({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(false);
  });
});
