import type { ComponentProps, RefObject } from "react";

import { EditorCanvasStage } from "./EditorCanvasStage";
import { EditorFloatingPanels } from "./EditorFloatingPanels";
import { EditorToolPalette } from "./EditorToolPalette";
import { OptimizationPlanner } from "./OptimizationPlanner";

interface EditorWorkspaceShellProps {
  toolPaletteProps: ComponentProps<typeof EditorToolPalette>;
  canvasFrameRef: RefObject<HTMLDivElement | null>;
  canvasStageProps: ComponentProps<typeof EditorCanvasStage>;
  optimizationPlannerProps: ComponentProps<typeof OptimizationPlanner>;
  floatingPanelsProps: ComponentProps<typeof EditorFloatingPanels>;
  isOptimizationVisible: boolean;
  isReadOnly?: boolean;
}

export function EditorWorkspaceShell({
  toolPaletteProps,
  canvasFrameRef,
  canvasStageProps,
  optimizationPlannerProps,
  floatingPanelsProps,
  isOptimizationVisible,
  isReadOnly = false
}: EditorWorkspaceShellProps) {
  return (
    <div className="editor-workspace-shell">
      <div className="editor-canvas-viewport" ref={canvasFrameRef}>
        <EditorCanvasStage {...canvasStageProps} />
        {isReadOnly ? (
          <div className="editor-read-only-banner" role="status" aria-live="polite">
            <strong>Quoted revision</strong>
            <span>View only. Create the next revision from the drawing workspace to keep this quote unchanged.</span>
          </div>
        ) : null}
        <EditorToolPalette {...toolPaletteProps} />
        <div className="editor-floating-right">
          <EditorFloatingPanels {...floatingPanelsProps} />
        </div>
      </div>
      {/* OptimizationPlanner sits outside the viewport so its full-screen
          modal backdrop is not clipped by overflow:hidden / stacking context */}
      {isOptimizationVisible ? (
        <OptimizationPlanner {...optimizationPlannerProps} />
      ) : null}
    </div>
  );
}
