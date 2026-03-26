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
    expect(walk.yaw).toBe(0);
  });

  it("moves and turns the walk camera with pointer and keyboard input", () => {
    const baseWalk = buildDefaultWalkState(scene);
    const lookedWalk = applyWalkPointerDelta(baseWalk, 20, -10);
    const movedWalk = applyWalkKeyboardInput(baseWalk, "w");
    const strafedWalk = applyWalkKeyboardInput(baseWalk, "d");

    expect(lookedWalk.yaw).toBeLessThan(baseWalk.yaw);
    expect(lookedWalk.pitch).toBeLessThan(baseWalk.pitch);
    expect(movedWalk.z).toBeGreaterThan(baseWalk.z);
    expect(strafedWalk.x).toBeGreaterThan(baseWalk.x);
  });

  it("starts from the long-side edge and looks inward on wide pitches", () => {
    const wideScene: Optimization3DScene = {
      ...scene,
      bounds: {
        minX: 0,
        maxX: 24000,
        minZ: 0,
        maxZ: 12000,
        maxHeightMm: 5000
      }
    };

    const walk = buildDefaultWalkState(wideScene);

    expect(walk.x).toBeGreaterThan(wideScene.bounds.minX);
    expect(walk.x).toBeLessThan(wideScene.bounds.maxX / 2);
    expect(walk.z).toBe(6000);
    expect(walk.yaw).toBeGreaterThan(1.4);
    expect(walk.yaw).toBeLessThan(1.7);
  });

  it("accepts a larger custom movement step for bigger pitches", () => {
    const baseWalk = buildDefaultWalkState(scene);
    const movedWalk = applyWalkKeyboardInput(baseWalk, "w", 640);

    expect(Math.round(movedWalk.z - baseWalk.z)).toBe(640);
  });

  it("adjusts walk eye height from the wheel input", () => {
    const baseWalk = buildDefaultWalkState(scene);
    const raisedWalk = applyWalkWheelDelta(baseWalk, -120);
    const loweredWalk = applyWalkWheelDelta(baseWalk, 120);

    expect(raisedWalk.eyeHeightMm).toBeGreaterThan(baseWalk.eyeHeightMm);
    expect(loweredWalk.eyeHeightMm).toBeLessThan(baseWalk.eyeHeightMm);
  });
});
