import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { LayoutSegment } from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import type { ActiveGateDragState } from "./useEditorSelectionState";

interface UseEditorSelectionEffectsOptions {
  selectedSegment: LayoutSegment | null;
  selectedGateId: string | null;
  selectedPlanId: string | null;
  hasSelectedGate: boolean;
  highlightablePlanIds: string[];
  setSelectedGateId: Dispatch<SetStateAction<string | null>>;
  setActiveGateDrag: Dispatch<SetStateAction<ActiveGateDragState | null>>;
  setIsLengthEditorOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedLengthInputM: Dispatch<SetStateAction<string>>;
  setSelectedPlanId: Dispatch<SetStateAction<string | null>>;
}

export function useEditorSelectionEffects({
  selectedSegment,
  selectedGateId,
  selectedPlanId,
  hasSelectedGate,
  highlightablePlanIds,
  setSelectedGateId,
  setActiveGateDrag,
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
    if (highlightablePlanIds.length === 0) {
      setSelectedPlanId(null);
      return;
    }

    if (!selectedPlanId || !highlightablePlanIds.includes(selectedPlanId)) {
      setSelectedPlanId(highlightablePlanIds[0] ?? null);
    }
  }, [highlightablePlanIds, selectedPlanId, setSelectedPlanId]);
}
