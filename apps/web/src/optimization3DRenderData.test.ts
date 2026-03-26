import { describe, expect, it } from "vitest";

import type { LayoutSegment, TwinBarOptimizationPlan } from "@fence-estimator/contracts";

import { buildOptimization3DScene } from "./optimization3D.js";
import { buildOptimization3DRenderData, DEFAULT_ORBIT } from "./optimization3DRenderData.js";

function parsePointString(value: string): Array<[number, number]> {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => token.split(",").map(Number) as [number, number])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

describe("buildOptimization3DRenderData", () => {
  it("builds sorted scene faces, strokes, and badges for an active reuse plan", () => {
    const segment: LayoutSegment = {
      id: "seg-render",
      start: { x: 0, y: 0 },
      end: { x: 2525, y: 0 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
    };
    const plan: TwinBarOptimizationPlan = {
      id: "plan-render",
      variant: "STANDARD",
      stockPanelHeightMm: 2000,
      stockPanelWidthMm: 2525,
      consumedMm: 1200,
      leftoverMm: 1325,
      reusableLeftoverMm: 1325,
      reusedCuts: 1,
      panelsSaved: 0,
      cuts: [
        {
          id: "plan-render-cut-1",
          step: 1,
          mode: "OPEN_STOCK_PANEL",
          demand: { segmentId: "seg-render", startOffsetMm: 0, endOffsetMm: 700, lengthMm: 700 },
          lengthMm: 700,
          effectiveLengthMm: 900,
          offcutBeforeMm: 2525,
          offcutAfterMm: 1825
        },
        {
          id: "plan-render-cut-2",
          step: 2,
          mode: "REUSE_OFFCUT",
          demand: { segmentId: "seg-render", startOffsetMm: 700, endOffsetMm: 1200, lengthMm: 500 },
          lengthMm: 500,
          effectiveLengthMm: 700,
          offcutBeforeMm: 1825,
          offcutAfterMm: 1125
        }
      ]
    };

    const scene = buildOptimization3DScene([segment], [plan], new Map([["seg-render", 1]]));
    const renderData = buildOptimization3DRenderData(scene, DEFAULT_ORBIT, 920, 320);

    expect(renderData.faces[0]?.key).toBeDefined();
    expect(renderData.faces.some((face) => face.key === "ground")).toBe(true);
    expect(renderData.strokes.some((stroke) => stroke.key.includes("grid-"))).toBe(true);
    expect(renderData.badges).toHaveLength(2);
    expect(renderData.badges[0]?.segmentLabel).toBe("S1");
    expect(renderData.faces.every((face) => Number.isFinite(face.depth))).toBe(true);
    expect(renderData.strokes.every((stroke) => Number.isFinite(stroke.depth))).toBe(true);
  });

  it("renders gates with a distinct blue palette", () => {
    const renderData = buildOptimization3DRenderData(
      {
        panelSlices: [],
        posts: [],
        rails: [],
        basketballPosts: [],
        floodlightColumns: [],
        cutOverlays: [],
        reuseLinks: [],
        gates: [
          {
            key: "gate-1",
            start: { x: 0, y: 0 },
            end: { x: 1200, y: 0 },
            center: { x: 600, y: 0 },
            normal: { x: 0, y: 1 },
            heightMm: 2000,
            leafCount: 1
          }
        ],
        bounds: {
          minX: 0,
          maxX: 1200,
          minZ: -600,
          maxZ: 600,
          maxHeightMm: 2000
        }
      },
      DEFAULT_ORBIT,
      920,
      320
    );

    const gateFace = renderData.faces.find((face) => face.key === "gate-1-leaf-0-front");
    expect(gateFace?.fill).toBe("rgba(67, 112, 189, 0.72)");
  });

  it("supports a walk camera for first-person pitch views", () => {
    const renderData = buildOptimization3DRenderData(
      {
        panelSlices: [],
        posts: [],
        rails: [],
        basketballPosts: [],
        floodlightColumns: [],
        cutOverlays: [],
        reuseLinks: [],
        gates: [
          {
            key: "gate-walk",
            start: { x: -600, y: 3200 },
            end: { x: 600, y: 3200 },
            center: { x: 0, y: 3200 },
            normal: { x: 0, y: 1 },
            heightMm: 2000,
            leafCount: 1
          }
        ],
        bounds: {
          minX: -1200,
          maxX: 1200,
          minZ: 0,
          maxZ: 5000,
          maxHeightMm: 2000
        }
      },
      {
        x: 0,
        z: 400,
        eyeHeightMm: 1700,
        yaw: 0,
        pitch: 0.04
      },
      920,
      320
    );

    expect(renderData.faces.some((face) => face.key === "gate-walk-leaf-0-front")).toBe(true);
    expect(renderData.faces.every((face) => face.points.length > 0)).toBe(true);
    expect(renderData.strokes.every((stroke) => Number.isFinite(stroke.depth))).toBe(true);
  });

  it("clips walk-view geometry at the near plane instead of stretching it through the camera", () => {
    const renderData = buildOptimization3DRenderData(
      {
        panelSlices: [],
        posts: [],
        rails: [],
        basketballPosts: [],
        floodlightColumns: [],
        cutOverlays: [],
        reuseLinks: [],
        gates: [
          {
            key: "gate-clip",
            start: { x: -800, y: 120 },
            end: { x: 800, y: 120 },
            center: { x: 0, y: 120 },
            normal: { x: 0, y: 1 },
            heightMm: 2000,
            leafCount: 1
          }
        ],
        bounds: {
          minX: -1200,
          maxX: 1200,
          minZ: -800,
          maxZ: 2200,
          maxHeightMm: 2000
        }
      },
      {
        x: 0,
        z: 0,
        eyeHeightMm: 1700,
        yaw: 0,
        pitch: 0
      },
      920,
      320
    );

    const gateFace = renderData.faces.find((face) => face.key === "gate-clip-leaf-0-side");
    const gateFacePoints = parsePointString(gateFace?.points ?? "");

    expect(gateFacePoints.length).toBeGreaterThanOrEqual(3);
    expect(gateFacePoints.every(([x, y]) => Math.abs(x) < 6000 && Math.abs(y) < 6000)).toBe(true);
  });

  it("renders standalone basketball posts with a fixed hoop marker instead of a scaled ring", () => {
    const renderData = buildOptimization3DRenderData(
      {
        panelSlices: [],
        posts: [],
        rails: [],
        basketballPosts: [
          {
            key: "bp-1",
            point: { x: 0, y: 0 },
            normal: { x: 0, y: 1 },
            heightMm: 3250,
            armLengthMm: 1800,
            hoopRadiusMm: 180
          }
        ],
        floodlightColumns: [],
        cutOverlays: [],
        reuseLinks: [],
        gates: [],
        bounds: {
          minX: -2000,
          maxX: 2000,
          minZ: -2000,
          maxZ: 2000,
          maxHeightMm: 3250
        }
      },
      DEFAULT_ORBIT,
      920,
      320
    );

    expect(renderData.faces.some((face) => face.key === "bp-1-backboard")).toBe(true);
    expect(renderData.faces.some((face) => face.key === "bp-1-hoop")).toBe(true);
    expect(renderData.strokes.some((stroke) => stroke.key === "bp-1-hoop")).toBe(false);
  });
});
