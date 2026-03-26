import { useCallback, useReducer } from "react";
import type {
  BasketballPostPlacement,
  FloodlightColumnPlacement,
  GatePlacement,
  LayoutModel,
  LayoutSegment
} from "@fence-estimator/contracts";

import { historyReducer } from "./editorMath";
import type { HistoryState } from "./types";
import { reconcileLayoutForSegments } from "./layoutReconciliation";

function createEmptyLayout(): LayoutModel {
  return {
    segments: [],
    gates: [],
    basketballPosts: [],
    floodlightColumns: [],
    goalUnits: [],
    kickboards: [],
    pitchDividers: [],
    sideNettings: []
  };
}

export function useEditorLayoutHistory() {
  const [history, dispatchHistory] = useReducer(historyReducer, {
    past: [],
    present: createEmptyLayout(),
    future: []
  } satisfies HistoryState);

  const applyLayout = useCallback((updater: (previous: LayoutModel) => LayoutModel) => {
    dispatchHistory({ type: "APPLY", updater });
  }, []);

  const applySegments = useCallback(
    (updater: (previous: LayoutSegment[]) => LayoutSegment[]) => {
      applyLayout((previous) => reconcileLayoutForSegments(previous, updater(previous.segments)));
    },
    [applyLayout],
  );

  const applyGatePlacements = useCallback(
    (updater: (previous: GatePlacement[]) => GatePlacement[]) => {
      applyLayout((previous) => ({
        ...previous,
        gates: updater(previous.gates ?? [])
      }));
    },
    [applyLayout],
  );

  const applyBasketballPostPlacements = useCallback(
    (updater: (previous: BasketballPostPlacement[]) => BasketballPostPlacement[]) => {
      applyLayout((previous) => ({
        ...previous,
        basketballPosts: updater(previous.basketballPosts ?? [])
      }));
    },
    [applyLayout],
  );

  const applyFloodlightColumnPlacements = useCallback(
    (updater: (previous: FloodlightColumnPlacement[]) => FloodlightColumnPlacement[]) => {
      applyLayout((previous) => ({
        ...previous,
        floodlightColumns: updater(previous.floodlightColumns ?? [])
      }));
    },
    [applyLayout],
  );

  const resetLayout = useCallback((layout: LayoutModel) => {
    dispatchHistory({ type: "RESET", layout });
  }, []);

  const undoLayout = useCallback(() => {
    dispatchHistory({ type: "UNDO" });
  }, []);

  const redoLayout = useCallback(() => {
    dispatchHistory({ type: "REDO" });
  }, []);

  const currentLayout = history.present;

  return {
    history,
    currentLayout,
    segments: currentLayout.segments,
    gatePlacements: currentLayout.gates ?? [],
    basketballPostPlacements: currentLayout.basketballPosts ?? [],
    floodlightColumnPlacements: currentLayout.floodlightColumns ?? [],
    goalUnitPlacements: currentLayout.goalUnits ?? [],
    kickboardAttachments: currentLayout.kickboards ?? [],
    pitchDividerPlacements: currentLayout.pitchDividers ?? [],
    sideNettingAttachments: currentLayout.sideNettings ?? [],
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    applyLayout,
    applySegments,
    applyGatePlacements,
    applyBasketballPostPlacements,
    applyFloodlightColumnPlacements,
    resetLayout,
    undoLayout,
    redoLayout
  };
}
