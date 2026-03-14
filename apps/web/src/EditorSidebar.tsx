import type { FenceHeightKey, FenceSpec, GateType } from "@fence-estimator/contracts";

import { EditorFencePalettePanel } from "./EditorFencePalettePanel";
import { EditorInteractionPanel } from "./EditorInteractionPanel";

interface EditorSidebarProps {
  interactionMode: "DRAW" | "SELECT" | "RECTANGLE" | "RECESS" | "GATE" | "BASKETBALL_POST" | "FLOODLIGHT_COLUMN";
  recessWidthInputM: string;
  recessDepthInputM: string;
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
  basketballPostPreview:
    | {
        offsetMm: number;
        facing: "LEFT" | "RIGHT";
        snapMeta: {
          label: string;
        };
      }
    | null;
  floodlightColumnPreview?:
    | {
        offsetMm: number;
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
  onSetInteractionMode: (mode: "DRAW" | "SELECT" | "RECTANGLE" | "RECESS" | "GATE" | "BASKETBALL_POST" | "FLOODLIGHT_COLUMN") => void;
  onRecessWidthInputChange: (value: string) => void;
  onRecessDepthInputChange: (value: string) => void;
  onNormalizeRecessInputs: () => void;
  onSetGateType: (type: GateType) => void;
  onCustomGateWidthInputChange: (value: string) => void;
  onNormalizeGateInputs: () => void;
  onSetActiveSpec: (updater: (previous: FenceSpec) => FenceSpec) => void;
}

export function EditorSidebar({
  interactionMode,
  recessWidthInputM,
  recessDepthInputM,
  gateType,
  customGateWidthInputM,
  recessWidthOptionsMm,
  recessDepthOptionsMm,
  gateWidthOptionsMm,
  recessPreview,
  gatePreview,
  basketballPostPreview,
  floodlightColumnPreview = null,
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
          gateType={gateType}
          customGateWidthInputM={customGateWidthInputM}
          recessWidthOptionsMm={recessWidthOptionsMm}
          recessDepthOptionsMm={recessDepthOptionsMm}
          gateWidthOptionsMm={gateWidthOptionsMm}
          recessPreview={recessPreview}
          gatePreview={gatePreview}
          basketballPostPreview={basketballPostPreview}
          floodlightColumnPreview={floodlightColumnPreview}
          formatLengthMm={formatLengthMm}
          formatMetersInputFromMm={formatMetersInputFromMm}
          onSetInteractionMode={onSetInteractionMode}
          onRecessWidthInputChange={onRecessWidthInputChange}
          onRecessDepthInputChange={onRecessDepthInputChange}
          onNormalizeRecessInputs={onNormalizeRecessInputs}
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
