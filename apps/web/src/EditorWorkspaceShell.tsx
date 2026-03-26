import type { ComponentProps, RefObject } from "react";

import { EditorCanvasStage } from "./EditorCanvasStage";
import { EditorCanvasControls } from "./EditorCanvasControls";
import { EditorOverlayPanels } from "./EditorOverlayPanels";
import { EditorSidebar } from "./EditorSidebar";
import { OptimizationPlanner } from "./OptimizationPlanner";

interface EditorWorkspaceShellProps {
  sidebarProps: ComponentProps<typeof EditorSidebar>;
  interactionLabel: string;
  canvasControlsProps: ComponentProps<typeof EditorCanvasControls>;
  canvasFrameRef: RefObject<HTMLDivElement | null>;
  canvasStageProps: ComponentProps<typeof EditorCanvasStage>;
  optimizationPlannerProps: ComponentProps<typeof OptimizationPlanner>;
  overlayPanelsProps: ComponentProps<typeof EditorOverlayPanels>;
}

export function EditorWorkspaceShell({
  sidebarProps,
  interactionLabel,
  canvasControlsProps,
  canvasFrameRef,
  canvasStageProps,
  optimizationPlannerProps,
  overlayPanelsProps
}: EditorWorkspaceShellProps) {
  return (
    <div className="editor-workspace-shell">
      <EditorSidebar {...sidebarProps} />

      <section className="editor-stage-column">
        <div className="editor-stage-shell">
          <section className="panel-block editor-stage-toolbar editor-stage-toolbar-compact">
            <div className="editor-stage-toolbar-copy">
              <span className="portal-section-kicker">Mode</span>
              <h2>{interactionLabel}</h2>
            </div>
            <EditorCanvasControls {...canvasControlsProps} />
          </section>

          <div className="editor-canvas-frame" ref={canvasFrameRef}>
            <EditorCanvasStage {...canvasStageProps} />
          </div>
        </div>
      </section>

      <aside className="editor-secondary-rail">
        <div className="editor-rail-scroll">
          <OptimizationPlanner {...optimizationPlannerProps} />
          <EditorOverlayPanels {...overlayPanelsProps} />
        </div>
      </aside>
    </div>
  );
}