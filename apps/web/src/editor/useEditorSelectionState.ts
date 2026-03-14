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

export interface ActiveBasketballPostDragState {
  basketballPostId: string;
  lastPointer: PointMm;
}

export interface ActiveFloodlightColumnDragState {
  floodlightColumnId: string;
  lastPointer: PointMm;
}

export function useEditorSelectionState(interactionMode: InteractionMode) {
  const [drawStart, setDrawStart] = useState<PointMm | null>(null);
  const [drawChainStart, setDrawChainStart] = useState<PointMm | null>(null);
  const [rectangleStart, setRectangleStart] = useState<PointMm | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [selectedBasketballPostId, setSelectedBasketballPostId] = useState<string | null>(null);
  const [selectedFloodlightColumnId, setSelectedFloodlightColumnId] = useState<string | null>(null);
  const [activeSegmentDrag, setActiveSegmentDrag] = useState<ActiveSegmentDragState | null>(null);
  const [activeGateDrag, setActiveGateDrag] = useState<ActiveGateDragState | null>(null);
  const [activeBasketballPostDrag, setActiveBasketballPostDrag] = useState<ActiveBasketballPostDragState | null>(null);
  const [activeFloodlightColumnDrag, setActiveFloodlightColumnDrag] = useState<ActiveFloodlightColumnDragState | null>(null);
  const [isLengthEditorOpen, setIsLengthEditorOpen] = useState(false);
  const [selectedLengthInputM, setSelectedLengthInputM] = useState("");

  useEffect(() => {
    if (interactionMode !== "SELECT") {
      setSelectedSegmentId(null);
      setSelectedGateId(null);
      setSelectedBasketballPostId(null);
      setSelectedFloodlightColumnId(null);
      setIsLengthEditorOpen(false);
      setActiveSegmentDrag(null);
      setActiveGateDrag(null);
      setActiveBasketballPostDrag(null);
      setActiveFloodlightColumnDrag(null);
    }
    if (interactionMode !== "DRAW") {
      setDrawStart(null);
      setDrawChainStart(null);
    }
    if (interactionMode !== "RECTANGLE") {
      setRectangleStart(null);
    }
  }, [interactionMode]);

  const resetLoadedWorkspaceState = useCallback(() => {
    setDrawStart(null);
    setDrawChainStart(null);
    setRectangleStart(null);
    setSelectedSegmentId(null);
    setSelectedGateId(null);
    setSelectedBasketballPostId(null);
    setSelectedFloodlightColumnId(null);
    setActiveSegmentDrag(null);
    setActiveGateDrag(null);
    setActiveBasketballPostDrag(null);
    setActiveFloodlightColumnDrag(null);
    setIsLengthEditorOpen(false);
    setSelectedLengthInputM("");
  }, []);

  const clearHistorySelection = useCallback(() => {
    setDrawStart(null);
    setDrawChainStart(null);
    setSelectedSegmentId(null);
    setSelectedGateId(null);
    setSelectedBasketballPostId(null);
    setSelectedFloodlightColumnId(null);
  }, []);

  return {
    drawStart,
    drawChainStart,
    rectangleStart,
    selectedSegmentId,
    selectedGateId,
    selectedBasketballPostId,
    selectedFloodlightColumnId,
    activeSegmentDrag,
    activeGateDrag,
    activeBasketballPostDrag,
    activeFloodlightColumnDrag,
    isLengthEditorOpen,
    selectedLengthInputM,
    setDrawStart,
    setDrawChainStart,
    setRectangleStart,
    setSelectedSegmentId,
    setSelectedGateId,
    setSelectedBasketballPostId,
    setSelectedFloodlightColumnId,
    setActiveSegmentDrag,
    setActiveGateDrag,
    setActiveBasketballPostDrag,
    setActiveFloodlightColumnDrag,
    setIsLengthEditorOpen,
    setSelectedLengthInputM,
    resetLoadedWorkspaceState,
    clearHistorySelection
  };
}
