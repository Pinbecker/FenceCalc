import { useCallback, useMemo, useReducer, useRef } from "react";
import type { LayoutModel } from "@fence-estimator/contracts";

import { isEmptyLayout, normalizeLayout } from "./workspacePersistenceUtils";

const EMPTY_LAYOUT: LayoutModel = {
  segments: [],
  gates: [],
  basketballPosts: [],
  floodlightColumns: [],
  goalUnits: [],
  kickboards: [],
  pitchDividers: [],
  sideNettings: []
};

export function useWorkspaceSavedState(
  normalizedLayout: LayoutModel,
  currentDrawingId: string | null,
  currentDrawingName: string,
  currentCustomerId: string | null,
) {
  const savedLayoutSnapshotRef = useRef<string>(
    JSON.stringify(EMPTY_LAYOUT)
  );
  const savedNameRef = useRef("");
  const savedCustomerIdRef = useRef<string | null>(null);
  const [savedRevision, bumpSavedRevision] = useReducer((value: number) => value + 1, 0);

  const rememberSavedState = useCallback((layout: LayoutModel, drawingName: string, customerId: string | null) => {
    savedLayoutSnapshotRef.current = JSON.stringify(normalizeLayout(layout));
    savedNameRef.current = drawingName;
    savedCustomerIdRef.current = customerId;
    bumpSavedRevision();
  }, []);

  const resetSavedState = useCallback(() => {
    rememberSavedState(EMPTY_LAYOUT, "", null);
  }, [rememberSavedState]);

  const isDirty = useMemo(() => {
    const nameChanged = currentDrawingName.trim() !== savedNameRef.current.trim();
    const customerChanged = currentCustomerId !== savedCustomerIdRef.current;
    if (currentDrawingId) {
      return JSON.stringify(normalizedLayout) !== savedLayoutSnapshotRef.current || nameChanged || customerChanged;
    }

    return nameChanged || customerChanged || !isEmptyLayout(normalizedLayout);
  }, [currentCustomerId, currentDrawingId, currentDrawingName, normalizedLayout, savedRevision]);

  return {
    isDirty,
    rememberSavedState,
    resetSavedState
  };
}
