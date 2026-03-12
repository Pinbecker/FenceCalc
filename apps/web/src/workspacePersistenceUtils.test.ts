import { describe, expect, it, vi } from "vitest";

import { buildDefaultDrawingName, isEmptyLayout, normalizeLayout } from "./workspacePersistenceUtils.js";

describe("workspacePersistenceUtils", () => {
  it("builds a default drawing name from the current timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T09:15:00.000Z"));

    expect(buildDefaultDrawingName()).toBe("Drawing 2026-03-12 0915");

    vi.useRealTimers();
  });

  it("detects whether a layout is empty", () => {
    expect(isEmptyLayout({ segments: [], gates: [] })).toBe(true);
    expect(
      isEmptyLayout({
        segments: [
          {
            id: "segment-1",
            start: { x: 0, y: 0 },
            end: { x: 1000, y: 0 },
            spec: { system: "TWIN_BAR", height: "2m" }
          }
        ]
      }),
    ).toBe(false);
  });

  it("normalizes missing gates to an empty list", () => {
    expect(
      normalizeLayout({
        segments: [
          {
            id: "segment-1",
            start: { x: 0, y: 0 },
            end: { x: 1000, y: 0 },
            spec: { system: "TWIN_BAR", height: "2m" }
          }
        ]
      }),
    ).toEqual({
      segments: [
        {
          id: "segment-1",
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m" }
        }
      ],
      gates: []
    });
  });
});
