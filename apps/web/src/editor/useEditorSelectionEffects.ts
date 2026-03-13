import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { LayoutSegment } from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import type { ActiveBasketballPostDragState, ActiveGateDragState } from "./useEditorSelectionState";

interface UseEditorSelectionEffectsOptions {
  selectedSegment: LayoutSegment | null;
  selectedGateId: string | null;
  selectedBasketballPostId: string | null;
  selectedPlanId: string | null;
  hasSelectedGate: boolean;
  hasSelectedBasketballPost: boolean;
  highlightablePlanIds: string[];
  setSelectedGateId: Dispatch<SetStateAction<string | null>>;
  setSelectedBasketballPostId: Dispatch<SetStateAction<string | null>>;
  setActiveGateDrag: Dispatch<SetStateAction<ActiveGateDragState | null>>;
  setActiveBasketballPostDrag: Dispatch<SetStateAction<ActiveBasketballPostDragState | null>>;
  setIsLengthEditorOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedLengthInputM: Dispatch<SetStateAction<string>>;
  setSelectedPlanId: Dispatch<SetStateAction<string | null>>;
}

export function useEditorSelectionEffects({
  selectedSegment,
  selectedGateId,
  selectedBasketballPostId,
  selectedPlanId,
  hasSelectedGate,
  hasSelectedBasketballPost,
  highlightablePlanIds,
  setSelectedGateId,
  setSelectedBasketballPostId,
  setActiveGateDrag,
  setActiveBasketballPostDrag,
  setIsLengthEditorOpen,
  setSelectedLengthInputM,
  setSelectedPlanId
}: UseEditorSelectionEffectsOptions) {
  useEffect(() => {
    if (!selectedSegment) {
      setIsLengthEditorOpen(false);
      setSelectedLengthInputM("");
      return;
    }

    setSelectedLengthInputM((distanceMm(selectedSegment.start, selectedSegment.end) / 1000).toFixed(2));
  }, [selectedSegment, setIsLengthEditorOpen, setSelectedLengthInputM]);

  useEffect(() => {
    if (!selectedGateId || hasSelectedGate) {
      return;
    }

    setSelectedGateId(null);
    setActiveGateDrag(null);
  }, [hasSelectedGate, selectedGateId, setActiveGateDrag, setSelectedGateId]);

  useEffect(() => {
    if (!selectedBasketballPostId || hasSelectedBasketballPost) {
      return;
    }

    setSelectedBasketballPostId(null);
    setActiveBasketballPostDrag(null);
  }, [
    hasSelectedBasketballPost,
    selectedBasketballPostId,
    setActiveBasketballPostDrag,
    setSelectedBasketballPostId
  ]);

  useEffect(() => {
    if (highlightablePlanIds.length === 0) {
      setSelectedPlanId(null);
      return;
    }

    if (!selectedPlanId || !highlightablePlanIds.includes(selectedPlanId)) {
      setSelectedPlanId(highlightablePlanIds[0] ?? null);
    }
  }, [highlightablePlanIds, selectedPlanId, setSelectedPlanId]);
}
