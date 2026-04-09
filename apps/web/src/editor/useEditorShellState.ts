import { useState } from "react";
import type {
  BasketballArmLengthMm,
  FenceSpec,
  GateType,
  GoalUnitHeightMm,
  GoalUnitWidthMm,
  KickboardProfile,
  KickboardSectionHeightMm
} from "@fence-estimator/contracts";

import { formatMetersInputFromMm } from "../formatters";
import { useDraggablePanels, type PanelOffset } from "../useDraggablePanels";
import { defaultFenceSpec, SINGLE_GATE_WIDTH_MM } from "./constants";
import type { DraggablePanel, InteractionMode, PitchDividerAnchorPreview, RecessSidePreference } from "./types";

const DEFAULT_RECESS_WIDTH_MM = 7500;
const DEFAULT_RECESS_DEPTH_MM = 2500;
const DEFAULT_GOAL_UNIT_WIDTH_MM: GoalUnitWidthMm = 3000;
const DEFAULT_GOAL_UNIT_HEIGHT_MM: GoalUnitHeightMm = 3000;
const DEFAULT_GOAL_UNIT_DEPTH_MM = 1200;
const DEFAULT_BASKETBALL_ARM_LENGTH_MM: BasketballArmLengthMm = 1800;
const DEFAULT_KICKBOARD_SECTION_HEIGHT_MM: KickboardSectionHeightMm = 200;
const DEFAULT_KICKBOARD_THICKNESS_MM = 50;
const DEFAULT_KICKBOARD_BOARD_LENGTH_MM = 2500;
const DEFAULT_FLOODLIGHT_COLUMN_HEIGHT_MM = 6000;
const DEFAULT_SIDE_NETTING_HEIGHT_MM = 2000;

const INITIAL_PANEL_OFFSETS: Record<DraggablePanel, PanelOffset> = {
  controls: { x: 0, y: 0 },
  itemCounts: { x: 0, y: 0 },
  postKey: { x: 0, y: 0 },
  tutorial: { x: 0, y: 0 }
};

export function useEditorShellState() {
  const [activeSpec, setActiveSpec] = useState<FenceSpec>(defaultFenceSpec());
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("DRAW");
  const [recessWidthMm, setRecessWidthMm] = useState<number>(DEFAULT_RECESS_WIDTH_MM);
  const [recessDepthMm, setRecessDepthMm] = useState<number>(DEFAULT_RECESS_DEPTH_MM);
  const [recessWidthInputM, setRecessWidthInputM] = useState<string>(() => formatMetersInputFromMm(DEFAULT_RECESS_WIDTH_MM));
  const [recessDepthInputM, setRecessDepthInputM] = useState<string>(() => formatMetersInputFromMm(DEFAULT_RECESS_DEPTH_MM));
  const [recessSide, setRecessSide] = useState<RecessSidePreference>("AUTO");
  const [goalUnitWidthMm, setGoalUnitWidthMm] = useState<GoalUnitWidthMm>(DEFAULT_GOAL_UNIT_WIDTH_MM);
  const [goalUnitHeightMm, setGoalUnitHeightMm] = useState<GoalUnitHeightMm>(DEFAULT_GOAL_UNIT_HEIGHT_MM);
  const [goalUnitHasBasketballPost, setGoalUnitHasBasketballPost] = useState(false);
  const [goalUnitDepthMm] = useState<number>(DEFAULT_GOAL_UNIT_DEPTH_MM);
  const [basketballPlacementType, setBasketballPlacementType] = useState<"DEDICATED_POST" | "MOUNTED_TO_EXISTING_POST">("DEDICATED_POST");
  const [basketballArmLengthMm, setBasketballArmLengthMm] = useState<BasketballArmLengthMm>(DEFAULT_BASKETBALL_ARM_LENGTH_MM);
  const [kickboardSectionHeightMm, setKickboardSectionHeightMm] = useState<KickboardSectionHeightMm>(DEFAULT_KICKBOARD_SECTION_HEIGHT_MM);
  const [kickboardProfile, setKickboardProfile] = useState<KickboardProfile>("SQUARE");
  const [kickboardThicknessMm, setKickboardThicknessMm] = useState<number>(DEFAULT_KICKBOARD_THICKNESS_MM);
  const [kickboardBoardLengthMm, setKickboardBoardLengthMm] = useState<number>(DEFAULT_KICKBOARD_BOARD_LENGTH_MM);
  const [floodlightColumnHeightMm, setFloodlightColumnHeightMm] = useState<number>(DEFAULT_FLOODLIGHT_COLUMN_HEIGHT_MM);
  const [sideNettingHeightMm, setSideNettingHeightMm] = useState<number>(DEFAULT_SIDE_NETTING_HEIGHT_MM);
  const [pendingPitchDividerStart, setPendingPitchDividerStart] = useState<PitchDividerAnchorPreview | null>(null);
  const [pendingSideNettingStart, setPendingSideNettingStart] = useState<PitchDividerAnchorPreview | null>(null);
  const [gateType, setGateType] = useState<GateType>("SINGLE_LEAF");
  const [customGateWidthMm, setCustomGateWidthMm] = useState<number>(SINGLE_GATE_WIDTH_MM);
  const [customGateWidthInputM, setCustomGateWidthInputM] = useState<string>(() =>
    formatMetersInputFromMm(SINGLE_GATE_WIDTH_MM),
  );
  const [disableSnap, setDisableSnap] = useState(false);
  const [isGridVisible, setIsGridVisible] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isOptimizationInspectorOpen, setIsOptimizationInspectorOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const { panelDragStyle, startPanelDrag } = useDraggablePanels(INITIAL_PANEL_OFFSETS);

  return {
    activeSpec,
    interactionMode,
    recessWidthMm,
    recessDepthMm,
    recessWidthInputM,
    recessDepthInputM,
    recessSide,
    goalUnitWidthMm,
    goalUnitHeightMm,
    goalUnitHasBasketballPost,
    goalUnitDepthMm,
    basketballPlacementType,
    basketballArmLengthMm,
    kickboardSectionHeightMm,
    kickboardProfile,
    kickboardThicknessMm,
    kickboardBoardLengthMm,
    floodlightColumnHeightMm,
    sideNettingHeightMm,
    pendingPitchDividerStart,
    pendingSideNettingStart,
    gateType,
    customGateWidthMm,
    customGateWidthInputM,
    disableSnap,
    isGridVisible,
    selectedPlanId,
    isOptimizationInspectorOpen,
    isTutorialOpen,
    panelDragStyle,
    startPanelDrag,
    setActiveSpec,
    setInteractionMode,
    setRecessWidthMm,
    setRecessDepthMm,
    setRecessWidthInputM,
    setRecessDepthInputM,
    setRecessSide,
    setGoalUnitWidthMm,
    setGoalUnitHeightMm,
    setGoalUnitHasBasketballPost,
    setBasketballPlacementType,
    setBasketballArmLengthMm,
    setKickboardSectionHeightMm,
    setKickboardProfile,
    setKickboardThicknessMm,
    setKickboardBoardLengthMm,
    setFloodlightColumnHeightMm,
    setSideNettingHeightMm,
    setPendingPitchDividerStart,
    setPendingSideNettingStart,
    setGateType,
    setCustomGateWidthMm,
    setCustomGateWidthInputM,
    setDisableSnap,
    setIsGridVisible,
    setSelectedPlanId,
    setIsOptimizationInspectorOpen,
    setIsTutorialOpen
  };
}
