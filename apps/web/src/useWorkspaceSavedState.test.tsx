import { describe, expect, it } from "vitest";

import { renderHookServer } from "./test/renderHookServer.js";
import { useWorkspaceSavedState } from "./useWorkspaceSavedState.js";

describe("useWorkspaceSavedState", () => {
  it("treats an empty draft as clean", () => {
    const result = renderHookServer(() => useWorkspaceSavedState({ segments: [], gates: [] }, null, "", ""));

    expect(result.isDirty).toBe(false);
  });

  it("treats a named unsaved draft as dirty and exposes save tracking callbacks", () => {
    const result = renderHookServer(() => useWorkspaceSavedState({ segments: [], gates: [] }, null, "Draft", "Customer"));

    expect(result.isDirty).toBe(true);
    expect(() => result.rememberSavedState({ segments: [], gates: [] }, "Draft", "Customer")).not.toThrow();
    expect(() => result.resetSavedState()).not.toThrow();
  });
});
