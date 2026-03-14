import { describe, expect, it } from "vitest";

import { renderHookServer } from "../test/renderHookServer.js";
import { useEditorShellState } from "./useEditorShellState.js";

describe("useEditorShellState", () => {
  it("returns the default editor shell state", () => {
    const state = renderHookServer(() => useEditorShellState());

    expect(state.interactionMode).toBe("DRAW");
    expect(state.activeSpec).toEqual({
      system: "TWIN_BAR",
      height: "3m",
      twinBarVariant: "STANDARD"
    });
    expect(state.recessWidthMm).toBe(7500);
    expect(state.recessDepthMm).toBe(2500);
    expect(state.gateType).toBe("SINGLE_LEAF");
    expect(state.selectedPlanId).toBeNull();
    expect(state.isOptimizationInspectorOpen).toBe(false);
    expect(state.isTutorialOpen).toBe(false);
  });

  it("exposes panel drag helpers and setters", () => {
    const state = renderHookServer(() => useEditorShellState());

    expect(typeof state.panelDragStyle).toBe("function");
    expect(typeof state.startPanelDrag).toBe("function");
    expect(typeof state.setInteractionMode).toBe("function");
    expect(typeof state.setSelectedPlanId).toBe("function");
  });
});
