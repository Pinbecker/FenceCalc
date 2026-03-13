import { useCallback, useEffect, useRef } from "react";
import type { DrawingCanvasViewport, DrawingRecord, LayoutModel } from "@fence-estimator/contracts";

import { shouldLoadInitialDrawing } from "../initialDrawingLoad";
import { useWorkspacePersistence } from "../useWorkspacePersistence";

interface UseEditorWorkspaceBridgeOptions {
  getSavedViewport: () => DrawingCanvasViewport | null;
  layout: LayoutModel;
  initialDrawingId: string | null;
  onResetLayout: (layout: LayoutModel) => void;
  onResetEditorState: () => void;
  onRestoreViewport: (viewport: DrawingCanvasViewport | null) => void;
}

export function useEditorWorkspaceBridge({
  getSavedViewport,
  layout,
  initialDrawingId,
  onResetLayout,
  onResetEditorState,
  onRestoreViewport
}: UseEditorWorkspaceBridgeOptions) {
  const requestedInitialDrawingIdRef = useRef<string | null>(null);

  const loadWorkspaceDrawing = useCallback(
    (drawing: DrawingRecord) => {
      onResetLayout({
        segments: drawing.layout.segments,
        gates: drawing.layout.gates ?? [],
        basketballPosts: drawing.layout.basketballPosts ?? []
      });
      onResetEditorState();
      onRestoreViewport(drawing.savedViewport ?? null);
    },
    [onResetEditorState, onResetLayout, onRestoreViewport],
  );

  const workspace = useWorkspacePersistence({
    getSavedViewport,
    layout,
    onLoadDrawing: loadWorkspaceDrawing
  });

  useEffect(() => {
    const requestedDrawingId = initialDrawingId;
    if (
      !shouldLoadInitialDrawing({
        requestedDrawingId,
        currentDrawingId: workspace.currentDrawingId,
        lastRequestedDrawingId: requestedInitialDrawingIdRef.current,
        hasSession: workspace.session !== null,
        isRestoringSession: workspace.isRestoringSession
      })
    ) {
      if (!requestedDrawingId) {
        requestedInitialDrawingIdRef.current = null;
      } else if (workspace.currentDrawingId === requestedDrawingId) {
        requestedInitialDrawingIdRef.current = requestedDrawingId;
      }
      return;
    }

    if (!requestedDrawingId) {
      return;
    }

    requestedInitialDrawingIdRef.current = requestedDrawingId;
    void workspace.loadDrawing(requestedDrawingId);
  }, [
    initialDrawingId,
    workspace.currentDrawingId,
    workspace.isRestoringSession,
    workspace.loadDrawing,
    workspace.session
  ]);

  return workspace;
}
