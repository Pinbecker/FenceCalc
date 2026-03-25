import { describe, expect, it, vi } from "vitest";

import { InMemoryLoginAttemptLimiter, InMemoryWriteRequestLimiter } from "./security.js";

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

describe("InMemoryLoginAttemptLimiter", () => {
  it("locks after repeated failed attempts and resets after success", () => {
    const limiter = new InMemoryLoginAttemptLimiter(1000, 2, 5000);

    expect(limiter.recordFailure("owner@example.com")).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(limiter.recordFailure("owner@example.com")).toEqual({ allowed: false, retryAfterMs: 5000 });
    expect(limiter.getStatus("owner@example.com").allowed).toBe(false);

    limiter.recordSuccess("owner@example.com");

    expect(limiter.getStatus("owner@example.com")).toEqual({ allowed: true, retryAfterMs: 0 });
  });

  it("unlocks after the lockout period expires", () => {
    vi.useFakeTimers();
    const limiter = new InMemoryLoginAttemptLimiter(1000, 1, 5000);

    expect(limiter.recordFailure("owner@example.com")).toEqual({ allowed: false, retryAfterMs: 5000 });
    expect(limiter.getStatus("owner@example.com").allowed).toBe(false);

    vi.advanceTimersByTime(5001);

    expect(limiter.getStatus("owner@example.com")).toEqual({ allowed: true, retryAfterMs: 0 });
    vi.useRealTimers();
  });
});
