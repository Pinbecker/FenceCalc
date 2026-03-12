import { useState } from "react";
import type { FenceSpec, GateType } from "@fence-estimator/contracts";

import { formatMetersInputFromMm } from "../formatters";
import { useDraggablePanels, type PanelOffset } from "../useDraggablePanels";
import { defaultFenceSpec, SINGLE_GATE_WIDTH_MM } from "./constants";
import type { DraggablePanel, InteractionMode, RecessSide } from "./types";

const INITIAL_PANEL_OFFSETS: Record<DraggablePanel, PanelOffset> = {
  controls: { x: 0, y: 0 },
  itemCounts: { x: 0, y: 0 },
  postKey: { x: 0, y: 0 },
  tutorial: { x: 0, y: 0 }
};

export function useEditorShellState() {
  const [activeSpec, setActiveSpec] = useState<FenceSpec>(defaultFenceSpec());
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("DRAW");
  const [recessWidthMm, setRecessWidthMm] = useState<number>(1500);
  const [recessDepthMm, setRecessDepthMm] = useState<number>(1000);
  const [recessWidthInputM, setRecessWidthInputM] = useState<string>(() => formatMetersInputFromMm(1500));
  const [recessDepthInputM, setRecessDepthInputM] = useState<string>(() => formatMetersInputFromMm(1000));
  const [recessSide, setRecessSide] = useState<RecessSide>("LEFT");
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
