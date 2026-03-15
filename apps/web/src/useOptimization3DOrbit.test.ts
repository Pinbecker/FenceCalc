import { describe, expect, it } from "vitest";

import { DEFAULT_ORBIT } from "./optimization3DRenderData.js";
import { applyOrbitKeyboardInput, applyOrbitPointerDelta, applyOrbitWheelDelta } from "./useOptimization3DOrbit.js";

describe("useOptimization3DOrbit helpers", () => {
  it("applies rotate and pan pointer deltas", () => {
    expect(applyOrbitPointerDelta(DEFAULT_ORBIT, 20, -10, "rotate")).toMatchObject({
      yaw: DEFAULT_ORBIT.yaw - 20 * 0.0052
    });
    expect(applyOrbitPointerDelta(DEFAULT_ORBIT, 20, -10, "pan")).toMatchObject({
      panX: DEFAULT_ORBIT.panX + 20,
      panY: DEFAULT_ORBIT.panY - 10
    });
  });

  it("clamps keyboard pitch and resets to the default orbit", () => {
    const pitchedUp = applyOrbitKeyboardInput({ ...DEFAULT_ORBIT, pitch: 0.21 }, "ArrowUp");
    expect(pitchedUp.pitch).toBeGreaterThanOrEqual(0.2);

    const pitchedDown = applyOrbitKeyboardInput({ ...DEFAULT_ORBIT, pitch: 1.08 }, "ArrowDown");
    expect(pitchedDown.pitch).toBeLessThanOrEqual(1.1);

    expect(applyOrbitKeyboardInput({ ...DEFAULT_ORBIT, yaw: 1.5 }, "0")).toEqual(DEFAULT_ORBIT);
  });

  it("updates zoom and keyboard pan shortcuts", () => {
    expect(applyOrbitWheelDelta(DEFAULT_ORBIT, 120).zoom).toBeLessThan(DEFAULT_ORBIT.zoom);
    expect(applyOrbitWheelDelta(DEFAULT_ORBIT, -120).zoom).toBeGreaterThan(DEFAULT_ORBIT.zoom);
    expect(applyOrbitKeyboardInput(DEFAULT_ORBIT, "A").panX).toBe(DEFAULT_ORBIT.panX - 24);
    expect(applyOrbitKeyboardInput(DEFAULT_ORBIT, "s").panY).toBe(DEFAULT_ORBIT.panY + 24);
  });
});
