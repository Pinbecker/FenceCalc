import { useState } from "react";
import type { FenceSpec, GateType } from "@fence-estimator/contracts";

import { formatMetersInputFromMm } from "../formatters";
import { useDraggablePanels, type PanelOffset } from "../useDraggablePanels";
import { defaultFenceSpec, SINGLE_GATE_WIDTH_MM } from "./constants";
import type { DraggablePanel, InteractionMode, RecessSidePreference } from "./types";

const DEFAULT_RECESS_WIDTH_MM = 7500;
const DEFAULT_RECESS_DEPTH_MM = 2500;

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
  const [gateType, setGateType] = useState<GateType>("SINGLE_LEAF");
  const [customGateWidthMm, setCustomGateWidthMm] = useState<number>(SINGLE_GATE_WIDTH_MM);
  const [customGateWidthInputM, setCustomGateWidthInputM] = useState<string>(() =>
    formatMetersInputFromMm(SINGLE_GATE_WIDTH_MM),
  );
  const [disableSnap, setDisableSnap] = useState(false);
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
    gateType,
    customGateWidthMm,
    customGateWidthInputM,
    disableSnap,
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
    setGateType,
    setCustomGateWidthMm,
    setCustomGateWidthInputM,
    setDisableSnap,
    setSelectedPlanId,
    setIsOptimizationInspectorOpen,
    setIsTutorialOpen
  };
}
