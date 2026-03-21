import { describe, expect, it } from "vitest";

import type { LayoutModel } from "@fence-estimator/contracts";

import { renderHookServer } from "./test/renderHookServer.js";
import { useWorkspaceSavedState } from "./useWorkspaceSavedState.js";

const emptyLayout: LayoutModel = {
  segments: [],
  gates: [],
  basketballPosts: [],
  floodlightColumns: [],
  goalUnits: [],
  kickboards: [],
  pitchDividers: [],
  sideNettings: []
};

describe("useWorkspaceSavedState", () => {
  it("treats an empty draft as clean", () => {
    const result = renderHookServer(() => useWorkspaceSavedState(emptyLayout, null, "", null));

    expect(result.isDirty).toBe(false);
  });

  it("treats a named unsaved draft as dirty and exposes save tracking callbacks", () => {
    const result = renderHookServer(() => useWorkspaceSavedState(emptyLayout, null, "Draft", "customer-1"));

    expect(result.isDirty).toBe(true);
    expect(() => result.rememberSavedState(emptyLayout, "Draft", "customer-1")).not.toThrow();
    expect(() => result.resetSavedState()).not.toThrow();
  });
});
