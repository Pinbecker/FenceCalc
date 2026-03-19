import { describe, expect, it } from "vitest";

import type { Optimization3DScene } from "./optimization3D.js";
import { applyWalkKeyboardInput, applyWalkPointerDelta, applyWalkWheelDelta, buildDefaultWalkState } from "./useOptimization3DWalk.js";

const scene: Optimization3DScene = {
  panelSlices: [],
  posts: [],
  rails: [],
  gates: [],
  basketballPosts: [],
  floodlightColumns: [],
  goalUnits: [],
  kickboards: [],
  pitchDividers: [],
  sideNettings: [],
  cutOverlays: [],
  reuseLinks: [],
  bounds: {
    minX: 0,
    maxX: 12000,
    minZ: 0,
    maxZ: 24000,
    maxHeightMm: 5000
  }
};

describe("useOptimization3DWalk helpers", () => {
  it("builds a default walk position inside the pitch bounds", () => {
    const walk = buildDefaultWalkState(scene);

    expect(walk.x).toBe(6000);
    expect(walk.z).toBeGreaterThan(scene.bounds.minZ);
    expect(walk.z).toBeLessThan(scene.bounds.maxZ);
    expect(walk.eyeHeightMm).toBe(1700);
  });

  it("moves and turns the walk camera with pointer and keyboard input", () => {
    const baseWalk = buildDefaultWalkState(scene);
    const lookedWalk = applyWalkPointerDelta(baseWalk, 20, -10);
    const movedWalk = applyWalkKeyboardInput(baseWalk, "w");
    const strafedWalk = applyWalkKeyboardInput(baseWalk, "d");

    expect(lookedWalk.yaw).toBeGreaterThan(baseWalk.yaw);
    expect(lookedWalk.pitch).toBeGreaterThan(baseWalk.pitch);
    expect(movedWalk.z).toBeGreaterThan(baseWalk.z);
    expect(strafedWalk.x).toBeGreaterThan(baseWalk.x);
  });

  it("adjusts walk eye height from the wheel input", () => {
    const baseWalk = buildDefaultWalkState(scene);
    const raisedWalk = applyWalkWheelDelta(baseWalk, -120);
    const loweredWalk = applyWalkWheelDelta(baseWalk, 120);

    expect(raisedWalk.eyeHeightMm).toBeGreaterThan(baseWalk.eyeHeightMm);
    expect(loweredWalk.eyeHeightMm).toBeLessThan(baseWalk.eyeHeightMm);
  });
});
