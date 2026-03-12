import { describe, expect, it, vi } from "vitest";

import { renderHookServer } from "../test/renderHookServer.js";
import { useEditorNavigationGuards } from "./useEditorNavigationGuards.js";

describe("useEditorNavigationGuards", () => {
  it("allows navigation immediately when the editor is clean", () => {
    const onNavigate = vi.fn();
    const windowStub = {
      confirm: vi.fn(() => true),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    Object.assign(globalThis, { window: windowStub });

    const state = renderHookServer(() => useEditorNavigationGuards({ isDirty: false, onNavigate }));

    expect(state.confirmDiscardChanges("ignore")).toBe(true);
    state.guardedNavigate("drawings");
    expect(onNavigate).toHaveBeenCalledWith("drawings", undefined);
  });

  it("prompts before navigating away from a dirty editor", () => {
    const onNavigate = vi.fn();
    const windowStub = {
      confirm: vi.fn(() => false),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    Object.assign(globalThis, { window: windowStub });

    const state = renderHookServer(() => useEditorNavigationGuards({ isDirty: true, onNavigate }));

    expect(state.confirmDiscardChanges("Discard?")).toBe(false);
    state.guardedNavigate("dashboard");
    expect(windowStub.confirm).toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
