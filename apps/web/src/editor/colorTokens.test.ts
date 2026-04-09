import { describe, expect, it } from "vitest";

import { getDetailLevel, shouldShowIntermediatePosts, shouldShowPosts } from "./colorTokens.js";

describe("editor color tokens", () => {
  it("keeps post markers visible across all zoom detail levels", () => {
    expect(shouldShowPosts(getDetailLevel(0.2))).toBe(true);
    expect(shouldShowPosts(getDetailLevel(0.08))).toBe(true);
    expect(shouldShowPosts(getDetailLevel(0.03))).toBe(true);
    expect(shouldShowPosts(getDetailLevel(0.01))).toBe(true);
  });

  it("keeps intermediate posts visible when zoomed out", () => {
    expect(shouldShowIntermediatePosts(getDetailLevel(0.2))).toBe(true);
    expect(shouldShowIntermediatePosts(getDetailLevel(0.08))).toBe(true);
    expect(shouldShowIntermediatePosts(getDetailLevel(0.03))).toBe(true);
    expect(shouldShowIntermediatePosts(getDetailLevel(0.01))).toBe(true);
  });
});
