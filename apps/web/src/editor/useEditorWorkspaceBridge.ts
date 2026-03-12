import { useCallback, useEffect, useRef } from "react";
import type { LayoutModel } from "@fence-estimator/contracts";

import { shouldLoadInitialDrawing } from "../initialDrawingLoad";
import { useWorkspacePersistence } from "../useWorkspacePersistence";

interface UseEditorWorkspaceBridgeOptions {
  layout: LayoutModel;
  initialDrawingId: string | null;
  onResetLayout: (layout: LayoutModel) => void;
  onResetEditorState: () => void;
}

export function useEditorWorkspaceBridge({
  layout,
  initialDrawingId,
  onResetLayout,
  onResetEditorState
}: UseEditorWorkspaceBridgeOptions) {
  const requestedInitialDrawingIdRef = useRef<string | null>(null);

  const loadWorkspaceLayout = useCallback(
    (nextLayout: LayoutModel) => {
      onResetLayout({
        segments: nextLayout.segments,
        gates: nextLayout.gates ?? []
      });
      onResetEditorState();
    },
    [onResetEditorState, onResetLayout],
  );

  const workspace = useWorkspacePersistence({
    layout,
    onLoadLayout: loadWorkspaceLayout
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
