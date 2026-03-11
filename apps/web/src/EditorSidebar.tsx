import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import type { FenceHeightKey, FenceSpec, GateType } from "@fence-estimator/contracts";

import { EditorCanvasControls } from "./EditorCanvasControls";
import { EditorDocumentPanel } from "./EditorDocumentPanel";
import { EditorFencePalettePanel } from "./EditorFencePalettePanel";
import { EditorInteractionPanel } from "./EditorInteractionPanel";
import { EditorOverlayPanels } from "./EditorOverlayPanels";
import type { WorkspacePersistenceState } from "./useWorkspacePersistence";

interface EditorSidebarProps {
  workspace: WorkspacePersistenceState;
  onOpenDrawings: () => void;
  onStartNewDraft: () => void;
  onNavigate: (
    route: "dashboard" | "drawings" | "editor" | "admin" | "login",
    query?: Record<string, string>
  ) => void;
  interactionMode: "DRAW" | "SELECT" | "RECTANGLE" | "RECESS" | "GATE";
  recessWidthInputM: string;
  recessDepthInputM: string;
  recessSide: "LEFT" | "RIGHT";
  gateType: GateType;
  customGateWidthInputM: string;
  recessWidthOptionsMm: readonly number[];
  recessDepthOptionsMm: readonly number[];
  gateWidthOptionsMm: readonly number[];
  recessPreview:
    | {
        startOffsetMm: number;
        endOffsetMm: number;
        segmentLengthMm: number;
      }
    | null;
  gatePreview:
    | {
        widthMm: number;
        startOffsetMm: number;
        endOffsetMm: number;
        segmentLengthMm: number;
      }
    | null;
  activeSpec: FenceSpec;
  activeHeightOptions: FenceHeightKey[];
  twinBarHeightOptions: FenceHeightKey[];
  rollFormHeightOptions: FenceHeightKey[];
  postRowsByType: {
    end: Array<{ heightMm: number; count: number }>;
    intermediate: Array<{ heightMm: number; count: number }>;
    corner: Array<{ heightMm: number; count: number }>;
    junction: Array<{ heightMm: number; count: number }>;
    inlineJoin: Array<{ heightMm: number; count: number }>;
  };
  gateCounts: {
    total: number;
    single: number;
    double: number;
    custom: number;
  };
  gateCountsByHeight: Array<{ height: string; count: number }>;
  twinBarFenceRows: Array<{ height: string; standard: number; superRebound: number }>;
  postTypeCounts: {
    END: number;
    INTERMEDIATE: number;
    CORNER: number;
    JUNCTION: number;
    INLINE_JOIN: number;
    GATE: number;
  };
  isTutorialOpen: boolean;
  controlsStyle: CSSProperties;
  itemCountsStyle: CSSProperties;
  postKeyStyle: CSSProperties;
  tutorialStyle: CSSProperties;
  canUndo: boolean;
  canRedo: boolean;
  canDeleteSelection: boolean;
  formatLengthMm: (value: number) => string;
  formatMetersInputFromMm: (value: number) => string;
  formatHeightLabelFromMm: (value: number) => string;
  getSegmentColor: (spec: FenceSpec) => string;
  onSetInteractionMode: (mode: "DRAW" | "SELECT" | "RECTANGLE" | "RECESS" | "GATE") => void;
  onRecessWidthInputChange: (value: string) => void;
  onRecessDepthInputChange: (value: string) => void;
  onNormalizeRecessInputs: () => void;
  onSetRecessSide: (side: "LEFT" | "RIGHT") => void;
  onSetGateType: (type: GateType) => void;
  onCustomGateWidthInputChange: (value: string) => void;
  onNormalizeGateInputs: () => void;
  onSetActiveSpec: (updater: (previous: FenceSpec) => FenceSpec) => void;
  onOpenTutorial: () => void;
  onCloseTutorial: () => void;
  onStartItemCountsDrag: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onStartPostKeyDrag: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onStartTutorialDrag: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onStartControlsDrag: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelection: () => void;
  onClearLayout: () => void;
}

