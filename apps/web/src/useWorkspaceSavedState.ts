import { useCallback, useMemo, useReducer, useRef } from "react";
import type { LayoutModel } from "@fence-estimator/contracts";

import { isEmptyLayout, normalizeLayout } from "./workspacePersistenceUtils";

export function useWorkspaceSavedState(
  normalizedLayout: LayoutModel,
  currentDrawingId: string | null,
  currentDrawingName: string,
  currentCustomerName: string,
) {
  const savedLayoutSnapshotRef = useRef<string>(
    JSON.stringify({ segments: [], gates: [], basketballPosts: [], floodlightColumns: [] })
  );
  const savedNameRef = useRef("");
  const savedCustomerNameRef = useRef("");
  const [savedRevision, bumpSavedRevision] = useReducer((value: number) => value + 1, 0);

  const rememberSavedState = useCallback((layout: LayoutModel, drawingName: string, customerName: string) => {
    savedLayoutSnapshotRef.current = JSON.stringify(normalizeLayout(layout));
    savedNameRef.current = drawingName;
    savedCustomerNameRef.current = customerName;
    bumpSavedRevision();
  }, []);

  const resetSavedState = useCallback(() => {
    rememberSavedState({ segments: [], gates: [], basketballPosts: [], floodlightColumns: [] }, "", "");
  }, [rememberSavedState]);

  const isDirty = useMemo(() => {
    const nameChanged = currentDrawingName.trim() !== savedNameRef.current.trim();
    const customerChanged = currentCustomerName.trim() !== savedCustomerNameRef.current.trim();
    if (currentDrawingId) {
      return JSON.stringify(normalizedLayout) !== savedLayoutSnapshotRef.current || nameChanged || customerChanged;
    }

    return nameChanged || customerChanged || !isEmptyLayout(normalizedLayout);
  }, [currentCustomerName, currentDrawingId, currentDrawingName, normalizedLayout, savedRevision]);

  return {
    isDirty,
    rememberSavedState,
    resetSavedState
  };
}
