import { describe, expect, it } from "vitest";

import { renderHookServer } from "./test/renderHookServer.js";
import { usePortalFeedbackState } from "./usePortalFeedbackState.js";

describe("usePortalFeedbackState", () => {
  it("starts with empty feedback messages", () => {
    const state = renderHookServer(() => usePortalFeedbackState());

    expect(state.errorMessage).toBeNull();
    expect(state.noticeMessage).toBeNull();
  });

  it("exposes setters and a clear callback", () => {
    const state = renderHookServer(() => usePortalFeedbackState());

    expect(typeof state.setErrorMessage).toBe("function");
    expect(typeof state.setNoticeMessage).toBe("function");
    expect(() => state.clearMessages()).not.toThrow();
  });
});
