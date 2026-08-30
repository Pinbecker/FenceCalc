import type { ComponentProps, RefObject } from "react";
import type { LayoutIntegrityIssue } from "@fence-estimator/geometry";

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
  isOptimizationVisible?: boolean;
  isReadOnly?: boolean;
  integrityIssues?: LayoutIntegrityIssue[];
}

export function EditorWorkspaceShell({
  toolPaletteProps,
  canvasFrameRef,
  canvasStageProps,
  optimizationPlannerProps,
  floatingPanelsProps,
  isReadOnly = false,
  integrityIssues = [],
}: EditorWorkspaceShellProps) {
  return (
    <div className="editor-workspace-shell">
      <div className="editor-canvas-viewport" ref={canvasFrameRef}>
        <EditorCanvasStage {...canvasStageProps} />
        {isReadOnly ? (
          <div className="editor-read-only-banner" role="status" aria-live="polite">
            <strong>Locked design revision</strong>
            <span>
              View only. Start a new revision from the design workspace to make further changes
              without altering this saved version.
            </span>
          </div>
        ) : null}
        {!isReadOnly && integrityIssues.length > 0 ? (
          <div className="editor-integrity-banner" role="alert">
            <strong>Drawing needs attention</strong>
            <span>{integrityIssues[0]?.message}</span>
            {integrityIssues.length > 1 ? <em>+{integrityIssues.length - 1} more</em> : null}
          </div>
        ) : null}
        <EditorToolPalette {...toolPaletteProps} />
        <div className="editor-floating-right">
          <EditorFloatingPanels {...floatingPanelsProps} />
        </div>
      </div>
      {/* OptimizationPlanner sits outside the viewport so its full-screen
          modal backdrop is not clipped by overflow:hidden / stacking context */}
      <OptimizationPlanner {...optimizationPlannerProps} />
    </div>
  );
}
