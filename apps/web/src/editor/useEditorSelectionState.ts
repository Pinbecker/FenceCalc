import { useCallback, useEffect, useState } from "react";
import type { LayoutSegment, PointMm } from "@fence-estimator/contracts";

import type { InteractionMode } from "./types";

export interface ActiveSegmentDragState {
  segmentId: string;
  segmentIds: string[];
  selectionKey: string;
  lastPointer: PointMm;
  originPointer: PointMm;
  baselineSegments: LayoutSegment[];
  referenceSegments: LayoutSegment[];
  baselineSnapNodes: PointMm[];
  baselineLineSnapSegments: LayoutSegment[];
}

export interface SegmentDragReferenceState {
  segmentId: string;
  segmentIds: string[];
  selectionKey: string;
  baselineSegments: LayoutSegment[];
  baselineSnapNodes: PointMm[];
  baselineLineSnapSegments: LayoutSegment[];
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
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [selectedBasketballPostId, setSelectedBasketballPostId] = useState<string | null>(null);
  const [selectedFloodlightColumnId, setSelectedFloodlightColumnId] = useState<string | null>(null);
  const [suppressNextSegmentClick, setSuppressNextSegmentClick] = useState(false);
  const [activeSegmentDrag, setActiveSegmentDrag] = useState<ActiveSegmentDragState | null>(null);
  const [segmentDragReference, setSegmentDragReference] = useState<SegmentDragReferenceState | null>(null);
  const [activeGateDrag, setActiveGateDrag] = useState<ActiveGateDragState | null>(null);
  const [activeBasketballPostDrag, setActiveBasketballPostDrag] = useState<ActiveBasketballPostDragState | null>(null);
  const [activeFloodlightColumnDrag, setActiveFloodlightColumnDrag] = useState<ActiveFloodlightColumnDragState | null>(null);
  const [isLengthEditorOpen, setIsLengthEditorOpen] = useState(false);
  const [selectedLengthInputM, setSelectedLengthInputM] = useState("");

  useEffect(() => {
    if (interactionMode !== "SELECT") {
      setSelectedSegmentId(null);
      setSelectedSegmentIds([]);
      setSelectedGateId(null);
      setSelectedBasketballPostId(null);
      setSelectedFloodlightColumnId(null);
      setSuppressNextSegmentClick(false);
      setIsLengthEditorOpen(false);
      setActiveSegmentDrag(null);
      setSegmentDragReference(null);
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
    setSelectedSegmentIds([]);
    setSelectedGateId(null);
    setSelectedBasketballPostId(null);
    setSelectedFloodlightColumnId(null);
    setSuppressNextSegmentClick(false);
    setActiveSegmentDrag(null);
    setSegmentDragReference(null);
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
    setSelectedSegmentIds([]);
    setSegmentDragReference(null);
    setSelectedGateId(null);
    setSelectedBasketballPostId(null);
    setSelectedFloodlightColumnId(null);
    setSuppressNextSegmentClick(false);
  }, []);

  return {
    drawStart,
    drawChainStart,
    rectangleStart,
    selectedSegmentId,
    selectedSegmentIds,
    selectedGateId,
    selectedBasketballPostId,
    selectedFloodlightColumnId,
    suppressNextSegmentClick,
    activeSegmentDrag,
    segmentDragReference,
    activeGateDrag,
    activeBasketballPostDrag,
    activeFloodlightColumnDrag,
    isLengthEditorOpen,
    selectedLengthInputM,
    setDrawStart,
    setDrawChainStart,
    setRectangleStart,
    setSelectedSegmentId,
    setSelectedSegmentIds,
    setSelectedGateId,
    setSelectedBasketballPostId,
    setSelectedFloodlightColumnId,
    setSuppressNextSegmentClick,
    setActiveSegmentDrag,
    setSegmentDragReference,
    setActiveGateDrag,
    setActiveBasketballPostDrag,
    setActiveFloodlightColumnDrag,
    setIsLengthEditorOpen,
    setSelectedLengthInputM,
    resetLoadedWorkspaceState,
    clearHistorySelection
  };
}
