import { describe, expect, it } from "vitest";

import { shouldLoadInitialDrawing } from "./initialDrawingLoad.js";

describe("shouldLoadInitialDrawing", () => {
  it("loads a requested drawing once when the session is ready", () => {
    expect(
      shouldLoadInitialDrawing({
        requestedDrawingId: "drawing-1",
        currentDrawingId: null,
        lastRequestedDrawingId: null,
        hasSession: true,
        isRestoringSession: false
      }),
    ).toBe(true);
  });

  it("does not reload the same requested drawing after it has been requested once", () => {
    expect(
      shouldLoadInitialDrawing({
        requestedDrawingId: "drawing-1",
        currentDrawingId: null,
        lastRequestedDrawingId: "drawing-1",
        hasSession: true,
        isRestoringSession: false
      }),
    ).toBe(false);
  });

  it("does not load while the session is restoring", () => {
    expect(
      shouldLoadInitialDrawing({
        requestedDrawingId: "drawing-1",
        currentDrawingId: null,
        lastRequestedDrawingId: null,
        hasSession: true,
        isRestoringSession: true
      }),
    ).toBe(false);
  });

  it("does not reload when the requested drawing is already current", () => {
    expect(
      shouldLoadInitialDrawing({
        requestedDrawingId: "drawing-1",
        currentDrawingId: "drawing-1",
        lastRequestedDrawingId: null,
        hasSession: true,
        isRestoringSession: false
      }),
    ).toBe(false);
  });
});