export function EditorSidebar({
  workspace,
  onOpenDrawings,
  onStartNewDraft,
  onNavigate,
  interactionMode,
  recessWidthInputM,
  recessDepthInputM,
  recessSide,
  gateType,
  customGateWidthInputM,
  recessWidthOptionsMm,
  recessDepthOptionsMm,
  gateWidthOptionsMm,
  recessPreview,
  gatePreview,
  activeSpec,
  activeHeightOptions,
  twinBarHeightOptions,
  rollFormHeightOptions,
  postRowsByType,
  gateCounts,
  gateCountsByHeight,
  twinBarFenceRows,
  postTypeCounts,
  isTutorialOpen,
  controlsStyle,
  itemCountsStyle,
  postKeyStyle,
  tutorialStyle,
  canUndo,
  canRedo,
  canDeleteSelection,
  formatLengthMm,
  formatMetersInputFromMm,
  formatHeightLabelFromMm,
  getSegmentColor,
  onSetInteractionMode,
  onRecessWidthInputChange,
  onRecessDepthInputChange,
  onNormalizeRecessInputs,
  onSetRecessSide,
  onSetGateType,
  onCustomGateWidthInputChange,
  onNormalizeGateInputs,
  onSetActiveSpec,
  onOpenTutorial,
  onCloseTutorial,
  onStartItemCountsDrag,
  onStartPostKeyDrag,
  onStartTutorialDrag,
  onStartControlsDrag,
  onUndo,
  onRedo,
  onDeleteSelection,
  onClearLayout
}: EditorSidebarProps) {
  return (
    <aside className="left-panel">
      <div className="left-panel-stack">
        <EditorDocumentPanel
          workspace={workspace}
          onOpenDrawings={onOpenDrawings}
          onStartNewDraft={onStartNewDraft}
          onNavigate={onNavigate}
        />
        <EditorInteractionPanel
          interactionMode={interactionMode}
          recessWidthInputM={recessWidthInputM}
          recessDepthInputM={recessDepthInputM}
          recessSide={recessSide}
          gateType={gateType}
          customGateWidthInputM={customGateWidthInputM}
          recessWidthOptionsMm={recessWidthOptionsMm}
          recessDepthOptionsMm={recessDepthOptionsMm}
          gateWidthOptionsMm={gateWidthOptionsMm}
          recessPreview={recessPreview}
          gatePreview={gatePreview}
          formatLengthMm={formatLengthMm}
          formatMetersInputFromMm={formatMetersInputFromMm}
          onSetInteractionMode={onSetInteractionMode}
          onRecessWidthInputChange={onRecessWidthInputChange}
          onRecessDepthInputChange={onRecessDepthInputChange}
          onNormalizeRecessInputs={onNormalizeRecessInputs}
          onSetRecessSide={onSetRecessSide}
          onSetGateType={onSetGateType}
          onCustomGateWidthInputChange={onCustomGateWidthInputChange}
          onNormalizeGateInputs={onNormalizeGateInputs}
        />
        <EditorFencePalettePanel
          activeSpec={activeSpec}
          activeHeightOptions={activeHeightOptions}
          twinBarHeightOptions={twinBarHeightOptions}
          rollFormHeightOptions={rollFormHeightOptions}
          onSetActiveSpec={onSetActiveSpec}
          getSegmentColor={getSegmentColor}
        />
      </div>

      <EditorOverlayPanels
        postRowsByType={postRowsByType}
        gateCounts={gateCounts}
        gateCountsByHeight={gateCountsByHeight}
        twinBarFenceRows={twinBarFenceRows}
        postTypeCounts={postTypeCounts}
        isTutorialOpen={isTutorialOpen}
        onOpenTutorial={onOpenTutorial}
        onCloseTutorial={onCloseTutorial}
        onStartItemCountsDrag={onStartItemCountsDrag}
        onStartPostKeyDrag={onStartPostKeyDrag}
        onStartTutorialDrag={onStartTutorialDrag}
        itemCountsStyle={itemCountsStyle}
        postKeyStyle={postKeyStyle}
        tutorialStyle={tutorialStyle}
        formatHeightLabelFromMm={formatHeightLabelFromMm}
      />

      <section className="panel-controls-shell" style={controlsStyle}>
        <div className="panel-drag-handle" onMouseDown={onStartControlsDrag}>
          <EditorCanvasControls
            canUndo={canUndo}
            canRedo={canRedo}
            canDeleteSelection={canDeleteSelection}
            onUndo={onUndo}
            onRedo={onRedo}
            onDeleteSelection={onDeleteSelection}
            onClearLayout={onClearLayout}
          />
        </div>
      </section>
    </aside>
  );
}
