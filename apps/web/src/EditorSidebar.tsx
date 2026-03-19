import type {
  BasketballArmLengthMm,
  FenceHeightKey,
  FenceSpec,
  GateType,
  GoalUnitHeightMm,
  GoalUnitWidthMm,
  KickboardProfile,
  KickboardSectionHeightMm
} from "@fence-estimator/contracts";

import { EditorFencePalettePanel } from "./EditorFencePalettePanel";
import { EditorInteractionPanel } from "./EditorInteractionPanel";

interface EditorSidebarProps {
  interactionMode:
    | "DRAW"
    | "SELECT"
    | "RECTANGLE"
    | "RECESS"
    | "GOAL_UNIT"
    | "GATE"
    | "BASKETBALL_POST"
    | "FLOODLIGHT_COLUMN"
    | "KICKBOARD"
    | "PITCH_DIVIDER"
    | "SIDE_NETTING";
  recessWidthInputM: string;
  recessDepthInputM: string;
  goalUnitWidthMm?: GoalUnitWidthMm;
  goalUnitHeightMm?: GoalUnitHeightMm;
  basketballPlacementType?: "DEDICATED_POST" | "MOUNTED_TO_EXISTING_POST";
  basketballArmLengthMm?: BasketballArmLengthMm;
  kickboardSectionHeightMm?: KickboardSectionHeightMm;
  kickboardProfile?: KickboardProfile;
  sideNettingHeightMm?: number;
  pendingPitchDividerStart?: { segmentId: string; offsetMm: number } | null;
  pendingSideNettingStart?: { segmentId: string; offsetMm: number } | null;
  gateType: GateType;
  customGateWidthInputM: string;
  recessWidthOptionsMm: readonly number[];
  recessDepthOptionsMm: readonly number[];
  goalUnitWidthOptionsMm?: readonly GoalUnitWidthMm[];
  goalUnitHeightOptionsMm?: readonly GoalUnitHeightMm[];
  basketballArmLengthOptionsMm?: readonly BasketballArmLengthMm[];
  kickboardSectionHeightOptionsMm?: readonly KickboardSectionHeightMm[];
  sideNettingHeightOptionsMm?: readonly number[];
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
  goalUnitPreview?:
    | {
        widthMm: number;
        depthMm: number;
        goalHeightMm: number;
        side: "LEFT" | "RIGHT";
        snapMeta: {
          label: string;
        };
      }
    | null;
  kickboardPreview?: { segmentId: string; snapMeta: { label: string } } | null;
  pitchDividerPreview?: { spanLengthMm: number; isValid: boolean } | null;
  sideNettingPreview?: { lengthMm: number; snapMeta: { label: string } } | null;
  activeSpec: FenceSpec;
  activeHeightOptions: FenceHeightKey[];
  twinBarHeightOptions: FenceHeightKey[];
  rollFormHeightOptions: FenceHeightKey[];
  formatLengthMm: (value: number) => string;
  formatMetersInputFromMm: (value: number) => string;
  getSegmentColor: (spec: FenceSpec) => string;
  onSetInteractionMode: (
    mode:
      | "DRAW"
      | "SELECT"
      | "RECTANGLE"
      | "RECESS"
      | "GOAL_UNIT"
      | "GATE"
      | "BASKETBALL_POST"
      | "FLOODLIGHT_COLUMN"
      | "KICKBOARD"
      | "PITCH_DIVIDER"
      | "SIDE_NETTING"
  ) => void;
  onRecessWidthInputChange: (value: string) => void;
  onRecessDepthInputChange: (value: string) => void;
  onNormalizeRecessInputs: () => void;
  onSetGoalUnitWidthMm?: (value: GoalUnitWidthMm) => void;
  onSetGoalUnitHeightMm?: (value: GoalUnitHeightMm) => void;
  onSetGateType: (type: GateType) => void;
  onSetBasketballPlacementType?: (value: "DEDICATED_POST" | "MOUNTED_TO_EXISTING_POST") => void;
  onSetBasketballArmLengthMm?: (value: BasketballArmLengthMm) => void;
  onSetKickboardSectionHeightMm?: (value: KickboardSectionHeightMm) => void;
  onSetKickboardProfile?: (value: KickboardProfile) => void;
  onSetSideNettingHeightMm?: (value: number) => void;
  onCustomGateWidthInputChange: (value: string) => void;
  onNormalizeGateInputs: () => void;
  onSetActiveSpec: (updater: (previous: FenceSpec) => FenceSpec) => void;
}

