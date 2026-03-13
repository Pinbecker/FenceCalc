import { useCallback, useMemo, useRef } from "react";
import type { LayoutModel } from "@fence-estimator/contracts";

import { isEmptyLayout, normalizeLayout } from "./workspacePersistenceUtils";

export function useWorkspaceSavedState(
  normalizedLayout: LayoutModel,
  currentDrawingId: string | null,
  currentDrawingName: string,
  currentCustomerName: string,
) {
  const savedLayoutSnapshotRef = useRef<string>(JSON.stringify({ segments: [], gates: [], basketballPosts: [] }));
  const savedNameRef = useRef("");
  const savedCustomerNameRef = useRef("");

  const rememberSavedState = useCallback((layout: LayoutModel, drawingName: string, customerName: string) => {
    savedLayoutSnapshotRef.current = JSON.stringify(normalizeLayout(layout));
    savedNameRef.current = drawingName;
    savedCustomerNameRef.current = customerName;
  }, []);

  const resetSavedState = useCallback(() => {
    rememberSavedState({ segments: [], gates: [], basketballPosts: [] }, "", "");
  }, [rememberSavedState]);

  const isDirty = useMemo(() => {
    const nameChanged = currentDrawingName.trim() !== savedNameRef.current.trim();
    const customerChanged = currentCustomerName.trim() !== savedCustomerNameRef.current.trim();
    if (currentDrawingId) {
      return JSON.stringify(normalizedLayout) !== savedLayoutSnapshotRef.current || nameChanged || customerChanged;
    }

    return nameChanged || customerChanged || !isEmptyLayout(normalizedLayout);
  }, [currentCustomerName, currentDrawingId, currentDrawingName, normalizedLayout]);

  return {
    isDirty,
    rememberSavedState,
    resetSavedState
  };
}
