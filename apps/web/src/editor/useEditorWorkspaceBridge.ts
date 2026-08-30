import { useCallback, useEffect, useRef } from "react";
import type { DrawingCanvasViewport, DrawingRecord, LayoutModel } from "@fence-estimator/contracts";

import { useWorkspacePersistence } from "../useWorkspacePersistence";

interface UseEditorWorkspaceBridgeOptions {
  getSavedViewport: () => DrawingCanvasViewport | null;
  layout: LayoutModel;
  initialDrawingId: string | null;
  initialRevisionId: string | null;
  onResetLayout: (layout: LayoutModel) => void;
  onResetEditorState: () => void;
  onRestoreViewport: (viewport: DrawingCanvasViewport | null) => void;
}

type LoadedDrawingPayload = DrawingRecord & {
  layout: LayoutModel;
  savedViewport: DrawingCanvasViewport | null;
};

export function useEditorWorkspaceBridge({
  getSavedViewport,
  layout,
  initialDrawingId,
  initialRevisionId,
  onResetLayout,
  onResetEditorState,
  onRestoreViewport
}: UseEditorWorkspaceBridgeOptions) {
  const requestedInitialDrawingKeyRef = useRef<string | null>(null);

  const loadWorkspaceDrawing = useCallback(
    (drawing: LoadedDrawingPayload) => {
      onResetLayout({
        segments: drawing.layout.segments,
        gates: drawing.layout.gates ?? [],
        basketballPosts: drawing.layout.basketballPosts ?? [],
        floodlightColumns: drawing.layout.floodlightColumns ?? [],
        goalUnits: drawing.layout.goalUnits ?? [],
        kickboards: drawing.layout.kickboards ?? [],
        pitchDividers: drawing.layout.pitchDividers ?? [],
        sideNettings: drawing.layout.sideNettings ?? []
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
    if (!initialDrawingId) {
      requestedInitialDrawingKeyRef.current = null;
      return;
    }
    if (!workspace.session || workspace.isRestoringSession) return;
    const key = `${initialDrawingId}:${initialRevisionId ?? "current"}`;
    if (requestedInitialDrawingKeyRef.current === key) return;
    requestedInitialDrawingKeyRef.current = key;
    void workspace.loadDrawing(initialDrawingId, initialRevisionId);
  }, [
    initialDrawingId,
    initialRevisionId,
    workspace.isRestoringSession,
    workspace.loadDrawing,
    workspace.session
  ]);

  return workspace;
}
