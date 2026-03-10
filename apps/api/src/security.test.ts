import { describe, expect, it, vi } from "vitest";

import { InMemoryWriteRequestLimiter } from "./security.js";

describe("InMemoryWriteRequestLimiter", () => {
  it("blocks requests over the configured budget within the active window", () => {
    const limiter = new InMemoryWriteRequestLimiter(1000, 2);

    expect(limiter.allow("client-a")).toBe(true);
    expect(limiter.allow("client-a")).toBe(true);
    expect(limiter.allow("client-a")).toBe(false);
  });

  it("resets the budget after the window expires", () => {
    vi.useFakeTimers();
    const limiter = new InMemoryWriteRequestLimiter(1000, 1);

    expect(limiter.allow("client-a")).toBe(true);
    expect(limiter.allow("client-a")).toBe(false);

    vi.advanceTimersByTime(1001);

    expect(limiter.allow("client-a")).toBe(true);
    vi.useRealTimers();
  });
});
