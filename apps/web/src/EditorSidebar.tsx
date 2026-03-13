import type { FenceHeightKey, FenceSpec, GateType } from "@fence-estimator/contracts";

import { EditorFencePalettePanel } from "./EditorFencePalettePanel";
import { EditorInteractionPanel } from "./EditorInteractionPanel";

interface EditorSidebarProps {
  interactionMode: "DRAW" | "SELECT" | "RECTANGLE" | "RECESS" | "GATE";
  recessWidthInputM: string;
  recessDepthInputM: string;
  recessSide: "AUTO" | "LEFT" | "RIGHT";
  gateType: GateType;
  customGateWidthInputM: string;
  recessWidthOptionsMm: readonly number[];
  recessDepthOptionsMm: readonly number[];
  gateWidthOptionsMm: readonly number[];
  recessPreview:
    | {
        depthMm: number;
        startOffsetMm: number;
        endOffsetMm: number;
        segmentLengthMm: number;
        side: "LEFT" | "RIGHT";
        sideSource: "AUTO" | "MANUAL";
        snapMeta: {
          label: string;
        };
      }
    | null;
  gatePreview:
    | {
        widthMm: number;
        startOffsetMm: number;
        endOffsetMm: number;
        segmentLengthMm: number;
        snapMeta: {
          label: string;
        };
      }
    | null;
  activeSpec: FenceSpec;
  activeHeightOptions: FenceHeightKey[];
  twinBarHeightOptions: FenceHeightKey[];
  rollFormHeightOptions: FenceHeightKey[];
  formatLengthMm: (value: number) => string;
  formatMetersInputFromMm: (value: number) => string;
  getSegmentColor: (spec: FenceSpec) => string;
  onSetInteractionMode: (mode: "DRAW" | "SELECT" | "RECTANGLE" | "RECESS" | "GATE") => void;
  onRecessWidthInputChange: (value: string) => void;
  onRecessDepthInputChange: (value: string) => void;
  onNormalizeRecessInputs: () => void;
  onSetRecessSide: (side: "AUTO" | "LEFT" | "RIGHT") => void;
  onSetGateType: (type: GateType) => void;
  onCustomGateWidthInputChange: (value: string) => void;
  onNormalizeGateInputs: () => void;
  onSetActiveSpec: (updater: (previous: FenceSpec) => FenceSpec) => void;
}

export function EditorSidebar({
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
  formatLengthMm,
  formatMetersInputFromMm,
  getSegmentColor,
  onSetInteractionMode,
  onRecessWidthInputChange,
  onRecessDepthInputChange,
  onNormalizeRecessInputs,
  onSetRecessSide,
  onSetGateType,
  onCustomGateWidthInputChange,
  onNormalizeGateInputs,
  onSetActiveSpec
}: EditorSidebarProps) {
  return (
    <aside className="editor-primary-rail">
      <div className="editor-rail-scroll">
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
    </aside>
  );
}
