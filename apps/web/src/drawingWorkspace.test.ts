import { describe, expect, it } from "vitest";

import {
  buildDrawingWorkspaceQuery,
  resolveDrawingWorkspaceLoadTarget,
} from "./drawingWorkspace.js";

describe("drawing workspace helpers", () => {
  it("loads the requested drawing while keeping the explicit workspace lookup", () => {
    expect(
      resolveDrawingWorkspaceLoadTarget({
        targetId: "workspace-1",
        requestedDrawingId: "drawing-2",
        query: { workspaceId: "workspace-1", drawingId: "drawing-2" },
      }),
    ).toEqual({
      workspaceLookupId: "workspace-1",
    });
  });

  it("falls back to the drawing-derived workspace when the route only has a drawing id", () => {
    expect(
      resolveDrawingWorkspaceLoadTarget({
        targetId: "drawing-2",
        requestedDrawingId: "drawing-2",
        query: { drawingId: "drawing-2" },
        resolvedDrawingWorkspaceId: "workspace-1",
      }),
    ).toEqual({
      workspaceLookupId: "workspace-1",
    });
  });

  it("keeps workspaceId in canonical workspace navigation queries", () => {
    expect(
      buildDrawingWorkspaceQuery({
        workspaceId: "workspace-1",
        drawingId: "drawing-2",
        estimateDrawingId: "drawing-2",
        focusTaskId: "task-3",
      }),
    ).toEqual({
      workspaceId: "workspace-1",
      drawingId: "drawing-2",
      estimateDrawingId: "drawing-2",
      focusTaskId: "task-3",
    });
  });
});
