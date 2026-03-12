import { useCallback, useEffect, useState } from "react";
import type { PointMm } from "@fence-estimator/contracts";

import type { InteractionMode } from "./types";

export interface ActiveSegmentDragState {
  segmentId: string;
  lastPointer: PointMm;
}

export interface ActiveGateDragState {
  gateId: string;
  lastPointer: PointMm;
}

export function useEditorSelectionState(interactionMode: InteractionMode) {
  const [drawStart, setDrawStart] = useState<PointMm | null>(null);
  const [rectangleStart, setRectangleStart] = useState<PointMm | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [activeSegmentDrag, setActiveSegmentDrag] = useState<ActiveSegmentDragState | null>(null);
  const [activeGateDrag, setActiveGateDrag] = useState<ActiveGateDragState | null>(null);
  const [isLengthEditorOpen, setIsLengthEditorOpen] = useState(false);
  const [selectedLengthInputM, setSelectedLengthInputM] = useState("");

  useEffect(() => {
    if (interactionMode !== "SELECT") {
      setSelectedSegmentId(null);
      setSelectedGateId(null);
      setIsLengthEditorOpen(false);
      setActiveSegmentDrag(null);
      setActiveGateDrag(null);
    }
    if (interactionMode !== "DRAW") {
      setDrawStart(null);
    }
    if (interactionMode !== "RECTANGLE") {
      setRectangleStart(null);
    }
  }, [interactionMode]);

  const resetLoadedWorkspaceState = useCallback(() => {
    setDrawStart(null);
    setRectangleStart(null);
    setSelectedSegmentId(null);
    setSelectedGateId(null);
    setActiveSegmentDrag(null);
    setActiveGateDrag(null);
    setIsLengthEditorOpen(false);
    setSelectedLengthInputM("");
  }, []);

  const clearHistorySelection = useCallback(() => {
    setDrawStart(null);
    setSelectedSegmentId(null);
    setSelectedGateId(null);
  }, []);

  return {
    drawStart,
    rectangleStart,
    selectedSegmentId,
    selectedGateId,
    activeSegmentDrag,
    activeGateDrag,
    isLengthEditorOpen,
    selectedLengthInputM,
    setDrawStart,
    setRectangleStart,
    setSelectedSegmentId,
    setSelectedGateId,
    setActiveSegmentDrag,
    setActiveGateDrag,
    setIsLengthEditorOpen,
    setSelectedLengthInputM,
    resetLoadedWorkspaceState,
    clearHistorySelection
  };
}
