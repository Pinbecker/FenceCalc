import { describe, expect, it } from "vitest";

import { buildCanvasGrid, buildVisibleBounds, screenToWorld, zoomViewportAtPointer } from "./canvasViewport.js";

describe("canvasViewport", () => {
  it("converts screen coordinates into world coordinates", () => {
    expect(screenToWorld({ x: 260, y: 180 }, { x: 60, y: 30, scale: 2 })).toEqual({
      x: 100,
      y: 75
    });
  });

  it("builds visible bounds from the current viewport", () => {
    expect(buildVisibleBounds(1000, 800, { x: 100, y: 200, scale: 0.5 })).toEqual({
      left: -200,
      right: 1800,
      top: -400,
      bottom: 1200
    });
  });

  it("builds grid lines across the current visible bounds", () => {
    const grid = buildCanvasGrid(
      {
        left: -250,
        right: 750,
        top: -250,
        bottom: 250
      },
      0.2,
      () => 250,
    );

    expect(grid.gridStepMm).toBe(250);
    expect(grid.majorGridStepMm).toBe(1250);
    expect(grid.verticalLines.map((line) => line.coordinate)).toEqual([-250, 0, 250, 500, 750]);
    expect(grid.horizontalLines.map((line) => line.coordinate)).toEqual([-250, 0, 250]);
  });

  it("zooms around the pointer focus point", () => {
    const nextViewport = zoomViewportAtPointer(
      { x: 120, y: 80, scale: 0.5 },
      { x: 400, y: 300 },
      -1,
      0.1,
      3,
    );

    expect(nextViewport.scale).toBeCloseTo(0.54);
    expect(nextViewport.x).toBeCloseTo(97.6);
    expect(nextViewport.y).toBeCloseTo(62.4);
  });
});
