import { describe, expect, it } from "vitest";

import { renderHookServer } from "../test/renderHookServer.js";
import { useEditorSelectionState } from "./useEditorSelectionState.js";

describe("useEditorSelectionState", () => {
  it("returns the default transient editor selection state", () => {
    const state = renderHookServer(() => useEditorSelectionState("DRAW"));

    expect(state.drawStart).toBeNull();
    expect(state.rectangleStart).toBeNull();
    expect(state.selectedSegmentId).toBeNull();
    expect(state.selectedGateId).toBeNull();
    expect(state.selectedBasketballPostId).toBeNull();
    expect(state.isLengthEditorOpen).toBe(false);
    expect(state.selectedLengthInputM).toBe("");
  });

  it("exposes reset helpers for loaded workspaces and history changes", () => {
    const state = renderHookServer(() => useEditorSelectionState("SELECT"));

    expect(() => state.resetLoadedWorkspaceState()).not.toThrow();
    expect(() => state.clearHistorySelection()).not.toThrow();
  });
});
