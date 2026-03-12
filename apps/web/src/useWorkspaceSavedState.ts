import { useCallback, useMemo, useRef } from "react";
import type { LayoutModel } from "@fence-estimator/contracts";

import { isEmptyLayout, normalizeLayout } from "./workspacePersistenceUtils";

export function useWorkspaceSavedState(
  normalizedLayout: LayoutModel,
  currentDrawingId: string | null,
  currentDrawingName: string,
) {
  const savedLayoutSnapshotRef = useRef<string>(JSON.stringify({ segments: [], gates: [] }));
  const savedNameRef = useRef("");

  const rememberSavedState = useCallback((layout: LayoutModel, drawingName: string) => {
    savedLayoutSnapshotRef.current = JSON.stringify(normalizeLayout(layout));
    savedNameRef.current = drawingName;
  }, []);

  const resetSavedState = useCallback(() => {
    rememberSavedState({ segments: [], gates: [] }, "");
  }, [rememberSavedState]);

  const isDirty = useMemo(() => {
    const nameChanged = currentDrawingName.trim() !== savedNameRef.current.trim();
    if (currentDrawingId) {
      return JSON.stringify(normalizedLayout) !== savedLayoutSnapshotRef.current || nameChanged;
    }

    return nameChanged || !isEmptyLayout(normalizedLayout);
  }, [currentDrawingId, currentDrawingName, normalizedLayout]);

  return {
    isDirty,
    rememberSavedState,
    resetSavedState
  };
}