export function EditorSidebar({
  interactionMode,
  recessWidthInputM,
  recessDepthInputM,
  goalUnitWidthMm = 3000,
  goalUnitHeightMm = 3000,
  basketballPlacementType = "DEDICATED_POST",
  basketballArmLengthMm = 1800,
  kickboardSectionHeightMm = 200,
  kickboardProfile = "SQUARE",
  sideNettingHeightMm = 2000,
  pendingPitchDividerStart = null,
  pendingSideNettingStart = null,
  gateType,
  customGateWidthInputM,
  recessWidthOptionsMm,
  recessDepthOptionsMm,
  goalUnitWidthOptionsMm = [3000, 3600, 4800] as const,
  goalUnitHeightOptionsMm = [3000, 4000] as const,
  basketballArmLengthOptionsMm = [1200, 1800] as const,
  kickboardSectionHeightOptionsMm = [200, 225, 250] as const,
  sideNettingHeightOptionsMm = [500, 1000, 1500, 2000] as const,
  gateWidthOptionsMm,
  recessPreview,
  gatePreview,
  basketballPostPreview,
  floodlightColumnPreview = null,
  goalUnitPreview = null,
  kickboardPreview = null,
  pitchDividerPreview = null,
  sideNettingPreview = null,
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
  onSetGoalUnitWidthMm = () => undefined,
  onSetGoalUnitHeightMm = () => undefined,
  onSetGateType,
  onSetBasketballPlacementType = () => undefined,
  onSetBasketballArmLengthMm = () => undefined,
  onSetKickboardSectionHeightMm = () => undefined,
  onSetKickboardProfile = () => undefined,
  onSetSideNettingHeightMm = () => undefined,
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
          goalUnitWidthMm={goalUnitWidthMm}
          goalUnitHeightMm={goalUnitHeightMm}
          basketballPlacementType={basketballPlacementType}
          basketballArmLengthMm={basketballArmLengthMm}
          kickboardSectionHeightMm={kickboardSectionHeightMm}
          kickboardProfile={kickboardProfile}
          sideNettingHeightMm={sideNettingHeightMm}
          pendingPitchDividerStart={pendingPitchDividerStart}
          pendingSideNettingStart={pendingSideNettingStart}
          gateType={gateType}
          customGateWidthInputM={customGateWidthInputM}
          recessWidthOptionsMm={recessWidthOptionsMm}
          recessDepthOptionsMm={recessDepthOptionsMm}
          goalUnitWidthOptionsMm={goalUnitWidthOptionsMm}
          goalUnitHeightOptionsMm={goalUnitHeightOptionsMm}
          basketballArmLengthOptionsMm={basketballArmLengthOptionsMm}
          kickboardSectionHeightOptionsMm={kickboardSectionHeightOptionsMm}
          sideNettingHeightOptionsMm={sideNettingHeightOptionsMm}
          gateWidthOptionsMm={gateWidthOptionsMm}
          recessPreview={recessPreview}
          gatePreview={gatePreview}
          basketballPostPreview={basketballPostPreview}
          floodlightColumnPreview={floodlightColumnPreview}
          goalUnitPreview={goalUnitPreview}
          kickboardPreview={kickboardPreview}
          pitchDividerPreview={pitchDividerPreview}
          sideNettingPreview={sideNettingPreview}
          formatLengthMm={formatLengthMm}
          formatMetersInputFromMm={formatMetersInputFromMm}
          onSetInteractionMode={onSetInteractionMode}
          onRecessWidthInputChange={onRecessWidthInputChange}
          onRecessDepthInputChange={onRecessDepthInputChange}
          onNormalizeRecessInputs={onNormalizeRecessInputs}
          onSetGoalUnitWidthMm={onSetGoalUnitWidthMm}
          onSetGoalUnitHeightMm={onSetGoalUnitHeightMm}
          onSetGateType={onSetGateType}
          onSetBasketballPlacementType={onSetBasketballPlacementType}
          onSetBasketballArmLengthMm={onSetBasketballArmLengthMm}
          onSetKickboardSectionHeightMm={onSetKickboardSectionHeightMm}
          onSetKickboardProfile={onSetKickboardProfile}
          onSetSideNettingHeightMm={onSetSideNettingHeightMm}
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
